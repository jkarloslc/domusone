'use client'
import { useState, useEffect } from 'react'
import { dbGolf, dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { X, Save, Loader, AlertTriangle, CheckCircle } from 'lucide-react'
import { fechaLocal, inicioDelDia, finDelDia } from '@/lib/dateUtils'

type FormaPagoResumen = { id_forma_fk: number; forma_nombre: string; monto: number }
type DetalleProd     = { concepto: string; cantidad: number; monto: number }
type CentroMap = { id_centro_ingreso_fk: number; activo: boolean }
type CentroIngreso = { id: number }
type Props = {
  idCentro: number
  nombreCentro: string
  onClose: () => void
  onSaved: () => void
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

export default function CorteModal({ idCentro, nombreCentro, onClose, onSaved }: Props) {
  const { authUser } = useAuth()

  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState(false)

  // Datos del preview
  const [numVentas,      setNumVentas]      = useState(0)
  const [numCanceladas,  setNumCanceladas]  = useState(0)
  const [totalVentas,    setTotalVentas]    = useState(0)
  const [totalCancelado, setTotalCancelado] = useState(0)
  const [formasPago,     setFormasPago]     = useState<FormaPagoResumen[]>([])
  const [detalleProd,    setDetalleProd]    = useState<DetalleProd[]>([])
  const [fechaInicio,    setFechaInicio]    = useState('')
  const [fechaFin,       setFechaFin]       = useState('')
  const [notas,          setNotas]          = useState('')

  // Rango default = HOY en zona horaria local (no UTC)
  const hoyStr = fechaLocal()
  const [f1, setF1] = useState(hoyStr)
  const [f2, setF2] = useState(hoyStr)

  const mapFormasPago = (rows: FormaPagoResumen[]) => {
    const mapped: Record<string, number> = {
      monto_efectivo: 0, monto_transferencia: 0, monto_tarjeta: 0, monto_cheque: 0,
    }
    for (const fp of rows) {
      const n = fp.forma_nombre.toLowerCase()
      if (n.includes('efectivo')) mapped.monto_efectivo += fp.monto
      else if (n.includes('tarjeta')) mapped.monto_tarjeta += fp.monto
      else if (n.includes('transf')) mapped.monto_transferencia += fp.monto
      else if (n.includes('cheque')) mapped.monto_cheque += fp.monto
      else mapped.monto_efectivo += fp.monto
    }
    return mapped
  }

  const cargarPreview = async () => {
    setLoading(true)
    // Ventas sin corte en el período — usar límites en TZ local (no UTC crudo)
    const { data: ventasActivas } = await dbGolf.from('ctrl_ventas')
      .select('id, total, status')
      .eq('id_centro_fk', idCentro)
      .is('id_corte_fk', null)
      .gte('fecha', inicioDelDia(f1))
      .lte('fecha', finDelDia(f2))

    const activas    = (ventasActivas ?? []).filter((v: any) => v.status === 'PAGADA')
    const canceladas = (ventasActivas ?? []).filter((v: any) => v.status === 'CANCELADA')
    const totalAct   = activas.reduce((a: number, v: any) => a + (v.total ?? 0), 0)
    const totalCanc  = canceladas.reduce((a: number, v: any) => a + (v.total ?? 0), 0)

    setNumVentas(activas.length)
    setNumCanceladas(canceladas.length)
    setTotalVentas(totalAct)
    setTotalCancelado(totalCanc)
    setFechaInicio(f1)
    setFechaFin(f2)

    if (activas.length > 0) {
      const ids = activas.map((v: any) => v.id)

      // Desglose por forma de pago
      const { data: pagos } = await dbGolf.from('ctrl_ventas_pagos')
        .select('id_forma_fk, forma_nombre, monto')
        .in('id_venta_fk', ids)
      const mapFP: Record<string, FormaPagoResumen> = {}
      for (const p of pagos ?? []) {
        const k = String(p.id_forma_fk)
        if (!mapFP[k]) mapFP[k] = { id_forma_fk: p.id_forma_fk, forma_nombre: p.forma_nombre, monto: 0 }
        mapFP[k].monto += p.monto
      }
      setFormasPago(Object.values(mapFP))

      // Desglose por producto / servicio
      const { data: dets } = await dbGolf.from('ctrl_ventas_det')
        .select('concepto, cantidad, total')
        .in('id_venta_fk', ids)
      const mapProd: Record<string, DetalleProd> = {}
      for (const d of dets ?? []) {
        const k = (d.concepto ?? '').trim()
        if (!mapProd[k]) mapProd[k] = { concepto: k, cantidad: 0, monto: 0 }
        mapProd[k].cantidad += d.cantidad ?? 1
        mapProd[k].monto    += d.total    ?? 0
      }
      setDetalleProd(Object.values(mapProd).sort((a, b) => b.monto - a.monto))
    } else {
      setFormasPago([])
      setDetalleProd([])
    }

    setLoading(false)
  }

  useEffect(() => { cargarPreview() }, [])

  const handleCorte = async () => {
    if (numVentas === 0) { setError('No hay ventas pendientes de corte en este período'); return }
    setSaving(true); setError('')

    // 1. Insertar corte
    const { data: corte, error: e1 } = await dbGolf.from('ctrl_cortes_caja').insert({
      id_centro_fk:    idCentro,
      centro_nombre:   nombreCentro,
      fecha_inicio:    inicioDelDia(f1),
      fecha_fin:       finDelDia(f2),
      fecha_corte:     new Date().toISOString(),
      num_ventas:      numVentas,
      num_canceladas:  numCanceladas,
      total_ventas:    totalVentas,
      total_cancelado: totalCancelado,
      total_neto:      totalVentas,
      usuario:         authUser?.nombre ?? 'sistema',
      notas:           notas || null,
    }).select('id').single()

    if (e1 || !corte) { setError(e1?.message ?? 'Error al crear corte'); setSaving(false); return }

    // 2. Detalles de formas de pago
    if (formasPago.length > 0) {
      await dbGolf.from('ctrl_cortes_caja_det').insert(
        formasPago.map(f => ({ id_corte_fk: corte.id, id_forma_fk: f.id_forma_fk, forma_nombre: f.forma_nombre, monto: f.monto }))
      )
    }

    // 3. Actualizar ventas: asignar id_corte_fk
    const { data: ventasActivas } = await dbGolf.from('ctrl_ventas')
      .select('id')
      .eq('id_centro_fk', idCentro)
      .is('id_corte_fk', null)
      .gte('fecha', inicioDelDia(f1))
      .lte('fecha', finDelDia(f2))

    if (ventasActivas && ventasActivas.length > 0) {
      const ids = ventasActivas.map((v: any) => v.id)
      await dbGolf.from('ctrl_ventas').update({ id_corte_fk: corte.id }).in('id', ids)
    }

    // 4. Crear recibo en módulo Ingresos (integración automática por mapeo explícito PV->CI)
    try {
      const { data: mapRow } = await dbGolf.from('pos_centros_ingreso_map')
        .select('id_centro_ingreso_fk, activo')
        .eq('id_centro_venta_fk', idCentro)
        .eq('activo', true)
        .maybeSingle()

      const row = mapRow as CentroMap | null
      let idCentroIngreso = row?.id_centro_ingreso_fk ?? null
      if (!idCentroIngreso) {
        const { data: byId } = await dbCtrl.from('centros_ingreso')
          .select('id')
          .eq('id', idCentro)
          .maybeSingle()
        idCentroIngreso = (byId as CentroIngreso | null)?.id ?? null
      }
      if (!idCentroIngreso) {
        throw new Error(`No hay mapeo activo para el centro de venta "${nombreCentro}"`)
      }

      const fpagoMap = mapFormasPago(formasPago)
      const { data: recibo } = await dbCtrl.from('recibos_ingreso').insert({
        fecha:               f2,
        id_centro_ingreso_fk: idCentroIngreso,
        descripcion:         `Corte POS Golf — ${nombreCentro} — ${f1} al ${f2}`,
        monto_efectivo:      fpagoMap.monto_efectivo,
        monto_transferencia: fpagoMap.monto_transferencia,
        monto_tarjeta:       fpagoMap.monto_tarjeta,
        monto_cheque:        fpagoMap.monto_cheque,
        monto_total:         totalVentas,
        status:              'Confirmado',
        origen:              'POS_GOLF',
        referencia_externa:  `golf.ctrl_cortes_caja:${corte.id}`,
        notas:               `Folio corte Golf: #${corte.id}`,
        usuario_crea:        authUser?.nombre ?? 'sistema',
      }).select('id').single()

      // Guardar FK en el corte
      if (recibo) {
        await dbGolf.from('ctrl_cortes_caja').update({ id_recibo_ingreso: recibo.id }).eq('id', corte.id)
      }
    } catch (_) {
      // Integración con Ingresos es best-effort; no bloquea el corte
    }

    setSaving(false)
    setSuccess(true)
    onSaved()
  }

  if (success) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 32px', maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <CheckCircle size={52} color="#059669" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Corte registrado</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
          {numVentas} venta{numVentas !== 1 ? 's' : ''} cerradas · Total {fmt$(totalVentas)}
        </div>
        <div style={{ fontSize: 12, color: '#059669', marginBottom: 24 }}>Recibo de ingreso generado automáticamente</div>
        <button onClick={onClose} style={{ width: '100%', padding: '10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Cerrar
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1e293b' }}>Corte de Caja</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{nombreCentro}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Período */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Fecha inicio</label>
              <input type="date" value={f1} onChange={e => setF1(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Fecha fin</label>
              <input type="date" value={f2} onChange={e => setF2(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none' }} />
            </div>
          </div>
          <button onClick={cargarPreview} disabled={loading}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', color: '#475569', cursor: 'pointer', alignSelf: 'flex-start' }}>
            {loading ? 'Calculando…' : 'Recalcular'}
          </button>

          {/* Resumen */}
          {!loading && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Resumen del período</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { label: 'Ventas',      value: numVentas,           color: '#059669', bg: '#ecfdf5' },
                  { label: 'Canceladas',  value: numCanceladas,       color: '#dc2626', bg: '#fef2f2' },
                  { label: 'Total',       value: fmt$(totalVentas),   color: '#059669', bg: '#ecfdf5' },
                  { label: 'Cancelado',   value: fmt$(totalCancelado),color: '#dc2626', bg: '#fef2f2' },
                ].map(c => (
                  <div key={c.label} style={{ padding: '10px 12px', background: c.bg, borderRadius: 8, border: `1px solid ${c.color}22` }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Desglose formas de pago */}
              {formasPago.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Por forma de pago</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {formasPago.map(f => (
                      <div key={f.id_forma_fk} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#475569' }}>{f.forma_nombre}</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{fmt$(f.monto)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: 6, marginTop: 2 }}>
                      <span style={{ color: '#1e293b' }}>Total neto</span>
                      <span style={{ color: '#059669' }}>{fmt$(totalVentas)}</span>
                    </div>
                  </div>
                </>
              )}

              {detalleProd.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, marginTop: 12 }}>
                    Detalle de productos / servicios ({detalleProd.length})
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left',  color: '#475569', fontWeight: 600 }}>Concepto</th>
                          <th style={{ padding: '6px 8px',  textAlign: 'right', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>Cant.</th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleProd.map((d, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '5px 10px', color: '#1e293b' }}>{d.concepto || '(sin concepto)'}</td>
                            <td style={{ padding: '5px 8px',  color: '#64748b', textAlign: 'right' }}>{d.cantidad}</td>
                            <td style={{ padding: '5px 10px', color: '#1e293b', fontWeight: 600, textAlign: 'right' }}>{fmt$(d.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1e293b' }}>Total</td>
                          <td style={{ padding: '6px 8px',  fontWeight: 700, color: '#64748b', textAlign: 'right' }}>
                            {detalleProd.reduce((a, d) => a + d.cantidad, 0)}
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 700, color: '#059669', textAlign: 'right' }}>
                            {fmt$(totalVentas)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}

              {numVentas === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d97706', fontSize: 12, marginTop: 4 }}>
                  <AlertTriangle size={14} />
                  No hay ventas pendientes de corte en este período
                </div>
              )}
            </div>
          )}

          {/* Integración Ingresos */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1d4ed8' }}>
            <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Al confirmar, se generará automáticamente un <strong>recibo de ingreso</strong> en el módulo de Ingresos según el mapeo POS configurado.</span>
          </div>

          {/* Notas */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Observaciones</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none', height: 56, resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Notas del corte…" />
          </div>

          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleCorte} disabled={saving || loading || numVentas === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (saving || loading || numVentas === 0) ? 0.5 : 1 }}>
            {saving ? <Loader size={14} /> : <Save size={14} />}
            Confirmar Corte
          </button>
        </div>
      </div>
    </div>
  )
}
