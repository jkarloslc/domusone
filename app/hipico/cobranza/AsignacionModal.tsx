'use client'
import { useState, useEffect } from 'react'
import { dbHip } from '@/lib/supabase'
import { Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Arrendatario = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type Caballeriza  = { id: number; clave: string; nombre: string | null; status: string }

export type AsignacionData = {
  id?: number
  folio?: string
  id_arrendatario_fk: number
  id_caballeriza_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  renta_mensual: number
  dia_pago: number
  moneda: string
  status: string
  notas: string | null
}

type Props = {
  /** Si viene con datos = edición; si no = nueva asignación */
  asignacion?: AsignacionData
  /** Bloquear el arrendatario (viene pre-seleccionado) */
  idArrendatarioFijo?: number
  onClose: () => void
  onSaved: () => void
}

const fmtNombre = (a: Arrendatario) =>
  a.tipo_persona === 'Moral' && a.razon_social
    ? a.razon_social
    : [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')

const hoy = () => new Date().toLocaleDateString('en-CA')

export default function AsignacionModal({ asignacion, idArrendatarioFijo, onClose, onSaved }: Props) {
  const esEdicion = !!asignacion?.id

  const [arrendatarios, setArrendatarios] = useState<Arrendatario[]>([])
  const [caballerizas,  setCaballerizas]  = useState<Caballeriza[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    id_arrendatario_fk: asignacion?.id_arrendatario_fk ?? idArrendatarioFijo ?? 0,
    id_caballeriza_fk:  asignacion?.id_caballeriza_fk  ?? null as number | null,
    fecha_inicio:       asignacion?.fecha_inicio        ?? hoy(),
    fecha_fin:          asignacion?.fecha_fin           ?? '',
    renta_mensual:      asignacion?.renta_mensual       ?? 0,
    dia_pago:           asignacion?.dia_pago            ?? 1,
    moneda:             asignacion?.moneda              ?? 'MXN',
    status:             asignacion?.status              ?? 'Vigente',
    notas:              asignacion?.notas               ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    Promise.all([
      dbHip.from('cat_arrendatarios')
        .select('id, nombre, apellido_paterno, razon_social, tipo_persona')
        .eq('activo', true).order('apellido_paterno'),
      dbHip.from('cat_caballerizas')
        .select('id, clave, nombre, status')
        .eq('activo', true).order('clave'),
    ]).then(([{ data: arr }, { data: cab }]) => {
      setArrendatarios((arr ?? []) as Arrendatario[])
      setCaballerizas((cab  ?? []) as Caballeriza[])
      setLoading(false)
    })
  }, [])

  const generarFolio = async (): Promise<string> => {
    const anio = new Date().getFullYear()
    const { data } = await dbHip.from('ctrl_contratos')
      .select('folio').like('folio', `AC-${anio}-%`)
      .order('folio', { ascending: false }).limit(1)
    const ultimo = (data as { folio: string }[] | null)?.[0]?.folio
    const num = ultimo ? parseInt(ultimo.split('-')[2] ?? '0') + 1 : 1
    return `AC-${anio}-${String(num).padStart(3, '0')}`
  }

  const handleSave = async () => {
    if (!form.id_arrendatario_fk) { setErr('Selecciona un socio'); return }
    if (!form.id_caballeriza_fk)  { setErr('Selecciona una caballeriza'); return }
    if (form.renta_mensual <= 0)  { setErr('La renta mensual debe ser mayor a 0'); return }
    if (!form.fecha_inicio)       { setErr('La fecha de inicio es obligatoria'); return }

    setSaving(true); setErr('')

    const payload: Record<string, unknown> = {
      id_arrendatario_fk: form.id_arrendatario_fk,
      id_caballeriza_fk:  form.id_caballeriza_fk,
      fecha_inicio:       form.fecha_inicio,
      fecha_fin:          form.fecha_fin || null,
      renta_mensual:      form.renta_mensual,
      dia_pago:           form.dia_pago,
      moneda:             form.moneda,
      status:             form.status,
      notas:              form.notas || null,
    }

    let error: { message: string } | null = null

    if (esEdicion) {
      const res = await dbHip.from('ctrl_contratos').update(payload).eq('id', asignacion!.id!)
      error = res.error
    } else {
      payload.folio = await generarFolio()
      const res = await dbHip.from('ctrl_contratos').insert(payload)
      error = res.error
    }

    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <ModalShell
      modulo="hipico"
      titulo={esEdicion ? 'Editar Asignación' : 'Nueva Asignación'}
      onClose={onClose}
      maxWidth={560}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader size={13} /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando catálogos…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* Socio */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Socio *</label>
            <select className="input" style={{ width: '100%' }}
              value={form.id_arrendatario_fk}
              disabled={!!idArrendatarioFijo && !esEdicion}
              onChange={e => set('id_arrendatario_fk', Number(e.target.value))}>
              <option value={0}>— Seleccionar —</option>
              {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombre(a)}</option>)}
            </select>
          </div>

          {/* Caballeriza */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Caballeriza *</label>
            <select className="input" style={{ width: '100%' }}
              value={form.id_caballeriza_fk ?? ''}
              onChange={e => set('id_caballeriza_fk', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Seleccionar —</option>
              {caballerizas.map(c => (
                <option key={c.id} value={c.id} disabled={c.status === 'Rentada' && c.id !== asignacion?.id_caballeriza_fk}>
                  {c.clave}{c.nombre ? ` — ${c.nombre}` : ''} {c.status !== 'Libre' && c.id !== asignacion?.id_caballeriza_fk ? `(${c.status})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Renta mensual */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Renta mensual *</label>
            <input className="input" type="number" min={0} step={0.01} style={{ width: '100%' }}
              value={form.renta_mensual}
              onChange={e => set('renta_mensual', Number(e.target.value))} />
          </div>

          {/* Moneda */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Moneda</label>
            <select className="input" style={{ width: '100%' }}
              value={form.moneda} onChange={e => set('moneda', e.target.value)}>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>

          {/* Día de pago */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Día de pago (vencimiento)</label>
            <input className="input" type="number" min={1} max={31} style={{ width: '100%' }}
              value={form.dia_pago}
              onChange={e => set('dia_pago', Number(e.target.value))} />
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
            <select className="input" style={{ width: '100%' }}
              value={form.status} onChange={e => set('status', e.target.value)}>
              {['Vigente', 'Vencido', 'Cancelado', 'En negociación'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Fecha inicio */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha inicio *</label>
            <input className="input" type="date" style={{ width: '100%' }}
              value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
          </div>

          {/* Fecha fin */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha fin (opcional)</label>
            <input className="input" type="date" style={{ width: '100%' }}
              value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} />
          </div>

          {/* Notas */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical' }}
              value={form.notas} onChange={e => set('notas', e.target.value)} />
          </div>

          {err && (
            <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
              {err}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  )
}
