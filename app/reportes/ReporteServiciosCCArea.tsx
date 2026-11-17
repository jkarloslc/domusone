'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { tablasAmbito } from '@/lib/ambito'
import { useZonas, SelectZona } from '@/lib/zonas'
import { PrintBar } from './utils'
import KpiCard from '@/components/ui/KpiCard'
import { RefreshCw, Filter, ChevronDown, ChevronRight, Download, Wallet, Zap, Droplets, Flame, Gauge } from 'lucide-react'

// Servicios del Club (CFE / Agua / Gas LP, tablas originales de Mantto. Campo)
// agrupados Centro de Costo → Área → detalle de periodos.
// CC y Área salen del catálogo del servicio (el CC se deriva del Área si falta).
const T = tablasAmbito('campo')

type Servicio = {
  id: number; no_servicio: string; ubicacion: string | null; tipo_servicio: string
  id_centro_costo_fk: number | null; id_area_fk: number | null; activo: boolean
}
type Registro = {
  id: number; id_servicio_fk: number; fecha_inicio: string; fecha_fin: string | null
  consumo_periodo: number | null; monto_periodo: number | null; id_op_fk: number | null
}
type Fila = Registro & { srv: Servicio; cc: number | null; area: number | null; folioOP: string | null }
type Sumas = { monto: number; kwh: number; m3: number; litros: number; periodos: number; servicios: Set<number> }
type ArBucket = Sumas & { id: number | null; nombre: string; filas: Fila[] }
type CCBucket = Sumas & { id: number | null; nombre: string; areas: Record<string, ArBucket> }

const TIPOS = ['CFE', 'Agua', 'Gas LP'] as const
const UNIDAD: Record<string, string> = { CFE: 'kWh', Agua: 'm³', 'Gas LP': 'L' }
const vacio = (): Sumas => ({ monto: 0, kwh: 0, m3: 0, litros: 0, periodos: 0, servicios: new Set() })
const sumar = (b: Sumas, f: Fila) => {
  const c = Number(f.consumo_periodo ?? 0)
  b.monto += Number(f.monto_periodo ?? 0)
  b.periodos += 1
  b.servicios.add(f.srv.id)
  if (f.srv.tipo_servicio === 'CFE') b.kwh += c
  else if (f.srv.tipo_servicio === 'Agua') b.m3 += c
  else if (f.srv.tipo_servicio === 'Gas LP') b.litros += c
}

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN = (n: number) => n ? n.toLocaleString('es-MX', { maximumFractionDigits: 0 }) : '—'
const fmtF = (s: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const num  = { fontVariantNumeric: 'tabular-nums' as const, textAlign: 'right' as const }

export default function ReporteServiciosCCArea() {
  const anio = new Date().getFullYear()
  const [filas, setFilas]     = useState<Fila[]>([])
  const [ccs, setCcs]         = useState<{ id: number; nombre: string }[]>([])
  const [areas, setAreas]     = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCC, setFiltroCC]     = useState('')
  const [filtroZona, setFiltroZona] = useState('')
  const [filtroArea, setFiltroArea] = useState('')
  const [desde, setDesde]           = useState(`${anio}-01-01`)
  const [hasta, setHasta]           = useState(`${anio}-12-31`)
  const zonasCat = useZonas()
  useEffect(() => { if (!zonasCat.ccUsaZonas(filtroCC)) setFiltroZona('') }, [filtroCC, zonasCat])

  const [openCC, setOpenCC] = useState<Set<string>>(new Set())
  const [openAr, setOpenAr] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    const [rCC, rAr, rSrv] = await Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').order('nombre'),
      dbCtrl.from(T.servicios_catalogo).select('id, no_servicio, ubicacion, tipo_servicio, id_centro_costo_fk, id_area_fk, activo'),
    ])
    const err = rCC.error ?? rAr.error ?? rSrv.error
    if (err) { setError(err.message); setLoading(false); return }

    let q = dbCtrl.from(T.servicios_registros)
      .select('id, id_servicio_fk, fecha_inicio, fecha_fin, consumo_periodo, monto_periodo, id_op_fk')
      .order('fecha_inicio', { ascending: true })
    if (desde) q = q.gte('fecha_inicio', desde)
    if (hasta) q = q.lte('fecha_inicio', hasta)
    const { data: regs, error: eReg } = await q
    if (eReg) { setError(eReg.message); setLoading(false); return }

    const opIds = Array.from(new Set((regs ?? []).map((r: any) => r.id_op_fk).filter(Boolean)))
    const folios: Record<number, string> = {}
    if (opIds.length) {
      const { data: ops, error: eOp } = await dbComp.from('ordenes_pago').select('id, folio').in('id', opIds)
      if (eOp) { setError(eOp.message); setLoading(false); return }
      ;(ops ?? []).forEach((o: any) => { folios[o.id] = o.folio })
    }

    const arCC: Record<number, number> = {}
    ;(rAr.data ?? []).forEach((a: any) => { arCC[a.id] = a.id_centro_costo_fk })
    const srvMap: Record<number, Servicio> = {}
    ;(rSrv.data ?? []).forEach((s: any) => { srvMap[s.id] = s })

    const res: Fila[] = []
    for (const r of (regs ?? []) as Registro[]) {
      const srv = srvMap[r.id_servicio_fk]
      if (!srv) continue
      res.push({
        ...r, srv,
        cc: srv.id_centro_costo_fk ?? (srv.id_area_fk != null ? arCC[srv.id_area_fk] ?? null : null),
        area: srv.id_area_fk,
        folioOP: r.id_op_fk ? folios[r.id_op_fk] ?? null : null,
      })
    }
    setCcs(rCC.data ?? []); setAreas((rAr.data ?? []) as any)
    setFilas(res)
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => { fetchData() }, [fetchData])

  const ccMap = useMemo(() => Object.fromEntries(ccs.map(c => [c.id, c.nombre])), [ccs])
  const arMap = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a.nombre])), [areas])

  // Opciones de filtro: solo lo que aparece en los servicios del Club
  const ccsUsados   = useMemo(() => ccs.filter(c => filas.some(f => f.cc === c.id)), [ccs, filas])
  const areasUsadas = useMemo(() => areas.filter(a => filas.some(f => f.area === a.id && (!filtroCC || f.cc === Number(filtroCC)))
    && zonasCat.areaEnZona(filtroZona, a.id)), [areas, filas, filtroCC, filtroZona, zonasCat])

  const filtradas = useMemo(() => filas.filter(f => {
    if (filtroTipo && f.srv.tipo_servicio !== filtroTipo) return false
    if (filtroCC   && f.cc !== Number(filtroCC)) return false
    if (filtroZona && !zonasCat.areaEnZona(filtroZona, f.area)) return false
    if (filtroArea && f.area !== Number(filtroArea)) return false
    return true
  }), [filas, filtroTipo, filtroCC, filtroZona, filtroArea, zonasCat])

  const { grupos, total } = useMemo(() => {
    const res: Record<string, CCBucket> = {}
    const total = vacio()
    for (const f of filtradas) {
      const ck = f.cc != null ? String(f.cc) : 'sin'
      const ak = f.area != null ? String(f.area) : 'sin'
      const cc = (res[ck] ??= { ...vacio(), id: f.cc, nombre: f.cc != null ? (ccMap[f.cc] ?? `Centro #${f.cc}`) : 'Sin centro de costo', areas: {} })
      const ar = (cc.areas[ak] ??= { ...vacio(), id: f.area, nombre: f.area != null ? (arMap[f.area] ?? `Área #${f.area}`) : 'Sin área', filas: [] })
      ;[total, cc, ar].forEach(b => sumar(b, f))
      ar.filas.push(f)
    }
    // Detalle: por servicio y, dentro de cada uno, por fecha
    Object.values(res).forEach(cc => Object.values(cc.areas).forEach(ar => ar.filas.sort((a, b) =>
      a.srv.tipo_servicio.localeCompare(b.srv.tipo_servicio) || a.srv.no_servicio.localeCompare(b.srv.no_servicio) || a.fecha_inicio.localeCompare(b.fecha_inicio))))
    return { grupos: Object.values(res).sort((a, b) => b.monto - a.monto), total }
  }, [filtradas, ccMap, arMap])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setter(n)
  }
  const expandirTodo = () => {
    const c = new Set<string>(), a = new Set<string>()
    grupos.forEach(cc => {
      const ck = String(cc.id ?? 'sin'); c.add(ck)
      Object.values(cc.areas).forEach(ar => a.add(`${ck}:${ar.id ?? 'sin'}`))
    })
    setOpenCC(c); setOpenAr(a)
  }

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    const r2 = (n: number) => Math.round(n * 100) / 100
    const resumen: any[] = []
    grupos.forEach(cc => Object.values(cc.areas).forEach(ar => resumen.push({
      'Centro de Costo': cc.nombre, 'Área': ar.nombre, 'Servicios': ar.servicios.size, 'Periodos': ar.periodos,
      'kWh': ar.kwh, 'm³': ar.m3, 'Litros Gas LP': ar.litros, 'Monto': r2(ar.monto),
    })))
    resumen.push({ 'Centro de Costo': 'TOTAL', 'Servicios': total.servicios.size, 'Periodos': total.periodos,
      'kWh': total.kwh, 'm³': total.m3, 'Litros Gas LP': total.litros, 'Monto': r2(total.monto) })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')

    const detalle: any[] = []
    grupos.forEach(cc => Object.values(cc.areas).forEach(ar => ar.filas.forEach(f => detalle.push({
      'Centro de Costo': cc.nombre, 'Área': ar.nombre,
      'Tipo': f.srv.tipo_servicio, 'No. Servicio': f.srv.no_servicio, 'Ubicación': f.srv.ubicacion ?? '',
      'Inicio': f.fecha_inicio, 'Fin': f.fecha_fin ?? '',
      'Consumo': Number(f.consumo_periodo ?? 0), 'Unidad': UNIDAD[f.srv.tipo_servicio] ?? '',
      'Monto': Number(f.monto_periodo ?? 0), 'OP': f.folioOP ?? '',
    }))))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle')
    XLSX.writeFile(wb, `Servicios-Club-CC-Area_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const celdasSumas = (b: Sumas, peso: number, color: string, size = 12) => (
    <>
      <td style={{ ...num, fontSize: size, color: color === '#fff' ? '#C9CCD3' : 'var(--text-muted)' }}>{b.periodos}</td>
      <td style={{ ...num, fontSize: size, fontWeight: peso, color }}>{fmtN(b.kwh)}</td>
      <td style={{ ...num, fontSize: size, fontWeight: peso, color }}>{fmtN(b.m3)}</td>
      <td style={{ ...num, fontSize: size, fontWeight: peso, color }}>{fmtN(b.litros)}</td>
      <td style={{ ...num, fontSize: size, fontWeight: 700, color }}>{fmt(b.monto)}</td>
    </>
  )
  const consumoCol = (f: Fila, tipo: string) =>
    f.srv.tipo_servicio === tipo ? fmtN(Number(f.consumo_periodo ?? 0)) : ''

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ width: 140 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="select" style={{ width: 210 }} value={filtroCC} onChange={e => { setFiltroCC(e.target.value); setFiltroArea('') }}>
          <option value="">Todos los centros de costo</option>
          {ccsUsados.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {zonasCat.ccUsaZonas(filtroCC) && <SelectZona zonas={zonasCat.zonas} value={filtroZona} onChange={v => { setFiltroZona(v); setFiltroArea('') }} />}
        <select className="select" style={{ width: 190 }} value={filtroArea} onChange={e => setFiltroArea(e.target.value)}>
          <option value="">Todas las áreas{filtroCC ? ' del CC' : ''}</option>
          {areasUsadas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} title="Inicio de periodo desde" style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} title="Inicio de periodo hasta" style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Recargar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn-ghost" onClick={expandirTodo} style={{ fontSize: 12 }}>Expandir todo</button>
          <button className="btn-ghost" onClick={() => { setOpenCC(new Set()); setOpenAr(new Set()) }} style={{ fontSize: 12 }}>Colapsar</button>
        </div>
      </div>

      <PrintBar title="Servicios-Club-CC-Area" count={filtradas.length} reportTitle="Servicios del Club por CC / Área" hideCSV
        extra={<button className="btn-ghost" onClick={exportarExcel} disabled={!filtradas.length}><Download size={13} /> Exportar Excel</button>} />

      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #C23B3B', borderRadius: 6, color: '#C23B3B', fontSize: 12 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: '1 1 180px' }}><KpiCard label="Monto facturado" value={fmt(total.monto)} icon={Wallet} /></div>
        <div style={{ flex: '1 1 160px' }}><KpiCard label="Energía (kWh)" value={fmtN(total.kwh)} icon={Zap} tone="warning" /></div>
        <div style={{ flex: '1 1 160px' }}><KpiCard label="Agua (m³)" value={fmtN(total.m3)} icon={Droplets} tone="info" /></div>
        <div style={{ flex: '1 1 160px' }}><KpiCard label="Gas LP (L)" value={fmtN(total.litros)} icon={Flame} color="#A8501F" /></div>
        <div style={{ flex: '1 1 160px' }}><KpiCard label="Servicios con periodos" value={total.servicios.size} icon={Gauge} /></div>
      </div>

      <div id="reporte-print-area">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : grupos.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            Sin periodos de servicio para los filtros seleccionados
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Centro / Área / Servicio</th>
                  <th style={{ textAlign: 'left' }}>Tipo</th>
                  <th style={{ textAlign: 'left' }}>Ubicación</th>
                  <th style={{ textAlign: 'left' }}>Periodo</th>
                  <th style={{ textAlign: 'left' }}>OP</th>
                  <th style={{ textAlign: 'right' }}>Periodos</th>
                  <th style={{ textAlign: 'right' }}>kWh</th>
                  <th style={{ textAlign: 'right' }}>m³</th>
                  <th style={{ textAlign: 'right' }}>Litros</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(cc => {
                  const ck = String(cc.id ?? 'sin')
                  const ccOpen = openCC.has(ck)
                  return (
                    <Fragment key={`cc-${ck}`}>
                      <tr style={{ background: '#E6E8EB', cursor: 'pointer' }} onClick={() => toggle(openCC, setOpenCC, ck)}>
                        <td colSpan={5} style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {ccOpen ? <ChevronDown size={14} color="#1C1D21" /> : <ChevronRight size={14} color="#1C1D21" />}
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1D21' }}>{cc.nombre}</span>
                            <span style={{ fontSize: 11, color: '#4A4D54', background: '#F4F5F7', padding: '1px 8px', borderRadius: 20 }}>{cc.servicios.size} serv.</span>
                          </div>
                        </td>
                        {celdasSumas(cc, 700, '#1C1D21', 13)}
                      </tr>
                      {ccOpen && Object.values(cc.areas).sort((a, b) => b.monto - a.monto).map(ar => {
                        const ak = `${ck}:${ar.id ?? 'sin'}`
                        const arOpen = openAr.has(ak)
                        return (
                          <Fragment key={`ar-${ak}`}>
                            <tr style={{ background: '#F4F5F7', cursor: 'pointer' }} onClick={() => toggle(openAr, setOpenAr, ak)}>
                              <td colSpan={5} style={{ padding: '7px 12px 7px 32px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {arOpen ? <ChevronDown size={12} color="#62666E" /> : <ChevronRight size={12} color="#62666E" />}
                                  <span style={{ fontSize: 13, fontWeight: 600, color: ar.id == null ? '#7A7E87' : '#33363C' }}>{ar.nombre}</span>
                                  <span style={{ fontSize: 10, color: '#4A4D54', background: '#E6E8EB', padding: '1px 7px', borderRadius: 20 }}>{ar.servicios.size} serv.</span>
                                </div>
                              </td>
                              {celdasSumas(ar, 600, '#33363C')}
                            </tr>
                            {arOpen && ar.filas.map(f => (
                              <tr key={`rg-${f.id}`}>
                                <td style={{ paddingLeft: 56, fontSize: 12 }}>
                                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1C1D21' }}>{f.srv.no_servicio}</span>
                                  {!f.srv.activo && <span style={{ marginLeft: 6, fontSize: 10, color: '#fff', background: '#62666E', padding: '1px 6px', borderRadius: 4 }}>Inactivo</span>}
                                </td>
                                <td style={{ fontSize: 12 }}>{f.srv.tipo_servicio}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.srv.ubicacion ?? '—'}</td>
                                <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                  {fmtF(f.fecha_inicio)}{f.fecha_fin ? ` – ${fmtF(f.fecha_fin)}` : ''}
                                </td>
                                <td style={{ fontSize: 12, fontWeight: f.folioOP ? 700 : 400, fontVariantNumeric: 'tabular-nums', color: f.folioOP ? '#1C1D21' : '#9A9EA7' }}>{f.folioOP ?? 'Sin OP'}</td>
                                <td />
                                <td style={{ ...num, fontSize: 12 }}>{consumoCol(f, 'CFE')}</td>
                                <td style={{ ...num, fontSize: 12 }}>{consumoCol(f, 'Agua')}</td>
                                <td style={{ ...num, fontSize: 12 }}>{consumoCol(f, 'Gas LP')}</td>
                                <td style={{ ...num, fontSize: 12, fontWeight: 700 }}>{fmt(Number(f.monto_periodo ?? 0))}</td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  )
                })}
                <tr style={{ background: '#1C1D21' }}>
                  <td colSpan={5} style={{ padding: '10px 12px', color: '#fff', fontWeight: 700 }}>TOTAL GENERAL · {total.servicios.size} servicios</td>
                  {celdasSumas(total, 700, '#fff', 13)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
