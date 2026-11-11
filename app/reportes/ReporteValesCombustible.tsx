'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter, Download } from 'lucide-react'

/**
 * Vales de combustible por Centro de Costo.
 * El CC es el del vale (id_centro_costo_fk); no se toma nada de la OP salvo
 * su folio y status como referencia.
 * Monto = monto_autorizado del vale (la OP suma los montos de sus vales).
 */

type Vale = {
  id: number; folio: string | null; created_at: string; periodo: string | null
  solicitante: string | null; tipo_combustible: string | null; tipo_suministro: string | null
  status: string | null; litros_autorizados: number; litros_usados: number; monto: number
  id_cc: number | null; op_folio: string | null; op_status: string | null
}

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtL = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L'
const fmtF = (s: string | null) => s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-MX') : '—'

type Tot = { vales: number; litros: number; usados: number; monto: number }
const nuevoTot = (): Tot => ({ vales: 0, litros: 0, usados: 0, monto: 0 })
const sumar = (t: Tot, v: Vale) => { t.vales++; t.litros += v.litros_autorizados; t.usados += v.litros_usados; t.monto += v.monto }

export default function ReporteValesCombustible() {
  const [vales, setVales]   = useState<Vale[]>([])
  const [ccMap, setCcMap]   = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [filtroCC, setFiltroCC]         = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroDe, setFiltroDe]         = useState('')
  const [filtroA,  setFiltroA]          = useState('')
  const [expCC, setExpCC] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    const [rV, rCC] = await Promise.all([
      dbCtrl.from('vales_combustible')
        .select('id, folio, created_at, periodo, solicitante, tipo_combustible, tipo_suministro, status, litros_autorizados, litros_usados, monto_autorizado, id_centro_costo_fk, id_op_fk')
        .eq('activo', true)
        .order('created_at', { ascending: false }),
      dbCfg.from('centros_costo').select('id, nombre').order('nombre'),
    ])
    const err = rV.error || rCC.error
    if (err) { setError(err.message); setLoading(false); return }

    // Folio/status de la OP como referencia (consulta aparte: el embed ctrl → comp no funciona entre schemas)
    const opIds = Array.from(new Set((rV.data ?? []).map((v: any) => v.id_op_fk).filter(Boolean)))
    const opMap: Record<number, any> = {}
    for (let i = 0; i < opIds.length; i += 200) {
      const { data, error: e } = await dbComp.from('ordenes_pago')
        .select('id, folio, status')
        .in('id', opIds.slice(i, i + 200))
      if (e) { setError(e.message); setLoading(false); return }
      ;(data ?? []).forEach((o: any) => { opMap[o.id] = o })
    }

    setCcMap(Object.fromEntries((rCC.data ?? []).map((r: any) => [r.id, r.nombre])))
    setVales((rV.data ?? []).map((v: any): Vale => {
      const op = v.id_op_fk ? opMap[v.id_op_fk] : null
      return {
        id: v.id, folio: v.folio, created_at: v.created_at, periodo: v.periodo,
        solicitante: v.solicitante, tipo_combustible: v.tipo_combustible, tipo_suministro: v.tipo_suministro,
        status: v.status,
        litros_autorizados: Number(v.litros_autorizados) || 0,
        litros_usados: Number(v.litros_usados) || 0,
        monto: Number(v.monto_autorizado) || 0,
        id_cc: v.id_centro_costo_fk ?? null,
        op_folio: op?.folio ?? null, op_status: op?.status ?? null,
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const nomCC = useCallback((id: number | null) => id ? (ccMap[id] ?? `CC #${id}`) : 'Sin centro de costo', [ccMap])

  const filtrados = useMemo(() => vales.filter(v => {
    const f = v.created_at.slice(0, 10)
    if (filtroDe && f < filtroDe) return false
    if (filtroA  && f > filtroA)  return false
    if (filtroTipo && v.tipo_combustible !== filtroTipo) return false
    if (filtroStatus && v.status !== filtroStatus) return false
    if (filtroCC && v.id_cc !== Number(filtroCC)) return false
    return true
  }), [vales, filtroDe, filtroA, filtroTipo, filtroStatus, filtroCC])

  const tiposComb = useMemo(() => Array.from(new Set(vales.map(v => v.tipo_combustible).filter(Boolean))) as string[], [vales])
  const statuses  = useMemo(() => Array.from(new Set(vales.map(v => v.status).filter(Boolean))) as string[], [vales])
  const ccsConVales = useMemo(() => {
    const ids = Array.from(new Set(vales.map(v => v.id_cc).filter(Boolean))) as number[]
    return ids.map(id => ({ id, nombre: nomCC(id) })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [vales, nomCC])

  // Agrupado por CC del vale
  const grupos = useMemo(() => {
    const ccs: Record<string, { key: string; nombre: string; tot: Tot; vales: Vale[] }> = {}
    for (const v of filtrados) {
      const k = String(v.id_cc ?? 0)
      const g = ccs[k] ??= { key: k, nombre: nomCC(v.id_cc), tot: nuevoTot(), vales: [] }
      sumar(g.tot, v); g.vales.push(v)
    }
    return Object.values(ccs).sort((x, y) => y.tot.monto - x.tot.monto)
  }, [filtrados, nomCC])

  const total = useMemo(() => { const t = nuevoTot(); filtrados.forEach(v => sumar(t, v)); return t }, [filtrados])
  const numOPs = useMemo(() => new Set(filtrados.map(v => v.op_folio).filter(Boolean)).size, [filtrados])
  const precioProm = total.litros > 0 ? total.monto / total.litros : 0

  const toggle = (k: string) => setExpCC(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    const resumen: any[] = grupos.map(g => ({
      'Centro de Costo': g.nombre, 'Vales': g.tot.vales, 'Litros autorizados': g.tot.litros,
      'Litros usados': g.tot.usados, 'Monto': g.tot.monto,
      '% del monto': total.monto > 0 ? +(g.tot.monto / total.monto * 100).toFixed(2) : 0,
    }))
    resumen.push({ 'Centro de Costo': 'TOTAL', 'Vales': total.vales, 'Litros autorizados': total.litros,
      'Litros usados': total.usados, 'Monto': total.monto, '% del monto': 100 })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')

    const detalle = filtrados.map(v => ({
      'Folio': v.folio ?? '', 'Fecha': v.created_at.slice(0, 10), 'Periodo': v.periodo ?? '',
      'Centro de Costo': nomCC(v.id_cc),
      'Solicitante': v.solicitante ?? '', 'Combustible': v.tipo_combustible ?? '', 'Suministro': v.tipo_suministro ?? '',
      'Status vale': v.status ?? '', 'OP': v.op_folio ?? '', 'Status OP': v.op_status ?? '',
      'Litros autorizados': v.litros_autorizados, 'Litros usados': v.litros_usados, 'Monto': v.monto,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle')
    XLSX.writeFile(wb, `Vales-Combustible-por-CC_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const num = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }
  const celdasTot = (t: Tot, color?: string) => (<>
    <td style={num}>{t.vales}</td>
    <td style={num}>{fmtL(t.litros)}</td>
    <td style={{ ...num, color: 'var(--text-muted)' }}>{fmtL(t.usados)}</td>
    <td style={{ ...num, fontWeight: 700, color }}>{fmt(t.monto)}</td>
  </>)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ width: 'auto', minWidth: 200 }} value={filtroCC} onChange={e => setFiltroCC(e.target.value)}>
          <option value="">Todos los centros de costo</option>
          {ccsConVales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 'auto', minWidth: 140 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todo combustible</option>
          {tiposComb.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="select" style={{ width: 'auto', minWidth: 130 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todo status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PrintBar title="Vales-Combustible-por-CC" count={filtrados.length}
        reportTitle="Vales de Combustible por Centro de Costo" hideCSV
        extra={<button className="btn-ghost" onClick={exportarExcel} disabled={!filtrados.length}><Download size={13} /> Exportar Excel</button>} />

      {error && <div className="card" style={{ padding: 12, marginBottom: 12, color: '#dc2626' }}>Error: {error}</div>}

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Monto autorizado',    value: fmt(total.monto),    color: 'var(--blue)' },
          { label: 'Litros autorizados',  value: fmtL(total.litros),  color: '#059669' },
          { label: 'Precio promedio / L', value: fmt(precioProm),     color: '#d97706' },
          { label: 'Vales',               value: String(total.vales), color: '#7c3aed' },
          { label: 'Órdenes de Pago',     value: String(numOPs),      color: '#64748b' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px', flex: '1 1 180px', maxWidth: 260 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn-ghost" onClick={() => setExpCC(new Set(grupos.map(g => g.key)))}>Expandir todo</button>
        <button className="btn-ghost" onClick={() => setExpCC(new Set())}>Colapsar todo</button>
      </div>

      <div id="reporte-print-area" className="card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : grupos.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Sin vales para los filtros seleccionados</div>
        ) : (
          <table id="reporte-table">
            <thead>
              <tr>
                <th>Centro de Costo / Vale</th>
                <th>Fecha</th>
                <th>Solicitante</th>
                <th>Combustible</th>
                <th>Status</th>
                <th>OP</th>
                <th style={{ textAlign: 'right' }}>Vales</th>
                <th style={{ textAlign: 'right' }}>Litros aut.</th>
                <th style={{ textAlign: 'right' }}>Litros usados</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <Fragment key={g.key}>
                  <tr onClick={() => toggle(g.key)} style={{ background: '#eff6ff', cursor: 'pointer' }}>
                    <td colSpan={6} style={{ fontWeight: 700, color: 'var(--blue)' }}>
                      {expCC.has(g.key) ? '▾' : '▸'} {g.nombre}
                      <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                        {total.monto > 0 ? (g.tot.monto / total.monto * 100).toFixed(1) : '0.0'}%
                      </span>
                    </td>
                    {celdasTot(g.tot, 'var(--blue)')}
                  </tr>
                  {expCC.has(g.key) && g.vales.map(v => (
                    <tr key={v.id} style={{ fontSize: 12 }}>
                      <td style={{ paddingLeft: 28, fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600 }}>{v.folio ?? `#${v.id}`}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtF(v.created_at)}</td>
                      <td>{v.solicitante ?? '—'}</td>
                      <td>{v.tipo_combustible ?? '—'}</td>
                      <td>{v.status ?? '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{v.op_folio ?? '—'}{v.op_status ? <span style={{ color: 'var(--text-muted)' }}> · {v.op_status}</span> : null}</td>
                      <td style={num}></td>
                      <td style={num}>{fmtL(v.litros_autorizados)}</td>
                      <td style={{ ...num, color: 'var(--text-muted)' }}>{fmtL(v.litros_usados)}</td>
                      <td style={{ ...num, fontWeight: 600 }}>{fmt(v.monto)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={6} style={{ color: 'var(--blue)' }}>TOTAL GENERAL</td>
                {celdasTot(total, 'var(--blue)')}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
