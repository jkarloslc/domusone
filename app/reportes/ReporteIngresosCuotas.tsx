'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtF = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const pct  = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) + '%' : '—'
// Monto es captura manual; Subtotal e IVA se derivan para desglose fiscal (Subtotal = Monto/1.16, IVA = Subtotal*0.16)
const calcFiscal = (monto: number) => {
  const subtotal = monto / 1.16
  const iva = subtotal * 0.16
  return { subtotal, iva }
}

type Centro = { id: number; nombre: string; tipo: string | null; tipo_desglose: string }

type ReciboFlat = {
  id: number
  folio: string | null
  fecha: string
  status: string
  id_centro_ingreso_fk: number | null
  monto_total: number
  secciones: { nombre: string; monto: number }[]
  conceptos: { nombre: string; monto: number }[]
}

export default function ReporteIngresosCuotas() {
  const [centros, setCentros] = useState<Centro[]>([])
  const [recibos, setRecibos] = useState<ReciboFlat[]>([])
  const [loading, setLoading] = useState(true)

  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Confirmado')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const centrosCuotas = centros.filter(c => c.tipo === 'cuotas' && c.tipo_desglose === 'secciones')
  const centroMap     = Object.fromEntries(centros.map(c => [c.id, c]))

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: cs } = await dbCfg.from('centros_ingreso')
      .select('id, nombre, tipo, tipo_desglose').order('nombre')
    setCentros(cs ?? [])

    const cuotaIds = (cs ?? [])
      .filter((c: Centro) => c.tipo === 'cuotas' && c.tipo_desglose === 'secciones')
      .map((c: Centro) => c.id)

    if (cuotaIds.length === 0) { setRecibos([]); setLoading(false); return }

    const centroTarget = filtroCentro ? [Number(filtroCentro)] : cuotaIds

    // Secciones con join a recibos
    let secQ = (dbCtrl.from('recibos_ingreso_secciones') as any)
      .select('id_recibo_fk, nombre_seccion, monto, recibos_ingreso!inner(id, folio, fecha, status, id_centro_ingreso_fk, monto_total)')
      .in('recibos_ingreso.id_centro_ingreso_fk', centroTarget)
    if (filtroStatus) secQ = secQ.eq('recibos_ingreso.status', filtroStatus)
    if (filtroDe)     secQ = secQ.gte('recibos_ingreso.fecha', filtroDe)
    if (filtroA)      secQ = secQ.lte('recibos_ingreso.fecha', filtroA)

    const { data: secRows } = await secQ

    // Construir mapa de recibos únicos
    const reciboMap: Record<number, ReciboFlat> = {}
    for (const s of (secRows ?? []) as any[]) {
      const r = s.recibos_ingreso
      if (!reciboMap[r.id]) {
        reciboMap[r.id] = {
          id: r.id, folio: r.folio, fecha: r.fecha,
          status: r.status, id_centro_ingreso_fk: r.id_centro_ingreso_fk,
          monto_total: Number(r.monto_total ?? 0),
          secciones: [], conceptos: [],
        }
      }
      if (Number(s.monto) > 0) {
        reciboMap[r.id].secciones.push({ nombre: s.nombre_seccion, monto: Number(s.monto) })
      }
    }

    const reciboIds = Object.keys(reciboMap).map(Number)

    // Conceptos para esos recibos
    if (reciboIds.length > 0) {
      const { data: cRows } = await dbCtrl
        .from('recibos_ingreso_conceptos')
        .select('id_recibo_fk, nombre_concepto, monto')
        .in('id_recibo_fk', reciboIds)
      for (const c of (cRows ?? []) as any[]) {
        if (reciboMap[c.id_recibo_fk] && Number(c.monto) > 0) {
          reciboMap[c.id_recibo_fk].conceptos.push({ nombre: c.nombre_concepto, monto: Number(c.monto) })
        }
      }
    }

    setRecibos(
      Object.values(reciboMap).sort((a, b) => b.fecha.localeCompare(a.fecha))
    )
    setLoading(false)
  }, [filtroCentro, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Aggregados ────────────────────────────────────────────
  const totalGeneral = recibos.reduce((s, r) => s + r.monto_total, 0)

  // Por sección: sumar montos de sección a través de todos los recibos
  const seccionTotales: Record<string, number> = {}
  recibos.forEach(r => r.secciones.forEach(s => {
    seccionTotales[s.nombre] = (seccionTotales[s.nombre] ?? 0) + s.monto
  }))
  const seccionesOrdenadas = Object.entries(seccionTotales).sort((a, b) => b[1] - a[1])
  const totalSecciones      = seccionesOrdenadas.reduce((s, [, v]) => s + v, 0)

  // Por concepto: sumar montos de concepto a través de todos los recibos
  const conceptoTotales: Record<string, number> = {}
  recibos.forEach(r => r.conceptos.forEach(c => {
    conceptoTotales[c.nombre] = (conceptoTotales[c.nombre] ?? 0) + c.monto
  }))
  const conceptosOrdenados = Object.entries(conceptoTotales).sort((a, b) => b[1] - a[1])
  const totalConceptos     = conceptosOrdenados.reduce((s, [, v]) => s + v, 0)
  const hayConceptos       = conceptosOrdenados.length > 0

  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th style={{ padding: '9px 14px', textAlign: right ? 'right' : 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
      {children}
    </th>
  )

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 150 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select className="select" style={{ minWidth: 220 }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
          <option value="">Todos los centros de cuotas</option>
          {centrosCuotas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA}  onChange={e => setFiltroA(e.target.value)}  style={{ width: 140 }} />
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI total */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 180px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Cuotas</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2563eb' }}>{fmt(totalGeneral)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {recibos.length} recibo{recibos.length !== 1 ? 's' : ''} · {seccionesOrdenadas.length} sección{seccionesOrdenadas.length !== 1 ? 'es' : ''}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      ) : recibos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin registros con los filtros aplicados</div>
      ) : (
        <div id="reporte-print-area">

          {/* ── Dos resúmenes paralelos ─────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: hayConceptos ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 20 }}>

            {/* Resumen por Sección */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#1d4ed8' }}>
                Por Sección <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— quién paga</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <TH>Sección</TH>
                    <TH right>Subtotal</TH>
                    <TH right>IVA</TH>
                    <TH right>Monto</TH>
                    <TH right>%</TH>
                  </tr>
                </thead>
                <tbody>
                  {seccionesOrdenadas.map(([nombre, total]) => {
                    const f = calcFiscal(total)
                    return (
                    <tr key={nombre} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 500 }}>{nombre}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{fmt(f.subtotal)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{fmt(f.iva)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(total)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{pct(total, totalSecciones)}</td>
                    </tr>
                    )
                  })}
                  <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: '#1d4ed8' }}>Total</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmt(calcFiscal(totalSecciones).subtotal)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmt(calcFiscal(totalSecciones).iva)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmt(totalSecciones)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Resumen por Concepto (solo si hay) */}
            {hayConceptos && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#059669' }}>
                  Por Concepto <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— para qué</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <TH>Concepto</TH>
                      <TH right>Subtotal</TH>
                      <TH right>IVA</TH>
                      <TH right>Monto</TH>
                      <TH right>%</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {conceptosOrdenados.map(([nombre, total]) => {
                      const f = calcFiscal(total)
                      return (
                      <tr key={nombre} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 500 }}>{nombre}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{fmt(f.subtotal)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{fmt(f.iva)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(total)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{pct(total, totalConceptos)}</td>
                      </tr>
                      )
                    })}
                    <tr style={{ background: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 700, color: '#059669' }}>Total</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(calcFiscal(totalConceptos).subtotal)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(calcFiscal(totalConceptos).iva)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(totalConceptos)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Detalle plano de recibos (1 fila = 1 recibo) ────── */}
          <PrintBar
            title="Ingresos-Cuotas-Seccion-Concepto"
            count={recibos.length}
            reportTitle="Cuotas Residenciales — por Sección y Concepto"
          />

          <div className="card" style={{ overflow: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <TH>Folio</TH>
                  <TH>Fecha</TH>
                  {!filtroCentro && <TH>Centro</TH>}
                  <TH>Secciones</TH>
                  {hayConceptos && <TH>Conceptos</TH>}
                  <TH right>Subtotal</TH>
                  <TH right>IVA</TH>
                  <TH right>Total</TH>
                </tr>
              </thead>
              <tbody>
                {recibos.map(r => {
                  const centroNombre = r.id_centro_ingreso_fk ? (centroMap[r.id_centro_ingreso_fk]?.nombre ?? '—') : '—'
                  const secsText = r.secciones.map(s => `${s.nombre}: ${fmt(s.monto)}`).join(' · ') || '—'
                  const cptText  = r.conceptos.map(c => `${c.nombre}: ${fmt(c.monto)}`).join(' · ') || '—'
                  const fr = calcFiscal(r.monto_total)
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)' }}>
                        {r.folio ?? `ING-${r.id}`}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {fmtF(r.fecha)}
                      </td>
                      {!filtroCentro && (
                        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                          {centroNombre}
                        </td>
                      )}
                      <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 280, lineHeight: 1.5 }}>
                        {secsText}
                      </td>
                      {hayConceptos && (
                        <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 280, lineHeight: 1.5 }}>
                          {cptText}
                        </td>
                      )}
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmt(fr.subtotal)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmt(fr.iva)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmt(r.monto_total)}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                  <td colSpan={!filtroCentro ? (hayConceptos ? 5 : 4) : (hayConceptos ? 4 : 3)}
                    style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    Total General · {recibos.length} recibo{recibos.length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: '#cbd5e1' }}>
                    {fmt(calcFiscal(totalGeneral).subtotal)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: '#cbd5e1' }}>
                    {fmt(calcFiscal(totalGeneral).iva)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#93c5fd' }}>
                    {fmt(totalGeneral)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
