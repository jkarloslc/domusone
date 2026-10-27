'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt = (n: number) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (f: string | null) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const mesLabel = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`
const hoy = () => new Date().toISOString().slice(0, 10)

const STATUS = ['Borrador', 'Vigente', 'Vencida', 'Convertida', 'Descartada'] as const
const COLOR: Record<string, string> = { Borrador: '#64748b', Vigente: '#2563eb', Vencida: '#dc2626', Convertida: '#15803d', Descartada: '#94a3b8' }

type Pre = {
  id: number; folio: string; concepto: string; monto: number; status: string
  fecha_estimada_pago: string; vigencia_cotizacion: string | null; esquema_comprobante: string
  id_proveedor_fk: number | null; proveedor_prospecto: string | null
  id_centro_costo_fk: number | null; id_area_fk: number | null
}

// Vencida se deriva: cotización con vigencia pasada aún sin convertir ni descartar
const statusDe = (r: Pre) =>
  (r.status === 'Borrador' || r.status === 'Vigente') && r.vigencia_cotizacion && r.vigencia_cotizacion < hoy() ? 'Vencida' : r.status

export default function ReportePreOrdenes() {
  const [rows, setRows] = useState<Pre[]>([])
  const [ccs, setCcs] = useState<Record<number, string>>({})
  const [areas, setAreas] = useState<Record<number, string>>({})
  const [provs, setProvs] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [fStatus, setFStatus] = useState('abiertas')
  const [fCC, setFCC] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: c }, { data: a }, { data: p }] = await Promise.all([
      dbComp.from('pre_ordenes_pago')
        .select('id, folio, concepto, monto, status, fecha_estimada_pago, vigencia_cotizacion, esquema_comprobante, id_proveedor_fk, proveedor_prospecto, id_centro_costo_fk, id_area_fk')
        .order('fecha_estimada_pago'),
      dbCfg.from('centros_costo').select('id, nombre'),
      dbCfg.from('areas').select('id, nombre'),
      dbComp.from('proveedores').select('id, nombre'),
    ])
    setRows((data ?? []) as Pre[])
    setCcs(Object.fromEntries((c ?? []).map((x: any) => [x.id, x.nombre])))
    setAreas(Object.fromEntries((a ?? []).map((x: any) => [x.id, x.nombre])))
    setProvs(Object.fromEntries((p ?? []).map((x: any) => [x.id, x.nombre])))
    setLoading(false)
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const filtradas = useMemo(() => rows.filter(r => {
    const s = statusDe(r)
    if (fStatus === 'abiertas' ? !(s === 'Borrador' || s === 'Vigente' || s === 'Vencida') : (fStatus && s !== fStatus)) return false
    if (fCC && r.id_centro_costo_fk !== Number(fCC)) return false
    if (desde && r.fecha_estimada_pago < desde) return false
    if (hasta && r.fecha_estimada_pago > hasta) return false
    return true
  }), [rows, fStatus, fCC, desde, hasta])

  // Mes → Centro de Costo → líneas
  const meses = useMemo(() => {
    const m: Record<string, Record<string, Pre[]>> = {}
    filtradas.forEach(r => {
      const k = r.fecha_estimada_pago.slice(0, 7)
      const cc = r.id_centro_costo_fk ? (ccs[r.id_centro_costo_fk] ?? `#${r.id_centro_costo_fk}`) : 'Sin centro de costo'
      ;((m[k] ||= {})[cc] ||= []).push(r)
    })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
  }, [filtradas, ccs])

  const sum = (l: Pre[]) => l.reduce((a, r) => a + (Number(r.monto) || 0), 0)
  const total = sum(filtradas)
  const porStatus = (s: string) => sum(filtradas.filter(r => statusDe(r) === s))
  const provDe = (r: Pre) => r.id_proveedor_fk ? (provs[r.id_proveedor_fk] ?? `#${r.id_proveedor_fk}`) : `${r.proveedor_prospecto ?? '—'} (prospecto)`

  const exportar = () => {
    const wb = XLSX.utils.book_new()
    const det = filtradas.map(r => ({
      Folio: r.folio, Proveedor: provDe(r), Concepto: r.concepto, Mes: mesLabel(r.fecha_estimada_pago.slice(0, 7)),
      'Fecha estimada pago': r.fecha_estimada_pago, 'Vigencia cotización': r.vigencia_cotizacion ?? '',
      'Centro de costo': r.id_centro_costo_fk ? ccs[r.id_centro_costo_fk] : '', Área: r.id_area_fk ? areas[r.id_area_fk] : '',
      Comprobante: r.esquema_comprobante, Status: statusDe(r), Monto: Number(r.monto) || 0,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(det), 'Detalle')
    const res = meses.flatMap(([k, g]) => Object.entries(g).map(([cc, l]) => ({ Mes: mesLabel(k), 'Centro de costo': cc, Documentos: l.length, Monto: sum(l) })))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res), 'Resumen')
    XLSX.writeFile(wb, `Pre-ordenes-de-Pago_${hoy()}.xlsx`)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" style={{ width: 170 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="abiertas">Abiertas (sin convertir)</option>
          <option value="">Todas</option>
          {STATUS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ width: 220 }} value={fCC} onChange={e => setFCC(e.target.value)}>
          <option value="">Todos los centros de costo</option>
          {Object.entries(ccs).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pago estimado:</span>
        <input className="input" type="date" style={{ width: 150 }} value={desde} onChange={e => setDesde(e.target.value)} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
        <input className="input" type="date" style={{ width: 150 }} value={hasta} onChange={e => setHasta(e.target.value)} />
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        <PrintBar title="Pre-órdenes de Pago" count={filtradas.length} reportTitle="Pre-órdenes de Pago por Mes / CC" hideCSV
          extra={<button className="btn-ghost" onClick={exportar}><FileSpreadsheet size={13} /> Exportar Excel</button>} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 16px', flex: '1 1 180px', maxWidth: 240 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total filtrado ({filtradas.length})</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(total)}</div>
        </div>
        {['Vigente', 'Borrador', 'Vencida'].map(s => (
          <div key={s} className="card" style={{ padding: '12px 16px', flex: '1 1 160px', maxWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s}s</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLOR[s] }}>{fmt(porStatus(s))}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }} id="reporte-print-area">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><RefreshCw size={18} className="animate-spin" /></div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin pre-órdenes con estos filtros</div>
        ) : (
          <table id="reporte-table">
            <thead>
              <tr><th>Folio</th><th>Proveedor</th><th>Concepto</th><th>Área</th><th>Pago est.</th><th>Vigencia</th><th>Comprobante</th><th>Status</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
            </thead>
            <tbody>
              {meses.map(([k, g]) => (
                <Fragment key={k}>
                  <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                    <td colSpan={8} style={{ color: 'var(--blue)' }}>{mesLabel(k)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--blue)' }}>{fmt(sum(Object.values(g).flat()))}</td>
                  </tr>
                  {Object.entries(g).map(([cc, l]) => (
                    <Fragment key={k + cc}>
                      <tr style={{ background: 'var(--bg-secondary, #f8fafc)', fontWeight: 600 }}>
                        <td colSpan={8} style={{ paddingLeft: 24 }}>{cc}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(sum(l))}</td>
                      </tr>
                      {l.map(r => {
                        const s = statusDe(r)
                        return (
                          <tr key={r.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12, paddingLeft: 40 }}>{r.folio}</td>
                            <td style={{ fontSize: 12 }}>{provDe(r)}</td>
                            <td style={{ fontSize: 12 }}>{r.concepto}</td>
                            <td style={{ fontSize: 12 }}>{r.id_area_fk ? (areas[r.id_area_fk] ?? '—') : '—'}</td>
                            <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(r.fecha_estimada_pago)}</td>
                            <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: s === 'Vencida' ? '#dc2626' : undefined }}>{fmtF(r.vigencia_cotizacion)}</td>
                            <td style={{ fontSize: 11 }}>{r.esquema_comprobante === 'Factura previa al pago' ? 'Previa' : 'Posterior'}</td>
                            <td style={{ fontSize: 11, fontWeight: 600, color: COLOR[s] }}>{s}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(r.monto))}</td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={8} style={{ color: 'var(--blue)' }}>TOTAL GENERAL ({filtradas.length})</td>
                <td style={{ textAlign: 'right', color: 'var(--blue)' }}>{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
