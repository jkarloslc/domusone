'use client'
import { useState, useEffect, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import { Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Slot = { id: number; numero: string }

type Props = {
  idSocio: number
  idCarrito: number
  nombreSocio: string
  descripcionCarrito: string
  // Cuando se pasa idPension → modo "agregar cuotas" (no crea nueva pensión, no pide slot)
  idPension?: number
  idSlotExistente?: number | null
  montoMensualExistente?: number
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
/** Agrega N meses a un año-mes dado */
function addMeses(year: number, month: number, n: number): { year: number; month: number } {
  const total = (year * 12 + (month - 1)) + n
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}
/** Diferencia en meses entre dos año-mes (fin - inicio), inclusive = diff+1 */
function diffMeses(y1: number, m1: number, y2: number, m2: number): number {
  return (y2 * 12 + (m2 - 1)) - (y1 * 12 + (m1 - 1))
}

export default function PensionModal({
  idSocio, idCarrito, nombreSocio, descripcionCarrito,
  idPension, idSlotExistente, montoMensualExistente,
  onClose, onSaved,
}: Props) {
  const modoAgregarCuotas = !!idPension   // true → no crea nueva pensión, no pide slot
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [slots, setSlots]     = useState<Slot[]>([])
  const [tarifa, setTarifa]   = useState<number>(0)

  const hoy = new Date()

  const [form, setForm] = useState({
    id_slot_fk:        '' as number | '',
    fecha_inicio:      hoy.toISOString().split('T')[0],
    monto_mensual:     montoMensualExistente ?? 0,
    modalidad:         'MENSUAL' as 'MENSUAL' | 'ANUAL',

    // MENSUAL: rango de meses
    mes_ini:           hoy.getMonth() + 1,
    anio_ini:          hoy.getFullYear(),
    mes_fin:           hoy.getMonth() + 1,
    anio_fin:          hoy.getFullYear(),

    // ANUAL: año + mes desde el que se empieza + cuantos meses
    anio_cobro:        hoy.getFullYear(),
    mes_inicio_anual:  1,          // 1=Enero … 12=Diciembre
    num_meses:         12,         // cuántas cuotas (auto de mes_inicio_anual, editable)
    descuento:         0,
    observaciones:     '',
  })
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  // Sincronizar num_meses cuando cambia mes_inicio_anual
  useEffect(() => {
    const auto = 13 - form.mes_inicio_anual   // e.g. si empieza en Marzo → 10 meses
    setForm(f => ({ ...f, num_meses: Math.min(f.num_meses, auto) > 0 ? f.num_meses : auto }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.mes_inicio_anual])

  useEffect(() => {
    if (!modoAgregarCuotas) {
      // Slots libres (sin pensión activa)
      dbGolf.from('cat_slots').select('id, numero').eq('activo', true).order('numero')
        .then(async ({ data: todosSlots }) => {
          const { data: ocupados } = await dbGolf
            .from('ctrl_pensiones').select('id_slot_fk').eq('activo', true)
          const ocupadosIds = new Set((ocupados ?? []).map((p: any) => p.id_slot_fk))
          setSlots((todosSlots ?? []).filter((s: Slot) => !ocupadosIds.has(s.id)))
        })
    }
    // Tarifa global
    dbGolf.from('cfg_carritos').select('tarifa_mensual').single()
      .then(({ data }) => {
        const t = data?.tarifa_mensual ?? 0
        setTarifa(t)
        if (!montoMensualExistente) setForm(f => ({ ...f, monto_mensual: t }))
      })
  }, [modoAgregarCuotas, montoMensualExistente])

  // ── Calcular cuotas a generar ─────────────────────────────
  const cuotas = useMemo<{ periodo: string; label: string; monto: number }[]>(() => {
    if (form.modalidad === 'MENSUAL') {
      const diff = diffMeses(form.anio_ini, form.mes_ini, form.anio_fin, form.mes_fin)
      if (diff < 0) return []
      const result = []
      for (let i = 0; i <= diff; i++) {
        const { year: y, month: m } = addMeses(form.anio_ini, form.mes_ini, i)
        result.push({ periodo: periodoKey(y, m), label: periodoLabel(y, m), monto: form.monto_mensual })
      }
      return result
    } else {
      // ANUAL
      const montoConDesc = Math.max(0, form.monto_mensual - form.descuento / form.num_meses)
      const result = []
      for (let i = 0; i < form.num_meses; i++) {
        const { year: y, month: m } = addMeses(form.anio_cobro, form.mes_inicio_anual, i)
        result.push({ periodo: periodoKey(y, m), label: periodoLabel(y, m), monto: montoConDesc })
      }
      return result
    }
  }, [form])

  const totalCuotas    = cuotas.reduce((a, c) => a + c.monto, 0)
  const descuentoAnual = form.modalidad === 'ANUAL' ? form.descuento : 0
  const maxMesesAnual  = 13 - form.mes_inicio_anual   // máximo según mes de inicio

  const handleSave = async () => {
    if (!modoAgregarCuotas && !form.id_slot_fk) { setError('Selecciona un slot disponible'); return }
    if (form.monto_mensual <= 0) { setError('El monto mensual debe ser mayor a 0'); return }
    if (cuotas.length === 0) { setError('El rango de meses no produce cuotas'); return }
    setSaving(true); setError('')

    let pensionId = idPension ?? null

    if (!modoAgregarCuotas) {
      // Crear contrato de pensión nuevo
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
      pensionId = pension.id
    }

    // Generar cuotas en cxc_golf
    // NOTA: monto_final es columna GENERATED ALWAYS AS (monto_original - descuento)
    //       NO se puede incluir en el insert; la BD la calcula automáticamente.
    const cuotasInsert = cuotas.map(c => {
      const descPorCuota = form.modalidad === 'ANUAL' ? (form.descuento / form.num_meses) : 0
      return {
        id_socio_fk:      idSocio,
        tipo:             'PENSION_CARRITO',
        id_pension_fk:    pensionId,
        concepto:         `Pensión Carrito ${descripcionCarrito} — ${c.label}`,
        periodo:          c.periodo,
        monto_original:   form.monto_mensual,
        descuento:        descPorCuota,
        // monto_final: omitido — columna generada (monto_original - descuento)
        saldo:            c.monto,   // = monto_original - descuento (para cobros parciales)
        status:           'PENDIENTE',
        fecha_emision:    new Date().toISOString().split('T')[0],
        fecha_vencimiento: (() => {
          const [y, m] = c.periodo.split('-').map(Number)
          return new Date(y, m - 1, 10).toISOString().split('T')[0]
        })(),
      }
    })

    const { error: err2 } = await dbGolf.from('cxc_golf').insert(cuotasInsert)
    if (err2) { setError(err2.message); setSaving(false); return }

    onSaved()
  }

  const titulo   = modoAgregarCuotas ? 'Agregar Cuotas' : 'Asignar Pensión'
  const btnLabel = modoAgregarCuotas ? 'Agregar Cuotas' : 'Crear Pensión y Generar Cuotas'

  return (
    <ModalShell
      modulo="golf-carritos"
      titulo={titulo}
      subtitulo={`${nombreSocio} · ${descripcionCarrito}`}
      maxWidth={560}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || cuotas.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (saving || cuotas.length === 0) ? 0.7 : 1 }}>
          {saving ? <Loader size={14} /> : <Save size={14} />}
          {btnLabel}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Slot (solo al crear nueva pensión) ── */}
        {!modoAgregarCuotas && (
          <div>
            <label style={labelStyle}>Slot / Cajón *</label>
            <select style={inputStyle} value={form.id_slot_fk} onChange={e => set('id_slot_fk', e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Seleccionar slot disponible —</option>
              {slots.map(s => <option key={s.id} value={s.id}>Cajón {s.numero}</option>)}
            </select>
            {slots.length === 0 && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>No hay slots disponibles. Agrega slots en Configuración.</div>}
          </div>
        )}

        {/* ── Info slot cuando es modo agregar cuotas ── */}
        {modoAgregarCuotas && idSlotExistente != null && (
          <div style={{ padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#15803d', fontWeight: 500 }}>
            Agregando cuotas a pensión existente · Cajón ya asignado
          </div>
        )}

        {/* ── Fecha inicio + monto (solo al crear nueva pensión) ── */}
        {!modoAgregarCuotas && (
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
        )}

        {/* ── Monto (solo en modo agregar cuotas) ── */}
        {modoAgregarCuotas && (
          <div>
            <label style={labelStyle}>Monto Mensual *</label>
            <input style={inputStyle} type="number" min={0} step={0.01}
              value={form.monto_mensual}
              onChange={e => set('monto_mensual', parseFloat(e.target.value) || 0)} />
            {tarifa > 0 && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Tarifa vigente: ${tarifa.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>}
          </div>
        )}

        {/* ── Modalidad ── */}
        <div>
          <label style={labelStyle}>Modalidad de Cobro</label>
          <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => set('modalidad', 'MENSUAL')}
              style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: form.modalidad === 'MENSUAL' ? '#ecfdf5' : '#fff', color: form.modalidad === 'MENSUAL' ? '#065f46' : '#94a3b8' }}>
              Mensual
            </button>
            <button onClick={() => set('modalidad', 'ANUAL')}
              style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 600, border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', background: form.modalidad === 'ANUAL' ? '#ecfdf5' : '#fff', color: form.modalidad === 'ANUAL' ? '#065f46' : '#94a3b8' }}>
              Anual (múltiples cuotas)
            </button>
          </div>
        </div>

        {/* ── MENSUAL: rango de meses ── */}
        {form.modalidad === 'MENSUAL' && (
          <div>
            <label style={labelStyle}>Rango de meses a generar</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
              {/* Inicio */}
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Desde</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <select style={inputStyle} value={form.mes_ini} onChange={e => {
                    const m = Number(e.target.value)
                    set('mes_ini', m)
                    // Si fin queda antes que inicio, ajustar fin
                    if (diffMeses(form.anio_ini, m, form.anio_fin, form.mes_fin) < 0) {
                      setForm(f => ({ ...f, mes_ini: m, mes_fin: m, anio_fin: form.anio_ini }))
                    }
                  }}>
                    {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                  </select>
                  <input style={inputStyle} type="number" value={form.anio_ini}
                    onChange={e => {
                      const a = Number(e.target.value)
                      set('anio_ini', a)
                      if (diffMeses(a, form.mes_ini, form.anio_fin, form.mes_fin) < 0) {
                        setForm(f => ({ ...f, anio_ini: a, anio_fin: a }))
                      }
                    }}
                    min={2020} max={2040} />
                </div>
              </div>
              {/* Flecha */}
              <div style={{ paddingBottom: 8, color: '#94a3b8', fontSize: 18, textAlign: 'center' }}>→</div>
              {/* Fin */}
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Hasta</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <select style={inputStyle} value={form.mes_fin} onChange={e => set('mes_fin', Number(e.target.value))}>
                    {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                  </select>
                  <input style={inputStyle} type="number" value={form.anio_fin}
                    onChange={e => set('anio_fin', Number(e.target.value))}
                    min={form.anio_ini} max={2040} />
                </div>
              </div>
            </div>
            {diffMeses(form.anio_ini, form.mes_ini, form.anio_fin, form.mes_fin) < 0 && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>El mes de fin debe ser igual o posterior al de inicio.</div>
            )}
          </div>
        )}

        {/* ── ANUAL: año + mes inicio + número de cuotas ── */}
        {form.modalidad === 'ANUAL' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Año</label>
                <input style={inputStyle} type="number" value={form.anio_cobro} onChange={e => set('anio_cobro', Number(e.target.value))} min={2020} max={2040} />
              </div>
              <div>
                <label style={labelStyle}>Mes de inicio</label>
                <select style={inputStyle} value={form.mes_inicio_anual} onChange={e => {
                  const m = Number(e.target.value)
                  const autoMeses = 13 - m
                  setForm(f => ({ ...f, mes_inicio_anual: m, num_meses: Math.min(f.num_meses, autoMeses) || autoMeses }))
                }}>
                  {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Núm. cuotas</label>
                <input style={inputStyle} type="number"
                  value={form.num_meses}
                  onChange={e => set('num_meses', Math.min(Math.max(1, Number(e.target.value)), maxMesesAnual))}
                  min={1} max={maxMesesAnual} />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Máx. {maxMesesAnual} desde {MESES[form.mes_inicio_anual - 1]}</div>
              </div>
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

        {/* ── Resumen de cuotas a generar ── */}
        {cuotas.length > 0 ? (
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
        ) : (
          <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
            El rango seleccionado no genera cuotas. Ajusta los meses.
          </div>
        )}

        {/* ── Observaciones (solo al crear nueva pensión) ── */}
        {!modoAgregarCuotas && (
          <div>
            <label style={labelStyle}>Observaciones del contrato</label>
            <textarea style={{ ...inputStyle, height: 56, resize: 'vertical' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas sobre la pensión…" />
          </div>
        )}

        {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      </div>
    </ModalShell>
  )
}
