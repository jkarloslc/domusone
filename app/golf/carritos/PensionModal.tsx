'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Slot = { id: number; numero: string }
type Props = {
  idSocio: number
  idCarrito: number
  nombreSocio: string
  descripcionCarrito: string
  onClose: () => void
  onSaved: () => void
}

const inputStyle = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function periodoLabel(year: number, month: number) {
  return `${MESES[month - 1]} ${year}`
}

function periodoKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export default function PensionModal({ idSocio, idCarrito, nombreSocio, descripcionCarrito, onClose, onSaved }: Props) {
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [slots, setSlots]     = useState<Slot[]>([])
  const [tarifa, setTarifa]   = useState<number>(0)

  const hoy = new Date()
  const [form, setForm] = useState({
    id_slot_fk:        '' as number | '',
    fecha_inicio:      hoy.toISOString().split('T')[0],
    monto_mensual:     0,
    modalidad:         'MENSUAL' as 'MENSUAL' | 'ANUAL',
    // para mensual: mes/año de inicio
    mes_inicio:        hoy.getMonth() + 1,
    anio_inicio:       hoy.getFullYear(),
    // para anual: año a cobrar
    anio_cobro:        hoy.getFullYear(),
    num_meses:         12,
    descuento:         0,
    observaciones:     '',
  })
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    // Slots libres (sin pensión activa)
    dbGolf.from('cat_slots').select('id, numero').eq('activo', true).order('numero')
      .then(async ({ data: todosSlots }) => {
        const { data: ocupados } = await dbGolf
          .from('ctrl_pensiones')
          .select('id_slot_fk')
          .eq('activo', true)
        const ocupadosIds = new Set((ocupados ?? []).map((p: any) => p.id_slot_fk))
        setSlots((todosSlots ?? []).filter((s: Slot) => !ocupadosIds.has(s.id)))
      })
    // Tarifa global
    dbGolf.from('cfg_carritos').select('tarifa_mensual').single()
      .then(({ data }) => {
        const t = data?.tarifa_mensual ?? 0
        setTarifa(t)
        setForm(f => ({ ...f, monto_mensual: t }))
      })
  }, [])

  // Calcular resumen de cuotas a generar
  const cuotas: { periodo: string; label: string; monto: number }[] = []
  if (form.modalidad === 'MENSUAL') {
    // Solo 1 cuota del mes seleccionado
    cuotas.push({
      periodo: periodoKey(form.anio_inicio, form.mes_inicio),
      label:   periodoLabel(form.anio_inicio, form.mes_inicio),
      monto:   form.monto_mensual,
    })
  } else {
    // 12 cuotas del año seleccionado con descuento global
    const montoConDesc = Math.max(0, form.monto_mensual - form.descuento / 12)
    for (let m = 1; m <= 12; m++) {
      cuotas.push({
        periodo: periodoKey(form.anio_cobro, m),
        label:   periodoLabel(form.anio_cobro, m),
        monto:   montoConDesc,
      })
    }
  }

  const totalCuotas = cuotas.reduce((a, c) => a + c.monto, 0)
  const descuentoAnual = form.modalidad === 'ANUAL' ? form.descuento : 0

  const handleSave = async () => {
    if (!form.id_slot_fk) { setError('Selecciona un slot disponible'); return }
    if (form.monto_mensual <= 0) { setError('El monto mensual debe ser mayor a 0'); return }
    setSaving(true); setError('')

    // 1. Crear contrato de pensión
    const { data: pension, error: err1 } = await dbGolf
      .from('ctrl_pensiones')
      .insert({
        id_socio_fk:   idSocio,
        id_carrito_fk: idCarrito,
        id_slot_fk:    form.id_slot_fk,
        fecha_inicio:  form.fecha_inicio,
        monto_mensual: form.monto_mensual,
        observaciones: form.observaciones || null,
      })
      .select('id')
      .single()

    if (err1 || !pension) { setError(err1?.message ?? 'Error al crear pensión'); setSaving(false); return }

    // 2. Generar cuotas en cxc_golf
    const venc = new Date(form.fecha_inicio)
    venc.setDate(1)

    const cuotasInsert = cuotas.map((c, i) => {
      const [y, m] = c.periodo.split('-').map(Number)
      const fv = new Date(y, m - 1, 10).toISOString().split('T')[0]
      return {
        id_socio_fk:      idSocio,
        tipo:             'PENSION_CARRITO',
        id_pension_fk:    pension.id,
        concepto:         `Pensión Carrito ${descripcionCarrito} — ${c.label}`,
        periodo:          c.periodo,
        monto_original:   form.monto_mensual,
        descuento:        form.modalidad === 'ANUAL' ? (form.descuento / 12) : 0,
        status:           'PENDIENTE',
        fecha_emision:    new Date().toISOString().split('T')[0],
        fecha_vencimiento: fv,
      }
    })

    const { error: err2 } = await dbGolf.from('cxc_golf').insert(cuotasInsert)
    if (err2) { setError(err2.message); setSaving(false); return }

    onSaved()
  }

  return (
    <ModalShell modulo="golf-carritos" titulo="Asignar Pensión" subtitulo={`${nombreSocio} · ${descripcionCarrito}`} maxWidth={560} onClose={onClose} footer={<>
      <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
      <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? <Loader size={14} /> : <Save size={14} />}
        Crear Pensión y Generar Cuotas
      </button>
    </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Slot */}
          <div>
            <label style={labelStyle}>Slot / Cajón *</label>
            <select style={inputStyle} value={form.id_slot_fk} onChange={e => set('id_slot_fk', e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Seleccionar slot disponible —</option>
              {slots.map(s => <option key={s.id} value={s.id}>Cajón {s.numero}</option>)}
            </select>
            {slots.length === 0 && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>No hay slots disponibles. Agrega slots en Configuración.</div>}
          </div>

          {/* Fecha inicio + monto */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Fecha de Inicio</label>
              <input style={inputStyle} type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Monto Mensual *</label>
              <input style={inputStyle} type="number" min={0} step={0.01}
                value={form.monto_mensual}
                onChange={e => set('monto_mensual', parseFloat(e.target.value) || 0)} />
              {tarifa > 0 && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Tarifa global: ${tarifa.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>}
            </div>
          </div>

          {/* Modalidad de cobro */}
          <div>
            <label style={labelStyle}>Modalidad de Cobro</label>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => set('modalidad', 'MENSUAL')}
                style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: form.modalidad === 'MENSUAL' ? '#ecfdf5' : '#fff', color: form.modalidad === 'MENSUAL' ? '#065f46' : '#94a3b8' }}>
                Mensual
              </button>
              <button onClick={() => set('modalidad', 'ANUAL')}
                style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 600, border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', background: form.modalidad === 'ANUAL' ? '#ecfdf5' : '#fff', color: form.modalidad === 'ANUAL' ? '#065f46' : '#94a3b8' }}>
                Anual (12 cuotas)
              </button>
            </div>
          </div>

          {/* Opciones según modalidad */}
          {form.modalidad === 'MENSUAL' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Mes</label>
                <select style={inputStyle} value={form.mes_inicio} onChange={e => set('mes_inicio', Number(e.target.value))}>
                  {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Año</label>
                <input style={inputStyle} type="number" value={form.anio_inicio} onChange={e => set('anio_inicio', Number(e.target.value))} min={2020} max={2040} />
              </div>
            </div>
          )}

          {form.modalidad === 'ANUAL' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Año a cobrar</label>
                <input style={inputStyle} type="number" value={form.anio_cobro} onChange={e => set('anio_cobro', Number(e.target.value))} min={2020} max={2040} />
              </div>
              <div>
                <label style={labelStyle}>Descuento total ($)</label>
                <input style={inputStyle} type="number" min={0} step={0.01}
                  value={form.descuento}
                  onChange={e => set('descuento', parseFloat(e.target.value) || 0)}
                  placeholder="0.00" />
              </div>
            </div>
          )}

          {/* Resumen de cuotas a generar */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Cuotas a generar ({cuotas.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
              {cuotas.map(c => (
                <div key={c.periodo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
                  <span>{c.label}</span>
                  <span style={{ fontWeight: 600 }}>${c.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: '#1e293b' }}>Total</span>
              <div style={{ textAlign: 'right' }}>
                {descuentoAnual > 0 && (
                  <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                    Descuento: -${descuentoAnual.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>
                )}
                <span style={{ color: '#059669' }}>${totalCuotas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label style={labelStyle}>Observaciones del contrato</label>
            <textarea style={{ ...inputStyle, height: 56, resize: 'vertical' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas sobre la pensión…" />
          </div>

          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      </div>
    </ModalShell>
  )
}
