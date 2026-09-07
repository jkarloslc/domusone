'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Wallet, Plus, ArrowLeft, Save, Loader, Eye, Printer,
  CheckCircle, XCircle, Trash2, AlertTriangle, User, ChevronDown, Search,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import ModalShell from '@/components/ui/ModalShell'
import { Colaborador, nombreCompletoColaborador } from '@/lib/colaboradores'
import { montoALetras } from '@/lib/numeroALetras'

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

type Trabajador = {
  tempId: number
  id?: number
  id_colaborador_fk: number | null
  nombre: string
  puesto: string
  costo_dia: string
  asistencias: Record<string, boolean>   // fecha -> asistió
}

export default function RolDePagosPage() {
  const { canWrite, authUser } = useAuth()
  const router = useRouter()
  const puedeCapturar = canWrite('hr')
  const puedeAutorizar = !!authUser && ['superadmin', 'admin'].includes(authUser.rol)

  const [rows, setRows]         = useState<any[]>([])
  const [ccMap, setCcMap]       = useState<Record<number, string>>({})
  const [loading, setLoading]   = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal]       = useState(false)
  const [editLote, setEditLote] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('rol_pagos_lotes').select('*').order('created_at', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((c: any) => { m[c.id] = c.nombre })
      setCcMap(m)
    })
  }, [])

  const openNew  = () => { setEditLote(null); setModal(true) }
  const openEdit = (l: any) => { setEditLote(l); setModal(true) }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <button className="btn-back" onClick={() => router.push('/hr')} title="Regresar" style={{ marginTop: 1 }}><ArrowLeft size={15} /></button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#b4530918', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={15} style={{ color: '#b45309' }} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Rol de Pagos</h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>
              Asistencia semanal de colaboradores y monto a pagar · {rows.length} lotes
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {puedeCapturar && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Nuevo Rol de Pagos
            </button>
          )}
        </div>
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
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Centro de Costo</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={16} className="animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Sin rol de pagos capturado</td></tr>
            ) : rows.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openEdit(l)}>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--blue)' }}>{l.folio}</td>
                <td style={{ padding: '10px 14px' }}>{fmtFecha(l.fecha_desde)} – {fmtFecha(l.fecha_hasta)}</td>
                <td style={{ padding: '10px 14px' }}>{l.id_centro_costo_fk ? (ccMap[l.id_centro_costo_fk] ?? '—') : '—'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(l.total)}</td>
                <td style={{ padding: '10px 14px' }}><StatusBadge status={l.status} /></td>
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
  const [ccId, setCcId]             = useState(lote?.id_centro_costo_fk?.toString() ?? '')
  const [notas, setNotas]           = useState(lote?.notas ?? '')
  const [centrosCosto, setCentrosCosto] = useState<any[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [nextTempId, setNextTempId] = useState(0)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [rechazando, setRechazando] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => setCentrosCosto(data ?? []))
  }, [])

  useEffect(() => {
    if (!isEdit) return
    dbCtrl.from('rol_pagos_colaboradores').select('*').eq('id_lote_fk', lote.id).order('id').then(async ({ data: cs }) => {
      const colabsData = cs ?? []
      const ids = colabsData.map((c: any) => c.id)
      const { data: asis } = ids.length
        ? await dbCtrl.from('rol_pagos_asistencias').select('*').in('id_colaborador_lote_fk', ids)
        : { data: [] }
      setTrabajadores(colabsData.map((c: any, i: number) => ({
        tempId: i,
        id: c.id,
        id_colaborador_fk: c.id_colaborador_fk ?? null,
        nombre: c.nombre,
        puesto: c.puesto ?? '',
        costo_dia: c.costo_dia?.toString() ?? '0',
        asistencias: Object.fromEntries((asis ?? []).filter((a: any) => a.id_colaborador_lote_fk === c.id).map((a: any) => [a.fecha, true])),
      })))
      setNextTempId(colabsData.length)
    })
  }, [isEdit, lote?.id])

  const dias = diasEnRango(fechaDesde, fechaHasta)

  const addTrabajador = () => {
    setTrabajadores(t => [...t, { tempId: nextTempId, id_colaborador_fk: null, nombre: '', puesto: '', costo_dia: '0', asistencias: {} }])
    setNextTempId(n => n + 1)
  }
  const removeTrabajador = (tempId: number) => setTrabajadores(t => t.filter(x => x.tempId !== tempId))
  const updateTrabajador = (tempId: number, patch: Partial<Trabajador>) =>
    setTrabajadores(t => t.map(x => x.tempId === tempId ? { ...x, ...patch } : x))
  const toggleAsistencia = (tempId: number, fecha: string) =>
    setTrabajadores(t => t.map(x => x.tempId === tempId
      ? { ...x, asistencias: { ...x.asistencias, [fecha]: !x.asistencias[fecha] } }
      : x))

  const costoTrabajador = (t: Trabajador) => Object.values(t.asistencias).filter(Boolean).length * (Number(t.costo_dia) || 0)
  const diasTrabajador  = (t: Trabajador) => Object.values(t.asistencias).filter(Boolean).length
  const totalLote = trabajadores.reduce((a, t) => a + costoTrabajador(t), 0)

  const handleSave = async () => {
    if (!fechaDesde || !fechaHasta) { setError('Captura el periodo (fecha desde / hasta)'); return }
    if (trabajadores.length === 0) { setError('Agrega al menos un colaborador'); return }
    if (trabajadores.some(t => !t.id_colaborador_fk)) { setError('Selecciona el colaborador para todos los renglones'); return }
    if (trabajadores.every(t => diasTrabajador(t) === 0)) { setError('Marca al menos un día trabajado'); return }
    setSaving(true); setError('')

    const payload: any = {
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      id_centro_costo_fk: ccId ? Number(ccId) : null,
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
      const { error: err } = await dbCtrl.from('rol_pagos_lotes').update(payload).eq('id', lote.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { count } = await dbCtrl.from('rol_pagos_lotes').select('id', { count: 'exact', head: true })
      payload.folio = `ROL-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
      payload.status = 'Capturado'
      payload.captured_by = authUser?.nombre ?? null
      payload.captured_by_id = authUser?.user.id ?? null
      const { data, error: err } = await dbCtrl.from('rol_pagos_lotes').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      loteId = data.id
    }

    // Reemplaza colaboradores + asistencias (cascade borra asistencias huérfanas)
    await dbCtrl.from('rol_pagos_colaboradores').delete().eq('id_lote_fk', loteId)
    for (const t of trabajadores) {
      const { data: tRow, error: tErr } = await dbCtrl.from('rol_pagos_colaboradores').insert({
        id_lote_fk: loteId,
        id_colaborador_fk: t.id_colaborador_fk,
        nombre: t.nombre.trim(),
        puesto: t.puesto.trim() || null,
        costo_dia: Number(t.costo_dia) || 0,
        dias: diasTrabajador(t),
        costo: costoTrabajador(t),
      }).select('id').single()
      if (tErr) { setError(tErr.message); setSaving(false); return }
      const asisRows = Object.entries(t.asistencias)
        .filter(([, asistio]) => asistio)
        .map(([fecha]) => ({ id_colaborador_lote_fk: tRow.id, fecha, costo: Number(t.costo_dia) || 0 }))
      if (asisRows.length > 0) {
        await dbCtrl.from('rol_pagos_asistencias').insert(asisRows)
      }
    }

    setSaving(false)
    onSaved()
  }

  const autorizar = async () => {
    if (!lote?.id) return
    setSaving(true)
    await dbCtrl.from('rol_pagos_lotes').update({
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
    await dbCtrl.from('rol_pagos_lotes').update({
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

  const imprimir = async () => {
    if (!lote?.id) return
    const ccNombre = ccId ? (centrosCosto.find(c => c.id === Number(ccId))?.nombre ?? '—') : '—'

    let orgNombre = 'Organización'
    let orgSubtitulo = ''
    let orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`

    const html = `<!DOCTYPE html><html><head><title>Rol de Pagos ${lote.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 18px; }
        .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 600; color: #0D4F80; margin-bottom: 2px; }
        .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 11px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
        .total { background: #eff6ff; font-size: 14px; font-weight: 700; color: #0D4F80; }
        .firmas { display: flex; gap: 60px; margin-top: 60px; }
        .firma { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 180px; font-size: 11px; color: #64748b; }
        .leyenda { font-size: 10px; color: #64748b; margin-top: 6px; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">HR — Rol de Pagos</div>
          <div class="sub" style="margin:0">Folio: <strong>${lote.folio}</strong> &nbsp;·&nbsp; Periodo: ${fmtFecha(fechaDesde)} – ${fmtFecha(fechaHasta)}</div>
        </div>
      </div>
      <table>
        <tr><th>Centro de Costo</th><td>${ccNombre}</td><th>Status</th><td style="font-weight:700">${lote.status}</td></tr>
        ${notas ? `<tr><th>Notas</th><td colspan="3">${notas}</td></tr>` : ''}
      </table>
      <table>
        <thead>
          <tr>
            <th>Nombre</th><th>Puesto</th><th style="text-align:right">$/día</th>
            ${dias.map(f => { const { letra, num } = diaLabel(f); return `<th style="text-align:center">${letra} ${num}</th>` }).join('')}
            <th style="text-align:center">Días</th><th style="text-align:right">Monto a Pagar</th>
          </tr>
        </thead>
        <tbody>
          ${trabajadores.map(t => `<tr>
            <td>${t.nombre || '—'}</td>
            <td>${t.puesto || '—'}</td>
            <td style="text-align:right">${fmt(Number(t.costo_dia))}</td>
            ${dias.map(f => `<td style="text-align:center;font-weight:${t.asistencias[f] ? 700 : 400}">${t.asistencias[f] ? '✓' : '—'}</td>`).join('')}
            <td style="text-align:center;font-weight:700">${diasTrabajador(t)}</td>
            <td style="text-align:right;font-weight:700">${fmt(costoTrabajador(t))}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><th colspan="${3 + dias.length + 1}" style="text-align:right" class="total">TOTAL DEL ROL DE PAGOS</th><td class="total" style="text-align:right">${fmt(totalLote)}</td></tr>
        </tfoot>
      </table>
      <div class="firmas">
        <div class="firma">
          <div style="margin-bottom:2px;font-weight:600;color:#1e293b">${lote.captured_by ?? 'Sin registro'}</div>
          Capturó
        </div>
        <div class="firma">
          <div style="margin-bottom:2px;font-weight:600;color:#1e293b">${lote.authorized_by ?? 'Sin registro'}</div>
          Autorizó
          ${lote.fecha_autorizacion ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${new Date(lote.fecha_autorizacion).toLocaleDateString('es-MX',{dateStyle:'short'})}</div>` : ''}
        </div>
      </div>
      </body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  // ── Recibo de dinero individual por colaborador ─────────────────────────
  const imprimirRecibo = async (t: Trabajador) => {
    if (!lote?.id) return
    const ccNombre = ccId ? (centrosCosto.find(c => c.id === Number(ccId))?.nombre ?? '—') : '—'
    const monto     = costoTrabajador(t)
    const diasCount = diasTrabajador(t)

    let orgNombre = 'Organización'
    let orgSubtitulo = ''
    let orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`

    const html = `<!DOCTYPE html><html><head><title>Recibo ${lote.folio} - ${t.nombre}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 18px; }
        .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 16px; font-weight: 700; color: #0D4F80; margin-bottom: 2px; letter-spacing: .04em; }
        .sub { color: #64748b; font-size: 12px; margin: 0; }
        .monto-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; text-align: center; }
        .monto-num { font-size: 30px; font-weight: 700; color: #15803d; }
        .monto-letra { font-size: 12px; color: #166534; margin-top: 4px; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; text-align: left; width: 160px; }
        .declaracion { font-size: 12px; line-height: 1.6; margin: 20px 0; text-align: justify; }
        .firmas { display: flex; justify-content: space-around; gap: 40px; margin-top: 70px; }
        .firma { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 220px; font-size: 11px; color: #64748b; }
        .leyenda { font-size: 10px; color: #94a3b8; margin-top: 30px; text-align: center; }
        @page { margin: 1.5cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">RECIBO DE PAGO</div>
          <div class="sub">Folio: <strong>${lote.folio}</strong></div>
          <div class="sub">Fecha: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      <div class="monto-box">
        <div class="monto-num">${fmt(monto)}</div>
        <div class="monto-letra">${montoALetras(monto)}</div>
      </div>

      <table>
        <tr><th>Recibí de</th><td>${orgNombre}</td></tr>
        <tr><th>Nombre</th><td>${t.nombre || '—'}</td></tr>
        <tr><th>Puesto</th><td>${t.puesto || '—'}</td></tr>
        <tr><th>Centro de Costo</th><td>${ccNombre}</td></tr>
        <tr><th>Periodo</th><td>${fmtFecha(fechaDesde)} – ${fmtFecha(fechaHasta)}</td></tr>
        <tr><th>Días Trabajados</th><td>${diasCount}</td></tr>
        <tr><th>Pago por Día</th><td>${fmt(Number(t.costo_dia))}</td></tr>
      </table>

      <p class="declaracion">
        Recibí de <strong>${orgNombre}</strong> la cantidad de <strong>${fmt(monto)}</strong> (${montoALetras(monto)})
        por concepto de pago de mano de obra correspondiente al periodo del <strong>${fmtFecha(fechaDesde)}</strong>
        al <strong>${fmtFecha(fechaHasta)}</strong>, quedando a mi entera satisfacción y sin nada más que reclamar
        por este concepto.
      </p>

      <div class="firmas">
        <div class="firma">${t.nombre || '—'}<br/>Recibí conforme</div>
        <div class="firma">${lote.authorized_by ?? lote.captured_by ?? 'Sin registro'}<br/>Entregó</div>
      </div>
      <div class="leyenda">Comprobante interno de pago de mano de obra — Rol de Pagos ${lote.folio}</div>
      </body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <ModalShell
      modulo="hr"
      titulo={isEdit ? `Rol de Pagos ${lote.folio}` : 'Nuevo Rol de Pagos'}
      subtitulo="HR · Rol de Pagos"
      icono={Wallet}
      maxWidth={880}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
          {isEdit && lote.status === 'Autorizado' && (
            <button className="btn-secondary" onClick={imprimir}>
              <Printer size={14} style={{ marginRight: 4 }} /> Imprimir
            </button>
          )}
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
        </div>
      )}

      {rechazando && (
        <div style={{ marginBottom: 14 }}>
          <label className="label">Motivo del rechazo *</label>
          <textarea className="input" rows={2} value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)}
            placeholder="Explica por qué se rechaza este rol de pagos" />
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
          <label className="label">Centro de Costo</label>
          <select className="select" value={ccId} onChange={e => setCcId(e.target.value)} disabled={!editable}>
            <option value="">— Sin especificar —</option>
            {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label">Notas</label>
        <input className="input" value={notas} onChange={e => setNotas(e.target.value)} disabled={!editable} placeholder="Notas adicionales del periodo" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Colaboradores {trabajadores.length > 0 && <span style={{ color: 'var(--blue)', marginLeft: 4 }}>{trabajadores.length}</span>}
        </span>
        {editable && dias.length > 0 && (
          <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={addTrabajador}>
            + Agregar colaborador
          </button>
        )}
      </div>

      {dias.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed #e2e8f0', borderRadius: 8 }}>
          Selecciona el periodo (fecha desde / hasta) para capturar asistencia
        </div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 180 }}>Nombre</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 120 }}>Puesto</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 80 }}>$/día</th>
                  {dias.map(f => {
                    const { letra, num } = diaLabel(f)
                    return <th key={f} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', width: 40 }}>{letra}<br />{num}</th>
                  })}
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Días</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monto a Pagar</th>
                  {isEdit && <th style={{ width: 32 }}></th>}
                  {editable && <th style={{ width: 28 }}></th>}
                </tr>
              </thead>
              <tbody>
                {trabajadores.length === 0 ? (
                  <tr><td colSpan={dias.length + 5 + (isEdit ? 1 : 0)} style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)' }}>Sin colaboradores capturados</td></tr>
                ) : trabajadores.map(t => (
                  <tr key={t.tempId} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 6px' }}>
                      {editable ? (
                        <ColaboradorPopup
                          value={{ id: t.id_colaborador_fk, nombre: t.nombre }}
                          onChange={c => updateTrabajador(t.tempId, {
                            id_colaborador_fk: c?.id ?? null,
                            nombre: c?.nombre ?? '',
                            puesto: c?.puesto ?? t.puesto,
                            costo_dia: c?.sueldo_diario != null ? String(c.sueldo_diario) : t.costo_dia,
                          })}
                        />
                      ) : (
                        <span style={{ fontSize: 12 }}>{t.nombre || '—'}</span>
                      )}
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input className="input" style={{ padding: '4px 6px', fontSize: 12 }}
                        value={t.puesto} disabled={!editable} onChange={e => updateTrabajador(t.tempId, { puesto: e.target.value })} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input className="input" type="number" step="0.01" style={{ padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                        value={t.costo_dia} disabled={!editable} onChange={e => updateTrabajador(t.tempId, { costo_dia: e.target.value })} />
                    </td>
                    {dias.map(f => (
                      <td key={f} style={{ padding: '2px', textAlign: 'center' }}>
                        <button type="button" disabled={!editable} onClick={() => toggleAsistencia(t.tempId, f)}
                          title={t.asistencias[f] ? 'Asistió' : 'No trabajó'}
                          style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 5,
                            background: t.asistencias[f] ? '#dcfce7' : '#fff', cursor: editable ? 'pointer' : 'default',
                            color: t.asistencias[f] ? '#15803d' : '#cbd5e1', fontWeight: 700, fontSize: 13 }}>
                          {t.asistencias[f] ? '✓' : '—'}
                        </button>
                      </td>
                    ))}
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600 }}>{diasTrabajador(t)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(costoTrabajador(t))}</td>
                    {isEdit && (
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button type="button" onClick={() => imprimirRecibo(t)} title="Imprimir recibo de dinero"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1' }}>
                          <Printer size={13} />
                        </button>
                      </td>
                    )}
                    {editable && (
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button type="button" onClick={() => removeTrabajador(t.tempId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {trabajadores.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <td colSpan={dias.length + 4} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 12 }}>Total del rol de pagos</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: 13 }}>{fmt(totalLote)}</td>
                    {isEdit && <td></td>}
                    {editable && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ── Popup selector de Colaborador (cfg.colaboradores) ────────────────────
function ColaboradorPopup({ value, onChange }: {
  value: { id: number | null; nombre: string }
  onChange: (c: Colaborador & { nombre: string } | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    dbCfg.from('colaboradores').select('*').eq('activo', true).order('nombre')
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
                  onClick={() => { onChange({ ...c, nombre }); setOpen(false); setQuery('') }}
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
