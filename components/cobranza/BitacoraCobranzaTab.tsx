'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbGolf, dbCtrl, dbHip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Trash2, Printer, Download, Phone, MessageSquare,
  Mail, MapPin, MoreHorizontal, X, ClipboardList, Loader,
} from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────
export type EntidadCobranza = 'socio' | 'lote' | 'arrendatario'

type Registro = {
  id: number
  fecha_contacto: string
  canal: string
  respuesta: string | null
  seguimiento: string
  monto_prometido: number | null
  fecha_proximo_contacto: string | null
  notas: string | null
  usuario_nombre: string | null
  created_at: string
}

const CANALES   = ['Llamada', 'WhatsApp', 'Email', 'Visita', 'Otro'] as const
const SEGUIMIENTOS = [
  'Contactar de nuevo',
  'Sin respuesta',
  'Pago prometido',
  'En mora',
  'Gestión jurídica',
  'Cerrado',
] as const

const SEG_STYLE: Record<string, { bg: string; color: string }> = {
  'Contactar de nuevo': { bg: '#F4F5F7', color: '#B5761A' },
  'Sin respuesta':      { bg: '#F8F9FA', color: '#62666E' },
  'Pago prometido':     { bg: '#F4F5F7', color: '#6B4E79' },
  'En mora':            { bg: '#F4F5F7', color: '#C23B3B' },
  'Gestión jurídica':   { bg: '#F4F5F7', color: '#8A4119' },
  'Cerrado':            { bg: '#F4F5F7', color: '#1F7A50' },
}

const CANAL_ICON: Record<string, React.ReactNode> = {
  'Llamada':  <Phone size={12} />,
  'WhatsApp': <MessageSquare size={12} />,
  'Email':    <Mail size={12} />,
  'Visita':   <MapPin size={12} />,
  'Otro':     <MoreHorizontal size={12} />,
}

// ── DB helpers ───────────────────────────────────────────────
function getDb(entidad: EntidadCobranza) {
  if (entidad === 'socio')        return dbGolf
  if (entidad === 'arrendatario') return dbHip
  return dbCtrl
}
function getTable(entidad: EntidadCobranza) {
  return entidad === 'lote' ? 'bitacora_cobranza_res' : 'bitacora_cobranza'
}
function getFk(entidad: EntidadCobranza) {
  if (entidad === 'socio')        return 'id_socio_fk'
  if (entidad === 'arrendatario') return 'id_arrendatario_fk'
  return 'id_lote_fk'
}

// ── Helpers UI ───────────────────────────────────────────────
const hoy = () => new Date().toISOString().split('T')[0]
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null

const EMPTY_FORM = {
  fecha_contacto:         hoy(),
  canal:                  'Llamada',
  respuesta:              '',
  seguimiento:            'Contactar de nuevo',
  monto_prometido:        '',
  fecha_proximo_contacto: '',
  notas:                  '',
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

// ── Props ────────────────────────────────────────────────────
type Props = {
  entidad:       EntidadCobranza
  idEntidad:     number
  nombreEntidad: string
  puedeEscribir: boolean
}

// ── Componente principal ─────────────────────────────────────
export default function BitacoraCobranzaTab({
  entidad, idEntidad, nombreEntidad, puedeEscribir,
}: Props) {
  const { authUser, canDelete } = useAuth()
  const puedeEliminar = canDelete()
  const printRef = useRef<HTMLDivElement>(null)

  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form, setForm]           = useState({ ...EMPTY_FORM })
  const [err, setErr]             = useState('')

  const db    = getDb(entidad)
  const table = getTable(entidad)
  const fk    = getFk(entidad)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await (db as any).from(table)
      .select('*')
      .eq(fk, idEntidad)
      .order('created_at', { ascending: false })
    setRegistros((data ?? []) as Registro[])
    setLoading(false)
  }, [db, table, fk, idEntidad])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.fecha_contacto) { setErr('La fecha de contacto es requerida.'); return }
    if (!form.canal)          { setErr('El canal es requerido.'); return }
    if (!form.seguimiento)    { setErr('El seguimiento es requerido.'); return }
    setSaving(true); setErr('')
    const montoNum = form.monto_prometido ? parseFloat(form.monto_prometido.replace(/,/g, '')) : null
    const payload: Record<string, any> = {
      [fk]:            idEntidad,
      fecha_contacto:  form.fecha_contacto,
      canal:           form.canal,
      respuesta:       form.respuesta || null,
      seguimiento:     form.seguimiento,
      monto_prometido: montoNum && montoNum > 0 ? montoNum : null,
      fecha_proximo_contacto: form.seguimiento !== 'Cerrado' && form.fecha_proximo_contacto
        ? form.fecha_proximo_contacto : null,
      notas:           form.notas || null,
      usuario_nombre:  authUser?.nombre ?? null,
    }
    const { error } = await (db as any).from(table).insert(payload)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowForm(false)
    setForm({ ...EMPTY_FORM, fecha_contacto: hoy() })
    load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    setDeletingId(id)
    await (db as any).from(table).delete().eq('id', id)
    setDeletingId(null)
    load()
  }

  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? ''
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return
    w.document.write(`
      <html><head><title>Seguimiento Cobranza — ${nombreEntidad}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #26282D; padding: 20px; }
        h2   { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
        .sub { font-size: 11px; color: #62666E; margin-bottom: 20px; }
        .entry { border-left: 3px solid #E6E8EB; padding: 8px 12px; margin-bottom: 12px; page-break-inside: avoid; }
        .meta  { display: flex; gap: 12px; font-size: 11px; color: #62666E; margin-bottom: 4px; flex-wrap: wrap; }
        .badge { display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 10px; font-weight: bold; }
        .resp  { font-size: 12px; margin-bottom: 2px; }
        .next  { font-size: 11px; color: #6B4E79; }
        .note  { font-size: 11px; color: #62666E; font-style: italic; margin-top: 2px; }
        .user  { font-size: 10px; color: #7A7E87; }
        @media print { @page { margin: 1.5cm; } }
      </style></head><body>
      <h2>Seguimiento de Cobranza</h2>
      <div class="sub">${nombreEntidad} · Generado: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      ${content}
      </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  const handleExcel = async () => {
    const xlsx = await import('xlsx')
    const rows = registros.map(r => ({
      'Fecha contacto':         r.fecha_contacto,
      'Canal':                  r.canal,
      'Respuesta':              r.respuesta ?? '',
      'Seguimiento':            r.seguimiento,
      'Monto prometido':        r.monto_prometido ?? '',
      'Próx. contacto':         r.fecha_proximo_contacto ?? '',
      'Notas':                  r.notas ?? '',
      'Registrado por':         r.usuario_nombre ?? '',
      'Fecha registro':         new Date(r.created_at).toLocaleDateString('es-MX'),
    }))
    const ws = xlsx.utils.json_to_sheet(rows)
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'Seguimiento')
    const fecha = new Date().toISOString().split('T')[0]
    xlsx.writeFile(wb, `Seguimiento-Cobranza_${nombreEntidad.replace(/\s+/g, '_')}_${fecha}.xlsx`)
  }

  // ── Render ───────────────────────────────────────────────────

  const abiertos  = registros.filter(r => r.seguimiento !== 'Cerrado').length
  const proxHoy   = registros.filter(r => r.seguimiento !== 'Cerrado' && r.fecha_proximo_contacto && r.fecha_proximo_contacto <= hoy()).length

  return (
    <div>
      {/* Barra de acciones */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {abiertos > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: '#B5761A', color: '#fff', border: '1px solid #B5761A' }}>
              {abiertos} abierto{abiertos !== 1 ? 's' : ''}
            </span>
          )}
          {proxHoy > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#C23B3B', color: '#fff', border: '1px solid #C23B3B' }}>
              {proxHoy} para hoy
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {registros.length > 0 && (
            <>
              <button onClick={handlePrint} style={btnGhost}><Printer size={12} /> Imprimir</button>
              <button onClick={handleExcel} style={btnGhost}><Download size={12} /> Excel</button>
            </>
          )}
          {puedeEscribir && (
            <button onClick={() => { setForm({ ...EMPTY_FORM, fecha_contacto: hoy() }); setErr(''); setShowForm(true) }}
              style={{ ...btnGhost, background: '#F4F5F7', color: '#1C1D21', borderColor: '#C9CCD3' }}>
              <Plus size={12} /> Agregar
            </button>
          )}
        </div>
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div style={{ background: '#F8F9FA', border: '1px solid #E6E8EB', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#26282D' }}>Nuevo registro de contacto</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A7E87', padding: 4 }}><X size={14} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Fecha de contacto *</label>
              <input type="date" value={form.fecha_contacto}
                onChange={e => setForm(f => ({ ...f, fecha_contacto: e.target.value }))}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Canal *</label>
              <select value={form.canal}
                onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
                style={inputStyle}>
                {CANALES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Respuesta / ¿Qué dijo?</label>
            <textarea value={form.respuesta}
              onChange={e => setForm(f => ({ ...f, respuesta: e.target.value }))}
              placeholder="Ej: 'Paga el viernes, está de viaje…'"
              rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Seguimiento *</label>
              <select value={form.seguimiento}
                onChange={e => setForm(f => ({ ...f, seguimiento: e.target.value }))}
                style={inputStyle}>
                {SEGUIMIENTOS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Monto prometido</label>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value={form.monto_prometido}
                onChange={e => setForm(f => ({ ...f, monto_prometido: e.target.value }))}
                style={inputStyle} />
            </div>
          </div>

          {form.seguimiento !== 'Cerrado' && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Próx. contacto</label>
              <input type="date" value={form.fecha_proximo_contacto}
                onChange={e => setForm(f => ({ ...f, fecha_proximo_contacto: e.target.value }))}
                style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Notas internas</label>
            <textarea value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Notas internas del equipo…"
              rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>

          {err && <div style={{ fontSize: 12, color: '#C23B3B', marginBottom: 8 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={btnGhost}>Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#1C1D21', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline de registros — se incluye en el DOM para impresión */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7A7E87', fontSize: 13 }}>Cargando…</div>
      ) : registros.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#F8F9FA', borderRadius: 10, border: '1px dashed #E6E8EB' }}>
          <ClipboardList size={28} style={{ color: '#C9CCD3', margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontSize: 13, color: '#7A7E87', fontWeight: 500 }}>Sin registros de seguimiento</div>
          {puedeEscribir && <div style={{ fontSize: 12, color: '#C9CCD3', marginTop: 4 }}>Usa el botón "Agregar" para registrar el primer contacto</div>}
        </div>
      ) : (
        <div ref={printRef} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {registros.map((r, i) => {
            const seg  = SEG_STYLE[r.seguimiento] ?? { bg: '#F8F9FA', color: '#62666E' }
            const prox = r.fecha_proximo_contacto
            const proxVencida = prox && prox <= hoy() && r.seguimiento !== 'Cerrado'
            const isLast = i === registros.length - 1
            return (
              <div key={r.id}
                style={{
                  display: 'flex', gap: 0, paddingBottom: isLast ? 0 : 4,
                  // clase para imprimir: dotline
                }}>
                {/* Línea de tiempo */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0, paddingTop: 4 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: r.seguimiento === 'Cerrado' ? '#1F7A50'
                      : r.seguimiento === 'En mora' || r.seguimiento === 'Gestión jurídica' ? '#C23B3B'
                      : r.seguimiento === 'Pago prometido' ? '#6B4E79'
                      : '#B5761A',
                    border: '2px solid #fff',
                    boxShadow: '0 0 0 2px #E6E8EB',
                  }} />
                  {!isLast && <div style={{ width: 2, flex: 1, minHeight: 20, background: '#E6E8EB', marginTop: 4 }} />}
                </div>

                {/* Contenido */}
                <div style={{
                  flex: 1, marginLeft: 10, marginBottom: 14,
                  background: '#fff', border: '1px solid #E6E8EB', borderRadius: 10, padding: '12px 14px',
                }}>
                  {/* Meta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#62666E', fontWeight: 600 }}>{fmtFecha(r.fecha_contacto)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#62666E' }}>
                      {CANAL_ICON[r.canal] ?? <MoreHorizontal size={12} />} {r.canal}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
                      background: seg.color, color: '#fff',
                    }}>
                      {r.seguimiento}
                    </span>
                    {puedeEliminar && (
                      <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#C9CCD3', padding: 2, display: 'flex' }}
                        title="Eliminar registro">
                        {deletingId === r.id ? <Loader size={12} /> : <Trash2 size={12} />}
                      </button>
                    )}
                  </div>

                  {/* Respuesta */}
                  {r.respuesta && (
                    <div style={{ fontSize: 13, color: '#26282D', lineHeight: 1.5, marginBottom: 4, fontStyle: 'italic' }}>
                      "{r.respuesta}"
                    </div>
                  )}

                  {/* Monto prometido */}
                  {r.monto_prometido != null && r.monto_prometido > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#fff', background: '#6B4E79', border: '1px solid #6B4E79', borderRadius: 6, padding: '2px 9px', marginBottom: 4 }}>
                      {fmt$(r.monto_prometido)}
                    </div>
                  )}

                  {/* Próx. contacto */}
                  {prox && r.seguimiento !== 'Cerrado' && (
                    <div style={{ fontSize: 11, color: proxVencida ? '#C23B3B' : '#6B4E79', fontWeight: 600, marginBottom: 2 }}>
                      {proxVencida ? '' : ''}Próx. contacto: {fmtFecha(prox)}
                    </div>
                  )}

                  {/* Notas internas */}
                  {r.notas && (
                    <div style={{ fontSize: 11, color: '#62666E', fontStyle: 'italic', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #F4F5F7' }}>
                      {r.notas}
                    </div>
                  )}

                  {/* Usuario + fecha registro */}
                  <div style={{ fontSize: 10, color: '#C9CCD3', marginTop: 6, display: 'flex', gap: 8 }}>
                    {r.usuario_nombre && <span>{r.usuario_nombre}</span>}
                    <span>{new Date(r.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Estilos compartidos ──────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 12,
  border: '1px solid #E6E8EB', borderRadius: 6,
  background: '#fff', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  color: '#7A7E87', textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 4,
}
const btnGhost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '5px 10px', fontSize: 11, fontWeight: 600,
  border: '1px solid #E6E8EB', borderRadius: 7,
  background: '#fff', color: '#62666E', cursor: 'pointer',
}
