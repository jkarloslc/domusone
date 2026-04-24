'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'

type TipoEvento = { id: number; nombre: string; color: string }
type Lugar      = { id: number; nombre: string }

type Evento = {
  id: number
  folio: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string | null
  status: string
  cliente_nombre: string | null
  cat_tipos_evento?: { nombre: string; color: string }
  cat_lugares?: { nombre: string }
}

type Ingreso = { id: number; id_evento_fk: number; monto: number; forma_pago: string }
type EventoOP = { id: number; id_evento_fk: number; id_op_fk: number }
type OP = { id: number; monto: number; saldo: number }

type EventoRow = Evento & {
  total_ingresos: number
  total_gastos: number
  balance: number
  num_ingresos: number
  num_ops: number
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Cotización': { bg: '#fef9c3', color: '#ca8a04' },
  'Confirmado': { bg: '#eff6ff', color: '#2563eb' },
  'En curso':   { bg: '#fff7ed', color: '#ea580c' },
  'Realizado':  { bg: '#f0fdf4', color: '#15803d' },
  'Cancelado':  { bg: '#fef2f2', color: '#dc2626' },
}

const STATUSES = ['Cotización', 'Confirmado', 'En curso', 'Realizado', 'Cancelado']

const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

export default function ReporteHospitalityEventos() {
  const hoy   = new Date()
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1).toISOString().split('T')[0]
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0]

  const [tipos,   setTipos]   = useState<TipoEvento[]>([])
  const [lugares, setLugares] = useState<Lugar[]>([])

  const [filtroDesde,  setFiltroDesde]  = useState(desde)
  const [filtroHasta,  setFiltroHasta]  = useState(hasta)
  const [filtroTipo,   setFiltroTipo]   = useState<number | ''>('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroLugar,  setFiltroLugar]  = useState<number | ''>('')

  const [rows,    setRows]    = useState<EventoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)

  useEffect(() => {
    dbCtrl.from('cat_tipos_evento').select('id, nombre, color').eq('activo', true).order('nombre')
      .then(({ data }: any) => setTipos(data ?? []))
    dbCtrl.from('cat_lugares').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }: any) => setLugares(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true)

    // 1. Traer eventos del período
    let q = dbCtrl.from('eventos')
      .select('id, folio, nombre, fecha_inicio, fecha_fin, status, cliente_nombre, cat_tipos_evento(nombre, color), cat_lugares(nombre)')
      .gte('fecha_inicio', filtroDesde)
      .lte('fecha_inicio', filtroHasta)
      .order('fecha_inicio', { ascending: false })
    if (filtroTipo   !== '') q = q.eq('id_tipo_evento_fk', filtroTipo)
    if (filtroStatus)        q = q.eq('status', filtroStatus)
    if (filtroLugar  !== '') q = q.eq('id_lugar_fk', filtroLugar)

    const { data: evData } = await q
    const eventos = (evData as unknown as Evento[]) ?? []

    if (eventos.length === 0) { setRows([]); setLoading(false); return }

    const ids = eventos.map(e => e.id)

    // 2. Ingresos de esos eventos
    const { data: ingData } = await dbCtrl.from('eventos_ingresos')
      .select('id, id_evento_fk, monto, forma_pago')
      .in('id_evento_fk', ids)
    const ingresos = (ingData as unknown as Ingreso[]) ?? []

    // 3. Relaciones evento-OP
    const { data: eopData } = await dbCtrl.from('eventos_ops')
      .select('id, id_evento_fk, id_op_fk')
      .in('id_evento_fk', ids)
    const evOps = (eopData as unknown as EventoOP[]) ?? []

    // 4. OPs vinculadas
    let ops: OP[] = []
    const opIds = evOps.map(e => e.id_op_fk)
    if (opIds.length > 0) {
      const { data: opData } = await dbComp.from('ordenes_pago')
        .select('id, monto, saldo').in('id', opIds)
      ops = (opData as unknown as OP[]) ?? []
    }

    // 5. Armar filas
    const result: EventoRow[] = eventos.map(ev => {
      const ings      = ingresos.filter(i => i.id_evento_fk === ev.id)
      const evOpLinks = evOps.filter(e => e.id_evento_fk === ev.id)
      const evOpObjs  = ops.filter(o => evOpLinks.some(l => l.id_op_fk === o.id))

      const total_ingresos = ings.reduce((s, i) => s + i.monto, 0)
      const total_gastos   = evOpObjs.reduce((s, o) => s + o.monto, 0)
      const balance        = total_ingresos - total_gastos

      return { ...ev, total_ingresos, total_gastos, balance, num_ingresos: ings.length, num_ops: evOpObjs.length }
    })

    setRows(result)
    setLoading(false)
  }, [filtroDesde, filtroHasta, filtroTipo, filtroStatus, filtroLugar])

  // KPIs totales
  const totalIngresos = rows.reduce((s, r) => s + r.total_ingresos, 0)
  const totalGastos   = rows.reduce((s, r) => s + r.total_gastos, 0)
  const balanceTotal  = totalIngresos - totalGastos
  const realizados    = rows.filter(r => r.status === 'Realizado').length
  const confirmados   = rows.filter(r => r.status === 'Confirmado' || r.status === 'En curso').length

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Desde</label>
          <input className="input" type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
          <input className="input" type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo de evento</label>
          <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value ? Number(e.target.value) : '')} style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todos</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
          <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ fontSize: 12, minWidth: 140 }}>
            <option value="">Todos</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Lugar</label>
          <select className="input" value={filtroLugar} onChange={e => setFiltroLugar(e.target.value ? Number(e.target.value) : '')} style={{ fontSize: 12, minWidth: 140 }}>
            <option value="">Todos</option>
            {lugares.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && (
          <PrintBar title="Hospitality-Eventos" count={rows.length} reportTitle="Eventos Hospitality — Ingresos vs Gastos" />
        )}
      </div>

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Aplica los filtros y haz clic en Consultar
        </div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Eventos',      value: rows.length.toString(),    color: '#9333ea', bg: '#faf5ff' },
              { label: 'Realizados',   value: realizados.toString(),     color: '#15803d', bg: '#f0fdf4' },
              { label: 'Confirmados',  value: confirmados.toString(),    color: '#2563eb', bg: '#eff6ff' },
              { label: 'Total ingresos', value: fmt$(totalIngresos),     color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Total gastos',   value: fmt$(totalGastos),       color: '#dc2626', bg: '#fef2f2' },
              { label: 'Balance',        value: fmt$(balanceTotal),
                color: balanceTotal >= 0 ? '#15803d' : '#dc2626',
                bg:    balanceTotal >= 0 ? '#f0fdf4' : '#fef2f2' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 130px', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          {rows.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Sin eventos con los filtros seleccionados
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    {['Folio', 'Nombre', 'Tipo', 'Lugar', 'Fecha', 'Cliente', 'Status', 'Ingresos', 'Gastos', 'Balance'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const sc   = STATUS_COLORS[r.status] ?? { bg: '#f8fafc', color: '#64748b' }
                    const tipo = r.cat_tipos_evento
                    const bal  = r.balance
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: '#9333ea', fontFamily: 'monospace', fontSize: 11 }}>{r.folio}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)', maxWidth: 180 }}>{r.nombre}</td>
                        <td style={{ padding: '9px 12px' }}>
                          {tipo ? (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: tipo.color + '22', color: tipo.color }}>
                              {tipo.nombre}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{r.cat_lugares?.nombre ?? '—'}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>{fmtFecha(r.fecha_inicio)}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>{r.cliente_nombre ?? '—'}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{r.status}</span>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#16a34a' }}>
                          {r.total_ingresos > 0 ? fmt$(r.total_ingresos) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          {r.num_ingresos > 0 && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{r.num_ingresos} recibo{r.num_ingresos !== 1 ? 's' : ''}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#dc2626' }}>
                          {r.total_gastos > 0 ? fmt$(r.total_gastos) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          {r.num_ops > 0 && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{r.num_ops} OP{r.num_ops !== 1 ? 's' : ''}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: bal >= 0 ? '#15803d' : '#dc2626' }}>
                          {(r.total_ingresos > 0 || r.total_gastos > 0) ? fmt$(bal) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totales */}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                    <td colSpan={7} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                      TOTAL — {rows.length} evento{rows.length !== 1 ? 's' : ''}
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(totalIngresos)}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#dc2626' }}>{fmt$(totalGastos)}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: balanceTotal >= 0 ? '#15803d' : '#dc2626' }}>{fmt$(balanceTotal)}</td>
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
