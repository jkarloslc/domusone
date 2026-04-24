'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { PrintBar } from './utils'

type Arrendatario = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type Caballo      = { id: number; nombre: string; id_arrendatario_fk: number | null }
type TipoSvc      = { id: number; nombre: string; tipo: string }

type Servicio = {
  id: number
  tipo: string
  descripcion: string
  fecha: string
  proveedor: string | null
  costo: number
  cobrar_arrendatario: boolean
  notas: string | null
  cat_caballos?: { nombre: string }
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
  cat_tipos_servicio?: { nombre: string }
}

const TIPO_ICON: Record<string, string> = {
  veterinario: '🩺',
  herraje:     '🔨',
  alimento:    '🌾',
  otro:        '📋',
}

const TIPO_COLOR: Record<string, { bg: string; color: string }> = {
  veterinario: { bg: '#eff6ff', color: '#2563eb' },
  herraje:     { bg: '#fef9c3', color: '#ca8a04' },
  alimento:    { bg: '#f0fdf4', color: '#16a34a' },
  otro:        { bg: '#f8fafc', color: '#64748b' },
}

const fmtNombre = (a?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}
const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

export default function ReporteHipicoServicios() {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().split('T')[0]
  const fin    = hoy.toISOString().split('T')[0]

  const [arrendatarios, setArrendatarios] = useState<Arrendatario[]>([])
  const [caballos, setCaballos]           = useState<Caballo[]>([])
  const [tiposServ, setTiposServ]         = useState<TipoSvc[]>([])

  const [idArr, setIdArr]       = useState<number | ''>('')
  const [idCaballo, setIdCaballo] = useState<number | ''>('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [soloFacturar, setSoloFacturar] = useState(false)
  const [fechaDesde, setFechaDesde] = useState(inicio)
  const [fechaHasta, setFechaHasta] = useState(fin)

  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading]     = useState(false)
  const [buscado, setBuscado]     = useState(false)

  useEffect(() => {
    dbHip.from('cat_arrendatarios').select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
    dbHip.from('cat_caballos').select('id, nombre, id_arrendatario_fk').eq('activo', true).order('nombre')
      .then(({ data }: any) => setCaballos(data ?? []))
    dbHip.from('cat_tipos_servicio').select('id, nombre, tipo').eq('activo', true).order('nombre')
      .then(({ data }: any) => setTiposServ(data ?? []))
  }, [])

  // Caballos filtrados por arrendatario si está seleccionado
  const caballosFiltrados = idArr !== '' ? caballos.filter(c => c.id_arrendatario_fk === idArr) : caballos

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true)
    let q = dbHip
      .from('ctrl_servicios')
      .select('id, tipo, descripcion, fecha, proveedor, costo, cobrar_arrendatario, notas, cat_caballos(nombre), cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), cat_tipos_servicio(nombre)')
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: false })
    if (idArr !== '')     (q as any).eq('id_arrendatario_fk', idArr)
    if (idArr !== '')     q = q.eq('id_arrendatario_fk', idArr)
    if (idCaballo !== '') q = q.eq('id_caballo_fk', idCaballo)
    if (filtroTipo)       q = q.eq('tipo', filtroTipo)
    if (soloFacturar)     q = q.eq('cobrar_arrendatario', true)
    const { data } = await q
    setServicios((data as unknown as Servicio[]) ?? [])
    setLoading(false)
  }, [idArr, idCaballo, filtroTipo, soloFacturar, fechaDesde, fechaHasta])

  // Totales
  const totalCosto       = servicios.reduce((s, sv) => s + sv.costo, 0)
  const totalFacturable  = servicios.filter(sv => sv.cobrar_arrendatario).reduce((s, sv) => s + sv.costo, 0)
  const countPorTipo     = Object.fromEntries(
    ['veterinario', 'herraje', 'alimento', 'otro'].map(t => [
      t, servicios.filter(sv => sv.tipo === t).length
    ])
  )

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario</label>
          <select className="input" value={idArr} onChange={e => { setIdArr(e.target.value ? Number(e.target.value) : ''); setIdCaballo('') }}
            style={{ fontSize: 12, minWidth: 200 }}>
            <option value="">Todos</option>
            {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombre(a)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Caballo</label>
          <select className="input" value={idCaballo} onChange={e => setIdCaballo(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todos</option>
            {caballosFiltrados.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Todos</option>
            <option value="veterinario">🩺 Veterinario</option>
            <option value="herraje">🔨 Herraje</option>
            <option value="alimento">🌾 Alimento</option>
            <option value="otro">📋 Otro</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
          <input type="checkbox" id="soloFacturar" checked={soloFacturar} onChange={e => setSoloFacturar(e.target.checked)} style={{ accentColor: '#b45309' }} />
          <label htmlFor="soloFacturar" style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Solo facturables</label>
        </div>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && <PrintBar title="Servicios-Hipico" count={servicios.length} reportTitle="Servicios por Caballo — Módulo Hípico" />}
      </div>

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Aplica los filtros deseados y haz clic en Consultar
        </div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ flex: '1 1 120px', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Total servicios</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{servicios.length}</div>
            </div>
            <div className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Costo total</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{fmt$(totalCosto)}</div>
            </div>
            <div className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Facturable a arrendatario</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#b45309' }}>{fmt$(totalFacturable)}</div>
            </div>
            {(['veterinario', 'herraje', 'alimento', 'otro'] as const).map(t => (
              <div key={t} className="card" style={{ flex: '1 1 100px', padding: '12px 16px',
                borderLeft: `3px solid ${TIPO_COLOR[t].color}` }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{TIPO_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: TIPO_COLOR[t].color }}>{countPorTipo[t]}</div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          {servicios.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Sin servicios con los filtros seleccionados
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    {['Fecha', 'Caballo', 'Arrendatario', 'Tipo', 'Descripción', 'Proveedor', 'Costo', 'Facturable'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((sv, i) => {
                    const tc = TIPO_COLOR[sv.tipo] ?? TIPO_COLOR.otro
                    return (
                      <tr key={sv.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(sv.fecha)}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{sv.cat_caballos?.nombre ?? '—'}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>{fmtNombre(sv.cat_arrendatarios)}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: tc.bg, color: tc.color }}>
                            {TIPO_ICON[sv.tipo]} {sv.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>
                          {sv.descripcion}
                          {sv.notas && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{sv.notas}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{sv.proveedor ?? '—'}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(sv.costo)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          {sv.cobrar_arrendatario
                            ? <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>✓</span>
                            : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                    <td colSpan={6} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt$(totalCosto)}</td>
                    <td></td>
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
