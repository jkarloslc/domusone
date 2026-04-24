'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'

type Socio    = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null }
type Espacio  = { id: number; nombre: string }
type FormaJuego = { id: number; nombre: string }

type Acceso = {
  id: number
  fecha_entrada: string
  fecha_salida: string | null
  hoyo_inicio: number | null
  observaciones: string | null
  registrado_por: string | null
  cat_socios?: { numero_socio: string | null; nombre: string; apellido_paterno: string | null }
  cat_espacios_deportivos?: { nombre: string }
  cat_formas_juego?: { nombre: string }
  cat_familiares?: { nombre: string; apellido_paterno: string | null }
}

const fmtNombre = (s?: { nombre: string; apellido_paterno: string | null }) =>
  s ? [s.nombre, s.apellido_paterno].filter(Boolean).join(' ') : '—'

const fmtFecha = (d: string) =>
  new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtHora = (d: string) =>
  new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

export default function ReporteGolfAccesos() {
  const hoy = new Date()
  const hace30 = new Date(hoy); hace30.setDate(hoy.getDate() - 30)
  const [fechaDesde, setFechaDesde] = useState(hace30.toISOString().split('T')[0])
  const [fechaHasta, setFechaHasta] = useState(hoy.toISOString().split('T')[0])

  const [socios, setSocios] = useState<Socio[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [formasJuego, setFormasJuego] = useState<FormaJuego[]>([])

  const [filtroSocio, setFiltroSocio] = useState<number | ''>('')
  const [filtroEspacio, setFiltroEspacio] = useState<number | ''>('')
  const [filtroForma, setFiltroForma] = useState<number | ''>('')

  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)

  useEffect(() => {
    dbGolf.from('cat_socios').select('id, numero_socio, nombre, apellido_paterno').eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setSocios(data ?? []))
    dbGolf.from('cat_espacios_deportivos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }: any) => setEspacios(data ?? []))
    dbGolf.from('cat_formas_juego').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }: any) => setFormasJuego(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true)

    let q = dbGolf.from('ctrl_accesos')
      .select('id, fecha_entrada, fecha_salida, hoyo_inicio, observaciones, registrado_por, cat_socios(numero_socio, nombre, apellido_paterno), cat_espacios_deportivos(nombre), cat_formas_juego(nombre), cat_familiares(nombre, apellido_paterno)')
      .gte('fecha_entrada', fechaDesde + 'T00:00:00')
      .lte('fecha_entrada', fechaHasta + 'T23:59:59')
      .order('fecha_entrada', { ascending: false })

    if (filtroSocio   !== '') q = q.eq('id_socio_fk', filtroSocio)
    if (filtroEspacio !== '') q = q.eq('id_espacio_fk', filtroEspacio)
    if (filtroForma   !== '') q = q.eq('id_forma_juego_fk', filtroForma)

    const { data } = await q
    setAccesos((data as Acceso[]) ?? [])
    setLoading(false)
  }, [fechaDesde, fechaHasta, filtroSocio, filtroEspacio, filtroForma])

  // KPIs
  const sociosUnicos = new Set(accesos.map(a => a.cat_socios?.nombre)).size
  const porDia = accesos.reduce((acc, a) => {
    const dia = a.fecha_entrada.split('T')[0]
    acc[dia] = (acc[dia] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const diasConAcceso = Object.keys(porDia).length
  const promDia = diasConAcceso > 0 ? (accesos.length / diasConAcceso).toFixed(1) : '0'

  // Agrupación por espacio
  const porEspacio = accesos.reduce((acc, a) => {
    const esp = a.cat_espacios_deportivos?.nombre ?? 'Sin espacio'
    acc[esp] = (acc[esp] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Agrupación por forma de juego
  const porForma = accesos.reduce((acc, a) => {
    const f = a.cat_formas_juego?.nombre ?? 'Sin forma'
    acc[f] = (acc[f] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Socio</label>
          <select className="input" value={filtroSocio} onChange={e => setFiltroSocio(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 220 }}>
            <option value="">Todos</option>
            {socios.map(s => <option key={s.id} value={s.id}>{s.numero_socio ? `${s.numero_socio} — ` : ''}{fmtNombre(s)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Espacio</label>
          <select className="input" value={filtroEspacio} onChange={e => setFiltroEspacio(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todos</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Forma de Juego</label>
          <select className="input" value={filtroForma} onChange={e => setFiltroForma(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todas</option>
            {formasJuego.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
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
              { label: 'Total Rondas',    value: accesos.length.toString(), color: '#2563eb', bg: '#eff6ff' },
              { label: 'Socios Únicos',   value: sociosUnicos.toString(),   color: '#7c3aed', bg: '#f5f3ff' },
              { label: 'Días con accesos',value: diasConAcceso.toString(),  color: '#0891b2', bg: '#ecfeff' },
              { label: 'Promedio / día',  value: promDia,                   color: '#16a34a', bg: '#f0fdf4' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 120px', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Mini-resúmenes por espacio y forma de juego */}
          {accesos.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              {/* Por espacio */}
              <div className="card" style={{ flex: '1 1 220px', padding: '14px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Por Espacio</div>
                {Object.entries(porEspacio).sort(([,a],[,b]) => b-a).map(([esp, cnt]) => (
                  <div key={esp} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{esp}</span>
                    <span style={{ fontWeight: 700, color: '#2563eb', fontSize: 14 }}>{cnt}</span>
                  </div>
                ))}
              </div>
              {/* Por forma de juego */}
              <div className="card" style={{ flex: '1 1 220px', padding: '14px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Por Forma de Juego</div>
                {Object.entries(porForma).sort(([,a],[,b]) => b-a).map(([forma, cnt]) => (
                  <div key={forma} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{forma}</span>
                    <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 14 }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla detalle */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Detalle ({accesos.length} registros)
          </h3>
          {accesos.length === 0
            ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Sin accesos con los filtros seleccionados</div>
            : (
              <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      {['Fecha', 'Hora entrada', 'Hora salida', 'Socio / Familiar', 'Espacio', 'Forma Juego', 'Hoyo inicio', 'Observaciones'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {accesos.map((a, i) => {
                      const esFamiliar = !!a.cat_familiares
                      const nombreDisplay = esFamiliar
                        ? `👥 ${fmtNombre(a.cat_familiares)} (Familiar de ${fmtNombre(a.cat_socios)})`
                        : fmtNombre(a.cat_socios)
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(a.fecha_entrada)}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>{fmtHora(a.fecha_entrada)}</td>
                          <td style={{ padding: '9px 12px', color: a.fecha_salida ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                            {a.fecha_salida ? fmtHora(a.fecha_salida) : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', color: esFamiliar ? '#7c3aed' : 'var(--text-primary)', fontSize: 11 }}>{nombreDisplay}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>{a.cat_espacios_deportivos?.nombre ?? '—'}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>{a.cat_formas_juego?.nombre ?? '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {a.hoyo_inicio ?? '—'}
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11, maxWidth: 180 }}>{a.observaciones ?? '—'}</td>
                        </tr>
                      )
                    })}
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
