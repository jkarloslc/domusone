'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'

type Categoria = { id: number; nombre: string }

type Cuota = {
  id: number
  tipo: string
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  status: string
  fecha_emision: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  cat_socios?: { numero_socio: string | null; nombre: string; apellido_paterno: string | null; cat_categorias_socios?: { nombre: string } }
}

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtNombreSocio = (s?: { numero_socio: string | null; nombre: string; apellido_paterno: string | null }) => {
  if (!s) return '—'
  const num = s.numero_socio ? `${s.numero_socio} — ` : ''
  return num + [s.nombre, s.apellido_paterno].filter(Boolean).join(' ')
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'PENDIENTE': { bg: '#fef9c3', color: '#ca8a04' },
  'PAGADO':    { bg: '#dcfce7', color: '#16a34a' },
  'CANCELADO': { bg: '#f8fafc', color: '#64748b' },
}

const TIPO_LABEL: Record<string, string> = {
  INSCRIPCION:     'Inscripción',
  MENSUALIDAD:     'Mensualidad',
  PENSION_CARRITO: 'Pensión Carrito',
}

const TIPOS = ['INSCRIPCION', 'MENSUALIDAD', 'PENSION_CARRITO']
const STATUSES = ['PENDIENTE', 'PAGADO', 'CANCELADO']

export default function ReporteGolfCobranza() {
  const hoy = new Date()
  const inicioAnio = `${hoy.getFullYear()}-01-01`
  const hoyStr = hoy.toISOString().split('T')[0]

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('PENDIENTE')
  const [filtroPeriodo, setFiltroPeriodo] = useState('')
  const [fechaDesde, setFechaDesde] = useState(inicioAnio)
  const [fechaHasta, setFechaHasta] = useState(hoyStr)

  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }: any) => setCategorias(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true)
    let q = dbGolf.from('cxc_golf')
      .select('id, tipo, concepto, periodo, monto_original, descuento, monto_final, status, fecha_emision, fecha_vencimiento, fecha_pago, cat_socios(numero_socio, nombre, apellido_paterno, cat_categorias_socios(nombre))')
      .gte('fecha_emision', fechaDesde)
      .lte('fecha_emision', fechaHasta)
      .order('fecha_emision', { ascending: false })

    if (filtroTipo)   q = q.eq('tipo', filtroTipo)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    if (filtroPeriodo) q = q.eq('periodo', filtroPeriodo)

    const { data } = await q
    let resultado = (data as Cuota[]) ?? []

    // Filtro por categoría (post-fetch porque viene en join anidado)
    if (filtroCategoria) {
      resultado = resultado.filter(c =>
        (c.cat_socios?.cat_categorias_socios as any)?.nombre === filtroCategoria ||
        String((c.cat_socios?.cat_categorias_socios as any)?.id) === filtroCategoria
      )
    }

    setCuotas(resultado)
    setLoading(false)
  }, [fechaDesde, fechaHasta, filtroTipo, filtroStatus, filtroPeriodo, filtroCategoria])

  // KPIs
  const totalCargado  = cuotas.reduce((s, c) => s + c.monto_final, 0)
  const totalPendiente = cuotas.filter(c => c.status === 'PENDIENTE').reduce((s, c) => s + c.monto_final, 0)
  const totalPagado   = cuotas.filter(c => c.status === 'PAGADO').reduce((s, c) => s + c.monto_final, 0)
  const totalVencido  = cuotas.filter(c => c.status === 'PENDIENTE' && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date()).reduce((s, c) => s + c.monto_final, 0)
  const countVencido  = cuotas.filter(c => c.status === 'PENDIENTE' && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date()).length

  // Agrupar por categoría para vista de resumen
  const porCategoria = cuotas.reduce((acc, c) => {
    const cat = (c.cat_socios?.cat_categorias_socios as any)?.nombre ?? 'Sin categoría'
    if (!acc[cat]) acc[cat] = { pendiente: 0, pagado: 0, cancelado: 0, count: 0 }
    acc[cat].count++
    if (c.status === 'PENDIENTE') acc[cat].pendiente += c.monto_final
    if (c.status === 'PAGADO')    acc[cat].pagado    += c.monto_final
    if (c.status === 'CANCELADO') acc[cat].cancelado += c.monto_final
    return acc
  }, {} as Record<string, { pendiente: number; pagado: number; cancelado: number; count: number }>)

  // Períodos únicos para filtro rápido
  const periodosUnicos = Array.from(new Set(cuotas.map(c => c.periodo).filter(Boolean))).sort()

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Categoría</label>
          <select className="input" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ fontSize: 12, minWidth: 180 }}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Todos</option>
            {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
          <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Todos</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Período (YYYY-MM)</label>
          <input className="input" type="month" value={filtroPeriodo.slice(0, 7)}
            onChange={e => setFiltroPeriodo(e.target.value ? e.target.value : '')}
            style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Emisión desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && <PrintBar targetId="reporte-print-area" />}
      </div>

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Aplica filtros y haz clic en Consultar
        </div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total cuotas',  value: cuotas.length.toString(), color: '#2563eb', bg: '#eff6ff' },
              { label: 'Total monto',   value: fmt$(totalCargado),       color: '#334155', bg: '#f8fafc' },
              { label: 'Pendiente',     value: fmt$(totalPendiente),     color: '#ca8a04', bg: '#fefce8' },
              { label: 'Cobrado',       value: fmt$(totalPagado),        color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Vencido',       value: fmt$(totalVencido),       color: '#dc2626', bg: '#fef2f2',
                sub: countVencido > 0 ? `${countVencido} cuota${countVencido !== 1 ? 's' : ''}` : undefined },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 130px', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 10, color: k.color, marginTop: 1 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Resumen por categoría */}
          {Object.keys(porCategoria).length > 1 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
                Resumen por Categoría
              </h3>
              <div className="card" style={{ overflow: 'hidden', padding: 0, marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      {['Categoría', '# Cuotas', 'Pendiente', 'Cobrado', 'Cancelado'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(porCategoria).sort(([a], [b]) => a.localeCompare(b)).map(([cat, vals], i) => (
                      <tr key={cat} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{cat}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{vals.count}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: vals.pendiente > 0 ? '#ca8a04' : 'var(--text-muted)' }}>{fmt$(vals.pendiente)}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#16a34a' }}>{fmt$(vals.pagado)}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{vals.cancelado > 0 ? fmt$(vals.cancelado) : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700 }}>{cuotas.length}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#ca8a04' }}>{fmt$(totalPendiente)}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(totalPagado)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Detalle */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Detalle ({cuotas.length} cuotas)
          </h3>
          {cuotas.length === 0
            ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Sin resultados</div>
            : (
              <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      {['Socio', 'Categoría', 'Tipo', 'Concepto', 'Período', 'Emisión', 'Vencimiento', 'Monto', 'Status'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cuotas.map((c, i) => {
                      const sc = STATUS_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
                      const vencida = c.status === 'PENDIENTE' && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date()
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontSize: 11 }}>{fmtNombreSocio(c.cat_socios)}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11 }}>
                            {(c.cat_socios?.cat_categorias_socios as any)?.nombre ?? '—'}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                              {TIPO_LABEL[c.tipo] ?? c.tipo}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{c.concepto}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{c.periodo ?? '—'}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(c.fecha_emision)}</td>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: vencida ? '#dc2626' : 'var(--text-muted)', fontWeight: vencida ? 600 : 400 }}>
                            {fmtFecha(c.fecha_vencimiento)}
                          </td>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(c.monto_final)}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status}</span>
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                      <td colSpan={7} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt$(totalCargado)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}
