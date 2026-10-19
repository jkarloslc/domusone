'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'

type Opcion = { id: number; nombre: string }

type Acomp = {
  id: number
  id_acceso_fk: number
  nombre: string
  es_externo: boolean
  origen_pago: 'PASE' | 'GREEN_FEE' | 'INTERCAMBIO' | null
  club_origen: string | null
  ctrl_accesos: {
    fecha_entrada: string
    id_socio_fk: number | null
    cat_socios: {
      numero_socio: string | null
      nombre: string
      apellido_paterno: string | null
      apellido_materno: string | null
      cat_categorias_socios: { nombre: string } | null
    } | null
  } | null
}

const TIPOS = ['Familiar', 'Invitado · Pase', 'Green Fee', 'Intercambio'] as const
type Tipo = typeof TIPOS[number]

const COLOR: Record<Tipo, { bg: string; color: string }> = {
  'Familiar':        { bg: '#eff6ff', color: '#1d4ed8' },
  'Invitado · Pase': { bg: '#fffbeb', color: '#d97706' },
  'Green Fee':       { bg: '#f0fdf4', color: '#16a34a' },
  'Intercambio':     { bg: '#fdf4ff', color: '#a21caf' },
}

function tipoAcomp(a: Acomp): Tipo {
  if (!a.es_externo) return 'Familiar'
  if (a.origen_pago === 'GREEN_FEE') return 'Green Fee'
  if (a.origen_pago === 'INTERCAMBIO') return 'Intercambio'
  return 'Invitado · Pase'
}

const vacio = (): Record<Tipo, number> => ({ 'Familiar': 0, 'Invitado · Pase': 0, 'Green Fee': 0, 'Intercambio': 0 })
const total = (r: Record<Tipo, number>) => TIPOS.reduce((s, t) => s + r[t], 0)

const TZ_MX = 'America/Mexico_City'
const fmtFecha = (d: string) =>
  new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ_MX })

const nombreSocio = (s: NonNullable<Acomp['ctrl_accesos']>['cat_socios']) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'

export default function ReporteGolfAcompanantes() {
  const hoy = new Date()
  const hace30 = new Date(hoy)
  hace30.setDate(hoy.getDate() - 30)

  const [fechaDesde, setFechaDesde] = useState(hace30.toISOString().split('T')[0])
  const [fechaHasta, setFechaHasta] = useState(hoy.toISOString().split('T')[0])
  const [categorias, setCategorias] = useState<Opcion[]>([])
  const [filtroCat, setFiltroCat] = useState<number | ''>('')
  const [filtroTipo, setFiltroTipo] = useState<Tipo | ''>('')

  const [rows, setRows] = useState<Acomp[]>([])
  const [salidas, setSalidas] = useState<{ id: number; fecha_entrada: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre').order('nombre')
      .then(({ data }: any) => setCategorias(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setBuscado(true)
    setError(null)
    try {
      let socioIds: number[] | null = null
      if (filtroCat !== '') {
        const { data, error: e } = await (dbGolf as any).from('cat_socios').select('id').eq('id_categoria_fk', filtroCat)
        if (e) throw e
        socioIds = (data ?? []).map((s: any) => s.id)
      }

      // Accesos del periodo (paginado: PostgREST limita a 1000 filas)
      const accesoIds: number[] = []
      const salidasTmp: { id: number; fecha_entrada: string }[] = []
      for (let from = 0; ; from += 1000) {
        let q = (dbGolf as any)
          .from('ctrl_accesos')
          .select('id, fecha_entrada')
          .gte('fecha_entrada', new Date(fechaDesde + 'T00:00:00').toISOString())
          .lte('fecha_entrada', new Date(fechaHasta + 'T23:59:59').toISOString())
          .range(from, from + 999)
        if (socioIds !== null) q = q.in('id_socio_fk', socioIds.length ? socioIds : [-1])
        const { data, error: e } = await q
        if (e) throw e
        accesoIds.push(...(data ?? []).map((r: any) => r.id))
        salidasTmp.push(...(data ?? []))
        if ((data ?? []).length < 1000) break
      }

      const out: Acomp[] = []
      for (let i = 0; i < accesoIds.length; i += 200) {
        const { data, error: e } = await (dbGolf as any)
          .from('ctrl_acceso_acomp')
          .select(
            'id, id_acceso_fk, nombre, es_externo, origen_pago, club_origen, ' +
            'ctrl_accesos(fecha_entrada, id_socio_fk, cat_socios(numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre)))'
          )
          .in('id_acceso_fk', accesoIds.slice(i, i + 200))
        if (e) throw e
        out.push(...(data ?? []))
      }
      setRows(out)
      setSalidas(salidasTmp)
    } catch (err: any) {
      setError(err?.message ?? 'Error al consultar')
      setRows([])
      setSalidas([])
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta, filtroCat])

  const filtradas = filtroTipo ? rows.filter(r => tipoAcomp(r) === filtroTipo) : rows

  // Totales por tipo (los KPIs ignoran el filtro de tipo para ver la distribución)
  const porTipo = vacio()
  rows.forEach(r => { porTipo[tipoAcomp(r)]++ })
  const totalGlobal = total(porTipo)

  // Por categoría de socio y por socio
  const porCat: Record<string, Record<Tipo, number>> = {}
  const porSocio: Record<string, { socio: string; cat: string; t: Record<Tipo, number> }> = {}
  filtradas.forEach(r => {
    const s = r.ctrl_accesos?.cat_socios ?? null
    const cat = s?.cat_categorias_socios?.nombre ?? 'Sin categoría'
    const tipo = tipoAcomp(r)
    ;(porCat[cat] ??= vacio())[tipo]++
    const key = String(r.ctrl_accesos?.id_socio_fk ?? 'x')
    const ent = (porSocio[key] ??= {
      socio: s ? `${s.numero_socio ? s.numero_socio + ' — ' : ''}${nombreSocio(s)}` : 'Sin socio',
      cat, t: vacio(),
    })
    ent.t[tipo]++
  })
  const catRows = Object.entries(porCat).sort((a, b) => a[0].localeCompare(b[0]))
  const socioRows = Object.values(porSocio).sort((a, b) => total(b.t) - total(a.t))
  const totFiltrado = vacio()
  filtradas.forEach(r => { totFiltrado[tipoAcomp(r)]++ })

  // Agrupación por mes (hora de México): salidas y acompañantes por tipo
  const mesDe = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ_MX }).slice(0, 7)
  const porMes: Record<string, { salidas: number; t: Record<Tipo, number> }> = {}
  const idsFiltro = filtroTipo ? new Set(filtradas.map(r => r.id_acceso_fk)) : null
  salidas.forEach(a => {
    if (idsFiltro && !idsFiltro.has(a.id)) return
    ;(porMes[mesDe(a.fecha_entrada)] ??= { salidas: 0, t: vacio() }).salidas++
  })
  filtradas.forEach(r => {
    const f = r.ctrl_accesos?.fecha_entrada
    if (!f) return
    ;(porMes[mesDe(f)] ??= { salidas: 0, t: vacio() }).t[tipoAcomp(r)]++
  })
  const mesRows = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0]))
  const totSalidas = mesRows.reduce((s, [, v]) => s + v.salidas, 0)
  const fmtMes = (ym: string) => {
    const [y, m] = ym.split('-')
    const n = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-MX', { month: 'long' })
    return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`
  }

  const th: React.CSSProperties = { textAlign: 'right' }
  const pct = (n: number) => (totalGlobal ? ((n / totalGlobal) * 100).toFixed(1) + '%' : '—')

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha hasta</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Categoría de socio</label>
          <select className="input" value={filtroCat} onChange={e => setFiltroCat(e.target.value ? Number(e.target.value) : '')} style={{ fontSize: 12, minWidth: 180 }}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo de acompañante</label>
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as Tipo | '')} style={{ fontSize: 12, minWidth: 170 }}>
            <option value="">Todos</option>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && (
          <PrintBar title="Salidas-Campo-Acompanantes" count={filtradas.length} reportTitle="Salidas al Campo por Tipo de Acompañante" />
        )}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {buscado && !loading && !error && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {TIPOS.map(t => (
              <div key={t} className="card" style={{ flex: '1 1 160px', maxWidth: 240, padding: '12px 16px', borderLeft: `4px solid ${COLOR[t].color}` }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: COLOR[t].color }}>{porTipo[t]}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct(porTipo[t])} del total</div>
              </div>
            ))}
            <div className="card" style={{ flex: '1 1 160px', maxWidth: 240, padding: '12px 16px', borderLeft: '4px solid #0f172a' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total acompañantes</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{totalGlobal}</div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 20 }}>
            <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>Por mes</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Mes</th>
                  <th style={th}>Salidas</th>
                  {TIPOS.map(t => <th key={t} style={th}>{t}</th>)}
                  <th style={th}>Total acomp.</th>
                </tr>
              </thead>
              <tbody>
                {mesRows.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Sin salidas en el periodo</td></tr>
                )}
                {mesRows.map(([ym, v]) => (
                  <tr key={ym}>
                    <td>{fmtMes(ym)}</td>
                    <td style={th}>{v.salidas}</td>
                    {TIPOS.map(t => <td key={t} style={th}>{v.t[t] || '—'}</td>)}
                    <td style={{ ...th, fontWeight: 600 }}>{total(v.t)}</td>
                  </tr>
                ))}
                {mesRows.length > 0 && (
                  <tr style={{ fontWeight: 700, background: 'var(--bg-subtle, #f8fafc)' }}>
                    <td>Total</td>
                    <td style={th}>{totSalidas}</td>
                    {TIPOS.map(t => <td key={t} style={th}>{totFiltrado[t]}</td>)}
                    <td style={th}>{total(totFiltrado)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card" id="reporte-print-area" style={{ padding: 0, overflow: 'auto', marginBottom: 20 }}>
            <table id="reporte-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Categoría de socio</th>
                  {TIPOS.map(t => <th key={t} style={th}>{t}</th>)}
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {catRows.map(([cat, v]) => (
                  <tr key={cat}>
                    <td>{cat}</td>
                    {TIPOS.map(t => <td key={t} style={th}>{v[t] || '—'}</td>)}
                    <td style={{ ...th, fontWeight: 600 }}>{total(v)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: 'var(--bg-subtle, #f8fafc)' }}>
                  <td>Total</td>
                  {TIPOS.map(t => <td key={t} style={th}>{totFiltrado[t]}</td>)}
                  <td style={th}>{total(totFiltrado)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>Detalle por socio</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Socio</th>
                  <th style={{ textAlign: 'left' }}>Categoría</th>
                  {TIPOS.map(t => <th key={t} style={th}>{t}</th>)}
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {socioRows.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Sin acompañantes en el periodo</td></tr>
                )}
                {socioRows.map((s, i) => (
                  <tr key={i}>
                    <td>{s.socio}</td>
                    <td>{s.cat}</td>
                    {TIPOS.map(t => <td key={t} style={th}>{s.t[t] || '—'}</td>)}
                    <td style={{ ...th, fontWeight: 600 }}>{total(s.t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
