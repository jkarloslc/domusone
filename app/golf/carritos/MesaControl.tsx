'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { Search, X, RefreshCw, Trash2, Plus, Save, Loader, AlertTriangle, Receipt, XCircle } from 'lucide-react'

// Mesa de Control — solo superadmin/admin (el tab se oculta para los demás).
// Corrige errores de captura en pagos de recibos y elimina cuotas de pensión.

type FormaPago = { id: number; nombre: string }

type ReciboMC = {
  id: number
  folio: string
  fecha_recibo: string
  total: number
  status: string
  forma_pago_nombre: string | null
  referencia_pago: string | null
  id_socio_fk: number
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
}

type PagoRow = {
  id?: number                       // sin id → pago nuevo
  id_forma_pago_fk: number | ''
  forma_nombre: string
  monto: string
  referencia: string
  _delete?: boolean
}

type CuotaMC = {
  id: number
  id_socio_fk: number
  concepto: string
  periodo: string | null
  monto_final: number
  saldo: number | null
  status: string
  fecha_vencimiento: string | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
}

const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const fechaFmt = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

const inp: React.CSSProperties = {
  padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8,
  background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

export default function MesaControl() {
  // ── Recibos ───────────────────────────────────────────────
  const [recibos, setRecibos]       = useState<ReciboMC[]>([])
  const [loadingR, setLoadingR]     = useState(true)
  const [busquedaR, setBusquedaR]   = useState('')
  const [formasPago, setFormasPago] = useState<FormaPago[]>([])

  // Modal edición de pagos
  const [editRecibo, setEditRecibo] = useState<ReciboMC | null>(null)
  const [pagos, setPagos]           = useState<PagoRow[]>([])
  const [loadingPagos, setLoadingPagos] = useState(false)
  const [savingPagos, setSavingPagos]   = useState(false)
  const [errPagos, setErrPagos]     = useState('')

  // ── Cuotas ────────────────────────────────────────────────
  const [cuotas, setCuotas]         = useState<CuotaMC[]>([])
  const [loadingQ, setLoadingQ]     = useState(true)
  const [busquedaQ, setBusquedaQ]   = useState('')
  const [statusQ, setStatusQ]       = useState<'PENDIENTE' | 'CANCELADO'>('PENDIENTE')
  const [borrandoQ, setBorrandoQ]   = useState<number | null>(null)

  const fetchRecibos = useCallback(async () => {
    setLoadingR(true)
    const { data } = await dbGolf.from('recibos_golf')
      .select(`id, folio, fecha_recibo, total, status, forma_pago_nombre, referencia_pago, id_socio_fk,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio)`)
      .eq('status', 'VIGENTE')
      .order('created_at', { ascending: false })
      .limit(200)
    setRecibos((data as unknown as ReciboMC[]) ?? [])
    setLoadingR(false)
  }, [])

  const fetchCuotas = useCallback(async () => {
    setLoadingQ(true)
    // Solo cuotas sin pagos aplicados son eliminables (PENDIENTE / CANCELADO)
    const { data } = await dbGolf.from('cxc_golf')
      .select(`id, id_socio_fk, concepto, periodo, monto_final, saldo, status, fecha_vencimiento,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio)`)
      .eq('tipo', 'PENSION_CARRITO')
      .eq('status', statusQ)
      .order('fecha_vencimiento', { ascending: false })
      .limit(300)
    setCuotas((data as unknown as CuotaMC[]) ?? [])
    setLoadingQ(false)
  }, [statusQ])

  useEffect(() => { fetchRecibos() }, [fetchRecibos])
  useEffect(() => { fetchCuotas() }, [fetchCuotas])
  useEffect(() => {
    dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setFormasPago((data as FormaPago[]) ?? []))
  }, [])

  // ── Edición de pagos de un recibo ─────────────────────────
  const abrirEdicion = async (r: ReciboMC) => {
    setEditRecibo(r)
    setErrPagos('')
    setLoadingPagos(true)
    const { data } = await dbGolf.from('recibos_golf_pagos')
      .select('id, id_forma_pago_fk, forma_nombre, monto, referencia')
      .eq('id_recibo_fk', r.id)
      .order('id')
    const rows = ((data ?? []) as { id: number; id_forma_pago_fk: number | null; forma_nombre: string; monto: number; referencia: string | null }[])
      .map(p => ({
        id: p.id,
        id_forma_pago_fk: p.id_forma_pago_fk ?? '' as const,
        forma_nombre: p.forma_nombre,
        monto: String(p.monto),
        referencia: p.referencia ?? '',
      }))
    // Recibos antiguos sin desglose de pagos: precargar una línea con los datos de cabecera
    setPagos(rows.length > 0 ? rows : [{
      id_forma_pago_fk: '',
      forma_nombre: r.forma_pago_nombre ?? '',
      monto: String(r.total),
      referencia: r.referencia_pago ?? '',
    }])
    setLoadingPagos(false)
  }

  const setPago = (i: number, patch: Partial<PagoRow>) =>
    setPagos(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))

  const agregarPago = () => setPagos(prev => [...prev, { id_forma_pago_fk: '', forma_nombre: '', monto: '', referencia: '' }])

  const pagosActivos = pagos.filter(p => !p._delete)
  const sumaPagos = pagosActivos.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0)
  const diff = editRecibo ? Math.round((sumaPagos - editRecibo.total) * 100) / 100 : 0
  const pagosValidos = pagosActivos.length > 0
    && pagosActivos.every(p => p.id_forma_pago_fk !== '' && (parseFloat(p.monto) || 0) > 0)
    && Math.abs(diff) < 0.01

  const guardarPagos = async () => {
    if (!editRecibo || !pagosValidos) return
    setSavingPagos(true)
    setErrPagos('')
    try {
      // 1. Bajas
      for (const p of pagos.filter(x => x._delete && x.id)) {
        const { error } = await dbGolf.from('recibos_golf_pagos').delete().eq('id', p.id!)
        if (error) throw new Error(error.message)
      }
      // 2. Cambios y altas
      for (const p of pagosActivos) {
        const payload = {
          id_recibo_fk:     editRecibo.id,
          id_forma_pago_fk: p.id_forma_pago_fk as number,
          forma_nombre:     p.forma_nombre,
          monto:            parseFloat(p.monto),
          referencia:       p.referencia.trim() || null,
        }
        const { error } = p.id
          ? await dbGolf.from('recibos_golf_pagos').update(payload).eq('id', p.id)
          : await dbGolf.from('recibos_golf_pagos').insert(payload)
        if (error) throw new Error(error.message)
      }
      // 3. Cabecera del recibo (forma de pago resumida y referencia)
      const nombres = Array.from(new Set(pagosActivos.map(p => p.forma_nombre))).join(' + ')
      const refPrincipal = pagosActivos.find(p => p.referencia.trim())?.referencia.trim() ?? null
      const { error: errCab } = await dbGolf.from('recibos_golf').update({
        forma_pago_nombre: nombres,
        id_forma_pago_fk:  pagosActivos[0].id_forma_pago_fk as number,
        referencia_pago:   refPrincipal,
      }).eq('id', editRecibo.id)
      if (errCab) throw new Error(errCab.message)
      // 4. Reflejar forma de pago en las cuotas cobradas con este recibo
      const { error: errCx } = await dbGolf.from('cxc_golf')
        .update({ forma_pago: nombres })
        .eq('id_recibo_fk', editRecibo.id)
      if (errCx) throw new Error(errCx.message)

      setEditRecibo(null)
      fetchRecibos()
    } catch (e: any) {
      setErrPagos(e?.message ?? 'No se pudieron guardar los cambios')
    } finally {
      setSavingPagos(false)
    }
  }

  // ── Eliminar cuota ────────────────────────────────────────
  const eliminarCuota = async (c: CuotaMC) => {
    if (!confirm(`¿Eliminar definitivamente la cuota "${c.concepto}"${c.periodo ? ` (${c.periodo})` : ''} de ${nc(c.cat_socios)} por ${fmt$(c.monto_final)}?\n\nEsta acción no se puede deshacer.`)) return
    setBorrandoQ(c.id)
    const { error } = await dbGolf.from('cxc_golf').delete().eq('id', c.id)
    setBorrandoQ(null)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    fetchCuotas()
  }

  const recibosF = recibos.filter(r => {
    if (!busquedaR.trim()) return true
    const q = busquedaR.toLowerCase()
    return r.folio.toLowerCase().includes(q) || nc(r.cat_socios).toLowerCase().includes(q)
  })

  const cuotasF = cuotas.filter(c => {
    if (!busquedaQ.trim()) return true
    return nc(c.cat_socios).toLowerCase().includes(busquedaQ.toLowerCase())
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Aviso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12, color: '#92400e' }}>
        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
        Herramienta de administración: los cambios afectan recibos ya emitidos y eliminan registros de forma permanente.
      </div>

      {/* ── SECCIÓN 1: Corrección de pagos en recibos ────── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Receipt size={14} style={{ color: '#0891b2' }} /> Corrección de pagos en recibos
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input style={{ ...inp, width: '100%', paddingLeft: 30 }}
              placeholder="Buscar por folio o socio…" value={busquedaR} onChange={e => setBusquedaR(e.target.value)} />
            {busquedaR && <button onClick={() => setBusquedaR('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
          </div>
          <button onClick={fetchRecibos} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                  {['Folio', 'Socio', 'Fecha', 'Total', 'Forma de pago', 'Referencia', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingR ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                ) : recibosF.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin recibos vigentes con ese criterio</td></tr>
                ) : recibosF.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0891b2', whiteSpace: 'nowrap' }}>{r.folio}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500 }}>{nc(r.cat_socios)}</div>
                      {r.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{r.cat_socios.numero_socio}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fechaFmt(r.fecha_recibo)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{fmt$(r.total)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{r.forma_pago_nombre ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{r.referencia_pago ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <button onClick={() => abrirEdicion(r)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Corregir pagos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── SECCIÓN 2: Eliminar cuotas de pensión ────────── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Trash2 size={14} style={{ color: '#dc2626' }} /> Eliminar cuotas de pensión
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          Solo se pueden eliminar cuotas sin pagos aplicados (pendientes o canceladas). Las pagadas o con pago parcial deben cancelarse desde su recibo.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input style={{ ...inp, width: '100%', paddingLeft: 30 }}
              placeholder="Buscar socio…" value={busquedaQ} onChange={e => setBusquedaQ(e.target.value)} />
            {busquedaQ && <button onClick={() => setBusquedaQ('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
          </div>
          <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {(['PENDIENTE', 'CANCELADO'] as const).map(s => (
              <button key={s} onClick={() => setStatusQ(s)} style={{
                padding: '7px 14px', fontSize: 12, fontWeight: statusQ === s ? 600 : 400,
                background: statusQ === s ? '#059669' : '#fff',
                color: statusQ === s ? '#fff' : '#94a3b8',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {s === 'PENDIENTE' ? 'Pendientes' : 'Canceladas'}
              </button>
            ))}
          </div>
          <button onClick={fetchCuotas} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                  {['Socio', 'Concepto', 'Periodo', 'Vencimiento', 'Monto', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingQ ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                ) : cuotasF.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin cuotas {statusQ === 'PENDIENTE' ? 'pendientes' : 'canceladas'} con ese criterio</td></tr>
                ) : cuotasF.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500 }}>{nc(c.cat_socios)}</div>
                      {c.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{c.cat_socios.numero_socio}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{c.concepto}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.periodo ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {c.fecha_vencimiento ? fechaFmt(c.fecha_vencimiento) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt$(c.monto_final)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: c.status === 'PENDIENTE' ? '#fffbeb' : '#f1f5f9', color: c.status === 'PENDIENTE' ? '#d97706' : '#64748b' }}>
                        {c.status === 'PENDIENTE' ? 'Pendiente' : 'Cancelada'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button onClick={() => eliminarCuota(c)} disabled={borrandoQ === c.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: borrandoQ === c.id ? 0.5 : 1 }}>
                        {borrandoQ === c.id ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />} Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal edición de pagos ───────────────────────── */}
      {editRecibo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Corregir pagos — {editRecibo.folio}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {nc(editRecibo.cat_socios)} · {fechaFmt(editRecibo.fecha_recibo)} · Total del recibo: <strong>{fmt$(editRecibo.total)}</strong>
                </div>
              </div>
              <button onClick={() => setEditRecibo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <XCircle size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {loadingPagos ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Cargando pagos…</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Formas de pago del recibo
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pagos.map((p, i) => p._delete ? null : (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={p.id_forma_pago_fk}
                          onChange={e => {
                            const id = e.target.value ? Number(e.target.value) : ''
                            const fp = formasPago.find(f => f.id === id)
                            setPago(i, { id_forma_pago_fk: id, forma_nombre: fp?.nombre ?? p.forma_nombre })
                          }}
                          style={{ ...inp, flex: '1 1 160px' }}>
                          <option value="">— Forma de pago —</option>
                          {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                        <input style={{ ...inp, width: 120, textAlign: 'right' }} type="number" min={0} step={0.01}
                          placeholder="Monto" value={p.monto} onChange={e => setPago(i, { monto: e.target.value })} />
                        <input style={{ ...inp, flex: '1 1 140px' }}
                          placeholder="Referencia (opcional)" value={p.referencia} onChange={e => setPago(i, { referencia: e.target.value })} />
                        <button onClick={() => p.id ? setPago(i, { _delete: true }) : setPagos(prev => prev.filter((_, idx) => idx !== i))}
                          title="Quitar forma de pago"
                          style={{ padding: '7px 9px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={agregarPago}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', marginTop: 12 }}>
                    <Plus size={12} /> Agregar forma de pago
                  </button>

                  {/* Cuadre */}
                  <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
                    background: Math.abs(diff) < 0.01 ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${Math.abs(diff) < 0.01 ? '#bbf7d0' : '#fecaca'}`,
                    color: Math.abs(diff) < 0.01 ? '#15803d' : '#dc2626' }}>
                    Suma de pagos: <strong>{fmt$(sumaPagos)}</strong> · Total del recibo: <strong>{fmt$(editRecibo.total)}</strong>
                    {Math.abs(diff) >= 0.01 && <span> · Diferencia: <strong>{fmt$(diff)}</strong> — los pagos deben cuadrar con el total</span>}
                  </div>

                  {errPagos && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                      {errPagos}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditRecibo(null)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarPagos} disabled={savingPagos || loadingPagos || !pagosValidos}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', opacity: (savingPagos || loadingPagos || !pagosValidos) ? 0.6 : 1 }}>
                {savingPagos ? <Loader size={14} className="animate-spin" /> : <Save size={14} />} Guardar correcciones
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
