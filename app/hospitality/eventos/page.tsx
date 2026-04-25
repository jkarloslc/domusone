'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp } from '@/lib/supabase'
import ModalShell from '@/components/ui/ModalShell'
import {
  Plus, Star, MapPin, Calendar, Users, DollarSign,
  FileText, Trash2, Edit2, ChevronLeft, Receipt, ShoppingBag,
  Printer, X, Check,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────

type TipoEvento = { id: number; nombre: string; color: string }
type Lugar      = { id: number; nombre: string; capacidad: number | null }

type Evento = {
  id: number
  folio: string
  nombre: string
  id_tipo_evento_fk: number | null
  id_lugar_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
  num_asistentes: number | null
  responsable: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_email: string | null
  notas: string | null
  status: string
  cat_tipos_evento?: { nombre: string; color: string }
  cat_lugares?: { nombre: string }
}

type Ingreso = {
  id: number
  folio: string
  descripcion: string
  monto: number
  fecha_pago: string
  forma_pago: string
  referencia: string | null
  notas: string | null
}

type OP = {
  id: number
  folio: string
  concepto: string
  monto: number
  saldo: number
  status: string
  id_proveedor_fk: number | null
}

type EventoOP = { id: number; id_op_fk: number }

// ── Constants ────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Cotización': { bg: '#f0fdf4', color: '#16a34a' },
  'Confirmado': { bg: '#eff6ff', color: '#2563eb' },
  'En curso':   { bg: '#fff7ed', color: '#ea580c' },
  'Realizado':  { bg: '#f0fdf4', color: '#15803d' },
  'Cancelado':  { bg: '#fef2f2', color: '#dc2626' },
}

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro']
const STATUSES    = ['Cotización', 'Confirmado', 'En curso', 'Realizado', 'Cancelado']

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Component ────────────────────────────────────────────────

export default function EventosPage() {
  // Catálogos
  const [tipos,   setTipos]   = useState<TipoEvento[]>([])
  const [lugares, setLugares] = useState<Lugar[]>([])

  // Lista
  const [eventos,  setEventos]  = useState<Evento[]>([])
  const [loading,  setLoading]  = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  // Modal
  const [modal,    setModal]    = useState(false)
  const [editEvt,  setEditEvt]  = useState<Evento | null>(null)
  const [activeTab, setActiveTab] = useState('info')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  // Formulario
  const blankForm = () => ({
    nombre: '', id_tipo_evento_fk: '' as number | '',
    id_lugar_fk: '' as number | '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: '', hora_inicio: '', hora_fin: '',
    num_asistentes: '' as number | '', responsable: '',
    cliente_nombre: '', cliente_telefono: '', cliente_email: '',
    notas: '', status: 'Cotización',
  })
  const [form, setForm] = useState(blankForm())

  // Ingresos
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [ingresoForm, setIngresoForm] = useState({ descripcion: '', monto: '', fecha_pago: new Date().toISOString().split('T')[0], forma_pago: 'Transferencia', referencia: '', notas: '' })
  const [savingIngreso, setSavingIngreso] = useState(false)

  // OPs
  const [ops,      setOps]      = useState<OP[]>([])
  const [evtOps,   setEvtOps]   = useState<EventoOP[]>([])
  const [busqOP,   setBusqOP]   = useState('')
  const [opsComp,  setOpsComp]  = useState<OP[]>([])
  const [loadingOps, setLoadingOps] = useState(false)
  const [provMap,  setProvMap]  = useState<Record<number, string>>({})

  // ── Load catálogos ─────────────────────────────────────────
  useEffect(() => {
    dbCtrl.from('cat_tipos_evento').select('id, nombre, color').eq('activo', true).order('nombre')
      .then(({ data }: any) => setTipos(data ?? []))
    dbCtrl.from('cat_lugares').select('id, nombre, capacidad').eq('activo', true).order('nombre')
      .then(({ data }: any) => setLugares(data ?? []))
    dbComp.from('proveedores').select('id, nombre').eq('activo', true)
      .then(({ data }) => {
        const m: Record<number, string> = {}
        ;(data ?? []).forEach((p: any) => { m[p.id] = p.nombre })
        setProvMap(m)
      })
  }, [])

  // ── Load eventos ───────────────────────────────────────────
  const loadEventos = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('eventos')
      .select('id, folio, nombre, id_tipo_evento_fk, id_lugar_fk, fecha_inicio, fecha_fin, hora_inicio, hora_fin, num_asistentes, responsable, cliente_nombre, cliente_telefono, cliente_email, notas, status, cat_tipos_evento(nombre, color), cat_lugares(nombre)')
      .order('fecha_inicio', { ascending: false })
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data } = await q
    setEventos((data as unknown as Evento[]) ?? [])
    setLoading(false)
  }, [filtroStatus])

  useEffect(() => { loadEventos() }, [loadEventos])

  // ── Load ingresos y OPs del evento seleccionado ────────────
  const loadEventoDetalle = useCallback(async (evtId: number) => {
    const [{ data: ing }, { data: eops }] = await Promise.all([
      dbCtrl.from('eventos_ingresos').select('id, folio, descripcion, monto, fecha_pago, forma_pago, referencia, notas').eq('id_evento_fk', evtId).order('fecha_pago'),
      dbCtrl.from('eventos_ops').select('id, id_op_fk').eq('id_evento_fk', evtId),
    ])
    setIngresos((ing as unknown as Ingreso[]) ?? [])
    const evOps = (eops as unknown as EventoOP[]) ?? []
    setEvtOps(evOps)
    if (evOps.length > 0) {
      const ids = evOps.map(e => e.id_op_fk)
      const { data: opData } = await dbComp.from('ordenes_pago')
        .select('id, folio, concepto, monto, saldo, status, id_proveedor_fk')
        .in('id', ids)
      setOps((opData as unknown as OP[]) ?? [])
    } else {
      setOps([])
    }
  }, [])

  // ── Open modal ─────────────────────────────────────────────
  const openNew = () => {
    setEditEvt(null)
    setForm(blankForm())
    setIngresos([]); setOps([]); setEvtOps([])
    setActiveTab('info')
    setErr('')
    setModal(true)
  }

  const openEdit = async (ev: Evento) => {
    setEditEvt(ev)
    setForm({
      nombre: ev.nombre,
      id_tipo_evento_fk: ev.id_tipo_evento_fk ?? '',
      id_lugar_fk: ev.id_lugar_fk ?? '',
      fecha_inicio: ev.fecha_inicio,
      fecha_fin: ev.fecha_fin ?? '',
      hora_inicio: ev.hora_inicio ?? '',
      hora_fin: ev.hora_fin ?? '',
      num_asistentes: ev.num_asistentes ?? '',
      responsable: ev.responsable ?? '',
      cliente_nombre: ev.cliente_nombre ?? '',
      cliente_telefono: ev.cliente_telefono ?? '',
      cliente_email: ev.cliente_email ?? '',
      notas: ev.notas ?? '',
      status: ev.status,
    })
    setActiveTab('info')
    setErr('')
    setModal(true)
    await loadEventoDetalle(ev.id)
  }

  // ── Save evento ────────────────────────────────────────────
  const saveEvento = async () => {
    if (!form.nombre.trim()) { setErr('El nombre del evento es obligatorio'); return }
    if (!form.fecha_inicio)  { setErr('La fecha de inicio es obligatoria'); return }
    setSaving(true); setErr('')
    const payload = {
      nombre:              form.nombre.trim(),
      id_tipo_evento_fk:   form.id_tipo_evento_fk || null,
      id_lugar_fk:         form.id_lugar_fk || null,
      fecha_inicio:        form.fecha_inicio,
      fecha_fin:           form.fecha_fin || null,
      hora_inicio:         form.hora_inicio || null,
      hora_fin:            form.hora_fin || null,
      num_asistentes:      form.num_asistentes || null,
      responsable:         form.responsable || null,
      cliente_nombre:      form.cliente_nombre || null,
      cliente_telefono:    form.cliente_telefono || null,
      cliente_email:       form.cliente_email || null,
      notas:               form.notas || null,
      status:              form.status,
    }
    if (editEvt) {
      const { error } = await dbCtrl.from('eventos').update(payload).eq('id', editEvt.id)
      if (error) { setErr(error.message); setSaving(false); return }
    } else {
      const { error } = await dbCtrl.from('eventos').insert(payload)
      if (error) { setErr(error.message); setSaving(false); return }
    }
    setSaving(false)
    setModal(false)
    loadEventos()
  }

  // ── Eliminar evento ────────────────────────────────────────
  const deleteEvento = async (id: number) => {
    if (!confirm('¿Eliminar este evento? Se borrarán sus ingresos y relaciones con OPs.')) return
    await dbCtrl.from('eventos').delete().eq('id', id)
    loadEventos()
  }

  // ── Save ingreso ───────────────────────────────────────────
  const saveIngreso = async () => {
    if (!editEvt) return
    if (!ingresoForm.descripcion.trim()) { setErr('Descripción requerida'); return }
    if (!ingresoForm.monto || Number(ingresoForm.monto) <= 0) { setErr('Monto debe ser mayor a 0'); return }
    setSavingIngreso(true); setErr('')
    const { error } = await dbCtrl.from('eventos_ingresos').insert({
      id_evento_fk: editEvt.id,
      descripcion:  ingresoForm.descripcion.trim(),
      monto:        Number(ingresoForm.monto),
      fecha_pago:   ingresoForm.fecha_pago,
      forma_pago:   ingresoForm.forma_pago,
      referencia:   ingresoForm.referencia || null,
      notas:        ingresoForm.notas || null,
    })
    if (error) { setErr(error.message); setSavingIngreso(false); return }
    setSavingIngreso(false)
    setIngresoForm({ descripcion: '', monto: '', fecha_pago: new Date().toISOString().split('T')[0], forma_pago: 'Transferencia', referencia: '', notas: '' })
    await loadEventoDetalle(editEvt.id)
  }

  const deleteIngreso = async (id: number) => {
    if (!editEvt) return
    await dbCtrl.from('eventos_ingresos').delete().eq('id', id)
    loadEventoDetalle(editEvt.id)
  }

  // ── Buscar OPs para vincular ───────────────────────────────
  const buscarOPs = async () => {
    if (!busqOP.trim()) return
    setLoadingOps(true)
    const term = busqOP.trim()
    // Busca por concepto OR por folio (ambos campos relevantes)
    const { data, error } = await dbComp.from('ordenes_pago')
      .select('id, folio, concepto, monto, saldo, status, id_proveedor_fk')
      .or(`concepto.ilike.%${term}%,folio.ilike.%${term}%`)
      .limit(20)
    if (error) console.error('Error buscando OPs:', error)
    setOpsComp((data as unknown as OP[]) ?? [])
    setLoadingOps(false)
  }

  const vincularOP = async (op: OP) => {
    if (!editEvt) return
    if (evtOps.find(e => e.id_op_fk === op.id)) return // ya vinculada
    await dbCtrl.from('eventos_ops').insert({ id_evento_fk: editEvt.id, id_op_fk: op.id })
    loadEventoDetalle(editEvt.id)
  }

  const desvincularOP = async (evtOpId: number) => {
    await dbCtrl.from('eventos_ops').delete().eq('id', evtOpId)
    if (editEvt) loadEventoDetalle(editEvt.id)
  }

  // ── Imprimir recibo de ingreso ─────────────────────────────
  const printRecibo = (ing: Ingreso) => {
    const evtNombre = editEvt?.nombre ?? ''
    const lugar     = editEvt?.cat_lugares?.nombre ?? ''
    const win = window.open('', '_blank', 'width=700,height=900')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Recibo ${ing.folio}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e1e1e; background: #fff; }
  .header { background: linear-gradient(135deg, #7e22ce, #a855f7); color: #fff; padding: 24px 28px; border-radius: 12px; margin-bottom: 24px; }
  .header h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .header p { font-size: 12px; opacity: 0.75; }
  .folio { font-size: 28px; font-weight: 800; letter-spacing: 0.05em; color: #fff; margin-top: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .field label { display: block; font-size: 10px; font-weight: 700; color: #9333ea; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
  .field span { font-size: 14px; color: #1e1e1e; }
  .monto-box { background: #faf5ff; border: 2px solid #d8b4fe; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .monto-box .label { font-size: 12px; color: #9333ea; font-weight: 600; }
  .monto-box .value { font-size: 28px; font-weight: 800; color: #7e22ce; }
  .firma { margin-top: 40px; display: flex; gap: 40px; }
  .firma-line { flex: 1; border-top: 1px solid #ccc; padding-top: 8px; font-size: 11px; color: #666; text-align: center; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <h1>Recibo de Ingreso — Hospitality</h1>
  <p>Club Balvanera · Hospitality</p>
  <div class="folio">${ing.folio}</div>
</div>
<div class="grid">
  <div class="field"><label>Evento</label><span>${evtNombre}</span></div>
  <div class="field"><label>Lugar</label><span>${lugar || '—'}</span></div>
  <div class="field"><label>Descripción</label><span>${ing.descripcion}</span></div>
  <div class="field"><label>Fecha de pago</label><span>${fmtFecha(ing.fecha_pago)}</span></div>
  <div class="field"><label>Forma de pago</label><span>${ing.forma_pago}</span></div>
  <div class="field"><label>Referencia</label><span>${ing.referencia || '—'}</span></div>
</div>
<div class="monto-box">
  <div class="label">MONTO TOTAL</div>
  <div class="value">${fmt$(ing.monto)}</div>
</div>
${ing.notas ? `<p style="font-size:12px;color:#666;margin-bottom:20px;"><strong>Notas:</strong> ${ing.notas}</p>` : ''}
<div class="firma">
  <div class="firma-line">Recibió</div>
  <div class="firma-line">Responsable del Evento</div>
</div>
</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  // ── Filtrado local ─────────────────────────────────────────
  const eventosFiltrados = eventos.filter(e =>
    e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
    (e.cliente_nombre ?? '').toLowerCase().includes(busqueda.toLowerCase())
  )

  // ── KPIs ───────────────────────────────────────────────────
  const totalEventos    = eventos.length
  const confirmados     = eventos.filter(e => e.status === 'Confirmado' || e.status === 'En curso').length
  const realizados      = eventos.filter(e => e.status === 'Realizado').length

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <a href="/hospitality" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
          <ChevronLeft size={15} /> Hospitality
        </a>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Eventos</span>
      </div>

      {/* Título + botón nuevo */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>Eventos</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {eventosFiltrados.length} evento{eventosFiltrados.length !== 1 ? 's' : ''} en los filtros actuales
          </p>
        </div>
        <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexShrink: 0 }}>
          <Plus size={14} /> Nuevo Evento
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total eventos', value: totalEventos, color: '#9333ea', bg: '#faf5ff' },
          { label: 'Confirmados / En curso', value: confirmados, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Realizados', value: realizados, color: '#16a34a', bg: '#f0fdf4' },
        ].map(k => (
          <div key={k.label} className="card" style={{ flex: '1 1 160px', padding: '12px 16px', minWidth: 140 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="input" placeholder="Buscar por nombre, folio o cliente…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, fontSize: 13 }} />
        <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ fontSize: 13, width: 180, flexShrink: 0 }}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : eventosFiltrados.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Sin eventos registrados
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                {['Folio', 'Nombre', 'Tipo', 'Lugar', 'Fecha inicio', 'Cliente', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventosFiltrados.map((ev, i) => {
                const sc = STATUS_COLORS[ev.status] ?? { bg: '#f8fafc', color: '#64748b' }
                const tipo = ev.cat_tipos_evento
                return (
                  <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#9333ea', fontFamily: 'monospace', fontSize: 11 }}>{ev.folio}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{ev.nombre}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {tipo ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: tipo.color + '22', color: tipo.color }}>
                          {tipo.nombre}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={11} />{ev.cat_lugares?.nombre ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtFecha(ev.fecha_inicio)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{ev.cliente_nombre ?? '—'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{ev.status}</span>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-ghost" onClick={() => openEdit(ev)} style={{ padding: '4px 8px', fontSize: 11 }}>
                          <Edit2 size={12} />
                        </button>
                        <button className="btn-ghost" onClick={() => deleteEvento(ev.id)} style={{ padding: '4px 8px', fontSize: 11, color: '#dc2626' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL ── */}
      {modal && (
        <ModalShell
          modulo="default"
          titulo={editEvt ? `${editEvt.folio} — ${editEvt.nombre}` : 'Nuevo Evento'}
          subtitulo={editEvt ? editEvt.status : 'Hospitality'}
          icono={Star}
          maxWidth={820}
          onClose={() => setModal(false)}
          tabs={[
            { key: 'info',      label: 'Información', icon: Star },
            { key: 'ingresos',  label: 'Ingresos',    icon: DollarSign, badge: editEvt ? ingresos.length || undefined : undefined, disabled: !editEvt, disabledHint: 'Guarda el evento primero' },
            { key: 'gastos',    label: 'Gastos / OPs', icon: ShoppingBag, badge: editEvt ? ops.length || undefined : undefined,    disabled: !editEvt, disabledHint: 'Guarda el evento primero' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          footer={activeTab === 'info' ? (
            <>
              <button className="btn-ghost" onClick={() => setModal(false)} style={{ fontSize: 13 }}>Cancelar</button>
              <button className="btn-primary" onClick={saveEvento} disabled={saving} style={{ fontSize: 13 }}>
                {saving ? 'Guardando…' : editEvt ? 'Guardar cambios' : 'Crear evento'}
              </button>
            </>
          ) : activeTab === 'ingresos' ? (
            <>
              {editEvt && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Total ingresos: <strong style={{ color: '#9333ea' }}>{fmt$(ingresos.reduce((s, i) => s + i.monto, 0))}</strong>
                </div>
              )}
            </>
          ) : undefined}
        >
          {/* ── TAB INFO ── */}
          {activeTab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 12 }}>{err}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del evento *</label>
                  <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo de evento</label>
                  <select className="input" value={form.id_tipo_evento_fk} onChange={e => setForm(f => ({ ...f, id_tipo_evento_fk: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }}>
                    <option value="">— Seleccionar —</option>
                    {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Lugar / Salón</label>
                  <select className="input" value={form.id_lugar_fk} onChange={e => setForm(f => ({ ...f, id_lugar_fk: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }}>
                    <option value="">— Seleccionar —</option>
                    {lugares.map(l => <option key={l.id} value={l.id}>{l.nombre}{l.capacidad ? ` (cap. ${l.capacidad})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha inicio *</label>
                  <input className="input" type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha fin</label>
                  <input className="input" type="date" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hora inicio</label>
                  <input className="input" type="time" value={form.hora_inicio} onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hora fin</label>
                  <input className="input" type="time" value={form.hora_fin} onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>N° de asistentes</label>
                  <input className="input" type="number" value={form.num_asistentes} onChange={e => setForm(f => ({ ...f, num_asistentes: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
                  <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ fontSize: 13, width: '100%' }}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Responsable interno</label>
                  <input className="input" value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
              </div>

              {/* Cliente */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9333ea', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Datos del cliente</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre</label>
                    <input className="input" value={form.cliente_nombre} onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Teléfono</label>
                    <input className="input" value={form.cliente_telefono} onChange={e => setForm(f => ({ ...f, cliente_telefono: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email</label>
                    <input className="input" type="email" value={form.cliente_email} onChange={e => setForm(f => ({ ...f, cliente_email: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Notas */}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
                <textarea className="input" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={3} style={{ fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>
            </div>
          )}

          {/* ── TAB INGRESOS ── */}
          {activeTab === 'ingresos' && editEvt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 12 }}>{err}</div>}

              {/* Formulario nuevo ingreso */}
              <div className="card" style={{ background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9333ea', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Registrar ingreso</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Descripción *</label>
                    <input className="input" value={ingresoForm.descripcion} onChange={e => setIngresoForm(f => ({ ...f, descripcion: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Monto *</label>
                    <input className="input" type="number" value={ingresoForm.monto} onChange={e => setIngresoForm(f => ({ ...f, monto: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Fecha de pago</label>
                    <input className="input" type="date" value={ingresoForm.fecha_pago} onChange={e => setIngresoForm(f => ({ ...f, fecha_pago: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Forma de pago</label>
                    <select className="input" value={ingresoForm.forma_pago} onChange={e => setIngresoForm(f => ({ ...f, forma_pago: e.target.value }))} style={{ fontSize: 13, width: '100%' }}>
                      {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Referencia</label>
                    <input className="input" value={ingresoForm.referencia} onChange={e => setIngresoForm(f => ({ ...f, referencia: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Notas</label>
                    <input className="input" value={ingresoForm.notas} onChange={e => setIngresoForm(f => ({ ...f, notas: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" onClick={saveIngreso} disabled={savingIngreso} style={{ fontSize: 12, background: '#9333ea' }}>
                    {savingIngreso ? 'Guardando…' : '+ Registrar ingreso'}
                  </button>
                </div>
              </div>

              {/* Lista de ingresos */}
              {ingresos.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Sin ingresos registrados</div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                        {['Folio', 'Descripción', 'Fecha', 'Forma', 'Referencia', 'Monto', ''].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ingresos.map((ing, i) => (
                        <tr key={ing.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#9333ea', fontFamily: 'monospace', fontSize: 10 }}>{ing.folio}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>{ing.descripcion}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(ing.fecha_pago)}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ing.forma_pago}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ing.referencia ?? '—'}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a' }}>{fmt$(ing.monto)}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn-ghost" onClick={() => printRecibo(ing)} style={{ padding: '3px 6px', fontSize: 10 }} title="Imprimir recibo">
                                <Printer size={11} />
                              </button>
                              <button className="btn-ghost" onClick={() => deleteIngreso(ing.id)} style={{ padding: '3px 6px', fontSize: 10, color: '#dc2626' }}>
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                        <td colSpan={5} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a' }}>{fmt$(ingresos.reduce((s, i) => s + i.monto, 0))}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB GASTOS / OPs ── */}
          {activeTab === 'gastos' && editEvt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Buscador de OPs */}
              <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Vincular Orden de Pago</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input className="input" placeholder="Buscar por concepto…" value={busqOP} onChange={e => setBusqOP(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscarOPs()} style={{ flex: 1, fontSize: 12 }} />
                  <button className="btn-primary" onClick={buscarOPs} disabled={loadingOps} style={{ fontSize: 12, background: '#16a34a' }}>
                    {loadingOps ? '…' : 'Buscar'}
                  </button>
                </div>
                {opsComp.length > 0 && (
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    {opsComp.map(op => {
                      const yaVinculada = evtOps.some(e => e.id_op_fk === op.id)
                      return (
                        <div key={op.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                          <div>
                            <span style={{ fontWeight: 700, color: '#16a34a', marginRight: 8, fontFamily: 'monospace' }}>{op.folio}</span>
                            <span style={{ color: 'var(--text-primary)' }}>{op.concepto}</span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? '') : ''}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{fmt$(op.monto)}</span>
                            {yaVinculada ? (
                              <span style={{ fontSize: 10, color: '#16a34a' }}>✓ Vinculada</span>
                            ) : (
                              <button className="btn-primary" onClick={() => vincularOP(op)} style={{ fontSize: 11, padding: '3px 8px', background: '#16a34a' }}>Vincular</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* OPs vinculadas */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                OPs vinculadas ({ops.length})
              </div>
              {ops.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Sin OPs vinculadas</div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                        {['Folio', 'Concepto', 'Proveedor', 'Monto', 'Saldo', 'Status', ''].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ops.map((op, i) => {
                        const eop = evtOps.find(e => e.id_op_fk === op.id)
                        return (
                          <tr key={op.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 10 }}>{op.folio}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>{op.concepto}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : '—'}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt$(op.monto)}</td>
                            <td style={{ padding: '8px 10px', color: op.saldo > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{fmt$(op.saldo)}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#f8fafc', color: '#64748b', fontWeight: 600 }}>{op.status}</span>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {eop && (
                                <button className="btn-ghost" onClick={() => desvincularOP(eop.id)} style={{ padding: '3px 6px', fontSize: 10, color: '#dc2626' }} title="Desvincular">
                                  <X size={11} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                        <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{fmt$(ops.reduce((s, o) => s + o.monto, 0))}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#dc2626' }}>{fmt$(ops.reduce((s, o) => s + o.saldo, 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </ModalShell>
      )}
    </div>
  )
}
