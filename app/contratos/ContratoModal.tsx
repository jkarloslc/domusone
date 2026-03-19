'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { X, Save, Loader } from 'lucide-react'
import FileUpload from '@/components/FileUpload'
import { type Contrato } from './page'

const TIPOS    = ['Promesa de Compra-Venta', 'Cesión de Derechos', 'Compra-Venta', 'Permuta', 'Donación', 'Otro']
const FORMAS   = ['Contado', 'Financiado', 'Intercambio', 'Mixto']
const MONEDAS  = ['MXN', 'USD']

export default function ContratoModal({ contrato, onClose, onSaved }: { contrato: Contrato | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !contrato
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [lotes, setLotes]     = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState(contrato ? ((contrato as any).lotes?.cve_lote ?? '') : '')

  const [form, setForm] = useState({
    id_lote_fk:           contrato?.id_lote_fk?.toString() ?? '',
    sucesivo:             contrato?.sucesivo ?? '',
    tipo_contrato:        contrato?.tipo_contrato ?? '',
    parte_1:              contrato?.parte_1 ?? '',
    parte_2:              contrato?.parte_2 ?? '',
    objeto:               contrato?.objeto ?? '',
    valor_operacion:      contrato?.valor_operacion?.toString() ?? '',
    forma_pago:           contrato?.forma_pago ?? '',
    moneda:               contrato?.moneda ?? 'MXN',
    tipo_cambio:          contrato?.tipo_cambio?.toString() ?? '',
    fecha:                contrato?.fecha ?? '',
    clausula_penal:       contrato?.clausula_penal ?? '',
    membresia:            contrato?.membresia ?? '',
    cuotas_mantto:        contrato?.cuotas_mantto ?? '',
    descripcion:          contrato?.descripcion ?? '',
    adendum:              contrato?.adendum ?? '',
    concesiones:          contrato?.concesiones ?? '',
    propietario_contrato: contrato?.propietario_contrato ?? '',
    pdf_contrato:         (contrato as any)?.pdf_contrato ?? null,
  })

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk) { setError('Selecciona un lote'); return }
    setSaving(true); setError('')
    const payload = {
      id_lote_fk:           Number(form.id_lote_fk),
      sucesivo:             form.sucesivo.trim() || null,
      tipo_contrato:        form.tipo_contrato || null,
      parte_1:              form.parte_1.trim() || null,
      parte_2:              form.parte_2.trim() || null,
      objeto:               form.objeto.trim() || null,
      valor_operacion:      form.valor_operacion ? Number(form.valor_operacion) : null,
      forma_pago:           form.forma_pago || null,
      moneda:               form.moneda || 'MXN',
      tipo_cambio:          form.tipo_cambio ? Number(form.tipo_cambio) : null,
      fecha:                form.fecha || null,
      clausula_penal:       form.clausula_penal.trim() || null,
      membresia:            form.membresia.trim() || null,
      cuotas_mantto:        form.cuotas_mantto.trim() || null,
      descripcion:          form.descripcion.trim() || null,
      adendum:              form.adendum.trim() || null,
      concesiones:          form.concesiones.trim() || null,
      propietario_contrato: form.propietario_contrato.trim() || null,
      pdf_contrato:         (form as any).pdf_contrato || null,
    }
    const { error: err } = isNew
      ? await dbCtrl.from('contratos').insert(payload)
      : await dbCtrl.from('contratos').update(payload).eq('id', contrato.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>{isNew ? 'Nuevo Contrato' : `Editar Contrato ${contrato.sucesivo ?? ''}`}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13 }}>{error}</div>}

          <Section label="Identificación">
            <Grid3>
              <div>
                <label className="label">Lote *</label>
                <input className="input" placeholder="Busca clave de lote…" value={loteSearch}
                  onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
                {lotes.length > 0 && (
                  <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                    {lotes.map((l: any) => (
                      <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                        style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 15 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        {l.cve_lote ?? `#${l.lote}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Field label="Sucesivo / No. Contrato"><input className="input" value={form.sucesivo} onChange={set('sucesivo')} placeholder="CV-001" /></Field>
              <Field label="Tipo de Contrato">
                <select className="select" value={form.tipo_contrato} onChange={set('tipo_contrato')}>
                  <option value="">— Seleccionar —</option>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </Grid3>
            <Grid2>
              <Field label="Fecha"><input className="input" type="date" value={form.fecha} onChange={set('fecha')} /></Field>
              <Field label="Propietario en Contrato"><input className="input" value={form.propietario_contrato} onChange={set('propietario_contrato')} /></Field>
            </Grid2>
          </Section>

          <Section label="Partes">
            <Grid2>
              <Field label="Parte 1 (Vendedor)"><input className="input" value={form.parte_1} onChange={set('parte_1')} /></Field>
              <Field label="Parte 2 (Comprador)"><input className="input" value={form.parte_2} onChange={set('parte_2')} /></Field>
            </Grid2>
            <Field label="Objeto del Contrato"><textarea className="input" rows={2} value={form.objeto} onChange={set('objeto')} style={{ resize: 'vertical' }} /></Field>
          </Section>

          <Section label="Condiciones Económicas">
            <Grid3>
              <Field label="Valor Operación"><input className="input" type="number" step="0.01" value={form.valor_operacion} onChange={set('valor_operacion')} /></Field>
              <Field label="Forma de Pago">
                <select className="select" value={form.forma_pago} onChange={set('forma_pago')}>
                  <option value="">—</option>
                  {FORMAS.map(f => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Moneda">
                <select className="select" value={form.moneda} onChange={set('moneda')}>
                  {MONEDAS.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
            </Grid3>
            <Grid2>
              <Field label="Tipo de Cambio"><input className="input" type="number" step="0.01" value={form.tipo_cambio} onChange={set('tipo_cambio')} placeholder="Solo si aplica USD" /></Field>
              <Field label="Membresía"><input className="input" value={form.membresia} onChange={set('membresia')} placeholder="Incluye / No incluye" /></Field>
            </Grid2>
            <Field label="Cuotas de Mantenimiento"><input className="input" value={form.cuotas_mantto} onChange={set('cuotas_mantto')} /></Field>
          </Section>

          <Section label="Documento del Contrato">
            <FileUpload
              value={(form as any).pdf_contrato}
              onChange={url => setForm((f: any) => ({ ...f, pdf_contrato: url }))}
              accept="pdf"
              folder="contratos"
              label="PDF del Contrato"
              preview={false}
            />
          </Section>

          <Section label="Cláusulas y Notas">
            <Field label="Cláusula Penal"><textarea className="input" rows={2} value={form.clausula_penal} onChange={set('clausula_penal')} style={{ resize: 'vertical' }} /></Field>
            <Field label="Concesiones"><textarea className="input" rows={2} value={form.concesiones} onChange={set('concesiones')} style={{ resize: 'vertical' }} /></Field>
            <Field label="Descripción General"><textarea className="input" rows={2} value={form.descripcion} onChange={set('descripcion')} style={{ resize: 'vertical' }} /></Field>
            <Field label="Adéndum"><textarea className="input" rows={2} value={form.adendum} onChange={set('adendum')} style={{ resize: 'vertical' }} /></Field>
          </Section>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  </div>
)
const Grid2 = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
const Grid3 = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>{children}</div>
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div><label className="label">{label}</label>{children}</div>
