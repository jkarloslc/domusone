'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { PrintBar } from './utils'

type Lugar = { id: number; nombre: string; tipo: string | null; capacidad: number | null }
type Ocup = {
  origen: 'Evento' | 'Bloqueo'; id_lugar: number; titulo: string; clase: string
  ini: string; fin: string; horaIni: string | null; horaFin: string | null; detalle: string
}
type Resumen = {
  lugar: Lugar; diasOcupados: number; pct: number; eventos: number; bloqueos: number
  diasEvento: number; diasBloqueo: number; empalmes: number
}

const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const horas = (a: string | null, b: string | null) => a ? `${a.slice(0, 5)}${b ? '–' + b.slice(0, 5) : ''}` : '—'

// Días (YYYY-MM-DD) que cubre un rango recortado al período
function diasDe(ini: string, fin: string, desde: string, hasta: string): string[] {
  const out: string[] = []
  let d = ini < desde ? desde : ini
  const f = fin > hasta ? hasta : fin
  while (d <= f) { out.push(d); d = addDays(d, 1) }
  return out
}

export default function ReporteOcupacionInstalaciones() {
  const hoy = new Date()
  const [desde, setDesde] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1).toLocaleDateString('en-CA'))
  const [hasta, setHasta] = useState(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toLocaleDateString('en-CA'))
  const [lugares, setLugares] = useState<Lugar[]>([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroLugar, setFiltroLugar] = useState<number | ''>('')
  const [filtroOrigen, setFiltroOrigen] = useState('')
  const [resumen, setResumen] = useState<Resumen[]>([])
  const [detalle, setDetalle] = useState<(Ocup & { lugar: string })[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)

  useEffect(() => {
    dbCtrl.from('cat_lugares').select('id, nombre, tipo, capacidad').eq('modulo', 'hipico').eq('activo', true).order('nombre')
      .then(({ data }: any) => setLugares(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    if (hasta < desde) return
    setLoading(true); setBuscado(true)
    const [{ data: ev }, { data: bl }] = await Promise.all([
      dbCtrl.from('eventos')
        .select('id, folio, nombre, id_lugar_fk, fecha_inicio, fecha_fin, hora_inicio, hora_fin, status, cat_tipos_evento(nombre)')
        .in('modulo', ['hospitality', 'hipico']).not('id_lugar_fk', 'is', null).neq('status', 'Cancelado')
        .lte('fecha_inicio', hasta),
      dbCtrl.from('lugares_ocupacion').select('*').lte('fecha_inicio', hasta).gte('fecha_fin', desde),
    ])
    const ocups: Ocup[] = [
      ...((ev as any[]) ?? []).map((e): Ocup => ({
        origen: 'Evento', id_lugar: e.id_lugar_fk, titulo: e.nombre, clase: e.cat_tipos_evento?.nombre ?? 'Evento',
        ini: e.fecha_inicio, fin: e.fecha_fin ?? e.fecha_inicio, horaIni: e.hora_inicio, horaFin: e.hora_fin,
        detalle: `${e.folio} · ${e.status}`,
      })),
      ...((bl as any[]) ?? []).map((b): Ocup => ({
        origen: 'Bloqueo', id_lugar: b.id_lugar_fk, titulo: b.titulo, clase: b.tipo,
        ini: b.fecha_inicio, fin: b.fecha_fin, horaIni: b.hora_inicio, horaFin: b.hora_fin,
        detalle: [b.responsable, b.notas].filter(Boolean).join(' · '),
      })),
    ].filter(o => o.fin >= desde && o.ini <= hasta)

    const totalDias = diasDe(desde, hasta, desde, hasta).length
    const lugaresF = lugares.filter(l => (!filtroTipo || l.tipo === filtroTipo) && (filtroLugar === '' || l.id === filtroLugar))
    const res: Resumen[] = lugaresF.map(l => {
      const propias = ocups.filter(o => o.id_lugar === l.id && (!filtroOrigen || o.origen === filtroOrigen))
      const conteo: Record<string, number> = {}
      const ev = new Set<string>(); const bk = new Set<string>()
      propias.forEach(o => diasDe(o.ini, o.fin, desde, hasta).forEach(d => {
        conteo[d] = (conteo[d] ?? 0) + 1
        ;(o.origen === 'Evento' ? ev : bk).add(d)
      }))
      const dias = Object.keys(conteo)
      return {
        lugar: l, diasOcupados: dias.length, pct: totalDias ? dias.length / totalDias * 100 : 0,
        eventos: propias.filter(o => o.origen === 'Evento').length, bloqueos: propias.filter(o => o.origen === 'Bloqueo').length,
        diasEvento: ev.size, diasBloqueo: bk.size, empalmes: dias.filter(d => conteo[d] > 1).length,
      }
    })
    const nombres: Record<number, string> = {}; lugares.forEach(l => { nombres[l.id] = l.nombre })
    const ids = new Set(lugaresF.map(l => l.id))
    setResumen(res)
    setDetalle(ocups.filter(o => ids.has(o.id_lugar) && (!filtroOrigen || o.origen === filtroOrigen))
      .map(o => ({ ...o, lugar: nombres[o.id_lugar] ?? '—' }))
      .sort((a, b) => a.lugar.localeCompare(b.lugar) || a.ini.localeCompare(b.ini)))
    setLoading(false)
  }, [desde, hasta, lugares, filtroTipo, filtroLugar, filtroOrigen])

  const totalDias = resumen.length ? diasDe(desde, hasta, desde, hasta).length : 0
  const ocupProm = resumen.length ? resumen.reduce((s, r) => s + r.pct, 0) / resumen.length : 0
  const tipos = Array.from(new Set(lugares.map(l => l.tipo).filter(Boolean))) as string[]
  const thSt: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
  const tdSt: React.CSSProperties = { padding: '7px 10px', fontSize: 12 }
  const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }
  const colorPct = (p: number) => p >= 70 ? '#dc2626' : p >= 40 ? '#d97706' : '#16a34a'

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div><label style={lbl}>Desde</label><input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ fontSize: 12 }} /></div>
        <div><label style={lbl}>Hasta</label><input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ fontSize: 12 }} /></div>
        <div>
          <label style={lbl}>Tipo de instalación</label>
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ fontSize: 12, minWidth: 140 }}>
            <option value="">Todos</option>{tipos.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Instalación</label>
          <select className="input" value={filtroLugar} onChange={e => setFiltroLugar(e.target.value ? Number(e.target.value) : '')} style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todas</option>{lugares.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Origen</label>
          <select className="input" value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)} style={{ fontSize: 12, minWidth: 130 }}>
            <option value="">Eventos y bloqueos</option><option value="Evento">Solo eventos</option><option value="Bloqueo">Solo bloqueos</option>
          </select>
        </div>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 12 }}>{loading ? 'Consultando…' : 'Consultar'}</button>
        {buscado && !loading && (
          <PrintBar title="Ocupacion-Instalaciones" count={detalle.length}
            reportTitle={`Ocupación de Instalaciones · ${fmtFecha(desde)} al ${fmtFecha(hasta)}`} />
        )}
      </div>

      {!buscado && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Aplica los filtros y haz clic en Consultar</div>}

      {buscado && !loading && (
        <div id="reporte-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Instalaciones', value: String(resumen.length), color: '#0f766e' },
              { label: 'Días del período', value: String(totalDias), color: '#475569' },
              { label: 'Ocupación promedio', value: ocupProm.toFixed(1) + '%', color: colorPct(ocupProm) },
              { label: 'Ocupaciones', value: String(detalle.length), color: '#9333ea' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: '12px 14px', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ overflowX: 'auto', padding: 0, marginBottom: 20 }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thSt}>Instalación</th><th style={thSt}>Tipo</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Eventos</th><th style={{ ...thSt, textAlign: 'right' }}>Bloqueos</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Días evento</th><th style={{ ...thSt, textAlign: 'right' }}>Días bloqueo</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Empalmes (días)</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Días ocupados</th><th style={{ ...thSt, textAlign: 'right' }}>% Ocupación</th>
                </tr>
              </thead>
              <tbody>
                {resumen.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Sin instalaciones con los filtros seleccionados</td></tr>
                ) : resumen.map((r, i) => (
                  <tr key={r.lugar.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                    <td style={{ ...tdSt, fontWeight: 600 }}>{r.lugar.nombre}</td>
                    <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{r.lugar.tipo ?? '—'}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{r.eventos}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{r.bloqueos}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{r.diasEvento}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{r.diasBloqueo}</td>
                    <td style={{ ...tdSt, textAlign: 'right', color: r.empalmes ? '#dc2626' : 'var(--text-muted)', fontWeight: r.empalmes ? 700 : 400 }}>{r.empalmes || '—'}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 600 }}>{r.diasOcupados} / {totalDias}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700, color: colorPct(r.pct) }}>{r.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-secondary)' }}>Detalle de ocupaciones</div>
          <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                  {['Instalación', 'Origen', 'Clase', 'Título', 'Desde', 'Hasta', 'Horario', 'Detalle'].map(h => <th key={h} style={thSt}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {detalle.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Sin ocupaciones en el período</td></tr>
                ) : detalle.map((o, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                    <td style={{ ...tdSt, fontWeight: 600 }}>{o.lugar}</td>
                    <td style={tdSt}>{o.origen}</td>
                    <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{o.clase}</td>
                    <td style={tdSt}>{o.titulo}</td>
                    <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>{fmtFecha(o.ini)}</td>
                    <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>{fmtFecha(o.fin)}</td>
                    <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>{horas(o.horaIni, o.horaFin)}</td>
                    <td style={{ ...tdSt, color: 'var(--text-muted)', fontSize: 11 }}>{o.detalle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
