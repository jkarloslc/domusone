'use client'
import { useState, useEffect, useRef } from 'react'
import { dbGolf, supabase } from '@/lib/supabase'
import { Award, Plus, Trash2, Edit2, Save, Loader, Upload, ExternalLink, CheckCircle } from 'lucide-react'

type Pago = {
  id: number
  periodo: number
  monto: number | null
  fecha_pago: string | null
  comprobante_url: string | null
  beneficiarios: string | null
}

type PagoForm = { periodo: string; monto: string; fecha_pago: string; beneficiarios: string }

const pagoVacio = (): PagoForm => ({ periodo: String(new Date().getFullYear()), monto: '', fecha_pago: '', beneficiarios: '' })

const fmt$ = (v: number | null) => v == null ? '—' : `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtF = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null

const inputStyle = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' as const }

function ComprobanteLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    supabase.storage.from('golf-docs').createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [path])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#d97706', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
      <ExternalLink size={11} /> Ver
    </a>
  )
}

export default function TabFederacion({ socioId, editable, onChange }: { socioId: number; editable: boolean; onChange?: (count: number) => void }) {
  const [loading, setLoading] = useState(true)
  const [federado, setFederado] = useState(false)
  const [clave, setClave] = useState('')
  const [codigo, setCodigo] = useState('')
  const [savingDatos, setSavingDatos] = useState(false)
  const [okDatos, setOkDatos] = useState(false)
  const [errDatos, setErrDatos] = useState('')

  const [pagos, setPagos] = useState<Pago[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<PagoForm>(pagoVacio())
  const [comprobante, setComprobante] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const [{ data: s }, { data: p }] = await Promise.all([
      dbGolf.from('cat_socios').select('federado, federacion_clave, federacion_codigo').eq('id', socioId).maybeSingle(),
      dbGolf.from('ctrl_federacion').select('id, periodo, monto, fecha_pago, comprobante_url, beneficiarios')
        .eq('id_socio_fk', socioId).order('periodo', { ascending: false }),
    ])
    setFederado(!!s?.federado); setClave(s?.federacion_clave ?? ''); setCodigo(s?.federacion_codigo ?? '')
    setPagos((p as Pago[]) ?? [])
    onChange?.((p ?? []).length)
    setLoading(false)
  }
  useEffect(() => { load() }, [socioId])

  const guardarDatos = async () => {
    setSavingDatos(true); setErrDatos(''); setOkDatos(false)
    const { error: err } = await dbGolf.from('cat_socios').update({
      federado, federacion_clave: clave.trim() || null, federacion_codigo: codigo.trim() || null,
    }).eq('id', socioId)
    setSavingDatos(false)
    if (err) { setErrDatos(err.message); return }
    setOkDatos(true)
  }

  const abrirForm = (p?: Pago) => {
    setError('')
    if (p) {
      setEditId(p.id)
      setForm({ periodo: String(p.periodo), monto: p.monto != null ? String(p.monto) : '', fecha_pago: p.fecha_pago ?? '', beneficiarios: p.beneficiarios ?? '' })
      setComprobante(p.comprobante_url ?? '')
    } else {
      setEditId(null); setForm(pagoVacio()); setComprobante('')
    }
    setShowForm(true)
  }
  const cerrarForm = () => { setShowForm(false); setEditId(null); setForm(pagoVacio()); setComprobante(''); setError('') }

  const subir = async (file: File) => {
    setUploading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `federacion/socio_${socioId}_${form.periodo}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('golf-docs').upload(path, file, { upsert: true })
    if (upErr) setError(upErr.message); else setComprobante(path)
    setUploading(false)
  }

  const guardarPago = async () => {
    const periodo = Number(form.periodo)
    if (!periodo || periodo < 2000 || periodo > 2100) { setError('El año es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      id_socio_fk: socioId, periodo,
      monto: form.monto === '' ? null : Number(form.monto),
      fecha_pago: form.fecha_pago || null,
      comprobante_url: comprobante || null,
      beneficiarios: form.beneficiarios.trim() || null,
    }
    const { error: err } = editId
      ? await dbGolf.from('ctrl_federacion').update(payload).eq('id', editId)
      : await dbGolf.from('ctrl_federacion').insert(payload)
    setSaving(false)
    if (err) { setError(err.code === '23505' ? `Ya existe un pago para el año ${periodo}` : err.message); return }
    cerrarForm(); load()
  }

  const eliminar = async (id: number) => {
    if (!confirm('¿Eliminar este pago a la federación?')) return
    await dbGolf.from('ctrl_federacion').delete().eq('id', id)
    load()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 13 }}>Cargando…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Datos de federación */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Award size={15} style={{ color: '#d97706' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Federación Mexicana de Golf</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <input type="checkbox" id="fed_federado" checked={federado} disabled={!editable}
              onChange={e => { setFederado(e.target.checked); setOkDatos(false) }}
              style={{ width: 16, height: 16, cursor: editable ? 'pointer' : 'default', accentColor: '#d97706' }} />
            <label htmlFor="fed_federado" style={{ ...labelStyle, marginBottom: 0, cursor: editable ? 'pointer' : 'default' }}>¿Federado?</label>
          </div>
          <div>
            <label style={labelStyle}>Clave</label>
            <input style={inputStyle} value={clave} disabled={!editable} onChange={e => { setClave(e.target.value); setOkDatos(false) }} placeholder="—" />
          </div>
          <div>
            <label style={labelStyle}>Código</label>
            <input style={inputStyle} value={codigo} disabled={!editable} onChange={e => { setCodigo(e.target.value); setOkDatos(false) }} placeholder="—" />
          </div>
        </div>
        {editable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            {errDatos && <span style={{ fontSize: 12, color: '#dc2626', marginRight: 'auto' }}>{errDatos}</span>}
            {okDatos && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> Guardado</span>}
            <button onClick={guardarDatos} disabled={savingDatos}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', cursor: 'pointer', opacity: savingDatos ? 0.7 : 1 }}>
              {savingDatos ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Guardar datos
            </button>
          </div>
        )}
      </div>

      {/* Pagos por ciclo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Pagos a la federación por ciclo <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>({pagos.length})</span></span>
        {editable && !showForm && (
          <button onClick={() => abrirForm()}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            <Plus size={13} /> Nuevo pago
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{editId ? 'Editar pago' : 'Nuevo pago'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Año *</label>
              <input style={inputStyle} type="number" min={2000} max={2100} value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Monto</label>
              <input style={inputStyle} type="number" step="0.01" min={0} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Fecha de pago</label>
              <input style={inputStyle} type="date" value={form.fecha_pago} onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Beneficiarios</label>
              <input style={inputStyle} value={form.beneficiarios} onChange={e => setForm(f => ({ ...f, beneficiarios: e.target.value }))} placeholder="Ej. Socio, cónyuge, hijos…" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Comprobante (PDF/imagen)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#475569', opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
                  {comprobante ? 'Cambiar archivo' : 'Subir comprobante'}
                </button>
                {comprobante && <span style={{ fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> Archivo listo</span>}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
            </div>
          </div>
          {error && <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={cerrarForm} style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={guardarPago} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Guardar
            </button>
          </div>
        </div>
      )}

      {pagos.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '28px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0', fontSize: 13, color: '#94a3b8' }}>
          Sin pagos registrados a la federación
        </div>
      ) : pagos.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Año</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Monto</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Pago</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Comprobante</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Beneficiarios</th>
                {editable && <th style={{ padding: '8px 12px' }} />}
              </tr>
            </thead>
            <tbody>
              {pagos.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>{p.periodo}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt$(p.monto)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {p.fecha_pago ? fmtF(p.fecha_pago) : <span style={{ color: '#d97706', fontWeight: 600 }}>Pendiente</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{p.comprobante_url ? <ComprobanteLink path={p.comprobante_url} /> : '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#475569' }}>{p.beneficiarios || '—'}</td>
                  {editable && (
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button onClick={() => abrirForm(p)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}><Edit2 size={14} /></button>
                      <button onClick={() => eliminar(p.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
