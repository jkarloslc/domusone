'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { useZonas, SelectZona } from '@/lib/zonas'
import { PrintBar } from './utils'
import { RefreshCw, Filter, Download } from 'lucide-react'

/**
 * Vales de combustible por Centro de Costo → Área → Frente.
 * - Centro de Costo: el del vale (id_centro_costo_fk, obligatorio al capturar).
 * - Área: la del vale si la tiene; si no, la de su OP.
 * - Frente y Zona: de la OP ligada (el vale no los tiene).
 * Monto = monto_autorizado del vale (la OP suma los montos de sus vales).
 */

type Vale = {
  id: number; folio: string | null; created_at: string; periodo: string | null
  solicitante: string | null; tipo_combustible: string | null; tipo_suministro: string | null
  status: string | null; litros_autorizados: number; litros_usados: number; monto: number
  id_cc: number | null; id_area: number | null; id_frente: number | null; id_cuadrante_fk: number | null
  op_folio: string | null; op_status: string | null
}

const SIN = 0   // clave para "Sin área" / "Sin frente"
const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtL = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L'
const fmtF = (s: string | null) => s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-MX') : '—'

type Tot = { vales: number; litros: number; usados: number; monto: number }
const nuevoTot = (): Tot => ({ vales: 0, litros: 0, usados: 0, monto: 0 })
const sumar = (t: Tot, v: Vale) => { t.vales++; t.litros += v.litros_autorizados; t.usados += v.litros_usados; t.monto += v.monto }

export default function ReporteValesCombustible() {
  const zonasCat = useZonas()
  const [vales, setVales]   = useState<Vale[]>([])
  const [ccMap, setCcMap]   = useState<Record<number, string>>({})
  const [areaMap, setAreaMap] = useState<Record<number, string>>({})
  const [frenteMap, setFrenteMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [filtroCC, setFiltroCC]         = useState('')
  const [filtroZona, setFiltroZona]     = useState('')
  const [filtroArea, setFiltroArea]     = useState('')
  const [filtroFrente, setFiltroFrente] = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroDe, setFiltroDe]         = useState('')
  const [filtroA,  setFiltroA]          = useState('')

  const [expCC, setExpCC]     = useState<Set<string>>(new Set())
  const [expArea, setExpArea] = useState<Set<string>>(new Set())
  const [expFr, setExpFr]     = useState<Set<string>>(new Set())

  // Zona solo bajo el CC que la usa; al cambiar de CC se limpian Zona/Área/Frente
  useEffect(() => { if (!zonasCat.ccUsaZonas(filtroCC)) setFiltroZona('') }, [filtroCC, zonasCat])

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    const [rV, rCC, rA, rF] = await Promise.all([
      dbCtrl.from('vales_combustible')
        .select('id, folio, created_at, periodo, solicitante, tipo_combustible, tipo_suministro, status, litros_autorizados, litros_usados, monto_autorizado, id_centro_costo_fk, id_area_fk, id_op_fk')
        .eq('activo', true)
        .order('created_at', { ascending: false }),
      dbCfg.from('centros_costo').select('id, nombre').order('nombre'),
      dbCfg.from('areas').select('id, nombre').order('nombre'),
      dbCfg.from('frentes').select('id, nombre').order('nombre'),
    ])
    const err = rV.error || rCC.error || rA.error || rF.error
    if (err) { setError(err.message); setLoading(false); return }

    // OP ligadas (consulta aparte: el embed ctrl → comp no funciona entre schemas)
    const opIds = Array.from(new Set((rV.data ?? []).map((v: any) => v.id_op_fk).filter(Boolean)))
    const opMap: Record<number, any> = {}
    for (let i = 0; i < opIds.length; i += 200) {
      const { data, error: e } = await dbComp.from('ordenes_pago')
        .select('id, folio, status, id_area_fk, id_frente_fk, id_cuadrante_fk')
        .in('id', opIds.slice(i, i + 200))
      if (e) { setError(e.message); setLoading(false); return }
      ;(data ?? []).forEach((o: any) => { opMap[o.id] = o })
    }

    const toMap = (rows: any[] | null) => Object.fromEntries((rows ?? []).map(r => [r.id, r.nombre]))
    setCcMap(toMap(rCC.data)); setAreaMap(toMap(rA.data)); setFrenteMap(toMap(rF.data))

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
        id_area: v.id_area_fk ?? op?.id_area_fk ?? null,
        id_frente: op?.id_frente_fk ?? null,
        id_cuadrante_fk: op?.id_cuadrante_fk ?? null,
        op_folio: op?.folio ?? null, op_status: op?.status ?? null,
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const nomCC = (id: number | null) => id ? (ccMap[id] ?? `CC #${id}`) : 'Sin centro de costo'
  const nomArea = (id: number | null) => id ? (areaMap[id] ?? `Área #${id}`) : 'Sin área'
  const nomFrente = (id: number | null) => id ? (frenteMap[id] ?? `Frente #${id}`) : 'Sin frente'

  // Filtros previos al de Área/Frente, para derivar sus opciones de los datos
  const base = useMemo(() => vales.filter(v => {
    const f = v.created_at.slice(0, 10)
    if (filtroDe && f < filtroDe) return false
    if (filtroA  && f > filtroA)  return false
    if (filtroTipo && v.tipo_combustible !== filtroTipo) return false
    if (filtroStatus && v.status !== filtroStatus) return false
    if (filtroCC && v.id_cc !== Number(filtroCC)) return false
    if (filtroZona && !zonasCat.docEnZona(filtroZona, { id_cuadrante_fk: v.id_cuadrante_fk, id_area_fk: v.id_area })) return false
    return true
  }), [vales, filtroDe, filtroA, filtroTipo, filtroStatus, filtroCC, filtroZona, zonasCat])

  const opcionesArea = useMemo(() => {
    const ids = Array.from(new Set(base.map(v => v.id_area ?? SIN)))
    return ids.map(id => ({ id, nombre: nomArea(id || null) })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [base, areaMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => base.filter(v => {
    if (filtroArea !== '' && (v.id_area ?? SIN) !== Number(filtroArea)) return false
    if (filtroFrente !== '' && (v.id_frente ?? SIN) !== Number(filtroFrente)) return false
    return true
  }), [base, filtroArea, filtroFrente])

  const opcionesFrente = useMemo(() => {
    const src = filtroArea !== '' ? base.filter(v => (v.id_area ?? SIN) === Number(filtroArea)) : base
    const ids = Array.from(new Set(src.map(v => v.id_frente ?? SIN)))
    return ids.map(id => ({ id, nombre: nomFrente(id || null) })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [base, filtroArea, frenteMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const tiposComb = useMemo(() => Array.from(new Set(vales.map(v => v.tipo_combustible).filter(Boolean))) as string[], [vales])
  const statuses  = useMemo(() => Array.from(new Set(vales.map(v => v.status).filter(Boolean))) as string[], [vales])
  const ccsConVales = useMemo(() => {
    const ids = Array.from(new Set(vales.map(v => v.id_cc).filter(Boolean))) as number[]
    return ids.map(id => ({ id, nombre: nomCC(id) })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [vales, ccMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Árbol CC → Área → Frente → vales
  const arbol = useMemo(() => {
    type NFr = { key: string; nombre: string; tot: Tot; vales: Vale[] }
    type NAr = { key: string; nombre: string; tot: Tot; frentes: Record<string, NFr> }
    type NCC = { key: string; nombre: string; tot: Tot; areas: Record<string, NAr> }
    const ccs: Record<string, NCC> = {}
    for (const v of filtrados) {
      const kc = String(v.id_cc ?? SIN)
      const ka = `${kc}|${v.id_area ?? SIN}`
      const kf = `${ka}|${v.id_frente ?? SIN}`
      const c = ccs[kc] ??= { key: kc, nombre: nomCC(v.id_cc), tot: nuevoTot(), areas: {} }
      const a = c.areas[ka] ??= { key: ka, nombre: nomArea(v.id_area), tot: nuevoTot(), frentes: {} }
      const f = a.frentes[kf] ??= { key: kf, nombre: nomFrente(v.id_frente), tot: nuevoTot(), vales: [] }
      sumar(c.tot, v); sumar(a.tot, v); sumar(f.tot, v); f.vales.push(v)
    }
    const porMonto = <T extends { tot: Tot }>(xs: T[]) => xs.sort((x, y) => y.tot.monto - x.tot.monto)
    return porMonto(Object.values(ccs)).map(c => ({
      ...c,
      lista: porMonto(Object.values(c.areas)).map(a => ({ ...a, lista: porMonto(Object.values(a.frentes)) })),
    }))
  }, [filtrados, ccMap, areaMap, frenteMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => { const t = nuevoTot(); filtrados.forEach(v => sumar(t, v)); return t }, [filtrados])
  const numOPs = useMemo(() => new Set(filtrados.map(v => v.op_folio).filter(Boolean)).size, [filtrados])
  const precioProm = total.litros > 0 ? total.monto / total.litros : 0

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) =>
    set(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const expandirTodo = () => {
    setExpCC(new Set(arbol.map(c => c.key)))
    setExpArea(new Set(arbol.flatMap(c => c.lista.map(a => a.key))))
    setExpFr(new Set(arbol.flatMap(c => c.lista.flatMap(a => a.lista.map(f => f.key)))))
  }
  const colapsarTodo = () => { setExpCC(new Set()); setExpArea(new Set()); setExpFr(new Set()) }

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    const resumen: any[] = []
    arbol.forEach(c => c.lista.forEach(a => a.lista.forEach(f => resumen.push({
      'Centro de Costo': c.nombre, 'Área': a.nombre, 'Frente': f.nombre,
      'Vales': f.tot.vales, 'Litros autorizados': f.tot.litros, 'Litros usados': f.tot.usados, 'Monto': f.tot.monto,
    }))))
    resumen.push({ 'Centro de Costo': 'TOTAL', 'Área': '', 'Frente': '', 'Vales': total.vales,
      'Litros autorizados': total.litros, 'Litros usados': total.usados, 'Monto': total.monto })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')

    const detalle = filtrados.map(v => ({
      'Folio': v.folio ?? '', 'Fecha': v.created_at.slice(0, 10), 'Periodo': v.periodo ?? '',
      'Centro de Costo': nomCC(v.id_cc), 'Área': nomArea(v.id_area), 'Frente': nomFrente(v.id_frente),
      'Solicitante': v.solicitante ?? '', 'Combustible': v.tipo_combustible ?? '', 'Suministro': v.tipo_suministro ?? '',
      'Status vale': v.status ?? '', 'OP': v.op_folio ?? '', 'Status OP': v.op_status ?? '',
      'Litros autorizados': v.litros_autorizados, 'Litros usados': v.litros_usados, 'Monto': v.monto,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle')
    XLSX.writeFile(wb, `Vales-Combustible-CC-Area-Frente_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const num = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }
  const celdasTot = (t: Tot, color?: string) => (<>
    <td style={{ ...num }}>{t.vales}</td>
    <td style={{ ...num }}>{fmtL(t.litros)}</td>
    <td style={{ ...num, color: 'var(--text-muted)' }}>{fmtL(t.usados)}</td>
    <td style={{ ...num, fontWeight: 700, color }}>{fmt(t.monto)}</td>
  </>)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ width: 'auto', minWidth: 200 }} value={filtroCC}
          onChange={e => { setFiltroCC(e.target.value); setFiltroArea(''); setFiltroFrente('') }}>
          <option value="">Todos los centros de costo</option>
          {ccsConVales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {zonasCat.ccUsaZonas(filtroCC) && (
          <SelectZona zonas={zonasCat.zonas} value={filtroZona}
            onChange={v => { setFiltroZona(v); setFiltroArea(''); setFiltroFrente('') }} />
        )}
        <select className="select" style={{ width: 'auto', minWidth: 180 }} value={filtroArea}
          onChange={e => { setFiltroArea(e.target.value); setFiltroFrente('') }}>
          <option value="">Todas las áreas</option>
          {opcionesArea.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 'auto', minWidth: 160 }} value={filtroFrente} onChange={e => setFiltroFrente(e.target.value)}>
          <option value="">Todos los frentes</option>
          {opcionesFrente.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
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

      <PrintBar title="Vales-Combustible-CC-Area-Frente" count={filtrados.length}
        reportTitle="Vales de Combustible por Centro de Costo, Área y Frente" hideCSV
        extra={<button className="btn-ghost" onClick={exportarExcel} disabled={!filtrados.length}><Download size={13} /> Exportar Excel</button>} />

      {error && <div className="card" style={{ padding: 12, marginBottom: 12, color: '#dc2626' }}>Error: {error}</div>}

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Monto autorizado',   value: fmt(total.monto),       color: 'var(--blue)' },
          { label: 'Litros autorizados', value: fmtL(total.litros),     color: '#059669' },
          { label: 'Precio promedio / L', value: fmt(precioProm),       color: '#d97706' },
          { label: 'Vales',              value: String(total.vales),    color: '#7c3aed' },
          { label: 'Órdenes de Pago',    value: String(numOPs),         color: '#64748b' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px', flex: '1 1 180px', maxWidth: 260 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn-ghost" onClick={expandirTodo}>Expandir todo</button>
        <button className="btn-ghost" onClick={colapsarTodo}>Colapsar todo</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
          CC del vale · Área del vale o de su OP · Frente de la OP
        </span>
      </div>

      <div id="reporte-print-area" className="card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : arbol.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Sin vales para los filtros seleccionados</div>
        ) : (
          <table id="reporte-table">
            <thead>
              <tr>
                <th>Centro de Costo / Área / Frente / Vale</th>
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
              {arbol.map(c => (<Fragment key={c.key}>
                <tr key={c.key} onClick={() => toggle(setExpCC, c.key)} style={{ background: '#eff6ff', cursor: 'pointer' }}>
                  <td colSpan={6} style={{ fontWeight: 700, color: 'var(--blue)' }}>
                    {expCC.has(c.key) ? '▾' : '▸'} {c.nombre}
                  </td>
                  {celdasTot(c.tot, 'var(--blue)')}
                </tr>
                {expCC.has(c.key) && c.lista.map(a => (<Fragment key={a.key}>
                  <tr key={a.key} onClick={() => toggle(setExpArea, a.key)} style={{ background: '#f8fafc', cursor: 'pointer' }}>
                    <td colSpan={6} style={{ paddingLeft: 28, fontWeight: 600 }}>
                      {expArea.has(a.key) ? '▾' : '▸'} {a.nombre}
                    </td>
                    {celdasTot(a.tot)}
                  </tr>
                  {expArea.has(a.key) && a.lista.map(f => (<Fragment key={f.key}>
                    <tr key={f.key} onClick={() => toggle(setExpFr, f.key)} style={{ cursor: 'pointer' }}>
                      <td colSpan={6} style={{ paddingLeft: 48, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {expFr.has(f.key) ? '▾' : '▸'} {f.nombre}
                      </td>
                      {celdasTot(f.tot)}
                    </tr>
                    {expFr.has(f.key) && f.vales.map(v => (
                      <tr key={`${f.key}|${v.id}`} style={{ fontSize: 12 }}>
                        <td style={{ paddingLeft: 68, fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600 }}>{v.folio ?? `#${v.id}`}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtF(v.created_at)}</td>
                        <td>{v.solicitante ?? '—'}</td>
                        <td>{v.tipo_combustible ?? '—'}</td>
                        <td>{v.status ?? '—'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{v.op_folio ?? '—'}{v.op_status ? <span style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}> · {v.op_status}</span> : null}</td>
                        <td style={num}></td>
                        <td style={num}>{fmtL(v.litros_autorizados)}</td>
                        <td style={{ ...num, color: 'var(--text-muted)' }}>{fmtL(v.litros_usados)}</td>
                        <td style={{ ...num, fontWeight: 600 }}>{fmt(v.monto)}</td>
                      </tr>
                    ))}
                  </Fragment>))}
                </Fragment>))}
              </Fragment>))}
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
