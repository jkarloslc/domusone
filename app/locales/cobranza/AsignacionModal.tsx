'use client'
import { useState, useEffect, useMemo } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Arrendatario = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type Propiedad    = { id: number; clave: string; nombre: string | null; status: string }

export type AsignacionData = {
  id: number
  id_arrendatario_fk: number
  id_propiedad_fk: number
  fecha_inicio: string
  fecha_fin: string | null
  monto_mensual: number
  monto_mantenimiento: number
  dia_pago: number
  activo: boolean
  observaciones: string | null
}

type Props = {
  asignacion?: AsignacionData        // si viene = modo edición
  idAsignacionFk?: number            // cuando se pasa = modo "agregar cuotas"
  modoAgregarCuotas?: boolean
  montoExistente?: number
  montoMantenimientoExistente?: number
  onClose: () => void
  onSaved: () => void
}

const fmtNombre = (a: Arrendatario) =>
  a.tipo_persona === 'Moral' && a.razon_social
    ? a.razon_social
    : [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const inputStyle = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

function periodoLabel(y: number, m: number) { return `${MESES[m - 1]} ${y}` }
function periodoKey(y: number, m: number)   { return `${y}-${String(m).padStart(2, '0')}` }
function addMeses(y: number, m: number, n: number) {
  const t = y * 12 + (m - 1) + n
  return { year: Math.floor(t / 12), month: (t % 12) + 1 }
}
function diffMeses(y1: number, m1: number, y2: number, m2: number) {
  return (y2 * 12 + (m2 - 1)) - (y1 * 12 + (m1 - 1))
}

const hoy = () => new Date().toISOString().split('T')[0]

export default function AsignacionModal({ asignacion, idAsignacionFk, modoAgregarCuotas = false, montoExistente, montoMantenimientoExistente, onClose, onSaved }: Props) {
  const esEdicion       = !!asignacion?.id && !modoAgregarCuotas
  const soloCuotas      = modoAgregarCuotas && !!idAsignacionFk

  const [arrendatarios, setArrendatarios] = useState<Arrendatario[]>([])
  const [propiedades,   setPropiedades]   = useState<Propiedad[]>([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState('')

  // Campos de asignación
  const [form, setForm] = useState({
    id_arrendatario_fk: asignacion?.id_arrendatario_fk ?? 0,
    id_propiedad_fk:    asignacion?.id_propiedad_fk    ?? 0,
    fecha_inicio:       asignacion?.fecha_inicio        ?? hoy(),
    fecha_fin:          asignacion?.fecha_fin           ?? '',
    monto_mensual:      asignacion?.monto_mensual       ?? montoExistente ?? 0,
    monto_mantenimiento: asignacion?.monto_mantenimiento ?? montoMantenimientoExistente ?? 0,
    dia_pago:           asignacion?.dia_pago            ?? 1,
    activo:             asignacion?.activo              ?? true,
    observaciones:      asignacion?.observaciones       ?? '',
  })

  // Generación de cuotas
  const now = new Date()
  const [modalidad, setModalidad] = useState<'MENSUAL' | 'ANUAL'>('MENSUAL')
  const [mesIni,  setMesIni]  = useState(now.getMonth() + 1)
  const [anioIni, setAnioIni] = useState(now.getFullYear())
  const [mesFin,  setMesFin]  = useState(now.getMonth() + 1)
  const [anioFin, setAnioFin] = useState(now.getFullYear())
  const [anioCobro, setAnioCobro]   = useState(now.getFullYear())
  const [mesInicioAnual, setMesInicioAnual] = useState(1)
  const [numMeses, setNumMeses]     = useState(12)
  const [descuento, setDescuento]   = useState(0)

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      dbCtrl.from('loc_arrendatarios').select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('apellido_paterno'),
      dbCtrl.from('loc_propiedades').select('id, clave, nombre, status').eq('activo', true).order('clave'),
    ]).then(([{ data: arr }, { data: prop }]) => {
      setArrendatarios((arr ?? []) as Arrendatario[])
      setPropiedades((prop ?? []) as Propiedad[])
      setLoading(false)
    })
  }, [])

  // Periodos del rango/modalidad seleccionada (comunes a renta y mantenimiento)
  const periodos = useMemo<{ periodo: string; label: string }[]>(() => {
    if (modalidad === 'MENSUAL') {
      const diff = diffMeses(anioIni, mesIni, anioFin, mesFin)
      if (diff < 0) return []
      return Array.from({ length: diff + 1 }, (_, i) => {
        const { year: y, month: m } = addMeses(anioIni, mesIni, i)
        return { periodo: periodoKey(y, m), label: periodoLabel(y, m) }
      })
    }
    return Array.from({ length: numMeses }, (_, i) => {
      const { year: y, month: m } = addMeses(anioCobro, mesInicioAnual, i)
      return { periodo: periodoKey(y, m), label: periodoLabel(y, m) }
    })
  }, [modalidad, mesIni, anioIni, mesFin, anioFin, anioCobro, mesInicioAnual, numMeses])

  // Cuotas de renta (el descuento anual, si aplica, solo afecta la renta)
  const cuotas = useMemo<{ periodo: string; label: string; monto: number }[]>(() => {
    if (modalidad === 'ANUAL') {
      const montoConDesc = Math.max(0, form.monto_mensual - descuento / numMeses)
      return periodos.map(p => ({ ...p, monto: montoConDesc }))
    }
    return periodos.map(p => ({ ...p, monto: form.monto_mensual }))
  }, [periodos, modalidad, form.monto_mensual, descuento, numMeses])

  // Cuotas de "Servicios de Mantto" — mismo rango de periodos, monto propio, sin descuento
  const cuotasMantto = useMemo<{ periodo: string; label: string; monto: number }[]>(() => {
    if (form.monto_mantenimiento <= 0) return []
    return periodos.map(p => ({ ...p, monto: form.monto_mantenimiento }))
  }, [periodos, form.monto_mantenimiento])

  const totalCuotas    = cuotas.reduce((a, c) => a + c.monto, 0)
  const totalMantto    = cuotasMantto.reduce((a, c) => a + c.monto, 0)
  const descuentoAnual = modalidad === 'ANUAL' ? descuento : 0
  const maxMesesAnual  = 13 - mesInicioAnual

  const handleSave = async () => {
    if (!soloCuotas) {
      if (!form.id_arrendatario_fk) { setErr('Selecciona un arrendatario'); return }
      if (!form.id_propiedad_fk)    { setErr('Selecciona una propiedad'); return }
      if (form.monto_mensual <= 0)  { setErr('La renta mensual debe ser mayor a 0'); return }
    }
    if (periodos.length === 0) { setErr('El rango de meses no produce cuotas'); return }
    setSaving(true); setErr('')

    let asigId = idAsignacionFk ?? asignacion?.id ?? null

    // 1. Crear o editar asignación
    if (esEdicion && asigId) {
      const payload = {
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin || null,
        monto_mensual: form.monto_mensual,
        monto_mantenimiento: form.monto_mantenimiento,
        dia_pago: form.dia_pago,
        activo: form.activo,
        observaciones: form.observaciones || null,
      }
      const { error } = await dbCtrl.from('loc_asignaciones').update(payload).eq('id', asigId)
      if (error) { setErr(error.message); setSaving(false); return }

      // El contrato pasó de activo a inactivo (finalizado manualmente o por vencimiento):
      // libera la propiedad si ya no tiene otra asignación activa.
      const idProp = asignacion!.id_propiedad_fk
      if (asignacion!.activo && !form.activo) {
        const { data: otras } = await dbCtrl.from('loc_asignaciones')
          .select('id').eq('id_propiedad_fk', idProp).eq('activo', true).neq('id', asigId).limit(1)
        if (!otras || otras.length === 0) {
          await dbCtrl.from('loc_propiedades').update({ status: 'Libre' }).eq('id', idProp)
        }
      } else if (!asignacion!.activo && form.activo) {
        // Reactivación de un contrato: solo si la propiedad no está ocupada por otro contrato vigente.
        const { data: prop } = await dbCtrl.from('loc_propiedades').select('status').eq('id', idProp).single()
        if ((prop as { status: string } | null)?.status === 'Rentada') {
          setErr('No se puede reactivar: la propiedad ya está rentada bajo otro contrato.')
          setSaving(false)
          return
        }
        await dbCtrl.from('loc_propiedades').update({ status: 'Rentada' }).eq('id', idProp)
      }

      onSaved()
      return
    }

    if (!soloCuotas) {
      const { data: newAsig, error: e1 } = await dbCtrl.from('loc_asignaciones').insert({
        id_arrendatario_fk: form.id_arrendatario_fk,
        id_propiedad_fk:    form.id_propiedad_fk,
        fecha_inicio:       form.fecha_inicio,
        fecha_fin:          form.fecha_fin || null,
        monto_mensual:      form.monto_mensual,
        monto_mantenimiento: form.monto_mantenimiento,
        dia_pago:           form.dia_pago,
        activo:             true,
        observaciones:      form.observaciones || null,
      }).select('id').single()
      if (e1 || !newAsig) { setErr(e1?.message ?? 'Error al crear asignación'); setSaving(false); return }
      asigId = (newAsig as any).id

      // Actualizar estado de la propiedad a Rentada
      await dbCtrl.from('loc_propiedades').update({ status: 'Rentada' }).eq('id', form.id_propiedad_fk)
    }

    // 2. Generar cuotas en cxc_loc — renta y, si aplica, Servicios de Mantto
    const diaVencDe = (periodo: string) => {
      const [y, m] = periodo.split('-').map(Number)
      const diasEnMes = new Date(y, m, 0).getDate()
      const diaVenc   = Math.min(form.dia_pago, diasEnMes)
      return `${y}-${String(m).padStart(2,'0')}-${String(diaVenc).padStart(2,'0')}`
    }
    const cuotasInsert = cuotas.map(c => ({
      id_arrendatario_fk: soloCuotas ? 0 : form.id_arrendatario_fk,
      id_asignacion_fk:   asigId,
      concepto:           `Renta de Local — ${c.label}`,
      periodo:            c.periodo,
      monto_original:     form.monto_mensual,
      descuento:          modalidad === 'ANUAL' ? descuento / numMeses : 0,
      monto_final:        c.monto,
      saldo:              c.monto,
      status:             'PENDIENTE' as const,
      fecha_emision:      hoy(),
      fecha_vencimiento:  diaVencDe(c.periodo),
      tipo:               'RENTA_LOCAL',
    }))
    const mantoInsert = cuotasMantto.map(c => ({
      id_arrendatario_fk: soloCuotas ? 0 : form.id_arrendatario_fk,
      id_asignacion_fk:   asigId,
      concepto:           `Servicios de Mantto — ${c.label}`,
      periodo:            c.periodo,
      monto_original:     form.monto_mantenimiento,
      descuento:          0,
      monto_final:        c.monto,
      saldo:              c.monto,
      status:             'PENDIENTE' as const,
      fecha_emision:      hoy(),
      fecha_vencimiento:  diaVencDe(c.periodo),
      tipo:               'SERVICIOS_MANTTO',
    }))

    // Si es modo solo cuotas, necesitamos recuperar el id_arrendatario de la asignación
    if (soloCuotas && asigId) {
      const { data: asigData } = await dbCtrl.from('loc_asignaciones')
        .select('id_arrendatario_fk, id_propiedad_fk, monto_mensual, monto_mantenimiento').eq('id', asigId).single()
      if (asigData) {
        const ad = asigData as { id_arrendatario_fk: number; id_propiedad_fk: number; monto_mensual: number; monto_mantenimiento: number }
        cuotasInsert.forEach(c => {
          c.id_arrendatario_fk = ad.id_arrendatario_fk
          if (!form.monto_mensual) c.monto_original = ad.monto_mensual
        })
        mantoInsert.forEach(c => {
          c.id_arrendatario_fk = ad.id_arrendatario_fk
          if (!form.monto_mantenimiento) c.monto_original = ad.monto_mantenimiento
        })
      }
    }

    const { error: e2 } = await dbCtrl.from('loc_cxc').insert([...cuotasInsert, ...mantoInsert])
    if (e2) { setErr(e2.message); setSaving(false); return }

    onSaved()
  }

  const titulo = soloCuotas ? 'Agregar Cuotas' : esEdicion ? 'Editar Asignación' : 'Nueva Asignación'
  const btnLabel = soloCuotas ? 'Agregar Cuotas' : esEdicion ? 'Guardar Cambios' : 'Crear Asignación y Generar Cuotas'

  return (
    <ModalShell
      modulo="locales"
      titulo={titulo}
      onClose={onClose}
      maxWidth={560}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}
            disabled={saving || loading || (!esEdicion && !soloCuotas && cuotas.length === 0)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f766e' }}>
            {saving ? <Loader size={13} /> : <Save size={13} />}
            {saving ? 'Guardando…' : btnLabel}
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Campos de asignación (solo si no es modo solo cuotas) ── */}
          {!soloCuotas && (
            <>
              {/* Arrendatario */}
              {!esEdicion && (
                <div>
                  <label style={labelStyle}>Arrendatario *</label>
                  <select style={inputStyle} value={form.id_arrendatario_fk}
                    onChange={e => set('id_arrendatario_fk', Number(e.target.value))}>
                    <option value={0}>— Seleccionar —</option>
                    {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombre(a)}</option>)}
                  </select>
                </div>
              )}

              {/* Propiedad */}
              {!esEdicion && (
                <div>
                  <label style={labelStyle}>Local / Propiedad *</label>
                  <select style={inputStyle} value={form.id_propiedad_fk}
                    onChange={e => set('id_propiedad_fk', Number(e.target.value))}>
                    <option value={0}>— Seleccionar —</option>
                    {propiedades.map(p => (
                      <option key={p.id} value={p.id}
                        disabled={p.status === 'Rentada' || p.status === 'Bloqueada'}>
                        {p.clave}{p.nombre ? ` — ${p.nombre}` : ''} {p.status !== 'Libre' ? `(${p.status})` : ''}
                      </option>
                    ))}
                  </select>
                  {propiedades.filter(p => p.status === 'Libre').length === 0 && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Sin propiedades disponibles.</div>
                  )}
                </div>
              )}

              {/* Renta + Servicios de Mantto */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Renta mensual *</label>
                  <input style={inputStyle} type="number" min={0} step={0.01}
                    value={form.monto_mensual}
                    onChange={e => set('monto_mensual', parseFloat(e.target.value) || 0)} />
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>La renta es propia de cada asignación y puede editarse en cualquier momento.</div>
                </div>
                <div>
                  <label style={labelStyle}>Servicios de Mantto</label>
                  <input style={inputStyle} type="number" min={0} step={0.01}
                    value={form.monto_mantenimiento}
                    onChange={e => set('monto_mantenimiento', parseFloat(e.target.value) || 0)} />
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Opcional. Cargo aparte, variable según la propiedad.</div>
                </div>
              </div>

              {/* Día de pago */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Día de vencimiento</label>
                  <input style={inputStyle} type="number" min={1} max={31}
                    value={form.dia_pago}
                    onChange={e => set('dia_pago', Number(e.target.value))} />
                </div>
              </div>

              {/* Fecha inicio + fecha fin (vencimiento de contrato) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Fecha inicio</label>
                  <input style={inputStyle} type="date" value={form.fecha_inicio}
                    onChange={e => set('fecha_inicio', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Vencimiento de contrato</label>
                  <input style={inputStyle} type="date" value={form.fecha_fin ?? ''} min={form.fecha_inicio || undefined}
                    onChange={e => set('fecha_fin', e.target.value)} />
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Opcional. No tiene que ser de 1 año — cualquier duración.</div>
                </div>
              </div>

              {esEdicion && (
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} />
                    Activa
                  </label>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Al desactivar (finalizar contrato) o al vencer la fecha de vencimiento, la propiedad se libera automáticamente y queda disponible para asignarse bajo otro contrato.
                  </div>
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label style={labelStyle}>Observaciones</label>
                <textarea style={{ ...inputStyle, height: 56, resize: 'vertical' }}
                  value={form.observaciones}
                  onChange={e => set('observaciones', e.target.value)} />
              </div>

              {/* Separador si no es edición */}
              {!esEdicion && <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0' }} />}
            </>
          )}

          {/* ── Generación de cuotas (no aplica en edición pura) ── */}
          {!esEdicion && (
            <>
              <div>
                <label style={labelStyle}>Modalidad de cobro</label>
                <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {(['MENSUAL', 'ANUAL'] as const).map(m => (
                    <button key={m} onClick={() => setModalidad(m)}
                      style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: modalidad === m ? '#f0fdfa' : '#fff',
                        color: modalidad === m ? '#0f766e' : '#94a3b8',
                        borderLeft: m === 'ANUAL' ? '1px solid #e2e8f0' : 'none' }}>
                      {m === 'MENSUAL' ? 'Mensual' : 'Anual (múltiples)'}
                    </button>
                  ))}
                </div>
              </div>

              {modalidad === 'MENSUAL' && (
                <div>
                  <label style={labelStyle}>Rango de meses</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Desde</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <select style={inputStyle} value={mesIni} onChange={e => {
                          const m = Number(e.target.value); setMesIni(m)
                          if (diffMeses(anioIni, m, anioFin, mesFin) < 0) { setMesFin(m); setAnioFin(anioIni) }
                        }}>
                          {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                        </select>
                        <input style={inputStyle} type="number" value={anioIni} min={2020} max={2040}
                          onChange={e => { const a = Number(e.target.value); setAnioIni(a); if (diffMeses(a, mesIni, anioFin, mesFin) < 0) setAnioFin(a) }} />
                      </div>
                    </div>
                    <div style={{ paddingBottom: 8, color: '#94a3b8', fontSize: 18, textAlign: 'center' }}>→</div>
                    <div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Hasta</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <select style={inputStyle} value={mesFin} onChange={e => setMesFin(Number(e.target.value))}>
                          {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                        </select>
                        <input style={inputStyle} type="number" value={anioFin} min={anioIni} max={2040}
                          onChange={e => setAnioFin(Number(e.target.value))} />
                      </div>
                    </div>
                  </div>
                  {diffMeses(anioIni, mesIni, anioFin, mesFin) < 0 && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>El mes fin debe ser igual o posterior al inicio.</div>
                  )}
                </div>
              )}

              {modalidad === 'ANUAL' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Año</label>
                      <input style={inputStyle} type="number" value={anioCobro} min={2020} max={2040}
                        onChange={e => setAnioCobro(Number(e.target.value))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Mes de inicio</label>
                      <select style={inputStyle} value={mesInicioAnual} onChange={e => {
                        const m = Number(e.target.value)
                        setMesInicioAnual(m)
                        setNumMeses(n => Math.min(n, 13 - m) || 13 - m)
                      }}>
                        {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Núm. cuotas</label>
                      <input style={inputStyle} type="number" value={numMeses} min={1} max={maxMesesAnual}
                        onChange={e => setNumMeses(Math.min(Math.max(1, Number(e.target.value)), maxMesesAnual))} />
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Máx. {maxMesesAnual}</div>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Descuento total ($)</label>
                    <input style={inputStyle} type="number" min={0} step={0.01} value={descuento} placeholder="0.00"
                      onChange={e => setDescuento(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              )}

              {/* Resumen cuotas */}
              {cuotas.length > 0 ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Cuotas a generar ({cuotas.length}{cuotasMantto.length > 0 ? ` + ${cuotasMantto.length} de Mantto` : ''})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                    {cuotas.map((c, i) => (
                      <div key={c.periodo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
                        <span>{c.label}</span>
                        <span style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 600 }}>${c.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          {cuotasMantto[i] && (
                            <span style={{ color: '#0f766e' }}> + ${cuotasMantto[i].monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} mantto</span>
                          )}
                        </span>
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
                      {totalMantto > 0 && (
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                          Renta: ${totalCuotas.toLocaleString('es-MX', { minimumFractionDigits: 2 })} + Mantto: ${totalMantto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                      <span style={{ color: '#0f766e' }}>${(totalCuotas + totalMantto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                  El rango seleccionado no genera cuotas. Ajusta los meses.
                </div>
              )}
            </>
          )}

          {err && (
            <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
              {err}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  )
}
