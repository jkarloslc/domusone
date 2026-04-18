'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, ChevronLeft, Car, Settings, CreditCard, Search, X, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import CarritoModal from './CarritoModal'
import PensionModal from './PensionModal'
import CobrarCuotaModal from './CobrarCuotaModal'

// ── Tipos ─────────────────────────────────────────────────────
type Pension = {
  id: number
  id_socio_fk: number
  id_carrito_fk: number
  id_slot_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  monto_mensual: number
  activo: boolean
  observaciones: string | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_carritos: { marca: string | null; modelo: string | null; tipo: string; color: string | null; placa: string | null } | null
  cat_slots: { numero: string } | null
  pendientes: number    // cuotas pendientes (calculado)
  monto_pendiente: number
}

type Cuota = {
  id: number
  id_socio_fk: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  status: string
  fecha_emision: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  forma_pago: string | null
  tipo: string
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null
}

type Slot = { id: number; numero: string }

const hoy = new Date().toISOString().split('T')[0]
const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const vencida = (f: string | null) => f ? f < hoy : false

type Tab = 'pensiones' | 'cxc' | 'config'

export default function CarritosPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-carritos')

  const [tab, setTab] = useState<Tab>('pensiones')

  // ── Pensiones ─────────────────────────────────────────────
  const [pensiones, setPensiones]       = useState<Pension[]>([])
  const [loadingP, setLoadingP]         = useState(true)
  const [expandido, setExpandido]       = useState<number | null>(null)
  const [soloActivas, setSoloActivas]   = useState(true)
  const [busquedaP, setBusquedaP]       = useState('')

  // modales
  const [showCarrito, setShowCarrito]   = useState(false)
  const [showPension, setShowPension]   = useState<{ idSocio: number; idCarrito: number; nombreSocio: string; descCarrito: string } | null>(null)
  const [carritoNuevo, setCarritoNuevo] = useState<{ id: number; id_socio_fk: number } | null>(null)

  // ── CXC ───────────────────────────────────────────────────
  const [cuotas, setCuotas]             = useState<Cuota[]>([])
  const [loadingC, setLoadingC]         = useState(false)
  const [filtroCXCStatus, setFiltroCXCStatus] = useState<'PENDIENTE' | 'PAGADO' | ''>('PENDIENTE')
  const [filtroCXCTipo, setFiltroCXCTipo]     = useState<'PENSION_CARRITO' | 'MEMBRESIA' | ''>('')
  const [busquedaC, setBusquedaC]       = useState('')
  const [showCobrar, setShowCobrar]     = useState<{ cuotas: Cuota[]; nombreSocio: string } | null>(null)

  // ── Config ────────────────────────────────────────────────
  const [tarifa, setTarifa]             = useState<number>(0)
  const [tarifaEdit, setTarifaEdit]     = useState<number>(0)
  const [savingConfig, setSavingConfig] = useState(false)
  const [slots, setSlots]               = useState<Slot[]>([])
  const [nuevoSlot, setNuevoSlot]       = useState('')
  const [savingSlot, setSavingSlot]     = useState(false)

  // ── Stats ─────────────────────────────────────────────────
  const [stats, setStats] = useState({ pensionesActivas: 0, cuotasPendientes: 0, montoPendiente: 0, vencidas: 0 })

  // ── Fetch pensiones ───────────────────────────────────────
  const fetchPensiones = useCallback(async () => {
    setLoadingP(true)
    let q = dbGolf.from('ctrl_pensiones')
      .select(`id, id_socio_fk, id_carrito_fk, id_slot_fk, fecha_inicio, fecha_fin, monto_mensual, activo, observaciones,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
        cat_carritos(marca, modelo, tipo, color, placa),
        cat_slots(numero)`)
      .order('created_at', { ascending: false })
    if (soloActivas) q = q.eq('activo', true)
    const { data: pData } = await q

    // Cuotas pendientes por pensión
    const { data: cxcData } = await dbGolf.from('cxc_golf')
      .select('id_pension_fk, monto_final, status')
      .eq('status', 'PENDIENTE')
      .eq('tipo', 'PENSION_CARRITO')

    const pendPorPension: Record<number, { count: number; monto: number }> = {}
    for (const c of cxcData ?? []) {
      if (!c.id_pension_fk) continue
      if (!pendPorPension[c.id_pension_fk]) pendPorPension[c.id_pension_fk] = { count: 0, monto: 0 }
      pendPorPension[c.id_pension_fk].count++
      pendPorPension[c.id_pension_fk].monto += c.monto_final
    }

    const result: Pension[] = (pData ?? []).map((p: any) => ({
      ...p,
      pendientes: pendPorPension[p.id]?.count ?? 0,
      monto_pendiente: pendPorPension[p.id]?.monto ?? 0,
    }))

    setPensiones(result)
    const activas = result.filter(p => p.activo)
    setStats({
      pensionesActivas: activas.length,
      cuotasPendientes: activas.reduce((a, p) => a + p.pendientes, 0),
      montoPendiente:   activas.reduce((a, p) => a + p.monto_pendiente, 0),
      vencidas:         0, // se calcula en CXC
    })
    setLoadingP(false)
  }, [soloActivas])

  // ── Fetch CXC ─────────────────────────────────────────────
  const fetchCXC = useCallback(async () => {
    setLoadingC(true)
    let q = dbGolf.from('cxc_golf')
      .select(`id, id_socio_fk, concepto, periodo, monto_original, descuento, monto_final, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo,
        cat_socios(nombre, apellido_paterno, apellido_materno)`)
      .order('fecha_vencimiento', { ascending: true })
    if (filtroCXCStatus) q = q.eq('status', filtroCXCStatus)
    if (filtroCXCTipo)   q = q.eq('tipo', filtroCXCTipo)
    const { data } = await q
    setCuotas((data as Cuota[]) ?? [])
    setLoadingC(false)
  }, [filtroCXCStatus, filtroCXCTipo])

  // ── Fetch Config ──────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    const { data: cfg } = await dbGolf.from('cfg_carritos').select('tarifa_mensual').single()
    const t = cfg?.tarifa_mensual ?? 0
    setTarifa(t); setTarifaEdit(t)
    const { data: sl } = await dbGolf.from('cat_slots').select('id, numero').eq('activo', true).order('numero')
    setSlots(sl ?? [])
  }, [])

  useEffect(() => { fetchPensiones() }, [fetchPensiones])
  useEffect(() => { if (tab === 'cxc') fetchCXC() }, [tab, fetchCXC])
  useEffect(() => { if (tab === 'config') fetchConfig() }, [tab, fetchConfig])

  const guardarTarifa = async () => {
    setSavingConfig(true)
    await dbGolf.from('cfg_carritos').update({ tarifa_mensual: tarifaEdit, updated_at: new Date().toISOString() }).eq('id', 1)
    setTarifa(tarifaEdit)
    setSavingConfig(false)
  }

  const agregarSlot = async () => {
    if (!nuevoSlot.trim()) return
    setSavingSlot(true)
    await dbGolf.from('cat_slots').insert({ numero: nuevoSlot.trim() })
    setNuevoSlot('')
    setSavingSlot(false)
    fetchConfig()
  }

  const desactivarSlot = async (id: number) => {
    if (!confirm('¿Desactivar este slot?')) return
    await dbGolf.from('cat_slots').update({ activo: false }).eq('id', id)
    fetchConfig()
  }

  // Tras crear carrito, abrir modal de pensión
  const handleCarritoSaved = (c: { id: number; id_socio_fk: number }) => {
    setShowCarrito(false)
    setCarritoNuevo(c)
    fetchPensiones()
  }

  const handlePensionSaved = () => {
    setShowPension(null)
    setCarritoNuevo(null)
    fetchPensiones()
    if (tab === 'cxc') fetchCXC()
  }

  // Cuotas pendientes del socio de una pensión
  const abrirCobro = async (pension: Pension) => {
    const { data } = await dbGolf.from('cxc_golf')
      .select('id, concepto, periodo, monto_original, descuento, monto_final, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo, id_socio_fk, cat_socios(nombre, apellido_paterno, apellido_materno)')
      .eq('id_socio_fk', pension.id_socio_fk)
      .eq('status', 'PENDIENTE')
      .order('fecha_vencimiento', { ascending: true })
    setShowCobrar({
      cuotas: (data as Cuota[]) ?? [],
      nombreSocio: nc(pension.cat_socios),
    })
  }

  const pensionesF = pensiones.filter(p => {
    if (!busquedaP.trim()) return true
    const q = busquedaP.toLowerCase()
    const nombre = nc(p.cat_socios).toLowerCase()
    const placa = (p.cat_carritos?.placa ?? '').toLowerCase()
    return nombre.includes(q) || placa.includes(q)
  })

  const cuotasF = cuotas.filter(c => {
    if (!busquedaC.trim()) return true
    const q = busquedaC.toLowerCase()
    return nc(c.cat_socios).toLowerCase().includes(q) || c.concepto.toLowerCase().includes(q)
  })

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'pensiones', label: 'Pensiones', icon: Car },
    { key: 'cxc',       label: 'CXC Golf',  icon: CreditCard },
    { key: 'config',    label: 'Configuración', icon: Settings },
  ]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', textDecoration: 'none', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2563eb'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94a3b8'}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>/</span>
            <Car size={13} style={{ color: '#059669' }} />
            <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Carritos</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Carritos & CXC Golf
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => { fetchPensiones(); if (tab === 'cxc') fetchCXC() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && tab === 'pensiones' && (
            <button className="btn-primary" onClick={() => setShowCarrito(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669' }}>
              <Plus size={14} /> Nuevo Carrito
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Pensiones Activas',  value: stats.pensionesActivas,  color: '#059669', bg: '#ecfdf5' },
          { label: 'Cuotas Pendientes',  value: stats.cuotasPendientes,  color: '#d97706', bg: '#fffbeb' },
          { label: 'Monto por Cobrar',   value: fmt$(stats.montoPendiente), color: '#dc2626', bg: '#fef2f2' },
        ].map(c => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', maxWidth: 220, padding: '12px 16px', background: c.bg, border: `1px solid ${c.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#059669' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #059669' : '2px solid transparent',
              marginBottom: -1,
            }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB: PENSIONES ───────────────────────────────── */}
      {tab === 'pensiones' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar socio o placa…" value={busquedaP} onChange={e => setBusquedaP(e.target.value)} />
              {busquedaP && <button onClick={() => setBusquedaP('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={soloActivas} onChange={e => setSoloActivas(e.target.checked)} />
              Solo activas
            </label>
          </div>

          {loadingP ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
          ) : pensionesF.length === 0 ? (
            <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin pensiones registradas</div>
              <div style={{ fontSize: 12 }}>Registra un nuevo carrito para comenzar</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pensionesF.map(p => {
                const abierto = expandido === p.id
                const carDesc = [p.cat_carritos?.marca, p.cat_carritos?.modelo, p.cat_carritos?.color].filter(Boolean).join(' ')
                return (
                  <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${p.activo ? '#059669' : '#e2e8f0'}`, opacity: p.activo ? 1 : 0.6 }}>
                    <div onClick={() => setExpandido(abierto ? null : p.id)}
                      style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', flexWrap: 'wrap' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                      <div style={{ color: '#94a3b8', flexShrink: 0 }}>
                        {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{nc(p.cat_socios)}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {p.cat_socios?.numero_socio && <span>#{p.cat_socios.numero_socio}</span>}
                          <span style={{ padding: '1px 6px', borderRadius: 20, background: p.cat_carritos?.tipo === 'ELECTRICO' ? '#eff6ff' : '#fffbeb', color: p.cat_carritos?.tipo === 'ELECTRICO' ? '#1d4ed8' : '#92400e', fontWeight: 600 }}>
                            {p.cat_carritos?.tipo === 'ELECTRICO' ? '⚡' : '⛽'} {carDesc || 'Carrito'}
                          </span>
                          {p.cat_slots && <span>Cajón {p.cat_slots.numero}</span>}
                          {p.cat_carritos?.placa && <span>Placa: {p.cat_carritos.placa}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{fmt$(p.monto_mensual)}/mes</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>tarifa</div>
                        </div>
                        {p.pendientes > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: '#fef2f2', border: '1px solid #fecaca' }}>
                            <AlertCircle size={12} color="#dc2626" />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{p.pendientes} pendiente{p.pendientes !== 1 ? 's' : ''} · {fmt$(p.monto_pendiente)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {abierto && (
                      <div style={{ borderTop: '1px solid #f1f5f9', padding: '14px 18px', background: '#fafafa', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 12, color: '#64748b', flex: 1 }}>
                          <span style={{ fontWeight: 600 }}>Inicio:</span> {new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                          {p.observaciones && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{p.observaciones}</div>}
                        </div>
                        {puedeEscribir && p.activo && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {p.pendientes > 0 && (
                              <button onClick={() => abrirCobro(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                                <CreditCard size={12} /> Cobrar cuotas
                              </button>
                            )}
                            <button onClick={() => {
                              const carDesc2 = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
                              setShowPension({ idSocio: p.id_socio_fk, idCarrito: p.id_carrito_fk, nombreSocio: nc(p.cat_socios), descCarrito: carDesc2 })
                            }}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                              <Plus size={12} /> Nueva cuota
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB: CXC GOLF ────────────────────────────────── */}
      {tab === 'cxc' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar socio o concepto…" value={busquedaC} onChange={e => setBusquedaC(e.target.value)} />
              {busquedaC && <button onClick={() => setBusquedaC('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <select value={filtroCXCStatus} onChange={e => setFiltroCXCStatus(e.target.value as any)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">Todos los status</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PAGADO">Pagado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <select value={filtroCXCTipo} onChange={e => setFiltroCXCTipo(e.target.value as any)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">Todos los tipos</option>
              <option value="PENSION_CARRITO">Pensión Carrito</option>
              <option value="MEMBRESIA">Membresía</option>
            </select>
          </div>

          {loadingC ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
          ) : cuotasF.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>💳</div>
              <div style={{ fontWeight: 500 }}>Sin cuotas</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cuotasF.map(c => {
                const venc = vencida(c.fecha_vencimiento) && c.status === 'PENDIENTE'
                const statusColor = c.status === 'PAGADO' ? '#15803d' : c.status === 'CANCELADO' ? '#64748b' : venc ? '#dc2626' : '#d97706'
                const statusBg   = c.status === 'PAGADO' ? '#f0fdf4' : c.status === 'CANCELADO' ? '#f8fafc' : venc ? '#fef2f2' : '#fffbeb'
                return (
                  <div key={c.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{c.concepto}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {nc(c.cat_socios)}
                        {c.fecha_vencimiento && (
                          <span style={{ marginLeft: 8, color: venc ? '#dc2626' : '#94a3b8' }}>
                            · {venc ? '⚠ Vencida' : 'Vence'} {new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: c.tipo === 'PENSION_CARRITO' ? '#ecfdf5' : '#eff6ff', color: c.tipo === 'PENSION_CARRITO' ? '#065f46' : '#1d4ed8', fontWeight: 600 }}>
                        {c.tipo === 'PENSION_CARRITO' ? 'Pensión' : 'Membresía'}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: statusBg, color: statusColor, fontWeight: 600 }}>
                        {c.status}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: statusColor }}>{fmt$(c.monto_final)}</span>
                      {c.status === 'PENDIENTE' && puedeEscribir && (
                        <button onClick={() => setShowCobrar({ cuotas: [c], nombreSocio: nc(c.cat_socios) })}
                          style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                          Cobrar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB: CONFIGURACIÓN ───────────────────────────── */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>

          {/* Tarifa mensual */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Tarifa de Pensión Mensual</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Monto mensual ($)</label>
                <input style={{ width: '100%', padding: '8px 12px', fontSize: 16, fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  type="number" min={0} step={0.01} value={tarifaEdit} onChange={e => setTarifaEdit(parseFloat(e.target.value) || 0)} />
              </div>
              <button onClick={guardarTarifa} disabled={savingConfig || tarifaEdit === tarifa}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (savingConfig || tarifaEdit === tarifa) ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {savingConfig ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Esta tarifa se usa como valor predeterminado al crear nuevas pensiones. Las pensiones existentes mantienen su tarifa original.
            </div>
          </div>

          {/* Slots */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Slots / Cajones ({slots.length})</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                placeholder="Número de cajón (ej. 42, A-12)…" value={nuevoSlot} onChange={e => setNuevoSlot(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarSlot()} />
              <button onClick={agregarSlot} disabled={savingSlot || !nuevoSlot.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (!nuevoSlot.trim() || savingSlot) ? 0.6 : 1 }}>
                <Plus size={13} /> Agregar
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {slots.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>Cajón {s.numero}</span>
                  <button onClick={() => desactivarSlot(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 1, lineHeight: 1 }}><X size={11} /></button>
                </div>
              ))}
              {slots.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No hay slots configurados</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      {showCarrito && (
        <CarritoModal onClose={() => setShowCarrito(false)} onSaved={handleCarritoSaved} />
      )}

      {carritoNuevo && !showPension && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Carrito registrado</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>¿Deseas asignar un slot y generar cuotas de pensión ahora?</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setCarritoNuevo(null)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Después
              </button>
              <button onClick={async () => {
                const { data: s } = await dbGolf.from('cat_socios').select('nombre, apellido_paterno, apellido_materno').eq('id', carritoNuevo.id_socio_fk).single()
                const { data: c } = await dbGolf.from('cat_carritos').select('marca, modelo').eq('id', carritoNuevo.id).single()
                const nombreS = s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : ''
                const descC = c ? [c.marca, c.modelo].filter(Boolean).join(' ') || 'Carrito' : 'Carrito'
                setShowPension({ idSocio: carritoNuevo.id_socio_fk, idCarrito: carritoNuevo.id, nombreSocio: nombreS, descCarrito: descC })
              }}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer' }}>
                Asignar Pensión
              </button>
            </div>
          </div>
        </div>
      )}

      {showPension && (
        <PensionModal
          idSocio={showPension.idSocio}
          idCarrito={showPension.idCarrito}
          nombreSocio={showPension.nombreSocio}
          descripcionCarrito={showPension.descCarrito}
          onClose={() => { setShowPension(null); setCarritoNuevo(null) }}
          onSaved={handlePensionSaved}
        />
      )}

      {showCobrar && (
        <CobrarCuotaModal
          cuotas={showCobrar.cuotas}
          nombreSocio={showCobrar.nombreSocio}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { setShowCobrar(null); fetchPensiones(); if (tab === 'cxc') fetchCXC() }}
        />
      )}
    </div>
  )
}
