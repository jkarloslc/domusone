'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  ShieldCheck, Plus, ArrowLeft, Save, Loader, Eye,
  CheckCircle, XCircle, Trash2, AlertTriangle, User, ChevronDown, Search,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import ModalShell from '@/components/ui/ModalShell'
import { Colaborador, nombreCompletoColaborador } from '@/lib/colaboradores'

const TURNOS = ['A-D', 'A-M', 'A-N'] as const
const TURNO_LABEL: Record<string, string> = {
  'A-D': 'A-D · Asistencia Día',
  'A-M': 'A-M · Asistencia Mixto',
  'A-N': 'A-N · Asistencia Noche',
}
const ZONAS = ['Recorrido', 'Elite', 'Otro']

const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  'Capturado':  { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'Autorizado': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Rechazado':  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}
const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_COLOR[status] ?? STATUS_COLOR['Capturado']
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  )
}

const fmt = (v: number | null | undefined) =>
  v != null ? '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function diasEnRango(desde: string, hasta: string): string[] {
  if (!desde || !hasta) return []
  const out: string[] = []
  const d = new Date(desde + 'T12:00:00')
  const end = new Date(hasta + 'T12:00:00')
  if (end < d) return []
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
    if (out.length >= 31) break
  }
  return out
}
const diaLabel = (fecha: string) => {
  const d = new Date(fecha + 'T12:00:00')
  return {
    letra: d.toLocaleDateString('es-MX', { weekday: 'narrow' }).toUpperCase(),
    num:   d.getDate(),
  }
}

type Guardia = {
  tempId: number
  id?: number
  id_colaborador_fk: number | null
  nombre: string
  zona: string
  puesto: string
  costo_dia: string
  asistencias: Record<string, string>   // fecha -> turno ('' = no trabajó)
}

export default function VigilanciaExtrasPage() {
  const { canWrite, authUser } = useAuth()
  const router = useRouter()
  const puedeCapturar = canWrite('vigilancia-extras')
  const puedeAutorizar = !!authUser && ['superadmin', 'admin'].includes(authUser.rol)

  const [rows, setRows]         = useState<any[]>([])
  const [areasMap, setAreasMap] = useState<Record<number, string>>({})
  const [loading, setLoading]   = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal]       = useState(false)
  const [editLote, setEditLote] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('vigilancia_extras_lotes').select('*').order('created_at', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    dbCfg.from('areas').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((a: any) => { m[a.id] = a.nombre })
      setAreasMap(m)
    })
  }, [])

  const openNew  = () => { setEditLote(null); setModal(true) }
  const openEdit = (l: any) => { setEditLote(l); setModal(true) }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={() => router.push('/residencial')}><ArrowLeft size={15} /></button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Vigilancia — Extras</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nómina semanal de guardias extra · {rows.length} lotes</p>
          </div>
        </div>
        {puedeCapturar && (
          <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nuevo Lote
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select className="select" style={{ maxWidth: 220 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">— Todos los status —</option>
          <option value="Capturado">Capturado</option>
          <option value="Autorizado">Autorizado</option>
          <option value="Rechazado">Rechazado</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Folio</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Periodo</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Área</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>OP</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={16} className="animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Sin lotes capturados</td></tr>
            ) : rows.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openEdit(l)}>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--blue)' }}>{l.folio}</td>
                <td style={{ padding: '10px 14px' }}>{fmtFecha(l.fecha_desde)} – {fmtFecha(l.fecha_hasta)}</td>
                <td style={{ padding: '10px 14px' }}>{l.id_area_fk ? (areasMap[l.id_area_fk] ?? '—') : '—'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(l.total)}</td>
                <td style={{ padding: '10px 14px' }}><StatusBadge status={l.status} /></td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{l.id_op_fk ? `OP #${l.id_op_fk}` : '—'}</td>
                <td style={{ padding: '10px 14px' }}><Eye size={14} style={{ color: '#94a3b8' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <LoteModal
          lote={editLote}
          puedeCapturar={puedeCapturar}
          puedeAutorizar={puedeAutorizar}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchData() }}
        />
      )}
    </div>
  )
}

// ── Modal de captura / autorización ──────────────────────────────────────
function LoteModal({ lote, puedeCapturar, puedeAutorizar, onClose, onSaved }: {
  lote: any | null
  puedeCapturar: boolean
  puedeAutorizar: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { authUser } = useAuth()
  const isEdit = !!lote
  const editable = puedeCapturar && (!isEdit || lote.status === 'Capturado' || lote.status === 'Rechazado')

  const [fechaDesde, setFechaDesde] = useState(lote?.fecha_desde ?? '')
  const [fechaHasta, setFechaHasta] = useState(lote?.fecha_hasta ?? '')
  const [areaId, setAreaId]         = useState(lote?.id_area_fk?.toString() ?? '')
  const [notas, setNotas]           = useState(lote?.notas ?? '')
  const [areas, setAreas]           = useState<any[]>([])
  const [guardias, setGuardias]     = useState<Guardia[]>([])
  const [nextTempId, setNextTempId] = useState(0)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [rechazando, setRechazando] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  useEffect(() => {
    dbCfg.from('areas').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => setAreas(data ?? []))
  }, [])

  useEffect(() => {
    if (!isEdit) return
    dbCtrl.from('vigilancia_extras_guardias').select('*').eq('id_lote_fk', lote.id).order('id').then(async ({ data: gs }) => {
      const guardiasData = gs ?? []
      const ids = guardiasData.map((g: any) => g.id)
      const { data: asis } = ids.length
        ? await dbCtrl.from('vigilancia_extras_asistencias').select('*').in('id_guardia_fk', ids)
        : { data: [] }
      setGuardias(guardiasData.map((g: any, i: number) => ({
        tempId: i,
        id: g.id,
        id_colaborador_fk: g.id_colaborador_fk ?? null,
        nombre: g.nombre,
        zona: g.zona ?? 'Recorrido',
        puesto: g.puesto ?? 'VIG.',
        costo_dia: g.costo_dia?.toString() ?? '500',
        asistencias: Object.fromEntries((asis ?? []).filter((a: any) => a.id_guardia_fk === g.id).map((a: any) => [a.fecha, a.turno])),
      })))
      setNextTempId(guardiasData.length)
    })
  }, [isEdit, lote?.id])

  const dias = diasEnRango(fechaDesde, fechaHasta)

  const addGuardia = () => {
    setGuardias(g => [...g, { tempId: nextTempId, id_colaborador_fk: null, nombre: '', zona: 'Recorrido', puesto: 'VIG.', costo_dia: '500', asistencias: {} }])
    setNextTempId(n => n + 1)
  }
  const removeGuardia = (tempId: number) => setGuardias(g => g.filter(x => x.tempId !== tempId))
  const updateGuardia = (tempId: number, patch: Partial<Guardia>) =>
    setGuardias(g => g.map(x => x.tempId === tempId ? { ...x, ...patch } : x))
  const setTurno = (tempId: number, fecha: string, turno: string) =>
    setGuardias(g => g.map(x => x.tempId === tempId
      ? { ...x, asistencias: turno ? { ...x.asistencias, [fecha]: turno } : Object.fromEntries(Object.entries(x.asistencias).filter(([f]) => f !== fecha)) }
      : x))

  const costoGuardia = (g: Guardia) => Object.keys(g.asistencias).filter(f => g.asistencias[f]).length * (Number(g.costo_dia) || 0)
  const diasGuardia   = (g: Guardia) => Object.values(g.asistencias).filter(Boolean).length
  const totalLote = guardias.reduce((a, g) => a + costoGuardia(g), 0)

  const handleSave = async () => {
    if (!fechaDesde || !fechaHasta) { setError('Captura el periodo (fecha desde / hasta)'); return }
    if (guardias.length === 0) { setError('Agrega al menos un guardia'); return }
    if (guardias.some(g => !g.id_colaborador_fk)) { setError('Selecciona el colaborador para todos los guardias'); return }
    if (guardias.every(g => diasGuardia(g) === 0)) { setError('Marca al menos un día trabajado'); return }
    setSaving(true); setError('')

    const payload: any = {
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      id_area_fk: areaId ? Number(areaId) : null,
      notas: notas.trim() || null,
      total: totalLote,
    }

    let loteId = lote?.id
    if (isEdit) {
      if (lote.status === 'Rechazado') {
        payload.status = 'Capturado'
        payload.motivo_rechazo = null
        payload.authorized_by = null
        payload.authorized_by_id = null
        payload.fecha_autorizacion = null
      }
      const { error: err } = await dbCtrl.from('vigilancia_extras_lotes').update(payload).eq('id', lote.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { count } = await dbCtrl.from('vigilancia_extras_lotes').select('id', { count: 'exact', head: true })
      payload.folio = `VIG-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
      payload.status = 'Capturado'
      payload.captured_by = authUser?.nombre ?? null
      payload.captured_by_id = authUser?.user.id ?? null
      const { data, error: err } = await dbCtrl.from('vigilancia_extras_lotes').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      loteId = data.id
    }

    // Reemplaza guardias + asistencias (cascade borra asistencias huérfanas)
    await dbCtrl.from('vigilancia_extras_guardias').delete().eq('id_lote_fk', loteId)
    for (const g of guardias) {
      const { data: gRow, error: gErr } = await dbCtrl.from('vigilancia_extras_guardias').insert({
        id_lote_fk: loteId,
        id_colaborador_fk: g.id_colaborador_fk,
        nombre: g.nombre.trim(),
        zona: g.zona || null,
        puesto: g.puesto.trim() || 'VIG.',
        costo_dia: Number(g.costo_dia) || 0,
        dias: diasGuardia(g),
        costo: costoGuardia(g),
      }).select('id').single()
      if (gErr) { setError(gErr.message); setSaving(false); return }
      const asisRows = Object.entries(g.asistencias)
        .filter(([, turno]) => turno)
        .map(([fecha, turno]) => ({ id_guardia_fk: gRow.id, fecha, turno, costo: Number(g.costo_dia) || 0 }))
      if (asisRows.length > 0) {
        await dbCtrl.from('vigilancia_extras_asistencias').insert(asisRows)
      }
    }

    setSaving(false)
    onSaved()
  }

  const autorizar = async () => {
    if (!lote?.id) return
    setSaving(true)
    await dbCtrl.from('vigilancia_extras_lotes').update({
      status: 'Autorizado',
      authorized_by: authUser?.nombre ?? null,
      authorized_by_id: authUser?.user.id ?? null,
      fecha_autorizacion: new Date().toISOString(),
    }).eq('id', lote.id)
    setSaving(false)
    onSaved()
  }

  const confirmarRechazo = async () => {
    if (!lote?.id || !motivoRechazo.trim()) { setError('Indica el motivo del rechazo'); return }
    setSaving(true)
    await dbCtrl.from('vigilancia_extras_lotes').update({
      status: 'Rechazado',
      motivo_rechazo: motivoRechazo.trim(),
      authorized_by: authUser?.nombre ?? null,
      authorized_by_id: authUser?.user.id ?? null,
      fecha_autorizacion: new Date().toISOString(),
    }).eq('id', lote.id)
    setSaving(false)
    onSaved()
  }

  const mostrarAutorizacion = isEdit && puedeAutorizar && lote.status === 'Capturado'

  return (
    <ModalShell
      modulo="accesos"
      titulo={isEdit ? `Lote ${lote.folio}` : 'Nuevo Lote de Extras'}
      subtitulo="Vigilancia · nómina semanal"
      icono={ShieldCheck}
      maxWidth={880}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
          {mostrarAutorizacion && !rechazando && (
            <>
              <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => setRechazando(true)}>
                <XCircle size={14} style={{ marginRight: 4 }} /> Rechazar
              </button>
              <button className="btn-primary" style={{ background: '#15803d' }} onClick={autorizar} disabled={saving}>
                <CheckCircle size={14} style={{ marginRight: 4 }} /> Autorizar
              </button>
            </>
          )}
          {rechazando && (
            <button className="btn-primary" style={{ background: '#dc2626' }} onClick={confirmarRechazo} disabled={saving}>
              Confirmar Rechazo
            </button>
          )}
          {editable && !rechazando && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} style={{ marginRight: 4 }} />} Guardar
            </button>
          )}
        </>
      }
    >
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 12, marginBottom: 14 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {isEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <StatusBadge status={lote.status} />
          {lote.status === 'Autorizado' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Autorizó {lote.authorized_by} · {fmtFecha(lote.fecha_autorizacion?.slice(0, 10))}</span>}
          {lote.status === 'Rechazado' && <span style={{ fontSize: 12, color: '#dc2626' }}>Motivo: {lote.motivo_rechazo}</span>}
          {lote.id_op_fk && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vinculado a OP #{lote.id_op_fk}</span>}
        </div>
      )}

      {rechazando && (
        <div style={{ marginBottom: 14 }}>
          <label className="label">Motivo del rechazo *</label>
          <textarea className="input" rows={2} value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)}
            placeholder="Explica por qué se rechaza este lote" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label className="label">Fecha desde *</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} disabled={!editable} />
        </div>
        <div>
          <label className="label">Fecha hasta *</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} disabled={!editable} />
        </div>
        <div>
          <label className="label">Área correspondiente</label>
          <select className="select" value={areaId} onChange={e => setAreaId(e.target.value)} disabled={!editable}>
            <option value="">— Sin especificar —</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label">Notas</label>
        <input className="input" value={notas} onChange={e => setNotas(e.target.value)} disabled={!editable} placeholder="ej. Empresa: LEON COMMERCE EXTERIEUR SA DE CV" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Guardias {guardias.length > 0 && <span style={{ color: 'var(--blue)', marginLeft: 4 }}>{guardias.length}</span>}
        </span>
        {editable && dias.length > 0 && (
          <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={addGuardia}>
            + Agregar guardia
          </button>
        )}
      </div>

      {dias.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed #e2e8f0', borderRadius: 8 }}>
          Selecciona el periodo (fecha desde / hasta) para capturar guardias
        </div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 180 }}>Nombre</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 90 }}>Zona</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 80 }}>$/día</th>
                  {dias.map(f => {
                    const { letra, num } = diaLabel(f)
                    return <th key={f} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', width: 56 }}>{letra}<br />{num}</th>
                  })}
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Días</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Costo</th>
                  {editable && <th style={{ width: 28 }}></th>}
                </tr>
              </thead>
              <tbody>
                {guardias.length === 0 ? (
                  <tr><td colSpan={dias.length + 5} style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)' }}>Sin guardias capturados</td></tr>
                ) : guardias.map(g => (
                  <tr key={g.tempId} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 6px' }}>
                      {editable ? (
                        <ColaboradorPopup
                          value={{ id: g.id_colaborador_fk, nombre: g.nombre }}
                          onChange={c => updateGuardia(g.tempId, { id_colaborador_fk: c?.id ?? null, nombre: c?.nombre ?? '' })}
                        />
                      ) : (
                        <span style={{ fontSize: 12 }}>{g.nombre || '—'}</span>
                      )}
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <select className="select" style={{ padding: '4px 6px', fontSize: 12 }} value={g.zona} disabled={!editable}
                        onChange={e => updateGuardia(g.tempId, { zona: e.target.value })}>
                        {ZONAS.map(z => <option key={z}>{z}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input className="input" type="number" step="0.01" style={{ padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                        value={g.costo_dia} disabled={!editable} onChange={e => updateGuardia(g.tempId, { costo_dia: e.target.value })} />
                    </td>
                    {dias.map(f => (
                      <td key={f} style={{ padding: '2px' }}>
                        <select
                          title={g.asistencias[f] ? TURNO_LABEL[g.asistencias[f]] : 'No trabajó'}
                          style={{ width: '100%', fontSize: 10, padding: '3px 2px', border: '1px solid #e2e8f0', borderRadius: 4,
                            background: g.asistencias[f] ? '#eff6ff' : '#fff', color: g.asistencias[f] ? 'var(--blue)' : '#94a3b8', fontWeight: g.asistencias[f] ? 600 : 400 }}
                          value={g.asistencias[f] ?? ''} disabled={!editable}
                          onChange={e => setTurno(g.tempId, f, e.target.value)}>
                          <option value="">—</option>
                          {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                    ))}
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600 }}>{diasGuardia(g)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(costoGuardia(g))}</td>
                    {editable && (
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button type="button" onClick={() => removeGuardia(g.tempId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {guardias.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <td colSpan={dias.length + 4} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 12 }}>Total del lote</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: 13 }}>{fmt(totalLote)}</td>
                    {editable && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        A-D Asistencia Día · A-M Asistencia Mixto · A-N Asistencia Noche
      </div>
    </ModalShell>
  )
}

// ── Popup selector de Colaborador (cfg.colaboradores) ────────────────────
function ColaboradorPopup({ value, onChange }: {
  value: { id: number | null; nombre: string }
  onChange: (c: { id: number; nombre: string } | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    dbCfg.from('colaboradores').select('*').eq('activo', true).eq('puesto', 'Vigilancia').order('nombre')
      .then(({ data }) => setColaboradores((data ?? []) as Colaborador[]))
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtrados = colaboradores.filter(c => nombreCompletoColaborador(c).toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '4px 8px', fontSize: 12, cursor: 'pointer',
          color: value.nombre ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        <User size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value.nombre || 'Seleccionar…'}
        </span>
        <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: 240, zIndex: 9999,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)', marginTop: 4, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar colaborador…"
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: 12, background: 'transparent' }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtrados.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Sin resultados</div>
            ) : filtrados.map(c => {
              const nombre = nombreCompletoColaborador(c)
              const selected = c.id === value.id
              return (
                <button key={c.id} type="button"
                  onClick={() => { onChange({ id: c.id, nombre }); setOpen(false); setQuery('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px',
                    fontSize: 12, background: selected ? '#eff6ff' : 'transparent',
                    color: selected ? 'var(--blue)' : 'var(--text-primary)',
                    border: 'none', cursor: 'pointer' }}>
                  {nombre}
                  {c.puesto && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{c.puesto}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
