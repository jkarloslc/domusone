'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCfg, type Lote, type Seccion } from '@/lib/supabase'
import { Save, Loader, AlertTriangle, CheckCircle, MapPin, Wallet, Scale, Wrench } from 'lucide-react'
import FileUpload from '@/components/FileUpload'
import ModalShell from '@/components/ui/ModalShell'
import { ServiciosTab } from './LoteDetail'

type Props = { lote: Lote | null; onClose: () => void; onSaved: () => void }

const STATUS_LOTE      = ['Libre', 'Vendido', 'Bloqueado']
const STATUS_JUR       = ['Limpio', 'Litigio', 'Pendiente', 'Escriturado']
const STATUS_COBRANZA  = ['Al corriente', 'Atrasado', 'Moroso', 'Incobrable', 'En convenio']
const TIPO_CUOTA        = ['Condominal', 'Cuota de Servicios']
const SEGMENTO          = ['Fricción_Admin', 'Moroso_Flujo', 'Opositor', 'Disputa por Servicios', 'Ausente No localizable', 'Incobrable definitivo']

type TabKey = 'identificacion' | 'cuotas' | 'juridico' | 'servicios'

export default function LoteModal({ lote, onClose, onSaved }: Props) {
  const isNew = !lote
  const [tab, setTab] = useState<TabKey>('identificacion')
  const [secciones, setSecciones]             = useState<Seccion[]>([])
  const [clasificaciones, setClasificaciones] = useState<{id: number; nombre: string}[]>([])
  const [tiposLote, setTiposLote]             = useState<{id: number; nombre: string}[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Capacidad de sección seleccionada
  const [capacidad, setCapacidad] = useState<{ actual: number; limite: number | null } | null>(null)
  const [loadingCap, setLoadingCap] = useState(false)

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
    clave_catastral:     lote?.clave_catastral ?? '',
    valor_catastral:     lote?.valor_catastral?.toString() ?? '',
    observaciones:       lote?.observaciones ?? '',
    notas:               lote?.notas ?? '',
    imagen_lote:         lote?.imagen_lote ?? '',
    // Cuotas
    status_cobranza:     lote?.status_cobranza ?? '',
    paga_cuotas:         lote?.paga_cuotas ?? '',
    tipo_cuota:          lote?.tipo_cuota ?? '',
    segmento:            lote?.segmento ?? '',
    motivo_detalle:      lote?.motivo_detalle ?? '',
    motivo_incobrable:   lote?.motivo_incobrable ?? '',
    domiciliacion:       lote?.domiciliacion ?? false,
    plan_pago_activo:    lote?.plan_pago_activo ?? false,
    plan_pago_enganche:  lote?.plan_pago_enganche?.toString() ?? '',
    plan_pago_plazo:     lote?.plan_pago_plazo?.toString() ?? '',
    // Jurídico
    status_juridico:     lote?.status_juridico ?? '',
    base_juridica:       lote?.base_juridica ?? '',
    convenio_firmado:    lote?.convenio_firmado ?? false,
    convenio_fecha:      lote?.convenio_fecha ?? '',
    escritura_clausula:  lote?.escritura_clausula ?? false,
  })

  useEffect(() => {
    dbCfg.from('secciones')
      .select('id, nombre, clave_alfa, activo, cantidad_lotes, descripcion, id_tipo_seccion_fk, fecha_autorizacion')
      .order('nombre')
      .then(({ data }) => setSecciones((data ?? []) as Seccion[]))
    dbCfg.from('clasificacion').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setClasificaciones(data ?? []))
    dbCfg.from('tipos_lote').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setTiposLote(data ?? []))
  }, [])

  // Verifica capacidad cuando cambia la sección seleccionada
  useEffect(() => {
    const seccionId = form.id_seccion_fk ? Number(form.id_seccion_fk) : null
    if (!seccionId) { setCapacidad(null); return }

    const sec = secciones.find(s => s.id === seccionId)
    const limite = sec?.cantidad_lotes ?? null

    setLoadingCap(true)
    let q = dbCat.from('lotes').select('id', { count: 'exact', head: true }).eq('id_seccion_fk', seccionId)
    // Al editar, excluir el lote actual del conteo
    if (!isNew && lote.id) q = q.neq('id', lote.id)

    q.then(({ count }) => {
      setCapacidad({ actual: count ?? 0, limite })
      setLoadingCap(false)
    })
  }, [form.id_seccion_fk, secciones, isNew, lote])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const setBool = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value === 'Sí' }))

  const seccionLlena = capacidad !== null && capacidad.limite !== null && capacidad.actual >= capacidad.limite

  const handleSubmit = async () => {
    if (seccionLlena) {
      setError(`La sección ya alcanzó su límite de ${capacidad!.limite} lotes.`)
      return
    }

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
      clave_catastral:     form.clave_catastral || null,
      valor_catastral:     form.valor_catastral ? Number(form.valor_catastral) : null,
      observaciones:       form.observaciones || null,
      notas:               form.notas || null,
      imagen_lote:         form.imagen_lote || null,
      // Cuotas
      status_cobranza:     form.status_cobranza || null,
      paga_cuotas:         form.paga_cuotas || null,
      tipo_cuota:          form.tipo_cuota.trim() || null,
      segmento:            form.segmento.trim() || null,
      motivo_detalle:      form.motivo_detalle.trim() || null,
      motivo_incobrable:   form.motivo_incobrable.trim() || null,
      domiciliacion:       form.domiciliacion,
      plan_pago_activo:    form.plan_pago_activo,
      plan_pago_enganche:  form.plan_pago_enganche ? Number(form.plan_pago_enganche) : null,
      plan_pago_plazo:     form.plan_pago_plazo ? Number(form.plan_pago_plazo) : null,
      // Jurídico
      status_juridico:     form.status_juridico || null,
      base_juridica:       form.base_juridica.trim() || null,
      convenio_firmado:    form.convenio_firmado,
      convenio_fecha:      form.convenio_fecha || null,
      escritura_clausula:  form.escritura_clausula,
    }

    const { error: err } = isNew
      ? await dbCat.from('lotes').insert(payload)
      : await dbCat.from('lotes').update(payload).eq('id', lote.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const tabs = [
    { key: 'identificacion', label: 'Identificación', icon: MapPin },
    { key: 'cuotas',         label: 'Cuotas',          icon: Wallet },
    { key: 'juridico',       label: 'Jurídico',        icon: Scale },
    { key: 'servicios',      label: 'Servicios',       icon: Wrench, disabled: isNew, disabledHint: 'Guarda el lote primero' },
  ]

  return (
    <ModalShell modulo="lotes" titulo={isNew ? 'Nuevo Lote' : `Editar ${lote.cve_lote ?? '#' + lote.lote}`} onClose={onClose} maxWidth={680}
      tabs={tabs} activeTab={tab} onTabChange={key => setTab(key as TabKey)}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving || seccionLlena}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* ── Tab: Identificación ── */}
      {tab === 'identificacion' && (
        <>
          <Section label="Identificación">
            <Row>
              <Field label="Clave Lote"><input className="input" value={form.cve_lote} onChange={set('cve_lote')} placeholder="GR-001" /></Field>
              <Field label="No. Lote"><input className="input" type="number" value={form.lote} onChange={set('lote')} /></Field>
            </Row>
            <Row>
              <Field label="Sección">
                <select className="select" value={form.id_seccion_fk} onChange={e => { set('id_seccion_fk')(e) }}>
                  <option value="">— Sin sección —</option>
                  {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <CapacidadIndicador capacidad={capacidad} loading={loadingCap} />
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
              <Field label="Status Lote">
                <select className="select" value={form.status_lote} onChange={set('status_lote')}>
                  {STATUS_LOTE.map(s => <option key={s}>{s}</option>)}
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
        </>
      )}

      {/* ── Tab: Cuotas ── */}
      {tab === 'cuotas' && (
        <>
          <Section label="Cobranza">
            <Row>
              <Field label="Status Cobranza">
                <select className="select" value={form.status_cobranza} onChange={set('status_cobranza')}>
                  <option value="">— Seleccionar —</option>
                  {STATUS_COBRANZA.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Paga Cuotas">
                <select className="select" value={form.paga_cuotas} onChange={set('paga_cuotas')}>
                  <option value="">—</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Tipo de Cuota">
                <select className="select" value={form.tipo_cuota} onChange={set('tipo_cuota')}>
                  <option value="">— Seleccionar —</option>
                  {TIPO_CUOTA.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Segmento">
                <select className="select" value={form.segmento} onChange={set('segmento')}>
                  <option value="">— Seleccionar —</option>
                  {SEGMENTO.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Domiciliación">
                <select className="select" value={form.domiciliacion ? 'Sí' : 'No'} onChange={setBool('domiciliacion')}>
                  <option value="No">No</option>
                  <option value="Sí">Sí</option>
                </select>
              </Field>
              <Field label="Motivo Incobrable"><input className="input" value={form.motivo_incobrable} onChange={set('motivo_incobrable')} /></Field>
            </Row>
            <Field label="Motivo (detalle)">
              <textarea className="input" rows={2} value={form.motivo_detalle} onChange={set('motivo_detalle')} style={{ resize: 'vertical' }} />
            </Field>
          </Section>

          <Section label="Plan de Pago">
            <Row>
              <Field label="Plan de Pago Activo">
                <select className="select" value={form.plan_pago_activo ? 'Sí' : 'No'} onChange={setBool('plan_pago_activo')}>
                  <option value="No">No</option>
                  <option value="Sí">Sí</option>
                </select>
              </Field>
              <Field label="Plazo (meses)"><input className="input" type="number" value={form.plan_pago_plazo} onChange={set('plan_pago_plazo')} /></Field>
            </Row>
            <Row>
              <Field label="Enganche"><input className="input" type="number" step="0.01" value={form.plan_pago_enganche} onChange={set('plan_pago_enganche')} /></Field>
              <div />
            </Row>
          </Section>
        </>
      )}

      {/* ── Tab: Jurídico ── */}
      {tab === 'juridico' && (
        <Section label="Jurídico">
          <Row>
            <Field label="Status Jurídico">
              <select className="select" value={form.status_juridico} onChange={set('status_juridico')}>
                <option value="">— Seleccionar —</option>
                {STATUS_JUR.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Base Jurídica"><input className="input" value={form.base_juridica} onChange={set('base_juridica')} /></Field>
          </Row>
          <Row>
            <Field label="Convenio Firmado">
              <select className="select" value={form.convenio_firmado ? 'Sí' : 'No'} onChange={setBool('convenio_firmado')}>
                <option value="No">No</option>
                <option value="Sí">Sí</option>
              </select>
            </Field>
            <Field label="Fecha de Convenio"><input className="input" type="date" value={form.convenio_fecha} onChange={set('convenio_fecha')} /></Field>
          </Row>
          <Row>
            <Field label="Cláusula de Escritura">
              <select className="select" value={form.escritura_clausula ? 'Sí' : 'No'} onChange={setBool('escritura_clausula')}>
                <option value="No">No</option>
                <option value="Sí">Sí</option>
              </select>
            </Field>
            <div />
          </Row>
        </Section>
      )}

      {/* ── Tab: Servicios ── */}
      {tab === 'servicios' && !isNew && (
        <ServiciosTab loteId={lote.id} />
      )}
    </ModalShell>
  )
}

// ── Indicador de capacidad ────────────────────────────────────
function CapacidadIndicador({ capacidad, loading }: { capacidad: { actual: number; limite: number | null } | null; loading: boolean }) {
  if (!capacidad || capacidad.limite === null) return null

  const { actual, limite } = capacidad
  const disponibles = limite - actual
  const llena = disponibles <= 0
  const pct = Math.min(100, Math.round((actual / limite) * 100))

  return (
    <div style={{ marginTop: 6, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Barra de progreso */}
      <div style={{ height: 4, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: llena ? '#dc2626' : pct >= 80 ? '#f59e0b' : '#22c55e',
          borderRadius: 4,
          transition: 'width 0.3s ease',
        }} />
      </div>
      {/* Texto */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: llena ? '#dc2626' : pct >= 80 ? '#b45309' : '#15803d' }}>
        {loading
          ? <span style={{ color: 'var(--text-muted)' }}>Verificando capacidad…</span>
          : llena
            ? <><AlertTriangle size={11} /> Sección llena — {actual} / {limite} lotes (sin disponibles)</>
            : <><CheckCircle size={11} /> {actual} / {limite} lotes · {disponibles} disponible{disponibles !== 1 ? 's' : ''}</>
        }
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
