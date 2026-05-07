'use client'
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { dbHip } from '@/lib/supabase'
import { PrintBar } from './utils'

type Caballo = { id: number; nombre: string }

type Servicio = {
  id: number
  id_caballo_fk: number
  id_tipo_servicio_fk: number | null
  tipo: string
  descripcion: string
  fecha: string
  proveedor: string | null
  costo: number | null
  cobrar_arrendatario: boolean
  notas: string | null
  cat_caballos?: { nombre: string }
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

const TIPOS = ['veterinario', 'herraje', 'alimento', 'otro'] as const

const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmt$ = (v: number | null) => '$' + (v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
const labelTipo = (tipo: string) => tipo.charAt(0).toUpperCase() + tipo.slice(1)
const tipoRank = (tipo: string) => {
  const idx = TIPOS.findIndex(t => t === tipo)
  return idx >= 0 ? idx : 999
}

type GrupoTipo = {
  tipo: string
  servicios: Servicio[]
  total: number
}

type GrupoCaballo = {
  caballoId: number
  caballo: string
  tipos: GrupoTipo[]
  total: number
  cantidad: number
}

export default function ReporteHipicoServicios() {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().split('T')[0]
  const fin    = hoy.toISOString().split('T')[0]

  const [caballos, setCaballos] = useState<Caballo[]>([])

  const [idCaballo, setIdCaballo] = useState<number | ''>('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [fechaDesde, setFechaDesde] = useState(inicio)
  const [fechaHasta, setFechaHasta] = useState(fin)

  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading]     = useState(false)
  const [buscado, setBuscado]     = useState(false)

  useEffect(() => {
    dbHip.from('cat_caballos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }: any) => setCaballos(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true)
    let q = dbHip
      .from('ctrl_servicios')
      .select('id, id_caballo_fk, id_tipo_servicio_fk, tipo, descripcion, fecha, proveedor, costo, cobrar_arrendatario, notas, cat_caballos(nombre), cat_tipos_servicio(nombre)')
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('id_caballo_fk', { ascending: true })
      .order('tipo', { ascending: true })
      .order('fecha', { ascending: false })
    if (idCaballo !== '') q = q.eq('id_caballo_fk', idCaballo)
    if (filtroTipo)       q = q.eq('tipo', filtroTipo)
    const { data } = await q
    const ordered = ((data as unknown as Servicio[]) ?? []).sort((a, b) => {
      const horseA = (a.cat_caballos?.nombre ?? '').toLowerCase()
      const horseB = (b.cat_caballos?.nombre ?? '').toLowerCase()
      if (horseA !== horseB) return horseA.localeCompare(horseB)
      const rank = tipoRank(a.tipo) - tipoRank(b.tipo)
      if (rank !== 0) return rank
      return b.fecha.localeCompare(a.fecha)
    })
    setServicios(ordered)
    setLoading(false)
  }, [idCaballo, filtroTipo, fechaDesde, fechaHasta])

  const grupos = useMemo<GrupoCaballo[]>(() => {
    const byCaballo = new Map<number, GrupoCaballo>()
    servicios.forEach((sv) => {
      const caballoId = sv.id_caballo_fk
      const caballoNom = sv.cat_caballos?.nombre ?? `Caballo #${sv.id_caballo_fk}`

      if (!byCaballo.has(caballoId)) {
        byCaballo.set(caballoId, {
          caballoId,
          caballo: caballoNom,
          tipos: [],
          total: 0,
          cantidad: 0,
        })
      }

      const grpCab = byCaballo.get(caballoId)!
      let grpTipo = grpCab.tipos.find(t => t.tipo === sv.tipo)
      if (!grpTipo) {
        grpTipo = { tipo: sv.tipo, servicios: [], total: 0 }
        grpCab.tipos.push(grpTipo)
      }

      grpTipo.servicios.push(sv)
      grpTipo.total += Number(sv.costo ?? 0)
      grpCab.total += Number(sv.costo ?? 0)
      grpCab.cantidad += 1
    })

    return Array.from(byCaballo.values())
      .map(g => ({
        ...g,
        tipos: g.tipos.sort((a, b) => {
          const rank = tipoRank(a.tipo) - tipoRank(b.tipo)
          if (rank !== 0) return rank
          return a.tipo.localeCompare(b.tipo)
        }),
      }))
      .sort((a, b) => a.caballo.localeCompare(b.caballo))
  }, [servicios])

  const totalCosto       = servicios.reduce((s, sv) => s + Number(sv.costo ?? 0), 0)
  const totalFacturable  = servicios.filter(sv => sv.cobrar_arrendatario).reduce((s, sv) => s + Number(sv.costo ?? 0), 0)
  const caballosConServicios = grupos.length
  const countPorTipo     = Object.fromEntries(
    TIPOS.map(t => [
      t, servicios.filter(sv => sv.tipo === t).length
    ])
  )

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Caballo</label>
          <select className="input" value={idCaballo} onChange={e => setIdCaballo(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todos</option>
            {caballos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo de servicio</label>
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Todos</option>
            {TIPOS.map(t => (
              <option key={t} value={t}>{TIPO_ICON[t]} {labelTipo(t)}</option>
            ))}
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
          <div className="print-only" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Servicios de Caballos por Tipo — Módulo Hípico</h2>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>
              {fmtFecha(fechaDesde)} al {fmtFecha(fechaHasta)}
            </p>
          </div>

          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ flex: '1 1 120px', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Total servicios</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{servicios.length}</div>
            </div>
            <div className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Caballos con servicios</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f766e' }}>{caballosConServicios}</div>
            </div>
            <div className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Costo total</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{fmt$(totalCosto)}</div>
            </div>
            <div className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Facturable a arrendatario</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#b45309' }}>{fmt$(totalFacturable)}</div>
            </div>
            {TIPOS.map(t => (
              <div key={t} className="card" style={{ flex: '1 1 100px', padding: '12px 16px',
                borderLeft: `3px solid ${TIPO_COLOR[t].color}` }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{TIPO_ICON[t]} {labelTipo(t)}</div>
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
                    {['Caballo / Tipo / Servicio', 'Fecha', 'Proveedor', 'Facturable', 'Costo'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((gc) => (
                    <Fragment key={`cab-group-${gc.caballoId}`}>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: '#f1f5f9' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {gc.caballo}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>
                            ({gc.cantidad} servicio{gc.cantidad !== 1 ? 's' : ''})
                          </span>
                        </td>
                        <td colSpan={3}></td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt$(gc.total)}</td>
                      </tr>

                      {gc.tipos.map((gt) => {
                        const tc = TIPO_COLOR[gt.tipo] ?? TIPO_COLOR.otro
                        return (
                          <Fragment key={`tipo-group-${gc.caballoId}-${gt.tipo}`}>
                            <tr style={{ borderBottom: '1px solid var(--border)', background: tc.bg }}>
                              <td style={{ padding: '8px 12px 8px 30px' }}>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700, background: '#fff', color: tc.color, border: `1px solid ${tc.color}33` }}>
                                  {TIPO_ICON[gt.tipo] ?? '📋'} {labelTipo(gt.tipo)}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                                  ({gt.servicios.length} servicio{gt.servicios.length !== 1 ? 's' : ''})
                                </span>
                              </td>
                              <td colSpan={3}></td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: tc.color }}>{fmt$(gt.total)}</td>
                            </tr>

                            {gt.servicios.map((sv) => (
                              <tr key={sv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 12px 8px 52px', color: 'var(--text-primary)' }}>
                                  {sv.cat_tipos_servicio?.nombre ? (
                                    <div style={{ fontWeight: 600 }}>{sv.cat_tipos_servicio.nombre}</div>
                                  ) : null}
                                  <div>{sv.descripcion}</div>
                                  {sv.notas && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{sv.notas}</div>}
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(sv.fecha)}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{sv.proveedor ?? '—'}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  {sv.cobrar_arrendatario
                                    ? <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>✓</span>
                                    : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                                </td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(sv.costo)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                    <td colSpan={4} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL GENERAL</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt$(totalCosto)}</td>
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
