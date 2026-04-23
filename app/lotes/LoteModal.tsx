'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCfg, type Lote, type Seccion } from '@/lib/supabase'
import { Save, Loader } from 'lucide-react'
import FileUpload from '@/components/FileUpload'
import ModalShell from '@/components/ui/ModalShell'

type Props = { lote: Lote | null; onClose: () => void; onSaved: () => void }

const STATUS_LOTE = ['Libre', 'Vendido', 'Bloqueado']
const STATUS_JUR  = ['Limpio', 'Litigio', 'Pendiente', 'Escriturado']

export default function LoteModal({ lote, onClose, onSaved }: Props) {
  const isNew = !lote
  const [secciones, setSecciones]             = useState<Seccion[]>([])
  const [clasificaciones, setClasificaciones] = useState<{id: number; nombre: string}[]>([])
  const [tiposLote, setTiposLote]             = useState<{id: number; nombre: string}[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [form, setForm] = useState({
    cve_lote:            lote?.cve_lote ?? '',
    lote:                lote?.lote?.toString() ?? '',
    id_seccion_fk:       lote?.id_seccion_fk?.toString() ?? '',
    id_clasificacion_fk: lote?.id_clasificacion_fk?.toString() ?? '',
    id_tipo_lote_fk:     lote?.id_tipo_lote_fk?.toString() ?? '',
    calle:               lote?.calle ?? '',
    numero:              lote?.numero ?? '',
    manzana:             lote?.manzana ?? '',
    Diferenciador:       lote?.Diferenciador ?? '',
    superficie:          lote?.superficie?.toString() ?? '',
    sup_construccion:    lote?.sup_construccion?.toString() ?? '',
    status_lote:         lote?.status_lote ?? 'Libre',
    status_juridico:     lote?.status_juridico ?? '',
    status_cobranza:     lote?.status_cobranza ?? '',
    clasificacion_cobranza: lote?.clasificacion_cobranza ?? '',
    paga_cuotas:         lote?.paga_cuotas ?? '',
    clave_catastral:     lote?.clave_catastral ?? '',
    valor_catastral:     lote?.valor_catastral?.toString() ?? '',
    observaciones:       lote?.observaciones ?? '',
    notas:               lote?.notas ?? '',
    imagen_lote:         lote?.imagen_lote ?? '',
  })

  useEffect(() => {
    dbCfg.from('secciones').select('*').order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
    dbCfg.from('clasificacion').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setClasificaciones(data ?? []))
    dbCfg.from('tipos_lote').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setTiposLote(data ?? []))
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    setSaving(true); setError('')
    const payload: Record<string, unknown> = {
      cve_lote:            form.cve_lote || null,
      lote:                form.lote ? Number(form.lote) : null,
      id_seccion_fk:       form.id_seccion_fk ? Number(form.id_seccion_fk) : null,
      id_clasificacion_fk: form.id_clasificacion_fk ? Number(form.id_clasificacion_fk) : null,
      id_tipo_lote_fk:     form.id_tipo_lote_fk ? Number(form.id_tipo_lote_fk) : null,
      calle:               form.calle.trim() || null,
      numero:              form.numero.trim() || null,
      manzana:             form.manzana.trim() || null,
      superficie:          form.superficie ? Number(form.superficie) : null,
      sup_construccion:    form.sup_construccion ? Number(form.sup_construccion) : null,
      status_lote:         form.status_lote || null,
      status_juridico:     form.status_juridico || null,
      status_cobranza:     form.status_cobranza || null,
      clasificacion_cobranza: form.clasificacion_cobranza || null,
      paga_cuotas:         form.paga_cuotas || null,
      clave_catastral:     form.clave_catastral || null,
      valor_catastral:     form.valor_catastral ? Number(form.valor_catastral) : null,
      observaciones:       form.observaciones || null,
      notas:               form.notas || null,
      imagen_lote:         form.imagen_lote || null,
    }

    const { error: err } = isNew
      ? await dbCat.from('lotes').insert(payload)
      : await dbCat.from('lotes').update(payload).eq('id', lote.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell modulo="lotes" titulo={isNew ? 'Nuevo Lote' : `Editar ${lote.cve_lote ?? '#' + lote.lote}`} onClose={onClose} maxWidth={680}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
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
                <select className="select" value={form.id_tipo_lote_fk} onChange={set('id_tipo_lote_fk')}>
                  <option value="">— Seleccionar —</option>
                  {tiposLote.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Calle"><input className="input" value={form.calle} onChange={set('calle')} placeholder="Nombre de la calle" /></Field>
              <Field label="Manzana"><input className="input" value={form.manzana} onChange={set('manzana')} placeholder="Manzana" /></Field>
            </Row>
            <Row>
              <Field label="Número"><input className="input" value={form.numero} onChange={set('numero')} placeholder="Número exterior" /></Field>
              <Field label="Diferenciador"><input className="input" value={form.Diferenciador} onChange={set('Diferenciador')} placeholder="Ej. A, B, Int…" /></Field>
            </Row>
            <Row>
              <Field label="Clasificación">
                <select className="select" value={form.id_clasificacion_fk} onChange={set('id_clasificacion_fk')}>
                  <option value="">— Seleccionar —</option>
                  {clasificaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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

          <Section label="Catastral">
            <Row>
              <Field label="Clave Catastral"><input className="input" value={form.clave_catastral} onChange={set('clave_catastral')} /></Field>
              <Field label="Valor Catastral"><input className="input" type="number" value={form.valor_catastral} onChange={set('valor_catastral')} /></Field>
            </Row>
          </Section>

          <Section label="Imagen del Lote">
            <FileUpload
              value={form.imagen_lote}
              onChange={url => setForm(f => ({ ...f, imagen_lote: url ?? '' }))}
              accept="image"
              folder="lotes"
              label="Foto o plano del lote"
              preview={true}
            />
          </Section>

          <Section label="Observaciones">
            <Field label="Observaciones">
              <textarea className="input" rows={3} value={form.observaciones} onChange={set('observaciones')} style={{ resize: 'vertical' }} />
            </Field>
            <Field label="Notas internas">
              <textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} />
            </Field>
          </Section>
    </ModalShell>
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
