'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Building2, Phone, CreditCard } from 'lucide-react'

const fmt  = (n: number | null | undefined) =>
  n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtF = (s: string | null | undefined) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_CLR: Record<string, string> = {
  'Pendiente Auth': '#7c3aed', 'Pendiente Auth Finanzas': '#6d28d9', Pendiente: '#d97706',
  Pagada: '#15803d', Rechazada: '#dc2626', Sustituida: '#64748b', Cancelada: '#64748b',
}

type Prov = {
  id: number; nombre: string; razon_social: string | null; rfc: string | null
  clave: string | null; contacto: string | null; telefono: string | null
  banco: string | null; cuenta_clabe: string | null; condiciones_pago: string | null
}
type OP = {
  id: number; folio: string; concepto: string | null; tipo_gasto: string | null
  monto: number; saldo: number | null; fecha_op: string | null
  fecha_vencimiento: string | null; status: string
  id_centro_costo_fk: number | null; id_area_fk: number | null
}

export default function ReporteEstadoCuentaProveedor() {
  const [provs,     setProvs]     = useState<Prov[]>([])
  const [ops,       setOps]       = useState<OP[]>([])
  const [ccMap,     setCcMap]     = useState<Record<number, string>>({})
  const [areaMap,   setAreaMap]   = useState<Record<number, string>>({})
  const [loading,   setLoading]   = useState(false)
  const [loadingProvs, setLoadingProvs] = useState(true)

  const [provSel,   setProvSel]   = useState<string>('')
  const [filtroDe,  setFiltroDe]  = useState<string>('')
  const [filtroA,   setFiltroA]   = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')

  // Carga catálogos al montar
  useEffect(() => {
    Promise.all([
      dbComp.from('proveedores').select('id, nombre, razon_social, rfc, clave, contacto, telefono, banco, cuenta_clabe, condiciones_pago').order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').order('nombre'),
      dbCfg.from('areas').select('id, nombre').order('nombre'),
    ]).then(([{ data: ps }, { data: cc }, { data: ar }]) => {
      setProvs((ps ?? []) as Prov[])
      const cm: Record<number, string> = {}
      ;(cc ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
      setCcMap(cm)
      const am: Record<number, string> = {}
      ;(ar ?? []).forEach((a: any) => { am[a.id] = a.nombre })
      setAreaMap(am)
      setLoadingProvs(false)
    })
  }, [])

  const fetchOps = useCallback(async () => {
    if (!provSel) return
    setLoading(true)
    let q = dbComp.from('ordenes_pago')
      .select('id, folio, concepto, tipo_gasto, monto, saldo, fecha_op, fecha_vencimiento, status, id_centro_costo_fk, id_area_fk')
      .eq('id_proveedor_fk', Number(provSel))
      .order('fecha_op', { ascending: true })
    if (filtroDe) q = q.gte('fecha_op', filtroDe)
    if (filtroA)  q = q.lte('fecha_op', filtroA)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data } = await q
    setOps((data ?? []) as OP[])
    setLoading(false)
  }, [provSel, filtroDe, filtroA, filtroStatus])

  useEffect(() => { fetchOps() }, [fetchOps])

  const proveedor = useMemo(() => provs.find(p => p.id === Number(provSel)), [provs, provSel])

  // Calcular saldo acumulado línea a línea
  const lineas = useMemo(() => {
    let acum = 0
    return ops.map(op => {
      const cargo  = ['Cancelada', 'Rechazada', 'Sustituida'].includes(op.status) ? 0 : (op.monto ?? 0)
      const abono  = Math.max(0, (op.monto ?? 0) - (op.saldo ?? op.monto ?? 0))
      acum += cargo - abono
      return { op, cargo, abono, saldoAcum: acum }
    })
  }, [ops])

  const totalCargo  = useMemo(() => lineas.reduce((s, l) => s + l.cargo, 0),  [lineas])
  const totalAbono  = useMemo(() => lineas.reduce((s, l) => s + l.abono, 0),  [lineas])
  const saldoFinal  = totalCargo - totalAbono

  const pendientes  = useMemo(() => ops.filter(o => !['Pagada','Cancelada','Rechazada','Sustituida'].includes(o.status)), [ops])
  const hoy = new Date().toISOString().slice(0, 10)
  const vencidas = useMemo(() => pendientes.filter(o => o.fecha_vencimiento && o.fecha_vencimiento < hoy), [pendientes, hoy])

  return (
    <div>
      <PrintBar title={`Estado de Cuenta — ${proveedor?.nombre ?? 'Proveedor'}`} count={ops.length} />

      {/* Selector de proveedor + filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 240px', maxWidth: 320 }}>
          <label className="label">Proveedor *</label>
          <select className="select" value={provSel} onChange={e => { setProvSel(e.target.value); setOps([]) }}>
            <option value="">— Selecciona un proveedor —</option>
            {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {['Pendiente Auth','Pendiente Auth Finanzas','Pendiente','Pagada','Rechazada','Sustituida','Cancelada'].map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
        </div>
        <div>
          <label className="label">Fecha OP Desde</label>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} />
        </div>
        <button className="btn-ghost" onClick={fetchOps} disabled={!provSel} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {!provSel && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          Selecciona un proveedor para generar su estado de cuenta.
        </div>
      )}

      {provSel && proveedor && (
        <div id="reporte-print-area">
          {/* Encabezado del proveedor */}
          <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Proveedor</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{proveedor.nombre}</div>
              {proveedor.razon_social && proveedor.razon_social !== proveedor.nombre && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{proveedor.razon_social}</div>
              )}
              {proveedor.rfc && (
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#475569', marginTop: 4 }}>
                  RFC: <strong>{proveedor.rfc}</strong>
                </div>
              )}
            </div>
            <div style={{ flex: '1 1 200px' }}>
              {proveedor.contacto && (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Building2 size={11} /> {proveedor.contacto}
                </div>
              )}
              {proveedor.telefono && (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={11} /> {proveedor.telefono}
                </div>
              )}
              {proveedor.condiciones_pago && (
                <div style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', display: 'inline-block', marginTop: 2 }}>
                  {proveedor.condiciones_pago}
                </div>
              )}
            </div>
            {(proveedor.banco || proveedor.cuenta_clabe) && (
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CreditCard size={11} /> Datos bancarios
                </div>
                {proveedor.banco && <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{proveedor.banco}</div>}
                {proveedor.cuenta_clabe && (
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', marginTop: 2 }}>CLABE: {proveedor.cuenta_clabe}</div>
                )}
              </div>
            )}
          </div>

          {/* KPIs resumen */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Cargos',     value: fmt(totalCargo),         color: '#1e293b', bg: '#f8fafc' },
              { label: 'Total Abonos',     value: fmt(totalAbono),         color: '#15803d', bg: '#f0fdf4' },
              { label: 'Saldo Actual',     value: fmt(saldoFinal),         color: saldoFinal > 0 ? '#d97706' : '#15803d', bg: saldoFinal > 0 ? '#fffbeb' : '#f0fdf4' },
              { label: 'OPs Pendientes',   value: pendientes.length,       color: '#7c3aed', bg: '#f5f3ff' },
              { label: 'OPs Vencidas',     value: vencidas.length,         color: vencidas.length > 0 ? '#dc2626' : '#15803d', bg: vencidas.length > 0 ? '#fef2f2' : '#f0fdf4' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 130px', maxWidth: 200, padding: '10px 14px', background: k.bg, border: `1px solid ${k.color}22` }}>
                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Movimientos vencidos — alerta */}
          {vencidas.length > 0 && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
              ⚠ {vencidas.length} OP{vencidas.length > 1 ? 's' : ''} vencida{vencidas.length > 1 ? 's' : ''} · Saldo vencido: <strong>{fmt(vencidas.reduce((s, o) => s + (o.saldo ?? o.monto ?? 0), 0))}</strong>
            </div>
          )}

          {/* Tabla de movimientos */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
          ) : (
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e293b' }}>
                  {['Folio', 'Fecha OP', 'Vencimiento', 'Concepto / Tipo', 'CC / Área', 'Cargo', 'Abono', 'Status', 'Saldo Acum.'].map(h => (
                    <th key={h} style={{
                      padding: '9px 10px', color: '#fff', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      textAlign: ['Cargo','Abono','Saldo Acum.'].includes(h) ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineas.map(({ op, cargo, abono, saldoAcum }, idx) => {
                  const vencida = op.fecha_vencimiento && op.fecha_vencimiento < hoy && !['Pagada','Cancelada','Rechazada','Sustituida'].includes(op.status)
                  return (
                    <tr key={op.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>{op.folio}</td>
                      <td style={{ padding: '8px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{fmtF(op.fecha_op)}</td>
                      <td style={{ padding: '8px 10px', color: vencida ? '#dc2626' : '#64748b', fontWeight: vencida ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {fmtF(op.fecha_vencimiento)}{vencida ? ' ⚠' : ''}
                      </td>
                      <td style={{ padding: '8px 10px', maxWidth: 220 }}>
                        <div style={{ color: '#1e293b' }}>{op.concepto ?? '—'}</div>
                        {op.tipo_gasto && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#f1f5f9', color: '#475569' }}>{op.tipo_gasto}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: '#64748b' }}>
                        {op.id_centro_costo_fk ? ccMap[op.id_centro_costo_fk] ?? '—' : '—'}
                        {op.id_area_fk ? <><br />{areaMap[op.id_area_fk] ?? ''}</> : null}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: cargo > 0 ? '#1e293b' : '#94a3b8' }}>
                        {cargo > 0 ? fmt(cargo) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: abono > 0 ? '#15803d' : '#94a3b8' }}>
                        {abono > 0 ? fmt(abono) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${STATUS_CLR[op.status]}20`, color: STATUS_CLR[op.status] }}>
                          {op.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: saldoAcum > 0 ? '#d97706' : '#15803d' }}>
                        {fmt(saldoAcum)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1e293b', borderTop: '2px solid #1e293b' }}>
                  <td colSpan={5} style={{ padding: '10px 10px', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                    Total — {lineas.length} movimiento{lineas.length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCargo)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#86efac', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAbono)}</td>
                  <td />
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: saldoFinal > 0 ? '#fde68a' : '#86efac', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(saldoFinal)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {!loading && lineas.length === 0 && provSel && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No se encontraron órdenes de pago para este proveedor con los filtros seleccionados.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
