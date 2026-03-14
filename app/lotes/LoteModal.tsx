'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCfg, type Lote, type Seccion } from '@/lib/supabase'
import { X, Save, Loader } from 'lucide-react'

type Props = { lote: Lote | null; onClose: () => void; onSaved: () => void }

const TIPOS_LOTE   = ['Fairway', 'Campestre', 'Panorámico', 'Departamento', 'Casa', 'Otro']
const STATUS_LOTE  = ['Libre', 'Vendido', 'Bloqueado']
const STATUS_JUR   = ['Limpio', 'Litigio', 'Pendiente', 'Escriturado']
const FORMAS_VENTA = ['Contado', 'Financiado', 'Intercambio']
const TIPOS_PER    = ['Física', 'Moral']

export default function LoteModal({ lote, onClose, onSaved }: Props) {
  const isNew = !lote
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [form, setForm] = useState({
    cve_lote:           lote?.cve_lote ?? '',
    lote:               lote?.lote?.toString() ?? '',
    id_seccion_fk:      lote?.id_seccion_fk?.toString() ?? '',
    tipo_lote:          lote?.tipo_lote ?? '',
    superficie:         lote?.superficie?.toString() ?? '',
    sup_construccion:   lote?.sup_construccion?.toString() ?? '',
    status_lote:        lote?.status_lote ?? 'Libre',
    status_juridico:    lote?.status_juridico ?? '',
    status_cobranza:    lote?.status_cobranza ?? '',
    clasificacion_cobranza: lote?.clasificacion_cobranza ?? '',
    paga_cuotas:        lote?.paga_cuotas ?? '',
    valor_operacion:    lote?.valor_operacion?.toString() ?? '',
    precio_de_lista:    lote?.precio_de_lista?.toString() ?? '',
    forma_venta:        lote?.forma_venta ?? '',
    incluye_membresia:  lote?.incluye_membresia ?? '',
    tipo_membresia:     lote?.tipo_membresia ?? '',
    vendedor:           lote?.vendedor ?? '',
    medio_captacion:    lote?.medio_captacion ?? '',
    clave_catastral:    lote?.clave_catastral ?? '',
    valor_catastral:    lote?.valor_catastral?.toString() ?? '',
    persona_contacto:   lote?.persona_contacto ?? '',
    telefono_persona_contacto: lote?.telefono_persona_contacto ?? '',
    correo_persona_contacto:   lote?.correo_persona_contacto ?? '',
    rfc_para_factura:          lote?.rfc_para_factura ?? '',
    razon_social_para_factura: lote?.razon_social_para_factura ?? '',
    urbanizacion_disponible:   lote?.urbanizacion_disponible ?? '',
    observaciones:      lote?.observaciones ?? '',
    notas:              lote?.notas ?? '',
  })

  useEffect(() => {
    dbCfg.from('secciones').select('*').order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    setSaving(true); setError('')
    const payload: Record<string, unknown> = {
      cve_lote:           form.cve_lote || null,
      lote:               form.lote ? Number(form.lote) : null,
      id_seccion_fk:      form.id_seccion_fk ? Number(form.id_seccion_fk) : null,
      tipo_lote:          form.tipo_lote || null,
      superficie:         form.superficie ? Number(form.superficie) : null,
      sup_construccion:   form.sup_construccion ? Number(form.sup_construccion) : null,
      status_lote:        form.status_lote || null,
      status_juridico:    form.status_juridico || null,
      status_cobranza:    form.status_cobranza || null,
      clasificacion_cobranza: form.clasificacion_cobranza || null,
      paga_cuotas:        form.paga_cuotas || null,
      valor_operacion:    form.valor_operacion ? Number(form.valor_operacion) : null,
      precio_de_lista:    form.precio_de_lista ? Number(form.precio_de_lista) : null,
      forma_venta:        form.forma_venta || null,
      incluye_membresia:  form.incluye_membresia || null,
      tipo_membresia:     form.tipo_membresia || null,
      vendedor:           form.vendedor || null,
      medio_captacion:    form.medio_captacion || null,
      clave_catastral:    form.clave_catastral || null,
      valor_catastral:    form.valor_catastral ? Number(form.valor_catastral) : null,
      persona_contacto:   form.persona_contacto || null,
      telefono_persona_contacto: form.telefono_persona_contacto || null,
      correo_persona_contacto:   form.correo_persona_contacto || null,
      rfc_para_factura:          form.rfc_para_factura || null,
      razon_social_para_factura: form.razon_social_para_factura || null,
      urbanizacion_disponible:   form.urbanizacion_disponible || null,
      observaciones:      form.observaciones || null,
      notas:              form.notas || null,
    }

    const { error: err } = isNew
      ? await dbCat.from('lotes').insert(payload)
      : await dbCat.from('lotes').update(payload).eq('id', lote.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>
            {isNew ? 'Nuevo Lote' : `Editar ${lote.cve_lote ?? '#' + lote.lote}`}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <Section label="Identificación">
            <Row>
              <Field label="Clave Lote *"><input className="input" value={form.cve_lote} onChange={set('cve_lote')} placeholder="GR-001" /></Field>
              <Field label="No. Lote"><input className="input" type="number" value={form.lote} onChange={set('lote')} /></Field>
            </Row>
            <Row>
              <Field label="Sección">
                <select className="select" value={form.id_seccion_fk} onChange={set('id_seccion_fk')}>
                  <option value="">— Sin sección —</option>
                  {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Field>
              <Field label="Tipo de Lote">
                <select className="select" value={form.tipo_lote} onChange={set('tipo_lote')}>
                  <option value="">— Seleccionar —</option>
                  {TIPOS_LOTE.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </Row>
          </Section>

          <Section label="Dimensiones">
            <Row>
              <Field label="Superficie (m²)"><input className="input" type="number" step="0.01" value={form.superficie} onChange={set('superficie')} /></Field>
              <Field label="Sup. Construcción (m²)"><input className="input" type="number" step="0.01" value={form.sup_construccion} onChange={set('sup_construccion')} /></Field>
            </Row>
          </Section>

          <Section label="Status">
            <Row>
              <Field label="Status Lote">
                <select className="select" value={form.status_lote} onChange={set('status_lote')}>
                  {STATUS_LOTE.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Status Jurídico">
                <select className="select" value={form.status_juridico} onChange={set('status_juridico')}>
                  <option value="">— Seleccionar —</option>
                  {STATUS_JUR.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Cobranza"><input className="input" value={form.clasificacion_cobranza} onChange={set('clasificacion_cobranza')} placeholder="Al corriente, Moroso…" /></Field>
              <Field label="Paga Cuotas">
                <select className="select" value={form.paga_cuotas} onChange={set('paga_cuotas')}>
                  <option value="">—</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
              </Field>
            </Row>
          </Section>

          <Section label="Comercial">
            <Row>
              <Field label="Valor Operación"><input className="input" type="number" step="0.01" value={form.valor_operacion} onChange={set('valor_operacion')} /></Field>
              <Field label="Precio Lista"><input className="input" type="number" step="0.01" value={form.precio_de_lista} onChange={set('precio_de_lista')} /></Field>
            </Row>
            <Row>
              <Field label="Forma de Venta">
                <select className="select" value={form.forma_venta} onChange={set('forma_venta')}>
                  <option value="">—</option>
                  {FORMAS_VENTA.map(f => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Vendedor"><input className="input" value={form.vendedor} onChange={set('vendedor')} /></Field>
            </Row>
            <Row>
              <Field label="Incluye Membresía">
                <select className="select" value={form.incluye_membresia} onChange={set('incluye_membresia')}>
                  <option value="">—</option>
                  <option>Sí</option><option>No</option>
                </select>
              </Field>
              <Field label="Tipo Membresía"><input className="input" value={form.tipo_membresia} onChange={set('tipo_membresia')} /></Field>
            </Row>
          </Section>

          <Section label="Datos Fiscales / Facturación">
            <Row>
              <Field label="RFC"><input className="input" value={form.rfc_para_factura} onChange={set('rfc_para_factura')} placeholder="XAXX010101000" /></Field>
              <Field label="Razón Social"><input className="input" value={form.razon_social_para_factura} onChange={set('razon_social_para_factura')} /></Field>
            </Row>
          </Section>

          <Section label="Catastral">
            <Row>
              <Field label="Clave Catastral"><input className="input" value={form.clave_catastral} onChange={set('clave_catastral')} /></Field>
              <Field label="Valor Catastral"><input className="input" type="number" value={form.valor_catastral} onChange={set('valor_catastral')} /></Field>
            </Row>
          </Section>

          <Section label="Observaciones">
            <Field label="Observaciones">
              <textarea className="input" rows={3} value={form.observaciones} onChange={set('observaciones')} style={{ resize: 'vertical' }} />
            </Field>
            <Field label="Notas internas">
              <textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} />
            </Field>
          </Section>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>
}
