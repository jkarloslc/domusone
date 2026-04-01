'use client'

import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCat } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Cargo = {
  id: number
  id_propietario_fk: number
  id_lote_fk: number | null
  concepto: string
  monto: number
  saldo: number
  fecha_vencimiento: string
  status: 'Pendiente' | 'Abonado' | 'Pagado' | 'Cancelado'
  created_at: string
}

type Pago = {
  id: number
  id_cargo_fk: number
  fecha_pago: string
  monto: number
  forma_pago: string
  referencia: string | null
  created_at: string
}

type Propietario = {
  id: number
  nombre: string           // nombre completo construido
  rfc: string | null
  telefono: string | null
  correo: string | null
}

type Lote = {
  id: number
  clave: string            // display: cve_lote o fallback
  manzana: string | null
  lote: string | null
}

type CargoEnriquecido = Cargo & {
  propietario_nombre: string
  lote_clave: string
}

// ─── Constantes ──────────────────────────────────────────────────────────────
const FORMAS_PAGO = ['Transferencia', 'Efectivo', 'Cheque', 'Tarjeta', 'Otro']

const STATUS_COLORS: Record<string, string> = {
  Pendiente: 'bg-yellow-100 text-yellow-800',
  Abonado:   'bg-blue-100 text-blue-800',
  Pagado:    'bg-green-100 text-green-800',
  Cancelado: 'bg-gray-100 text-gray-600',
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

function fmtDate(s: string) {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CXCPage() {
  const [cargos, setCargos]           = useState<CargoEnriquecido[]>([])
  const [propietarios, setPropietarios] = useState<Propietario[]>([])
  const [lotes, setLotes]             = useState<Lote[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)

  // filtros
  const [busqueda, setBusqueda]       = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('Todos')

  // modales
  const [showNuevoCargo, setShowNuevoCargo] = useState(false)
  const [showPago, setShowPago]             = useState(false)
  const [showDetalle, setShowDetalle]       = useState(false)
  const [cargoSeleccionado, setCargoSeleccionado] = useState<CargoEnriquecido | null>(null)

  // form cargo
  const [formCargo, setFormCargo] = useState({
    id_propietario_fk: '',
    id_lote_fk: '',
    concepto: '',
    monto: '',
    fecha_vencimiento: '',
  })

  // form pago
  const [formPago, setFormPago] = useState({
    monto: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    forma_pago: 'Transferencia',
    referencia: '',
  })

  const [savingCargo, setSavingCargo] = useState(false)
  const [savingPago, setSavingPago]   = useState(false)

  // detalle pagos
  const [pagosDetalle, setPagosDetalle] = useState<Pago[]>([])
  const [loadingPagos, setLoadingPagos] = useState(false)

  // ─── Carga de datos ────────────────────────────────────────────────────────
  const cargarCatalogos = useCallback(async () => {
    const [{ data: propsData }, { data: lotesData }] = await Promise.all([
      dbCat.from('propietarios')
        .select('id, nombre, apellido_paterno, apellido_materno, rfc, activo')
        .eq('activo', true)
        .order('nombre'),
      dbCat.from('lotes')
        .select('id, cve_lote, lote, id_seccion_fk, status_lote')
        .order('cve_lote'),
    ])

    // Construir nombre completo desde partes separadas
    const props: Propietario[] = (propsData ?? []).map((p: any) => ({
      id:       p.id,
      nombre:   [p.nombre, p.apellido_paterno, p.apellido_materno]
                  .filter(Boolean).join(' ') || `Propietario ${p.id}`,
      rfc:      p.rfc ?? null,
      telefono: null,
      correo:   null,
    }))

    // cve_lote como clave de display
    const lts: Lote[] = (lotesData ?? []).map((l: any) => ({
      id:      l.id,
      clave:   l.cve_lote ?? `Lote ${l.id}`,
      manzana: null,
      lote:    l.lote?.toString() ?? null,
    }))

    setPropietarios(props)
    setLotes(lts)
    return { props, lotes: lts }
  }, [])

  const cargarCargos = useCallback(async (
    props: Propietario[],
    lts: Lote[]
  ) => {
    const { data, error: err } = await dbCtrl
      .from('cxc_cargos')
      .select('*')
      .order('created_at', { ascending: false })

    if (err) throw err

    const propMap = Object.fromEntries(props.map(p => [p.id, p.nombre]))
    const loteMap = Object.fromEntries(lts.map(l => [l.id, l.clave]))

    const enriquecidos: CargoEnriquecido[] = (data ?? []).map(c => ({
      ...c,
      propietario_nombre: propMap[c.id_propietario_fk] ?? `ID ${c.id_propietario_fk}`,
      lote_clave: c.id_lote_fk ? (loteMap[c.id_lote_fk] ?? '—') : '—',
    }))

    setCargos(enriquecidos)
  }, [])

  const cargarTodo = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { props, lotes: lts } = await cargarCatalogos()
      await cargarCargos(props, lts)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [cargarCatalogos, cargarCargos])

  useEffect(() => { cargarTodo() }, [cargarTodo])

  // ─── Filtrado ──────────────────────────────────────────────────────────────
  const cargosFiltrados = cargos.filter(c => {
    const matchBusqueda = !busqueda ||
      c.propietario_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.concepto.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.lote_clave.toLowerCase().includes(busqueda.toLowerCase())
    const matchStatus = filtroStatus === 'Todos' || c.status === filtroStatus
    return matchBusqueda && matchStatus
  })

  // ─── Totales ───────────────────────────────────────────────────────────────
  const totalPendiente = cargosFiltrados
    .filter(c => c.status !== 'Cancelado' && c.status !== 'Pagado')
    .reduce((acc, c) => acc + c.saldo, 0)

  const totalCargos = cargosFiltrados.reduce((acc, c) => acc + c.monto, 0)

  // ─── Guardar cargo ─────────────────────────────────────────────────────────
  const handleGuardarCargo = async () => {
    if (!formCargo.id_propietario_fk || !formCargo.concepto || !formCargo.monto) {
      alert('Propietario, concepto y monto son requeridos')
      return
    }
    setSavingCargo(true)
    try {
      const monto = parseFloat(formCargo.monto)
      const { error: err } = await dbCtrl.from('cxc_cargos').insert({
        id_propietario_fk: Number(formCargo.id_propietario_fk),
        id_lote_fk: formCargo.id_lote_fk ? Number(formCargo.id_lote_fk) : null,
        concepto: formCargo.concepto.trim(),
        monto,
        saldo: monto,
        fecha_vencimiento: formCargo.fecha_vencimiento || null,
        status: 'Pendiente',
      })
      if (err) throw err
      setShowNuevoCargo(false)
      setFormCargo({ id_propietario_fk: '', id_lote_fk: '', concepto: '', monto: '', fecha_vencimiento: '' })
      await cargarTodo()
    } catch (e: unknown) {
      alert('Error al guardar: ' + (e as Error).message)
    } finally {
      setSavingCargo(false)
    }
  }

  // ─── Guardar pago ──────────────────────────────────────────────────────────
  const handleGuardarPago = async () => {
    if (!cargoSeleccionado || !formPago.monto) {
      alert('Ingresa el monto del pago')
      return
    }
    const montoPago = parseFloat(formPago.monto)
    if (montoPago <= 0) { alert('El monto debe ser mayor a 0'); return }
    if (montoPago > cargoSeleccionado.saldo) {
      alert(`El monto no puede exceder el saldo pendiente (${fmtMoney(cargoSeleccionado.saldo)})`)
      return
    }
    setSavingPago(true)
    try {
      // Insertar pago
      const { error: errPago } = await dbCtrl.from('cxc_pagos').insert({
        id_cargo_fk: cargoSeleccionado.id,
        fecha_pago: formPago.fecha_pago,
        monto: montoPago,
        forma_pago: formPago.forma_pago,
        referencia: formPago.referencia.trim() || null,
      })
      if (errPago) throw errPago

      // Actualizar saldo y status del cargo
      const nuevoSaldo = cargoSeleccionado.saldo - montoPago
      const nuevoStatus: Cargo['status'] = nuevoSaldo <= 0 ? 'Pagado' : 'Abonado'

      const { error: errCargo } = await dbCtrl
        .from('cxc_cargos')
        .update({ saldo: nuevoSaldo, status: nuevoStatus })
        .eq('id', cargoSeleccionado.id)
      if (errCargo) throw errCargo

      setShowPago(false)
      setFormPago({ monto: '', fecha_pago: new Date().toISOString().split('T')[0], forma_pago: 'Transferencia', referencia: '' })
      await cargarTodo()
    } catch (e: unknown) {
      alert('Error al registrar pago: ' + (e as Error).message)
    } finally {
      setSavingPago(false)
    }
  }

  // ─── Ver detalle de cargo ──────────────────────────────────────────────────
  const abrirDetalle = async (cargo: CargoEnriquecido) => {
    setCargoSeleccionado(cargo)
    setShowDetalle(true)
    setLoadingPagos(true)
    const { data } = await dbCtrl
      .from('cxc_pagos')
      .select('*')
      .eq('id_cargo_fk', cargo.id)
      .order('fecha_pago', { ascending: false })
    setPagosDetalle(data ?? [])
    setLoadingPagos(false)
  }

  const abrirPago = (cargo: CargoEnriquecido) => {
    setCargoSeleccionado(cargo)
    setShowPago(true)
  }

  // ─── Cancelar cargo ────────────────────────────────────────────────────────
  const handleCancelarCargo = async (cargo: CargoEnriquecido) => {
    if (!confirm(`¿Cancelar el cargo "${cargo.concepto}" de ${cargo.propietario_nombre}?`)) return
    const { error: err } = await dbCtrl
      .from('cxc_cargos')
      .update({ status: 'Cancelado' })
      .eq('id', cargo.id)
    if (err) { alert('Error: ' + err.message); return }
    await cargarTodo()
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="p-6 text-red-600 bg-red-50 rounded-lg">
      Error: {error}
      <button onClick={cargarTodo} className="ml-4 underline">Reintentar</button>
    </div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobranza (CXC)</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cuentas por Cobrar — Balvanera Polo & Country Club</p>
        </div>
        <button
          onClick={() => setShowNuevoCargo(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Nuevo Cargo
        </button>
      </div>

      {/* ── Resumen ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cargos mostrados</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{cargosFiltrados.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total cargado</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(totalCargos)}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <p className="text-xs text-yellow-700 uppercase tracking-wide">Saldo pendiente</p>
          <p className="text-2xl font-bold text-yellow-800 mt-1">{fmtMoney(totalPendiente)}</p>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por propietario, concepto o lote…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {['Todos', 'Pendiente', 'Abonado', 'Pagado', 'Cancelado'].map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Propietario</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Lote</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Concepto</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Monto</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Vencimiento</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  {busqueda || filtroStatus !== 'Todos' ? 'Sin resultados para los filtros aplicados' : 'Sin cargos registrados'}
                </td>
              </tr>
            ) : cargosFiltrados.map(cargo => (
              <tr key={cargo.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {cargo.propietario_nombre}
                </td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                  {cargo.lote_clave}
                </td>
                <td className="px-4 py-3 text-gray-700">{cargo.concepto}</td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {fmtMoney(cargo.monto)}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  <span className={cargo.saldo > 0 ? 'text-red-600' : 'text-green-600'}>
                    {fmtMoney(cargo.saldo)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-500 text-xs">
                  {cargo.fecha_vencimiento ? fmtDate(cargo.fecha_vencimiento) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[cargo.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {cargo.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => abrirDetalle(cargo)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver
                    </button>
                    {(cargo.status === 'Pendiente' || cargo.status === 'Abonado') && (
                      <button
                        onClick={() => abrirPago(cargo)}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                      >
                        Registrar pago
                      </button>
                    )}
                    {cargo.status === 'Pendiente' && (
                      <button
                        onClick={() => handleCancelarCargo(cargo)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Nuevo Cargo ──────────────────────────────────────────────── */}
      {showNuevoCargo && (
        <Modal title="Nuevo Cargo" onClose={() => setShowNuevoCargo(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Propietario <span className="text-red-500">*</span>
              </label>
              <select
                value={formCargo.id_propietario_fk}
                onChange={e => setFormCargo(p => ({ ...p, id_propietario_fk: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar propietario…</option>
                {propietarios.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lote</label>
              <select
                value={formCargo.id_lote_fk}
                onChange={e => setFormCargo(p => ({ ...p, id_lote_fk: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin lote específico</option>
                {lotes.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.clave}{l.lote ? ` — Lote ${l.lote}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Concepto <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ej. Cuota de mantenimiento Enero 2026"
                value={formCargo.concepto}
                onChange={e => setFormCargo(p => ({ ...p, concepto: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto (MXN) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formCargo.monto}
                  onChange={e => setFormCargo(p => ({ ...p, monto: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={formCargo.fecha_vencimiento}
                  onChange={e => setFormCargo(p => ({ ...p, fecha_vencimiento: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowNuevoCargo(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarCargo}
                disabled={savingCargo}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {savingCargo ? 'Guardando…' : 'Guardar cargo'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Registrar Pago ───────────────────────────────────────────── */}
      {showPago && cargoSeleccionado && (
        <Modal title="Registrar Pago" onClose={() => setShowPago(false)}>
          <div className="space-y-4">
            {/* resumen del cargo */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Propietario</span>
                <span className="font-medium text-gray-900">{cargoSeleccionado.propietario_nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Concepto</span>
                <span className="text-gray-700">{cargoSeleccionado.concepto}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cargo total</span>
                <span className="text-gray-700">{fmtMoney(cargoSeleccionado.monto)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                <span className="text-gray-700 font-medium">Saldo pendiente</span>
                <span className="font-bold text-red-600">{fmtMoney(cargoSeleccionado.saldo)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto del pago <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={cargoSeleccionado.saldo}
                  step="0.01"
                  placeholder="0.00"
                  value={formPago.monto}
                  onChange={e => setFormPago(p => ({ ...p, monto: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de pago</label>
                <input
                  type="date"
                  value={formPago.fecha_pago}
                  onChange={e => setFormPago(p => ({ ...p, fecha_pago: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pago</label>
                <select
                  value={formPago.forma_pago}
                  onChange={e => setFormPago(p => ({ ...p, forma_pago: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                <input
                  type="text"
                  placeholder="No. de transferencia, folio…"
                  value={formPago.referencia}
                  onChange={e => setFormPago(p => ({ ...p, referencia: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* atajo: pago total */}
            <button
              onClick={() => setFormPago(p => ({ ...p, monto: cargoSeleccionado.saldo.toFixed(2) }))}
              className="text-xs text-blue-600 hover:underline"
            >
              Llenar con saldo total ({fmtMoney(cargoSeleccionado.saldo)})
            </button>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowPago(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarPago}
                disabled={savingPago}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-60"
              >
                {savingPago ? 'Registrando…' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Detalle / Estado de cuenta ──────────────────────────────── */}
      {showDetalle && cargoSeleccionado && (
        <Modal title="Estado de Cuenta — Detalle" onClose={() => setShowDetalle(false)} wide>
          <div className="space-y-5">
            {/* info del cargo */}
            <div className="bg-gray-50 rounded-lg p-4 text-sm grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <span className="text-gray-500 block text-xs uppercase tracking-wide mb-0.5">Propietario</span>
                <span className="font-semibold text-gray-900">{cargoSeleccionado.propietario_nombre}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs uppercase tracking-wide mb-0.5">Lote</span>
                <span className="font-mono text-gray-700">{cargoSeleccionado.lote_clave}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs uppercase tracking-wide mb-0.5">Concepto</span>
                <span className="text-gray-700">{cargoSeleccionado.concepto}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs uppercase tracking-wide mb-0.5">Vencimiento</span>
                <span className="text-gray-700">{cargoSeleccionado.fecha_vencimiento ? fmtDate(cargoSeleccionado.fecha_vencimiento) : '—'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs uppercase tracking-wide mb-0.5">Monto original</span>
                <span className="font-bold text-gray-900">{fmtMoney(cargoSeleccionado.monto)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs uppercase tracking-wide mb-0.5">Saldo pendiente</span>
                <span className={`font-bold ${cargoSeleccionado.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmtMoney(cargoSeleccionado.saldo)}
                </span>
              </div>
            </div>

            {/* historial de pagos */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial de pagos</h3>
              {loadingPagos ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                </div>
              ) : pagosDetalle.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin pagos registrados</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="pb-2 text-gray-500 font-medium">Fecha</th>
                      <th className="pb-2 text-gray-500 font-medium">Forma de pago</th>
                      <th className="pb-2 text-gray-500 font-medium">Referencia</th>
                      <th className="pb-2 text-right text-gray-500 font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagosDetalle.map(pago => (
                      <tr key={pago.id}>
                        <td className="py-2 text-gray-700">{fmtDate(pago.fecha_pago)}</td>
                        <td className="py-2 text-gray-600">{pago.forma_pago}</td>
                        <td className="py-2 text-gray-500 text-xs">{pago.referencia ?? '—'}</td>
                        <td className="py-2 text-right font-semibold text-green-700">{fmtMoney(pago.monto)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300">
                      <td colSpan={3} className="pt-2 text-right text-sm font-semibold text-gray-700">Total pagado</td>
                      <td className="pt-2 text-right font-bold text-green-700">
                        {fmtMoney(pagosDetalle.reduce((a, p) => a + p.monto, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              {(cargoSeleccionado.status === 'Pendiente' || cargoSeleccionado.status === 'Abonado') && (
                <button
                  onClick={() => {
                    setShowDetalle(false)
                    abrirPago(cargoSeleccionado)
                  }}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  Registrar pago
                </button>
              )}
              <button
                onClick={() => setShowDetalle(false)}
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Modal reutilizable ───────────────────────────────────────────────────────
function Modal({
  title, onClose, children, wide = false
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
