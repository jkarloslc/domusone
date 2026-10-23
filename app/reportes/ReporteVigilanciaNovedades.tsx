'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { RefreshCw, FileSpreadsheet, ClipboardList, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import KpiCard from '@/components/ui/KpiCard'
import { PrintBar } from './utils'
import { CRIT_COLOR } from '@/components/vigilancia/tipos'

type Fila = {
  id: number; fecha: string; mes: string; turno: string | null; hora: string | null
  tipo: string; clase: string; crit: string; status: string; lote: string | null; ubic: string[]
}
type ParteR = { id: number; fecha: string; status: string; visto_at: string | null }

type Tab = 'resumen' | 'ubicacion' | 'lote' | 'pendientes' | 'cumplimiento'
const TABS: [Tab, string][] = [
  ['resumen', 'Resumen'], ['ubicacion', 'Por ubicación'], ['lote', 'Por lote'],
  ['pendientes', 'Pendientes y antigüedad'], ['cumplimiento', 'Cumplimiento de partes'],
]
const CLASES = ['Incidencia', 'Acceso', 'Rutina']
const CLASE_COLOR: Record<string, string> = { Incidencia: '#dc2626', Acceso: '#2563eb', Rutina: '#64748b' }
const CRITS = ['Crítica', 'Alta', 'Media', 'Baja']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—')
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const diasEntre = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

// PostgREST corta en 1000 filas: se pagina hasta agotar
async function traerTodo(q: (de: number, a: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const out: any[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q(de, de + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

const Barra = ({ v, max, color = '#475569' }: { v: number; max: number; color?: string }) => (
  <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, minWidth: 80 }}>
    <div style={{ width: `${max ? (v / max) * 100 : 0}%`, height: 8, borderRadius: 4, background: color }} />
  </div>
)

export default function ReporteVigilanciaNovedades() {
  const anio = new Date().getFullYear()
  const [desde, setDesde] = useState(`${anio}-01-01`)
  const [hasta, setHasta] = useState(hoyISO())
  const [fClase, setFClase] = useState('')
  const [fTurno, setFTurno] = useState('')
  const [tab, setTab] = useState<Tab>('resumen')
  const [filas, setFilas] = useState<Fila[]>([])
  const [partes, setPartes] = useState<ParteR[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [tiposR, ubicR] = await Promise.all([
        dbCfg.from('vig_tipos_novedad').select('id, nombre, clase'),
        dbCfg.from('vig_ubicaciones').select('id, nombre'),
      ])
      const tipoMap = new Map((tiposR.data ?? []).map((t: any) => [t.id, t]))
      const ubicMap = new Map((ubicR.data ?? []).map((u: any) => [u.id, u.nombre]))

      const nov = await traerTodo((de, a) => dbCtrl.from('vig_novedades')
        .select('id, turno, hora, id_tipo_fk, criticidad, status, id_lote_fk, vig_partes!inner(fecha)')
        .gte('vig_partes.fecha', desde).lte('vig_partes.fecha', hasta).order('id').range(de, a))

      // visto_at existe tras la migración 20261023140000; si falta, se reporta sin él
      let pts: any[]
      try {
        pts = await traerTodo((de, a) => dbCtrl.from('vig_partes').select('id, fecha, status, visto_at')
          .gte('fecha', desde).lte('fecha', hasta).order('fecha').range(de, a))
      } catch {
        pts = (await traerTodo((de, a) => dbCtrl.from('vig_partes').select('id, fecha, status')
          .gte('fecha', desde).lte('fecha', hasta).order('fecha').range(de, a))).map(p => ({ ...p, visto_at: 'n/d' }))
      }

      const ids = new Set(nov.map(n => n.id))
      const nu = await traerTodo((de, a) => dbCtrl.from('vig_novedad_ubicaciones').select('id_novedad_fk, id_ubicacion_fk').range(de, a))
      const ubPorNov = new Map<number, string[]>()
      nu.forEach((r: any) => { if (ids.has(r.id_novedad_fk)) { const n = ubicMap.get(r.id_ubicacion_fk); if (n) ubPorNov.set(r.id_novedad_fk, [...(ubPorNov.get(r.id_novedad_fk) ?? []), n]) } })

      const loteIds = Array.from(new Set(nov.filter(n => n.id_lote_fk).map(n => n.id_lote_fk as number)))
      const loteMap = new Map<number, string>()
      for (let i = 0; i < loteIds.length; i += 200) {
        const { data } = await dbCat.from('lotes').select('id, cve_lote, lote').in('id', loteIds.slice(i, i + 200))
        ;(data ?? []).forEach((l: any) => loteMap.set(l.id, l.cve_lote ?? `#${l.lote}`))
      }

      setFilas(nov.map(n => {
        const t: any = tipoMap.get(n.id_tipo_fk)
        const fecha = n.vig_partes.fecha as string
        return { id: n.id, fecha, mes: fecha.slice(0, 7), turno: n.turno, hora: n.hora, tipo: t?.nombre ?? 'Sin tipo', clase: t?.clase ?? 'Incidencia',
          crit: n.criticidad, status: n.status, lote: n.id_lote_fk ? (loteMap.get(n.id_lote_fk) ?? `#${n.id_lote_fk}`) : null, ubic: ubPorNov.get(n.id) ?? [] }
      }))
      setPartes(pts)
    } catch (e: any) { setError(e.message ?? 'Error al consultar') }
    setLoading(false)
  }, [desde, hasta])
  useEffect(() => { fetchData() }, [fetchData])

  const datos = useMemo(() => filas.filter(f => (!fClase || f.clase === fClase) && (!fTurno || f.turno === fTurno)), [filas, fClase, fTurno])
  const total = datos.length
  const hoy = hoyISO()

  const contar = <K extends string>(key: (f: Fila) => K | K[] | null) => {
    const m = new Map<K, Fila[]>()
    datos.forEach(f => { const k = key(f); (Array.isArray(k) ? k : k ? [k] : []).forEach(x => m.set(x, [...(m.get(x) ?? []), f])) })
    return Array.from(m.entries()).map(([k, fs]) => ({ k, fs, n: fs.length })).sort((a, b) => b.n - a.n)
  }
  const graves = (fs: Fila[]) => fs.filter(f => f.crit === 'Alta' || f.crit === 'Crítica').length
  const abiertas = (fs: Fila[]) => fs.filter(f => f.status !== 'Cerrado').length

  const porClase  = contar(f => f.clase)
  const porTipo   = contar(f => f.tipo)
  const porCrit   = contar(f => f.crit)
  const porTurno  = contar(f => f.turno ?? 'Sin turno')
  const porUbic   = contar(f => (f.ubic.length ? f.ubic : null))
  const porLote   = contar(f => f.lote)
  const porMes    = contar(f => f.mes).sort((a, b) => a.k.localeCompare(b.k))
  const porHora   = Array.from({ length: 24 }, (_, h) => ({ h, n: datos.filter(f => f.hora && Number(f.hora.slice(0, 2)) === h).length }))
  const pend      = datos.filter(f => f.status !== 'Cerrado').map(f => ({ ...f, dias: diasEntre(f.fecha, hoy) })).sort((a, b) => b.dias - a.dias)
  const bandas    = [['0-7 días', 0, 7], ['8-30 días', 8, 30], ['31-90 días', 31, 90], ['+90 días', 91, 99999]] as [string, number, number][]

  const cumplimiento = useMemo(() => {
    const m = new Map<string, { dias: number; conParte: number; enviados: number; sinRevisar: number; novs: number }>()
    const fin = hasta < hoy ? hasta : hoy
    for (let d = new Date(desde + 'T12:00:00'); d.toISOString().slice(0, 10) <= fin; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 7)
      m.set(k, { ...(m.get(k) ?? { dias: 0, conParte: 0, enviados: 0, sinRevisar: 0, novs: 0 }), dias: (m.get(k)?.dias ?? 0) + 1 })
    }
    partes.forEach(p => { const x = m.get(p.fecha.slice(0, 7)); if (!x) return; x.conParte++
      if (p.status === 'Enviado/Cerrado') { x.enviados++; if (!p.visto_at) x.sinRevisar++ } })
    filas.forEach(f => { const x = m.get(f.mes); if (x) x.novs++ })
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [partes, filas, desde, hasta, hoy])

  const exportar = () => {
    const wb = XLSX.utils.book_new()
    const add = (n: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Sin_datos: '' }]), n)
    add('Por tipo', porTipo.map(t => ({ Tipo: t.k, Clase: t.fs[0].clase, Novedades: t.n, '%': pct(t.n, total), 'Alta/Crítica': graves(t.fs), Abiertas: abiertas(t.fs) })))
    add('Por clase', porClase.map(t => ({ Clase: t.k, Novedades: t.n, '%': pct(t.n, total), 'Alta/Crítica': graves(t.fs), Abiertas: abiertas(t.fs) })))
    add('Mensual', porMes.map(t => ({ Mes: mesLabel(t.k), Total: t.n, ...Object.fromEntries(CLASES.map(c => [c, t.fs.filter(f => f.clase === c).length])), 'Alta/Crítica': graves(t.fs), Abiertas: abiertas(t.fs) })))
    add('Por ubicación', porUbic.map(t => ({ Ubicación: t.k, Total: t.n, ...Object.fromEntries(CLASES.map(c => [c, t.fs.filter(f => f.clase === c).length])), 'Alta/Crítica': graves(t.fs), Abiertas: abiertas(t.fs) })))
    add('Por lote', porLote.map(t => ({ Lote: t.k, Novedades: t.n, 'Alta/Crítica': graves(t.fs), Abiertas: abiertas(t.fs) })))
    add('Pendientes', pend.map(f => ({ Fecha: f.fecha, Días: f.dias, Tipo: f.tipo, Criticidad: f.crit, Status: f.status, Lote: f.lote ?? '', Ubicación: f.ubic.join(', ') })))
    add('Cumplimiento', cumplimiento.map(([m, x]) => ({ Mes: mesLabel(m), 'Días del periodo': x.dias, 'Días con parte': x.conParte, 'Días sin parte': x.dias - x.conParte, Enviados: x.enviados, 'Sin revisar': x.sinRevisar, Novedades: x.novs })))
    XLSX.writeFile(wb, `Vigilancia-Novedades_${desde}_${hasta}.xlsx`)
  }

  const th = (t: string, right?: boolean) => <th style={{ textAlign: right ? 'right' : 'left' }}>{t}</th>
  const num = { textAlign: 'right' as const, fontSize: 13 }
  const critPill = (c: string) => <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: CRIT_COLOR[c]?.bg, color: CRIT_COLOR[c]?.color }}>{c}</span>

  const tablaRanking = (titulo: string, rows: { k: string; fs: Fila[]; n: number }[], opts?: { colorFn?: (k: string) => string; limite?: number; columnaClases?: boolean }) => {
    const lista = rows.slice(0, opts?.limite ?? 500)
    const max = lista[0]?.n ?? 0
    return (
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0' }}>{titulo}</div>
        <div className="table-wrapper"><table>
          <thead><tr>{th('')}{th('Novedades', true)}{th('%', true)}{opts?.columnaClases && CLASES.map(c => th(c, true))}{th('Alta/Crítica', true)}{th('Abiertas', true)}<th style={{ width: 140 }}></th></tr></thead>
          <tbody>
            {lista.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Sin datos</td></tr> : lista.map(r => (
              <tr key={r.k}>
                <td style={{ fontSize: 13, fontWeight: 500 }}>{r.k}</td>
                <td style={num}>{r.n}</td><td style={{ ...num, color: 'var(--text-muted)' }}>{pct(r.n, total)}</td>
                {opts?.columnaClases && CLASES.map(c => <td key={c} style={num}>{r.fs.filter(f => f.clase === c).length || '—'}</td>)}
                <td style={{ ...num, color: graves(r.fs) ? '#dc2626' : 'var(--text-muted)', fontWeight: graves(r.fs) ? 600 : 400 }}>{graves(r.fs) || '—'}</td>
                <td style={num}>{abiertas(r.fs) || '—'}</td>
                <td><Barra v={r.n} max={max} color={opts?.colorFn?.(r.k)} /></td>
              </tr>))}
          </tbody>
        </table></div>
      </div>)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" className="input" style={{ width: 150 }} value={desde} onChange={e => setDesde(e.target.value)} title="Desde" />
        <input type="date" className="input" style={{ width: 150 }} value={hasta} onChange={e => setHasta(e.target.value)} title="Hasta" />
        <select className="select" style={{ width: 140 }} value={fClase} onChange={e => setFClase(e.target.value)}>
          <option value="">Toda clase</option>{CLASES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="select" style={{ width: 130 }} value={fTurno} onChange={e => setFTurno(e.target.value)}>
          <option value="">Todo turno</option><option>Diurno</option><option>Mixto</option><option>Nocturno</option>
        </select>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        <div style={{ marginLeft: 'auto' }}>
          <PrintBar title="Novedades de Vigilancia" count={total} reportTitle={`Estadísticas de Novedades de Vigilancia · ${desde} a ${hasta}`} hideCSV
            extra={<button className="btn-secondary" onClick={exportar} disabled={loading}><FileSpreadsheet size={13} /> Exportar Excel</button>} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 600 : 400,
            color: tab === k ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === k ? '#475569' : 'transparent'}`, marginBottom: -1 }}>{l}</button>))}
      </div>

      {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div id="reporte-print-area">
        {tab === 'resumen' && <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Novedades', value: total, icon: ClipboardList, color: '#475569' },
              { label: 'Partes en el periodo', value: partes.length, icon: ClipboardList, color: '#475569' },
              { label: 'Promedio por parte', value: partes.length ? (filas.length / partes.length).toFixed(1) : '—', icon: ClipboardList, color: '#475569' },
              { label: '% Incidencias', value: pct(datos.filter(f => f.clase === 'Incidencia').length, total), icon: AlertTriangle, color: '#dc2626' },
              { label: 'Alta / Crítica', value: graves(datos), icon: AlertTriangle, color: '#ea580c' },
              { label: 'Sin cerrar', value: abiertas(datos), icon: Clock, color: '#d97706' },
            ].map(k => <div key={k.label} style={{ flex: '1 1 170px', maxWidth: 240 }}><KpiCard label={k.label} value={k.value} icon={k.icon} color={k.color} /></div>)}
          </div>
          {tablaRanking('Por clase', porClase, { colorFn: k => CLASE_COLOR[k] })}
          {tablaRanking('Por tipo de novedad', porTipo, { limite: 20 })}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {tablaRanking('Por criticidad', CRITS.map(c => porCrit.find(x => x.k === c) ?? { k: c, fs: [], n: 0 }), { colorFn: k => CRIT_COLOR[k]?.color })}
            {tablaRanking('Por turno', porTurno)}
          </div>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0' }}>Tendencia mensual</div>
            <div className="table-wrapper"><table>
              <thead><tr>{th('Mes')}{th('Total', true)}{CLASES.map(c => th(c, true))}{th('Alta/Crítica', true)}{th('Abiertas', true)}<th style={{ width: 160 }}></th></tr></thead>
              <tbody>{porMes.map(m => (
                <tr key={m.k}><td style={{ fontSize: 13 }}>{mesLabel(m.k)}</td><td style={num}>{m.n}</td>
                  {CLASES.map(c => <td key={c} style={num}>{m.fs.filter(f => f.clase === c).length || '—'}</td>)}
                  <td style={num}>{graves(m.fs) || '—'}</td><td style={num}>{abiertas(m.fs) || '—'}</td>
                  <td><Barra v={m.n} max={Math.max(...porMes.map(x => x.n))} /></td></tr>))}</tbody>
            </table></div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Distribución por hora del día</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110 }}>
              {porHora.map(x => (
                <div key={x.h} title={`${x.h}:00 — ${x.n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{x.n || ''}</div>
                  <div style={{ width: '100%', background: '#475569', borderRadius: '3px 3px 0 0', height: `${(x.n / Math.max(1, ...porHora.map(y => y.n))) * 80}px`, minHeight: x.n ? 2 : 0 }} />
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{x.h}</div>
                </div>))}
            </div>
          </div>
        </>}

        {tab === 'ubicacion' && tablaRanking('Novedades por ubicación (una novedad puede contar en varias ubicaciones)', porUbic, { columnaClases: true })}

        {tab === 'lote' && <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Solo incluye novedades ligadas a un lote ({datos.filter(f => f.lote).length} de {total}). Las anteriores a este módulo no traen lote.
          </div>
          {tablaRanking('Novedades por lote', porLote, { limite: 100 })}
        </>}

        {tab === 'pendientes' && <>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0' }}>Antigüedad de novedades sin cerrar (días desde la fecha del parte)</div>
            <div className="table-wrapper"><table>
              <thead><tr>{th('Antigüedad')}{CRITS.map(c => th(c, true))}{th('Total', true)}</tr></thead>
              <tbody>
                {bandas.map(([l, a, b]) => { const fs = pend.filter(p => p.dias >= a && p.dias <= b)
                  return <tr key={l}><td style={{ fontSize: 13 }}>{l}</td>{CRITS.map(c => <td key={c} style={num}>{fs.filter(f => f.crit === c).length || '—'}</td>)}<td style={{ ...num, fontWeight: 600 }}>{fs.length}</td></tr> })}
                <tr style={{ background: '#f8fafc', fontWeight: 600 }}><td style={{ fontSize: 13 }}>Total</td>{CRITS.map(c => <td key={c} style={num}>{pend.filter(f => f.crit === c).length || '—'}</td>)}<td style={num}>{pend.length}</td></tr>
              </tbody>
            </table></div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0' }}>Las 30 más antiguas sin cerrar</div>
            <div className="table-wrapper"><table id="reporte-table">
              <thead><tr>{th('Fecha')}{th('Días', true)}{th('Tipo')}{th('Ubicación / Lote')}{th('Crit.')}{th('Status')}</tr></thead>
              <tbody>{pend.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: '#15803d' }}><CheckCircle size={14} style={{ verticalAlign: -2 }} /> Sin pendientes</td></tr>
                : pend.slice(0, 30).map(f => (
                <tr key={f.id}><td style={{ fontSize: 12 }}>{new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-MX')}</td><td style={{ ...num, fontWeight: 600 }}>{f.dias}</td>
                  <td style={{ fontSize: 12 }}>{f.tipo}</td><td style={{ fontSize: 12 }}>{f.lote ?? (f.ubic.join(', ') || '—')}</td><td>{critPill(f.crit)}</td><td style={{ fontSize: 12 }}>{f.status}</td></tr>))}</tbody>
            </table></div>
          </div>
        </>}

        {tab === 'cumplimiento' && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0' }}>Partes del periodo por mes (se esperan 1 por día)</div>
            <div className="table-wrapper"><table>
              <thead><tr>{th('Mes')}{th('Días', true)}{th('Con parte', true)}{th('Sin parte', true)}{th('Cobertura', true)}{th('Enviados', true)}{th('Sin revisar', true)}{th('Novedades', true)}{th('Prom./parte', true)}</tr></thead>
              <tbody>{cumplimiento.map(([m, x]) => (
                <tr key={m}><td style={{ fontSize: 13 }}>{mesLabel(m)}</td><td style={num}>{x.dias}</td><td style={num}>{x.conParte}</td>
                  <td style={{ ...num, color: x.dias - x.conParte ? '#dc2626' : 'var(--text-muted)', fontWeight: x.dias - x.conParte ? 600 : 400 }}>{x.dias - x.conParte || '—'}</td>
                  <td style={num}>{pct(x.conParte, x.dias)}</td><td style={num}>{x.enviados}</td>
                  <td style={{ ...num, color: x.sinRevisar ? '#dc2626' : 'var(--text-muted)' }}>{x.sinRevisar || '—'}</td><td style={num}>{x.novs}</td>
                  <td style={num}>{x.conParte ? (x.novs / x.conParte).toFixed(1) : '—'}</td></tr>))}
                {(() => { const t = cumplimiento.reduce((a, [, x]) => ({ d: a.d + x.dias, p: a.p + x.conParte, e: a.e + x.enviados, s: a.s + x.sinRevisar, n: a.n + x.novs }), { d: 0, p: 0, e: 0, s: 0, n: 0 })
                  return <tr style={{ background: '#f8fafc', fontWeight: 600 }}><td style={{ fontSize: 13 }}>Total</td><td style={num}>{t.d}</td><td style={num}>{t.p}</td><td style={num}>{t.d - t.p}</td><td style={num}>{pct(t.p, t.d)}</td><td style={num}>{t.e}</td><td style={num}>{t.s}</td><td style={num}>{t.n}</td><td style={num}>{t.p ? (t.n / t.p).toFixed(1) : '—'}</td></tr> })()}
              </tbody>
            </table></div>
          </div>
        )}
      </div>
    </div>
  )
}
