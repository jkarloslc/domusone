'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, X, Save, Loader, RefreshCw, Edit2, Trash2, Printer,
  Filter, CheckCircle, RotateCcw, AlertTriangle,
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

const CONDICIONES = ['Bueno', 'Regular', 'Dañado']

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Prestado':  { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Atrasado':  { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  'Devuelto':  { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
}

const Badge = ({ text }: { text: string }) => {
  const s = STATUS_STYLE[text] ?? STATUS_STYLE['Prestado']
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

const fmtF = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtH = (h: string | null) => h ? h.slice(0, 5) : '—'

const todayISO = () => new Date().toISOString().slice(0, 10)
const nowHHMM  = () => new Date().toTimeString().slice(0, 5)

const esc = (v: string | number | null | undefined) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Estado visual: si sigue prestado y ya pasó la fecha programada, se muestra "Atrasado"
const estadoVisual = (p: any) => {
  if (p.status === 'Devuelto') return 'Devuelto'
  if (p.fecha_entrega_prog && p.fecha_entrega_prog < todayISO()) return 'Atrasado'
  return 'Prestado'
}

// ══════════════════════════════════════════════════════════════
export default function PrestamosTab({ herramientas, herrMap, areaMap, areas, onChanged }: {
  herramientas: any[]
  herrMap: Record<number, any>
  areaMap: Record<number, string>
  areas: any[]
  onChanged: () => void
}) {
  const { canWrite, canDelete, authUser } = useAuth()
  const [registros, setRegistros] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filterHerr,   setFilterHerr]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDesde,  setFilterDesde]  = useState('')
  const [filterHasta,  setFilterHasta]  = useState('')
  const [modal,       setModal]       = useState<{ open: boolean; p?: any }>({ open: false })
  const [modalDevol,  setModalDevol]  = useState<{ open: boolean; p?: any }>({ open: false })

  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('prestamos_herramientas').select('*').eq('activo', true)
      .order('fecha_prestamo', { ascending: false }).order('id', { ascending: false })
    if (filterHerr)   q = q.eq('id_herramienta_fk', Number(filterHerr))
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterDesde)  q = q.gte('fecha_prestamo', filterDesde)
    if (filterHasta)  q = q.lte('fecha_prestamo', filterHasta)
    const { data } = await q
    setRegistros(data ?? [])
    setLoading(false)
  }, [filterHerr, filterStatus, filterDesde, filterHasta])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  const handleDelete = async (id: number) => {
    const reg = registros.find(r => r.id === id)
    if (reg && reg.status === 'Prestado') {
      alert('Este préstamo sigue abierto (la herramienta no ha sido devuelta).\n\nRegistra la devolución antes de eliminar el folio, para mantener correcto el control del equipo.')
      return
    }
    if (!confirm('¿Eliminar este registro de préstamo?')) return
    await dbCtrl.from('prestamos_herramientas').update({ activo: false }).eq('id', id)
    fetchRegistros()
  }

  // KPIs
  const activos    = registros.filter(p => p.status === 'Prestado')
  const atrasados  = activos.filter(p => p.fecha_entrega_prog && p.fecha_entrega_prog < todayISO())
  const devueltos  = registros.filter(p => p.status === 'Devuelto')

  const imprimirTicket = (p: any) => {
    const h = herrMap[p.id_herramienta_fk]
    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>Ticket de Préstamo ${esc(p.folio)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:12px; color:#1e293b; background:#f1f5f9; padding:16px; }
  .ticket { max-width:320px; margin:0 auto; background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:18px 20px; }
  h1 { font-size:15px; font-weight:800; text-align:center; color:#1e293b; }
  .sub { text-align:center; font-size:10px; color:#64748b; margin-top:2px; margin-bottom:10px; }
  .folio { text-align:center; font-size:20px; font-weight:900; color:#2563eb; margin:8px 0 12px; letter-spacing:0.04em; }
  hr { border:none; border-top:1px dashed #cbd5e1; margin:10px 0; }
  .row { display:flex; justify-content:space-between; gap:10px; padding:3px 0; font-size:12px; }
  .lbl { color:#64748b; }
  .val { font-weight:700; text-align:right; }
  .section-title { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#2563eb; margin:10px 0 4px; }
  .firma { margin-top:26px; border-top:1px solid #1e293b; padding-top:4px; text-align:center; font-size:10px; color:#64748b; }
  .firmas { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:30px; }
  .footer { text-align:center; font-size:10px; color:#94a3b8; margin-top:16px; }
  .no-print { text-align:center; margin-bottom:14px; }
  @media print { .no-print { display:none; } body { background:#fff; padding:0; } .ticket { border:none; } }
</style></head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨 Imprimir</button>
  </div>
  <div class="ticket">
    <h1>Ticket de Préstamo de Herramienta</h1>
    <div class="sub">Equipo &amp; Herramienta — Operaciones</div>
    <div class="folio">${esc(p.folio)}</div>
    <hr/>
    <div class="row"><span class="lbl">Herramienta</span><span class="val">${esc(h?.descripcion ?? `#${p.id_herramienta_fk}`)}</span></div>
    ${h?.marca || h?.modelo ? `<div class="row"><span class="lbl">Marca / Modelo</span><span class="val">${esc([h?.marca, h?.modelo].filter(Boolean).join(' / '))}</span></div>` : ''}
    ${h?.no_serie ? `<div class="row"><span class="lbl">No. Serie</span><span class="val">${esc(h.no_serie)}</span></div>` : ''}
    <hr/>
    <div class="row"><span class="lbl">Solicitante</span><span class="val">${esc(p.solicitante)}</span></div>
    ${p.id_area_fk ? `<div class="row"><span class="lbl">Área / Destino</span><span class="val">${esc(areaMap[p.id_area_fk] ?? '—')}</span></div>` : ''}
    <div class="row"><span class="lbl">Fecha préstamo</span><span class="val">${esc(fmtF(p.fecha_prestamo))} ${esc(fmtH(p.hora_prestamo))}</span></div>
    ${p.fecha_entrega_prog ? `<div class="row"><span class="lbl">Devolución prog.</span><span class="val">${esc(fmtF(p.fecha_entrega_prog))}</span></div>` : ''}
    ${p.condicion_entrega ? `<div class="row"><span class="lbl">Condición al entregar</span><span class="val">${esc(p.condicion_entrega)}</span></div>` : ''}
    ${p.entrega_responsable ? `<div class="row"><span class="lbl">Entrega</span><span class="val">${esc(p.entrega_responsable)}</span></div>` : ''}
    ${p.notas ? `<div class="section-title">Notas</div><div style="font-size:11px;">${esc(p.notas)}</div>` : ''}
    <div class="firmas">
      <div class="firma">Recibe / Solicitante</div>
      <div class="firma">Entrega / Responsable</div>
    </div>
    <div class="footer">Conserve este ticket para la devolución del equipo</div>
  </div>
</body></html>`
    const w = window.open('', '_blank', 'width=420,height=720')
    if (w) { w.document.write(html); w.document.close(); w.focus() }
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Préstamos activos', value: activos.length,   color: '#2563eb', bg: '#eff6ff' },
          { label: 'Atrasados',         value: atrasados.length, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Devueltos',         value: devueltos.length, color: '#15803d', bg: '#f0fdf4' },
          { label: 'Total registros',   value: registros.length, color: '#64748b', bg: '#f8fafc' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 12px', background: k.bg }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
        padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          <Filter size={11} /> Filtros
        </span>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        <select className="select" style={{ flex: '1 1 160px', maxWidth: 220, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterHerr} onChange={e => setFilterHerr(e.target.value)}>
          <option value="">Todas las herramientas</option>
          {herramientas.map(h => <option key={h.id} value={h.id}>{h.descripcion}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 110px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Status</option>
          <option value="Prestado">Prestado</option>
          <option value="Devuelto">Devuelto</option>
        </select>
        <input className="input" type="date" title="Desde" style={{ flex: '1 1 120px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterDesde} onChange={e => setFilterDesde(e.target.value)} />
        <input className="input" type="date" title="Hasta" style={{ flex: '1 1 120px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterHasta} onChange={e => setFilterHasta(e.target.value)} />
        {(filterHerr || filterStatus || filterDesde || filterHasta) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setFilterHerr(''); setFilterStatus(''); setFilterDesde(''); setFilterHasta('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }} onClick={fetchRegistros}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }}
            onClick={() => setModal({ open: true })}>
            <Plus size={12} /> Nuevo Préstamo
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              {['Folio', 'Herramienta', 'Solicitante', 'Área', 'F. Préstamo', 'Devol. Prog.', 'F. Devolución', 'Status', ''].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                Sin préstamos registrados. Usa <strong>Nuevo Préstamo</strong> para comenzar.
              </td></tr>
            ) : registros.map(p => {
              const h = herrMap[p.id_herramienta_fk]
              const estado = estadoVisual(p)
              return (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, padding: '8px 10px' }}>{p.folio}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{h?.descripcion ?? `#${p.id_herramienta_fk}`}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h?.no_serie ?? ''}</div>
                  </td>
                  <td style={{ fontSize: 12, padding: '8px 10px' }}>{p.solicitante}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>
                    {p.id_area_fk ? (areaMap[p.id_area_fk] ?? '—') : '—'}
                  </td>
                  <td style={{ fontSize: 11, padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtF(p.fecha_prestamo)} {fmtH(p.hora_prestamo)}</td>
                  <td style={{ fontSize: 11, padding: '8px 10px', color: estado === 'Atrasado' ? '#dc2626' : 'var(--text-muted)', fontWeight: estado === 'Atrasado' ? 700 : 400 }}>
                    {fmtF(p.fecha_entrega_prog)}
                  </td>
                  <td style={{ fontSize: 11, padding: '8px 10px', color: 'var(--text-muted)' }}>
                    {p.fecha_devolucion ? `${fmtF(p.fecha_devolucion)} ${fmtH(p.hora_devolucion)}` : '—'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <Badge text={estado} />
                  </td>
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ padding: '3px 5px' }} title="Imprimir ticket" onClick={() => imprimirTicket(p)}>
                      <Printer size={12} />
                    </button>
                    {canWrite('mantenimiento') && p.status === 'Prestado' && (
                      <button className="btn-ghost" style={{ padding: '3px 5px', color: '#15803d' }} title="Registrar devolución"
                        onClick={() => setModalDevol({ open: true, p })}>
                        <RotateCcw size={12} />
                      </button>
                    )}
                    {canWrite('mantenimiento') && (
                      <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setModal({ open: true, p })}>
                        <Edit2 size={12} />
                      </button>
                    )}
                    {canDelete() && (
                      <button className="btn-ghost" style={{ padding: '3px 5px', color: '#dc2626' }} onClick={() => handleDelete(p.id)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal: Nuevo / Editar préstamo */}
      {modal.open && (
        <PrestamoModal p={modal.p} herramientas={herramientas} areas={areas}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); fetchRegistros(); onChanged() }} />
      )}

      {/* Modal: Registrar devolución */}
      {modalDevol.open && modalDevol.p && (
        <DevolucionModal p={modalDevol.p} herrMap={herrMap}
          onClose={() => setModalDevol({ open: false })}
          onSaved={() => { setModalDevol({ open: false }); fetchRegistros(); onChanged() }} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Crear / Editar Préstamo
// ══════════════════════════════════════════════════════════════
function PrestamoModal({ p, herramientas, areas, onClose, onSaved }: {
  p?: any; herramientas: any[]; areas: any[]; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const isNew = !p?.id
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [form, setForm] = useState({
    id_herramienta_fk:  (p?.id_herramienta_fk ?? '').toString(),
    solicitante:        p?.solicitante        ?? '',
    id_area_fk:         (p?.id_area_fk ?? '').toString(),
    fecha_prestamo:     p?.fecha_prestamo     ?? todayISO(),
    hora_prestamo:      p?.hora_prestamo?.slice(0,5) ?? nowHHMM(),
    fecha_entrega_prog: p?.fecha_entrega_prog ?? '',
    condicion_entrega:  p?.condicion_entrega  ?? 'Bueno',
    entrega_responsable: p?.entrega_responsable ?? (authUser?.nombre ?? ''),
    notas:              p?.notas              ?? '',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_herramienta_fk) { setError('Selecciona una herramienta'); return }
    if (!form.solicitante.trim()) { setError('El solicitante es obligatorio'); return }
    if (!form.fecha_prestamo)      { setError('La fecha de préstamo es obligatoria'); return }
    setSaving(true); setError('')

    const idHerr = Number(form.id_herramienta_fk)
    const payloadBase = {
      id_herramienta_fk:   idHerr,
      solicitante:         form.solicitante.trim(),
      id_area_fk:          form.id_area_fk ? Number(form.id_area_fk) : null,
      fecha_prestamo:      form.fecha_prestamo,
      hora_prestamo:       form.hora_prestamo || null,
      fecha_entrega_prog:  form.fecha_entrega_prog || null,
      condicion_entrega:   form.condicion_entrega,
      entrega_responsable: form.entrega_responsable.trim() || null,
      notas:               form.notas.trim() || null,
    }

    if (isNew) {
      // La solicitud de préstamo permanece abierta hasta registrar la devolución:
      // no se permite un nuevo préstamo de la misma herramienta mientras exista uno abierto
      const { data: abiertos } = await dbCtrl.from('prestamos_herramientas')
        .select('id, folio').eq('id_herramienta_fk', idHerr).eq('status', 'Prestado').eq('activo', true).limit(1)
      if (abiertos && abiertos.length > 0) {
        setError(`Esta herramienta ya tiene un préstamo abierto (folio ${abiertos[0].folio}). Registra la devolución antes de generar uno nuevo.`)
        setSaving(false); return
      }

      const { count } = await dbCtrl.from('prestamos_herramientas').select('id', { count: 'exact', head: true })
      const folio = `PRES-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
      const { error: err } = await dbCtrl.from('prestamos_herramientas').insert({
        ...payloadBase, folio, status: 'Prestado', created_by: authUser?.nombre ?? null,
      })
      if (err) { setError(err.message); setSaving(false); return }
      await dbCfg.from('herramientas').update({ status: 'Prestado' }).eq('id', idHerr)
    } else {
      const { error: err } = await dbCtrl.from('prestamos_herramientas').update(payloadBase).eq('id', p.id)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={isNew ? 'Nuevo Préstamo' : `Editar — ${p?.folio}`} onClose={onClose} maxWidth={580}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        <div>
          <label className="label" style={{ fontSize: 11 }}>Herramienta *</label>
          <select className="select" style={{ fontSize: 12 }} value={form.id_herramienta_fk} onChange={setF('id_herramienta_fk')}>
            <option value="">— Seleccionar —</option>
            {herramientas
              .filter(h => h.status !== 'Baja' && (h.status !== 'Prestado' || h.id === p?.id_herramienta_fk))
              .map(h => {
                const serie = h.no_serie ? ` · SN: ${h.no_serie}` : ''
                return <option key={h.id} value={h.id}>{h.descripcion}{serie}</option>
              })}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Solicitante *</label>
            <input className="input" style={{ fontSize: 13 }} value={form.solicitante} onChange={setF('solicitante')} placeholder="Nombre de quien recibe" />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Área / Destino</label>
            <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk} onChange={setF('id_area_fk')}>
              <option value="">—</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Fecha préstamo *</label>
            <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_prestamo} onChange={setF('fecha_prestamo')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Hora préstamo</label>
            <input className="input" type="time" style={{ fontSize: 13 }} value={form.hora_prestamo} onChange={setF('hora_prestamo')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Devolución programada</label>
            <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_entrega_prog} onChange={setF('fecha_entrega_prog')} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Condición al entregar</label>
            <select className="select" style={{ fontSize: 12 }} value={form.condicion_entrega} onChange={setF('condicion_entrega')}>
              {CONDICIONES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Entrega (responsable)</label>
            <input className="input" style={{ fontSize: 13 }} value={form.entrega_responsable} onChange={setF('entrega_responsable')} />
          </div>
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Notas</label>
          <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
        </div>
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Registrar devolución
// ══════════════════════════════════════════════════════════════
function DevolucionModal({ p, herrMap, onClose, onSaved }: {
  p: any; herrMap: Record<number, any>; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [form, setForm] = useState({
    fecha_devolucion:     todayISO(),
    hora_devolucion:      nowHHMM(),
    condicion_devolucion: 'Bueno',
    recibe_responsable:   authUser?.nombre ?? '',
    notas:                '',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const h = herrMap[p.id_herramienta_fk]

  const handleSave = async () => {
    setSaving(true); setError('')
    const notasFinal = [p.notas, form.notas.trim() ? `Devolución: ${form.notas.trim()}` : '']
      .filter(Boolean).join(' · ') || null

    const { error: err } = await dbCtrl.from('prestamos_herramientas').update({
      status:               'Devuelto',
      fecha_devolucion:     form.fecha_devolucion,
      hora_devolucion:      form.hora_devolucion || null,
      condicion_devolucion: form.condicion_devolucion,
      recibe_responsable:   form.recibe_responsable.trim() || null,
      notas:                notasFinal,
    }).eq('id', p.id)
    if (err) { setError(err.message); setSaving(false); return }

    // El equipo regresa a Disponible, salvo que la condición indique daño (pasa a mantenimiento)
    const nuevoStatus = form.condicion_devolucion === 'Dañado' ? 'En Mantenimiento' : 'Disponible'
    await dbCfg.from('herramientas').update({ status: nuevoStatus }).eq('id', p.id_herramienta_fk)

    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={`Registrar Devolución — ${p.folio}`} onClose={onClose} maxWidth={460}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />} Confirmar Devolución
        </button>
      </>}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12 }}>
          <strong>{h?.descripcion ?? `#${p.id_herramienta_fk}`}</strong> · prestada a <strong>{p.solicitante}</strong> el {fmtF(p.fecha_prestamo)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Fecha de devolución</label>
            <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_devolucion} onChange={setF('fecha_devolucion')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Hora de devolución</label>
            <input className="input" type="time" style={{ fontSize: 13 }} value={form.hora_devolucion} onChange={setF('hora_devolucion')} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Condición al devolver</label>
            <select className="select" style={{ fontSize: 12 }} value={form.condicion_devolucion} onChange={setF('condicion_devolucion')}>
              {CONDICIONES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Recibe (responsable)</label>
            <input className="input" style={{ fontSize: 13 }} value={form.recibe_responsable} onChange={setF('recibe_responsable')} />
          </div>
        </div>

        {form.condicion_devolucion === 'Dañado' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11, color: '#92400e' }}>
              La herramienta pasará a status <strong>En Mantenimiento</strong>. Registra el servicio correspondiente en la Bitácora de Servicios.
            </span>
          </div>
        )}

        <div>
          <label className="label" style={{ fontSize: 11 }}>Notas de la devolución</label>
          <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
        </div>
      </div>
    </ModalShell>
  )
}
