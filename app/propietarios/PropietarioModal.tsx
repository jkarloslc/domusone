'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCtrl, type Propietario, type Lote } from '@/lib/supabase'
import { X, Save, Loader, Plus, Trash2 } from 'lucide-react'

type Props = { propietario: Propietario | null; onClose: () => void; onSaved: () => void }

type Tel   = { id?: number; tipo: string; numero: string }
type Email = { id?: number; tipo: string; correo: string }
type LoteAsig = { id?: number; id_lote_fk: number; cve_lote?: string; es_principal: boolean; porcentaje: string }

const ESTADO_CIVIL = ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)', 'Unión Libre']
const REGIMEN      = ['Separación de Bienes', 'Sociedad Conyugal']
const TIPOS_TEL    = ['Celular', 'Casa', 'Oficina', 'Otro']
const TIPOS_EMAIL  = ['Personal', 'Trabajo', 'Otro']
const TABS         = ['Datos Personales', 'Contacto', 'Fiscal', 'Lotes']

export default function PropietarioModal({ propietario, onClose, onSaved }: Props) {
  const isNew = !propietario
  const [tab, setTab]       = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [form, setForm] = useState({
    nombre:                  propietario?.nombre ?? '',
    apellido_paterno:        (propietario as any)?.apellido_paterno ?? '',
    apellido_materno:        (propietario as any)?.apellido_materno ?? '',
    tipo_persona:            (propietario as any)?.tipo_persona ?? 'Física',
    razon_social:            (propietario as any)?.razon_social ?? '',
    rfc:                     propietario?.rfc ?? '',
    curp:                    (propietario as any)?.curp ?? '',
    fecha_nacimiento:        (propietario as any)?.fecha_nacimiento ?? '',
    estado_civil:            (propietario as any)?.estado_civil ?? '',
    regimen:                 (propietario as any)?.regimen ?? '',
    calle:                   (propietario as any)?.calle ?? '',
    colonia:                 (propietario as any)?.colonia ?? '',
    ciudad:                  (propietario as any)?.ciudad ?? '',
    estado:                  (propietario as any)?.estado ?? '',
    pais:                    (propietario as any)?.pais ?? 'México',
    cp:                      (propietario as any)?.cp ?? '',
    pertenece_asociacion:    (propietario as any)?.pertenece_asociacion ?? false,
    activo:                  propietario?.activo ?? true,
  })

  const [telefonos, setTelefonos] = useState<Tel[]>([{ tipo: 'Celular', numero: '' }])
  const [correos, setCorreos]     = useState<Email[]>([{ tipo: 'Personal', correo: '' }])
  const [lotes, setLotes]         = useState<LoteAsig[]>([])
  const [lotesDisp, setLotesDisp] = useState<Lote[]>([])

  useEffect(() => {
    if (!isNew) {
      dbCat.from('propietarios_telefonos').select('*').eq('id_propietario_fk', propietario.id).eq('activo', true)
        .then(({ data }) => { if (data?.length) setTelefonos(data.map(d => ({ id: d.id, tipo: d.tipo ?? 'Celular', numero: d.numero }))) })
      dbCat.from('propietarios_correos').select('*').eq('id_propietario_fk', propietario.id).eq('activo', true)
        .then(({ data }) => { if (data?.length) setCorreos(data.map(d => ({ id: d.id, tipo: d.tipo ?? 'Personal', correo: d.correo }))) })
      dbCtrl.from('propietarios_lotes').select('*, lotes(cve_lote)').eq('id_propietario_fk', propietario.id).eq('activo', true)
        .then(({ data }) => {
          if (data?.length) setLotes(data.map((d: any) => ({
            id: d.id, id_lote_fk: d.id_lote_fk,
            cve_lote: d.lotes?.cve_lote, es_principal: d.es_principal,
            porcentaje: d.porcentaje?.toString() ?? ''
          })))
        })
    }
    dbCat.from('lotes').select('id, cve_lote, lote, tipo_lote').order('cve_lote')
      .then(({ data }) => setLotesDisp(data as Lote[] ?? []))
  }, [isNew, propietario])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')

    const payload = {
      nombre:               form.nombre.trim(),
      apellido_paterno:     form.apellido_paterno.trim() || null,
      apellido_materno:     form.apellido_materno.trim() || null,
      tipo_persona:         form.tipo_persona || null,
      razon_social:         form.razon_social.trim() || null,
      rfc:                  form.rfc.trim().toUpperCase() || null,
      curp:                 form.curp.trim().toUpperCase() || null,
      fecha_nacimiento:     form.fecha_nacimiento || null,
      estado_civil:         form.estado_civil || null,
      regimen:              form.regimen || null,
      calle:                form.calle.trim() || null,
      colonia:              form.colonia.trim() || null,
      ciudad:               form.ciudad.trim() || null,
      estado:               form.estado.trim() || null,
      pais:                 form.pais.trim() || null,
      cp:                   form.cp.trim() || null,
      pertenece_asociacion: form.pertenece_asociacion,
      activo:               form.activo,
    }

    let propId = propietario?.id
    if (isNew) {
      const { data, error: err } = await dbCat.from('propietarios').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      propId = data.id
    } else {
      const { error: err } = await dbCat.from('propietarios').update(payload).eq('id', propId!)
      if (err) { setError(err.message); setSaving(false); return }
    }

    if (!isNew) await dbCat.from('propietarios_telefonos').update({ activo: false }).eq('id_propietario_fk', propId!)
    const telsValidos = telefonos.filter(t => t.numero.trim())
    if (telsValidos.length) {
      await dbCat.from('propietarios_telefonos').upsert(
        telsValidos.map(t => ({ ...(t.id ? { id: t.id } : {}), id_propietario_fk: propId, tipo: t.tipo, numero: t.numero.trim(), activo: true }))
      )
    }

    if (!isNew) await dbCat.from('propietarios_correos').update({ activo: false }).eq('id_propietario_fk', propId!)
    const mailsValidos = correos.filter(c => c.correo.trim())
    if (mailsValidos.length) {
      await dbCat.from('propietarios_correos').upsert(
        mailsValidos.map(c => ({ ...(c.id ? { id: c.id } : {}), id_propietario_fk: propId, tipo: c.tipo, correo: c.correo.trim(), activo: true }))
      )
    }

    // Lotes: eliminar registros anteriores y reinsertar siempre limpio
    await dbCtrl.from('propietarios_lotes').delete().eq('id_propietario_fk', propId!)
    const lotesValidos = lotes.filter(l => l.id_lote_fk)
    if (lotesValidos.length) {
      const lotesPayload = lotesValidos.map(l => ({
        id_propietario_fk: propId,
        id_lote_fk:        l.id_lote_fk,
        es_principal:      l.es_principal,
        porcentaje:        l.porcentaje ? Number(l.porcentaje) : null,
        activo:            true,
      }))
      const { error: errLotes } = await dbCtrl.from('propietarios_lotes').insert(lotesPayload)
      if (errLotes) { setError('Error al asignar lotes: ' + errLotes.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>
            {isNew ? 'Nuevo Propietario' : `${propietario.nombre} ${(propietario as any).apellido_paterno ?? ''}`}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{
              padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontFamily: 'var(--font-body)',
              color: tab === i ? 'var(--gold-light)' : 'var(--text-muted)',
              borderBottom: tab === i ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.2s',
            }}>{t}</button>
          ))}
        </div>

        <div style={{ padding: '20px 24px', minHeight: 340 }}>
          {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>}

          {/* TAB 0 — Datos Personales */}
          {tab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Row2>
                <Field label="Tipo de Persona">
                  <select className="select" value={form.tipo_persona} onChange={set('tipo_persona')}>
                    <option>Física</option>
                    <option>Moral</option>
                  </select>
                </Field>
                <Field label="Activo">
                  <select className="select" value={form.activo ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </Field>
              </Row2>

              {/* Campo Asociación de Condóminos */}
              <Field label="Pertenece a Asociación de Condóminos">
                <div style={{ display: 'flex', gap: 10 }}>
                  {[{ val: true, label: 'Sí' }, { val: false, label: 'No' }].map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, pertenece_asociacion: opt.val }))}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'var(--font-body)', fontSize: 13,
                        border: `1px solid ${form.pertenece_asociacion === opt.val ? 'var(--blue)' : '#e2e8f0'}`,
                        background: form.pertenece_asociacion === opt.val ? 'var(--blue-pale)' : '#fff',
                        color: form.pertenece_asociacion === opt.val ? 'var(--blue)' : 'var(--text-secondary)',
                        fontWeight: form.pertenece_asociacion === opt.val ? 600 : 400,
                        transition: 'all 0.15s',
                      }}>
                      {opt.val ? '✓ ' : ''}{opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              {form.tipo_persona === 'Moral' && (
                <Field label="Razón Social">
                  <input className="input" value={form.razon_social} onChange={set('razon_social')} />
                </Field>
              )}
              <Row2>
                <Field label="Nombre(s) *"><input className="input" value={form.nombre} onChange={set('nombre')} /></Field>
                <Field label="Apellido Paterno"><input className="input" value={form.apellido_paterno} onChange={set('apellido_paterno')} /></Field>
              </Row2>
              <Row2>
                <Field label="Apellido Materno"><input className="input" value={form.apellido_materno} onChange={set('apellido_materno')} /></Field>
                <Field label="Fecha Nacimiento"><input className="input" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} /></Field>
              </Row2>
              <Row2>
                <Field label="Estado Civil">
                  <select className="select" value={form.estado_civil} onChange={set('estado_civil')}>
                    <option value="">— Seleccionar —</option>
                    {ESTADO_CIVIL.map(e => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Régimen Matrimonial">
                  <select className="select" value={form.regimen} onChange={set('regimen')}>
                    <option value="">— Seleccionar —</option>
                    {REGIMEN.map(r => <option key={r}>{r}</option>)}
                  </select>
                </Field>
              </Row2>
              <SectionDivider label="Domicilio" />
              <Field label="Calle y Número"><input className="input" value={form.calle} onChange={set('calle')} /></Field>
              <Row2>
                <Field label="Colonia"><input className="input" value={form.colonia} onChange={set('colonia')} /></Field>
                <Field label="C.P."><input className="input" value={form.cp} onChange={set('cp')} /></Field>
              </Row2>
              <Row2>
                <Field label="Ciudad"><input className="input" value={form.ciudad} onChange={set('ciudad')} /></Field>
                <Field label="Estado"><input className="input" value={form.estado} onChange={set('estado')} /></Field>
              </Row2>
              <Field label="País"><input className="input" value={form.pais} onChange={set('pais')} /></Field>
            </div>
          )}

          {/* TAB 1 — Contacto */}
          {tab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <SectionDivider label="Teléfonos" inline />
                  <button className="btn-ghost" onClick={() => setTelefonos(t => [...t, { tipo: 'Celular', numero: '' }])}>
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                {telefonos.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 32px', gap: 8, marginBottom: 8 }}>
                    <select className="select" value={t.tipo} onChange={e => setTelefonos(ts => ts.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}>
                      {TIPOS_TEL.map(k => <option key={k}>{k}</option>)}
                    </select>
                    <input className="input" placeholder="Número" value={t.numero} onChange={e => setTelefonos(ts => ts.map((x, j) => j === i ? { ...x, numero: e.target.value } : x))} />
                    <button className="btn-ghost" style={{ padding: '6px' }} onClick={() => setTelefonos(ts => ts.filter((_, j) => j !== i))}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <SectionDivider label="Correos Electrónicos" inline />
                  <button className="btn-ghost" onClick={() => setCorreos(c => [...c, { tipo: 'Personal', correo: '' }])}>
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                {correos.map((c, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 32px', gap: 8, marginBottom: 8 }}>
                    <select className="select" value={c.tipo} onChange={e => setCorreos(cs => cs.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}>
                      {TIPOS_EMAIL.map(k => <option key={k}>{k}</option>)}
                    </select>
                    <input className="input" type="email" placeholder="correo@ejemplo.com" value={c.correo} onChange={e => setCorreos(cs => cs.map((x, j) => j === i ? { ...x, correo: e.target.value } : x))} />
                    <button className="btn-ghost" style={{ padding: '6px' }} onClick={() => setCorreos(cs => cs.filter((_, j) => j !== i))}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2 — Fiscal */}
          {tab === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Row2>
                <Field label="RFC"><input className="input" value={form.rfc} onChange={set('rfc')} placeholder="XAXX010101000" style={{ fontFamily: 'monospace' }} /></Field>
                <Field label="CURP"><input className="input" value={form.curp} onChange={set('curp')} placeholder="XAXX010101HXXXXXX00" style={{ fontFamily: 'monospace' }} /></Field>
              </Row2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Los datos fiscales específicos por lote (régimen fiscal, uso CFDI) se gestionan en el módulo de Lotes.
              </p>
            </div>
          )}

          {/* TAB 3 — Lotes */}
          {tab === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lotes asignados a este propietario</span>
                <button className="btn-ghost" onClick={() => setLotes(l => [...l, { id_lote_fk: 0, es_principal: false, porcentaje: '' }])}>
                  <Plus size={12} /> Asignar Lote
                </button>
              </div>
              {lotes.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Sin lotes asignados
                </div>
              )}
              {lotes.map((l, i) => (
                <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 100px 80px 32px', gap: 10, alignItems: 'center' }}>
                  <div>
                    <label className="label">Lote</label>
                    <select className="select" value={l.id_lote_fk || ''} onChange={e => setLotes(ls => ls.map((x, j) => j === i ? { ...x, id_lote_fk: Number(e.target.value) } : x))}>
                      <option value="">— Seleccionar —</option>
                      {lotesDisp.map(ld => (
                        <option key={ld.id} value={ld.id}>{ld.cve_lote ?? `#${ld.lote}`} {ld.tipo_lote ? `· ${ld.tipo_lote}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">% Propiedad</label>
                    <input className="input" type="number" min="0" max="100" step="0.01" value={l.porcentaje} onChange={e => setLotes(ls => ls.map((x, j) => j === i ? { ...x, porcentaje: e.target.value } : x))} placeholder="100" />
                  </div>
                  <div>
                    <label className="label">Principal</label>
                    <select className="select" value={l.es_principal ? 'true' : 'false'} onChange={e => setLotes(ls => ls.map((x, j) => j === i ? { ...x, es_principal: e.target.value === 'true' } : x))}>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <button className="btn-ghost" style={{ padding: '6px', marginTop: 18 }} onClick={() => setLotes(ls => ls.filter((_, j) => j !== i))}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab > 0 && <button className="btn-secondary" onClick={() => setTab(t => t - 1)}>← Anterior</button>}
            {tab < TABS.length - 1 && <button className="btn-secondary" onClick={() => setTab(t => t + 1)}>Siguiente →</button>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>
}
function SectionDivider({ label, inline }: { label: string; inline?: boolean }) {
  if (inline) return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
  return <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{label}</div>
}
