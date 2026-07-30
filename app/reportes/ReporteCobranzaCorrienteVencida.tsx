'use client'
import { useState, useCallback } from 'react'
import { dbCtrl, dbGolf, dbHip } from '@/lib/supabase'
import { PrintBar } from './utils'

// ── Reporte de Cobranza Corriente vs Vencida ─────────────────
// Toma las cuotas COBRADAS (detalle de recibos vigentes) y las clasifica
// comparando el periodo de la cuota contra el MES DE LA FECHA DE PAGO:
//   · Corriente:  periodo == mes de la fecha de pago
//   · Vencida:    periodo <  mes de la fecha de pago (se cobró con atraso)
//   · Anticipada: periodo >  mes de la fecha de pago (se cobró por adelantado)
//   · Otros:      líneas sin periodo (cargos/descuentos adicionales, conceptos sueltos)
// El mismo componente sirve a Residencial, Golf, Pensiones de Carritos,
// Hípico y Locales — cambia solo la fuente de datos.

export type FuenteCobranza = 'residencial' | 'golf' | 'pensiones' | 'hipico' | 'locales'

type Clasif = 'CORRIENTE' | 'VENCIDA' | 'ANTICIPADA' | 'OTROS'

type Row = {
  key: string
  fechaPago: string        // YYYY-MM-DD — fecha de registro del pago
  folio: string
  cliente: string
  concepto: string
  periodo: string | null   // YYYY-MM
  monto: number
  clasif: Clasif
}

const FUENTE_CFG: Record<FuenteCobranza, { titulo: string; clienteLabel: string; printTitle: string }> = {
  residencial: { titulo: 'Cobranza Corriente vs Vencida — Residencial',           clienteLabel: 'Propietario / Lote', printTitle: 'Cobranza-Corriente-Vencida-Residencial' },
  golf:        { titulo: 'Cobranza Corriente vs Vencida — Club Golf (Cuotas)',    clienteLabel: 'Socio',              printTitle: 'Cobranza-Corriente-Vencida-Golf' },
  pensiones:   { titulo: 'Cobranza Corriente vs Vencida — Pensiones de Carritos', clienteLabel: 'Socio',              printTitle: 'Cobranza-Corriente-Vencida-Pensiones' },
  hipico:      { titulo: 'Cobranza Corriente vs Vencida — Hípico (Caballerizas)', clienteLabel: 'Arrendatario',       printTitle: 'Cobranza-Corriente-Vencida-Hipico' },
  locales:     { titulo: 'Cobranza Corriente vs Vencida — Locales Comerciales',   clienteLabel: 'Arrendatario',       printTitle: 'Cobranza-Corriente-Vencida-Locales' },
}

const CLASIF_META: Record<Clasif, { label: string; color: string; bg: string }> = {
  CORRIENTE:  { label: 'Corriente',  color: '#16a34a', bg: '#dcfce7' },
  VENCIDA:    { label: 'Vencida',    color: '#dc2626', bg: '#fee2e2' },
  ANTICIPADA: { label: 'Anticipada', color: '#2563eb', bg: '#dbeafe' },
  OTROS:      { label: 'Otros',      color: '#64748b', bg: '#f1f5f9' },
}

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMes = (m: string) =>
  new Date(m + '-01T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
const pct = (parte: number, total: number) => total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : '—'

// periodo_mes residencial viene como nombre ('Enero'…'Diciembre')
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const periodoResidencial = (mes: string | null, anio: number | null): string | null => {
  if (!mes || !anio) return null
  const idx = MESES.findIndex(m => m.toLowerCase() === mes.toLowerCase())
  if (idx < 0) return null
  return `${anio}-${String(idx + 1).padStart(2, '0')}`
}

// Clasificación central del reporte: SIEMPRE contra el mes de la fecha de pago
const clasificar = (periodo: string | null, fechaPago: string): Clasif => {
  if (!periodo) return 'OTROS'
  const mesPago = fechaPago.slice(0, 7)
  if (periodo === mesPago) return 'CORRIENTE'
  return periodo < mesPago ? 'VENCIDA' : 'ANTICIPADA'
}

const nombrePersona = (p: any): string => {
  if (!p) return '—'
  if (p.razon_social) return p.razon_social
  const num = p.numero_socio ? `${p.numero_socio} — ` : ''
  return num + [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')
}

const chunk = <T,>(arr: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n))

export default function ReporteCobranzaCorrienteVencida({ fuente }: { fuente: FuenteCobranza }) {
  const cfg = FUENTE_CFG[fuente]
  const hoy = new Date()
  const inicioAnio = `${hoy.getFullYear()}-01-01`
  const hoyStr = hoy.toLocaleDateString('en-CA')

  const [fechaDesde, setFechaDesde]   = useState(inicioAnio)
  const [fechaHasta, setFechaHasta]   = useState(hoyStr)
  const [filtroClasif, setFiltroClasif] = useState<'' | Clasif>('')

  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError]     = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true); setError('')
    try {
      const out: Row[] = []

      if (fuente === 'residencial') {
        // Fecha de pago del recibo; recibos viejos sin fecha_pago usan fecha_recibo
        const { data: recs, error: e1 } = await dbCtrl.from('recibos')
          .select('id, folio, fecha_recibo, fecha_pago, propietario, lotes(cve_lote)')
          .eq('activo', true)
          .or(`and(fecha_pago.gte.${fechaDesde},fecha_pago.lte.${fechaHasta}),and(fecha_pago.is.null,fecha_recibo.gte.${fechaDesde},fecha_recibo.lte.${fechaHasta})`)
        if (e1) throw e1
        const recList = (recs ?? []) as any[]
        const porId: Record<number, any> = {}
        recList.forEach(r => { porId[r.id] = r })

        const dets: any[] = []
        for (const ids of chunk(recList.map(r => r.id), 400)) {
          const { data: d, error: e2 } = await dbCtrl.from('recibos_detalle')
            .select('id, id_recibo_fk, concepto, total, periodo_mes, periodo_anio')
            .in('id_recibo_fk', ids)
          if (e2) throw e2
          dets.push(...((d ?? []) as any[]))
        }
        for (const d of dets) {
          const r = porId[d.id_recibo_fk]
          if (!r) continue
          const fechaPago = (r.fecha_pago ?? r.fecha_recibo) as string
          const periodo = periodoResidencial(d.periodo_mes, d.periodo_anio)
          out.push({
            key: `res-${d.id}`,
            fechaPago,
            folio: r.folio ?? `#${r.id}`,
            cliente: r.propietario || r.lotes?.cve_lote || '—',
            concepto: d.concepto,
            periodo,
            monto: Number(d.total) || 0,
            clasif: clasificar(periodo, fechaPago),
          })
        }
      }

      if (fuente === 'golf' || fuente === 'pensiones') {
        const { data, error: e1 } = await dbGolf.from('recibos_golf')
          .select('id, folio, fecha_recibo, status, cat_socios(numero_socio, nombre, apellido_paterno, apellido_materno), recibos_golf_det(id, concepto, periodo, monto_final, tipo)')
          .neq('status', 'CANCELADO')
          .gte('fecha_recibo', fechaDesde).lte('fecha_recibo', fechaHasta)
        if (e1) throw e1
        for (const r of (data ?? []) as any[]) {
          for (const d of (r.recibos_golf_det ?? []) as any[]) {
            const esPension = d.tipo === 'PENSION_CARRITO'
            if (fuente === 'pensiones' ? !esPension : esPension) continue
            out.push({
              key: `g-${d.id}`,
              fechaPago: r.fecha_recibo,
              folio: r.folio,
              cliente: nombrePersona(r.cat_socios),
              concepto: d.concepto,
              periodo: d.periodo ?? null,
              monto: Number(d.monto_final) || 0,
              clasif: clasificar(d.periodo ?? null, r.fecha_recibo),
            })
          }
        }
      }

      if (fuente === 'hipico') {
        const { data, error: e1 } = await dbHip.from('recibos_hip')
          .select('id, folio, fecha_recibo, status, cat_arrendatarios(nombre, apellido_paterno, razon_social), recibos_hip_det(id, concepto, periodo, monto_final)')
          .neq('status', 'CANCELADO')
          .gte('fecha_recibo', fechaDesde).lte('fecha_recibo', fechaHasta)
        if (e1) throw e1
        for (const r of (data ?? []) as any[]) {
          for (const d of (r.recibos_hip_det ?? []) as any[]) {
            out.push({
              key: `h-${d.id}`,
              fechaPago: r.fecha_recibo,
              folio: r.folio,
              cliente: nombrePersona(r.cat_arrendatarios),
              concepto: d.concepto,
              periodo: d.periodo ?? null,
              monto: Number(d.monto_final) || 0,
              clasif: clasificar(d.periodo ?? null, r.fecha_recibo),
            })
          }
        }
      }

      if (fuente === 'locales') {
        const { data, error: e1 } = await dbCtrl.from('loc_recibos')
          .select('id, folio, fecha_recibo, status, cat_arrendatarios:loc_arrendatarios(nombre, apellido_paterno, razon_social), loc_recibos_det(id, concepto, periodo, monto_final)')
          .neq('status', 'CANCELADO')
          .gte('fecha_recibo', fechaDesde).lte('fecha_recibo', fechaHasta)
        if (e1) throw e1
        for (const r of (data ?? []) as any[]) {
          for (const d of (r.loc_recibos_det ?? []) as any[]) {
            out.push({
              key: `l-${d.id}`,
              fechaPago: r.fecha_recibo,
              folio: r.folio,
              cliente: nombrePersona(r.cat_arrendatarios),
              concepto: d.concepto,
              periodo: d.periodo ?? null,
              monto: Number(d.monto_final) || 0,
              clasif: clasificar(d.periodo ?? null, r.fecha_recibo),
            })
          }
        }
      }

      out.sort((a, b) => b.fechaPago.localeCompare(a.fechaPago) || a.folio.localeCompare(b.folio))
      setRows(out)
    } catch (e: any) {
      setError(e?.message ?? 'Error al consultar')
      setRows([])
    }
    setLoading(false)
  }, [fuente, fechaDesde, fechaHasta])

  // ── KPIs (siempre sobre todo el rango; el filtro de clasificación solo acota el detalle) ──
  const suma = (cl: Clasif) => rows.filter(r => r.clasif === cl).reduce((s, r) => s + r.monto, 0)
  const cnt  = (cl: Clasif) => rows.filter(r => r.clasif === cl).length
  const totCorriente = suma('CORRIENTE'), totVencida = suma('VENCIDA')
  const totAnticipada = suma('ANTICIPADA'), totOtros = suma('OTROS')
  const totalCobrado = totCorriente + totVencida + totAnticipada + totOtros
  // Índice de cobranza: corriente vs (corriente + vencida) — lo cobrado de cuotas con periodo
  const baseCuotas = totCorriente + totVencida

  // ── Resumen por mes de pago ──
  const porMes = rows.reduce((acc, r) => {
    const mes = r.fechaPago.slice(0, 7)
    if (!acc[mes]) acc[mes] = { CORRIENTE: 0, VENCIDA: 0, ANTICIPADA: 0, OTROS: 0, total: 0 }
    acc[mes][r.clasif] += r.monto
    acc[mes].total += r.monto
    return acc
  }, {} as Record<string, Record<Clasif, number> & { total: number }>)
  const mesesOrden = Object.keys(porMes).sort().reverse()

  const detalle = filtroClasif ? rows.filter(r => r.clasif === filtroClasif) : rows

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha de pago desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Clasificación (detalle)</label>
          <select className="input" value={filtroClasif} onChange={e => setFiltroClasif(e.target.value as '' | Clasif)} style={{ fontSize: 12, minWidth: 150 }}>
            <option value="">Todas</option>
            {(Object.keys(CLASIF_META) as Clasif[]).map(c => <option key={c} value={c}>{CLASIF_META[c].label}</option>)}
          </select>
        </div>
      </div>

      {/* Barra de acción */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && <PrintBar title={cfg.printTitle} count={detalle.length} reportTitle={cfg.titulo} />}
      </div>

      {error && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Selecciona el rango de fechas de pago y haz clic en Consultar.<br/>
          <span style={{ fontSize: 12 }}>Corriente = cuota del mismo mes en que se pagó · Vencida = cuota de meses anteriores a la fecha de pago</span>
        </div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total cobrado',       value: fmt$(totalCobrado),  color: '#334155', bg: '#f8fafc', sub: `${rows.length} conceptos` },
              { label: 'Cobranza corriente',  value: fmt$(totCorriente),  color: '#16a34a', bg: '#f0fdf4', sub: `${cnt('CORRIENTE')} cuotas · ${pct(totCorriente, baseCuotas)} del cobro de cuotas` },
              { label: 'Cobranza vencida',    value: fmt$(totVencida),    color: '#dc2626', bg: '#fef2f2', sub: `${cnt('VENCIDA')} cuotas · ${pct(totVencida, baseCuotas)} del cobro de cuotas` },
              { label: 'Cobranza anticipada', value: fmt$(totAnticipada), color: '#2563eb', bg: '#eff6ff', sub: `${cnt('ANTICIPADA')} cuotas` },
              { label: 'Otros conceptos',     value: fmt$(totOtros),      color: '#64748b', bg: '#f8fafc', sub: `${cnt('OTROS')} sin periodo` },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 160px', padding: '12px 16px', background: k.bg }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 10, color: k.color, marginTop: 1 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Resumen por mes de pago */}
          {mesesOrden.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
                Resumen por Mes de Pago
              </h3>
              <div className="card" style={{ overflow: 'hidden', padding: 0, marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      {['Mes de pago', 'Corriente', 'Vencida', 'Anticipada', 'Otros', 'Total', '% Corriente'].map((h, i) => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mesesOrden.map((mes, i) => {
                      const m = porMes[mes]
                      return (
                        <tr key={mes} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{fmtMes(mes)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{m.CORRIENTE > 0 ? fmt$(m.CORRIENTE) : '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{m.VENCIDA > 0 ? fmt$(m.VENCIDA) : '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#2563eb' }}>{m.ANTICIPADA > 0 ? fmt$(m.ANTICIPADA) : '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{m.OTROS !== 0 ? fmt$(m.OTROS) : '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt$(m.total)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{pct(m.CORRIENTE, m.CORRIENTE + m.VENCIDA)}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt$(totCorriente)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{fmt$(totVencida)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{fmt$(totAnticipada)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>{fmt$(totOtros)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt$(totalCobrado)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>{pct(totCorriente, baseCuotas)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Detalle */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Detalle ({detalle.length} conceptos{filtroClasif ? ` · ${CLASIF_META[filtroClasif].label}` : ''})
          </h3>
          {detalle.length === 0
            ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Sin resultados</div>
            : (
              <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      {['Fecha de pago', 'Folio', cfg.clienteLabel, 'Concepto', 'Periodo de la cuota', 'Clasificación', 'Monto'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: h === 'Monto' ? 'right' : 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((r, i) => {
                      const cm = CLASIF_META[r.clasif]
                      return (
                        <tr key={r.key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(r.fechaPago)}</td>
                          <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontSize: 11 }}>{r.cliente}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{r.concepto}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.periodo ?? '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: cm.bg, color: cm.color, fontWeight: 700 }}>{cm.label}</span>
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: r.monto < 0 ? '#dc2626' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt$(r.monto)}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                      <td colSpan={6} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt$(detalle.reduce((s, r) => s + r.monto, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  )
}
