'use client'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect, useRef } from 'react'
import { dbComp, supabase } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, Edit2, X, Save, Loader,
  ArrowLeft, Phone, Mail, Upload, ExternalLink, Trash2,
  FileText, CheckCircle
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type Proveedor, FORMAS_PAGO_COMP } from '../types'

// ── Documentos requeridos ─────────────────────────────────
const DOCS = [
  { key: 'csf_url',          label: 'CSF',                      desc: 'Constancia de Situación Fiscal',     color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { key: 'opinion_sat_url',  label: 'Opinión SAT',               desc: 'Opinión de Cumplimiento del SAT',    color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
  { key: 'id_oficial_url',   label: 'ID Oficial',                desc: 'Identificación Oficial vigente',     color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { key: 'edo_cuenta_url',   label: 'Carátula Edo. Cuenta',      desc: 'Carátula Estado de Cuenta Bancario', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { key: 'acta_const_url',   label: 'Acta Constitutiva',         desc: 'Acta Constitutiva de la empresa',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  { key: 'comp_dom_url',     label: 'Comprobante de Domicilio',  desc: 'Comprobante de domicilio fiscal',    color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
]

export default function ProveedoresPage() {
  const { canWrite, canDelete } = useAuth()
  const router = useRouter()
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [modal, setModal]     = useState<any | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('proveedores').select('*').order('nombre')
    if (debouncedSearch) q = q.or(`nombre.ilike.%${debouncedSearch}%,rfc.ilike.%${debouncedSearch}%,clave.ilike.%${debouncedSearch}%`)
    const { data } = await q
    setRows(data ?? []); setLoading(false)
  }, [debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  // Contar documentos cargados de un proveedor
  const docsCount = (r: any) => DOCS.filter(d => r[d.key]).length

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Proveedores</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Catálogo de proveedores, condiciones comerciales y documentos fiscales</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar nombre, RFC, clave…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} /></button>
          {canWrite('proveedores') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nuevo Proveedor</button>}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Nombre / Razón Social</th>
              <th>RFC</th>
              <th>Contacto</th>
              <th>Status</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin proveedores registrados</td></tr>
            ) : rows.map(r => {
              const ndocs = docsCount(r)
              return (
                <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.45 }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.clave}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.nombre}</div>
                    {r.razon_social && r.razon_social !== r.nombre && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.razon_social}</div>
                    )}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.rfc ?? '—'}</td>
                  <td>
                    {r.contacto && <div style={{ fontSize: 13 }}>{r.contacto}</div>}
                    {r.telefono && <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} />{r.telefono}</div>}
                    {r.correo   && <div style={{ fontSize: 11, color: 'var(--blue)',        display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={10} />{r.correo}</div>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`badge ${r.activo ? 'badge-vendido' : 'badge-default'}`}>{r.activo ? 'Activo' : 'Inactivo'}</span>
                      {ndocs > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10,
                          background: ndocs === DOCS.length ? '#f0fdf4' : '#fffbeb',
                          color:      ndocs === DOCS.length ? '#15803d' : '#d97706',
                          border:     `1px solid ${ndocs === DOCS.length ? '#bbf7d0' : '#fde68a'}` }}>
                          {ndocs}/{DOCS.length} docs
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)}><Edit2 size={13} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <ProveedorModal
          row={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal Proveedor con documentos adjuntos
// ════════════════════════════════════════════════════════════
function ProveedorModal({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const [tab, setTab]             = useState<'datos'|'documentos'>('datos')

  const [form, setForm] = useState({
    clave:            row?.clave            ?? '',
    nombre:           row?.nombre           ?? '',
    razon_social:     row?.razon_social     ?? '',
    rfc:              row?.rfc              ?? '',
    contacto:         row?.contacto         ?? '',
    telefono:         row?.telefono         ?? '',
    correo:           row?.correo           ?? '',
    calle:            row?.calle            ?? '',
    colonia:          row?.colonia          ?? '',
    ciudad:           row?.ciudad           ?? '',
    estado:           row?.estado           ?? '',
    cp:               row?.cp               ?? '',
    banco:            row?.banco            ?? '',
    cuenta_clabe:     row?.cuenta_clabe     ?? '',
    condiciones_pago: row?.condiciones_pago ?? '',
    activo:           row?.activo           ?? true,
    // Documentos
    csf_url:          row?.csf_url          ?? '',
    opinion_sat_url:  row?.opinion_sat_url  ?? '',
    id_oficial_url:   row?.id_oficial_url   ?? '',
    edo_cuenta_url:   row?.edo_cuenta_url   ?? '',
    acta_const_url:   row?.acta_const_url   ?? '',
    comp_dom_url:     row?.comp_dom_url     ?? '',
  })

  // Refs para inputs de archivo
  const fileRefs: Record<string, React.RefObject<HTMLInputElement>> = {
    csf_url:          useRef<HTMLInputElement>(null),
    opinion_sat_url:  useRef<HTMLInputElement>(null),
    id_oficial_url:   useRef<HTMLInputElement>(null),
    edo_cuenta_url:   useRef<HTMLInputElement>(null),
    acta_const_url:   useRef<HTMLInputElement>(null),
    comp_dom_url:     useRef<HTMLInputElement>(null),
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const uploadDoc = async (file: File, campo: string, provId?: number) => {
    setUploading(campo)
    const ext  = file.name.split('.').pop()?.toLowerCase()
    const id   = provId ?? `new-${Date.now()}`
    const path = `prov-${id}/${campo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('prov-docs').upload(path, file, { upsert: true })
    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(null); return }
    const { data: { publicUrl } } = supabase.storage.from('prov-docs').getPublicUrl(path)
    setForm(f => ({ ...f, [campo]: publicUrl }))
    setUploading(null)
  }

  const removeDoc = async (campo: string) => {
    setForm(f => ({ ...f, [campo]: '' }))
    // Si ya está guardado, actualizar en BD inmediatamente
    if (!isNew && row?.id) {
      await dbComp.from('proveedores').update({ [campo]: null }).eq('id', row.id)
    }
  }

  const handleSave = async () => {
    if (!form.clave.trim() || !form.nombre.trim()) { setError('Clave y Nombre son obligatorios'); return }
    setSaving(true); setError('')

    const payload = {
      clave:            form.clave.trim().toUpperCase(),
      nombre:           form.nombre.trim(),
      razon_social:     form.razon_social.trim()     || null,
      rfc:              form.rfc.trim().toUpperCase() || null,
      contacto:         form.contacto.trim()         || null,
      telefono:         form.telefono.trim()         || null,
      correo:           form.correo.trim()           || null,
      calle:            form.calle.trim()            || null,
      colonia:          form.colonia.trim()          || null,
      ciudad:           form.ciudad.trim()           || null,
      estado:           form.estado.trim()           || null,
      cp:               form.cp.trim()               || null,
      banco:            form.banco.trim()            || null,
      cuenta_clabe:     form.cuenta_clabe.trim()     || null,
      condiciones_pago: form.condiciones_pago        || null,
      activo:           form.activo,
      csf_url:          form.csf_url         || null,
      opinion_sat_url:  form.opinion_sat_url  || null,
      id_oficial_url:   form.id_oficial_url   || null,
      edo_cuenta_url:   form.edo_cuenta_url   || null,
      acta_const_url:   form.acta_const_url   || null,
      comp_dom_url:     form.comp_dom_url     || null,
    }

    const { error: err } = isNew
      ? await dbComp.from('proveedores').insert(payload)
      : await dbComp.from('proveedores').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const TABS = [{ key: 'datos', label: 'Datos Generales' }, { key: 'documentos', label: 'Documentos Fiscales' }]
  const G = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
  const F = ({ label, k, mono }: { label: string; k: string; mono?: boolean }) => (
    <div><label className="label">{label}</label>
      <input className="input" value={(form as any)[k]} onChange={set(k)}
        style={{ fontFamily: mono ? 'monospace' : undefined, textTransform: mono ? 'uppercase' : undefined }} />
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
            {isNew ? 'Nuevo Proveedor' : row.nombre}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
                borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
                marginBottom: -1 }}>
              {t.label}
              {t.key === 'documentos' && (
                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                  background: DOCS.filter(d => form[d.key as keyof typeof form]).length === DOCS.length ? '#f0fdf4' : '#fffbeb',
                  color:      DOCS.filter(d => form[d.key as keyof typeof form]).length === DOCS.length ? '#15803d' : '#d97706' }}>
                  {DOCS.filter(d => form[d.key as keyof typeof form]).length}/{DOCS.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(88vh - 180px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* ── TAB: Datos Generales ── */}
          {tab === 'datos' && (
            <>
              <Sec label="Datos Fiscales">
                <G><F label="Clave *" k="clave" mono /><F label="Nombre *" k="nombre" /></G>
                <G><F label="Razón Social" k="razon_social" /><F label="RFC" k="rfc" mono /></G>
              </Sec>
              <Sec label="Contacto">
                <G><F label="Contacto" k="contacto" /><F label="Teléfono" k="telefono" /></G>
                <F label="Correo" k="correo" />
              </Sec>
              <Sec label="Domicilio">
                <F label="Calle y Número" k="calle" />
                <G><F label="Colonia" k="colonia" /><F label="C.P." k="cp" /></G>
                <G><F label="Ciudad" k="ciudad" /><F label="Estado" k="estado" /></G>
              </Sec>
              <Sec label="Datos Bancarios">
                <G><F label="Banco" k="banco" /><F label="CLABE (18 dígitos)" k="cuenta_clabe" mono /></G>
                <div><label className="label">Condiciones de Pago</label>
                  <select className="select" value={form.condiciones_pago} onChange={set('condiciones_pago')}>
                    <option value="">—</option>
                    {FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </Sec>
              <div><label className="label">Status</label>
                <select className="select" value={form.activo ? 'true' : 'false'}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            </>
          )}

          {/* ── TAB: Documentos Fiscales ── */}
          {tab === 'documentos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Adjunta los documentos del proveedor. Formatos aceptados: PDF, JPG, PNG.
              </p>
              {DOCS.map(doc => {
                const url = form[doc.key as keyof typeof form] as string
                const hasFile = !!url
                return (
                  <div key={doc.key}
                    style={{ padding: '14px 16px', border: `1px solid ${hasFile ? doc.border : '#e2e8f0'}`,
                      borderRadius: 10, background: hasFile ? doc.bg : '#fafafa',
                      transition: 'all 0.2s' }}>
                    <input
                      ref={fileRefs[doc.key]}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      onChange={e => { if (e.target.files?.[0]) uploadDoc(e.target.files[0], doc.key, row?.id) }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8,
                          background: hasFile ? doc.color + '20' : '#f1f5f9',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {hasFile
                            ? <CheckCircle size={18} style={{ color: doc.color }} />
                            : <FileText size={18} style={{ color: '#94a3b8' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: hasFile ? doc.color : 'var(--text-primary)' }}>
                            {doc.label}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{doc.desc}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {hasFile && (
                          <>
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                                color: doc.color, padding: '4px 10px', borderRadius: 6,
                                background: doc.color + '10', border: `1px solid ${doc.border}`,
                                textDecoration: 'none' }}>
                              <ExternalLink size={11} /> Ver
                            </a>
                            <button
                              onClick={() => removeDoc(doc.key)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                                color: '#dc2626', padding: '4px 10px', borderRadius: 6,
                                background: '#fef2f2', border: '1px solid #fecaca', cursor: 'pointer' }}>
                              <Trash2 size={11} /> Quitar
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => fileRefs[doc.key].current?.click()}
                          disabled={uploading === doc.key}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                            color: hasFile ? doc.color : 'var(--text-secondary)',
                            padding: '4px 10px', borderRadius: 6,
                            background: hasFile ? doc.color + '10' : '#f1f5f9',
                            border: `1px solid ${hasFile ? doc.border : '#e2e8f0'}`,
                            cursor: 'pointer' }}>
                          {uploading === doc.key
                            ? <><Loader size={11} className="animate-spin" /> Subiendo…</>
                            : <><Upload size={11} /> {hasFile ? 'Reemplazar' : 'Adjuntar'}</>}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Resumen del estado documental */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Completitud del expediente
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {DOCS.map(d => {
                    const ok = !!(form[d.key as keyof typeof form])
                    return (
                      <div key={d.key} style={{ flex: 1, textAlign: 'center', padding: '6px 4px',
                        background: ok ? d.bg : '#f1f5f9', borderRadius: 6,
                        border: `1px solid ${ok ? d.border : '#e2e8f0'}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: ok ? d.color : '#94a3b8' }}>
                          {d.label}
                        </div>
                        <div style={{ fontSize: 9, color: ok ? d.color : '#94a3b8', marginTop: 2 }}>
                          {ok ? '✓ Cargado' : 'Pendiente'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em',
      textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
      {label}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>
)