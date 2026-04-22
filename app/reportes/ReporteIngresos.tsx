'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtF = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

type Recibo = {
  id: number; folio: string | null; fecha: string; status: string
  id_centro_ingreso_fk: number | null; descripcion: string | null
  monto_efectivo: number; monto_transferencia: number
  monto_tarjeta: number; monto_cheque: number; monto_total: number
  origen: string | null
}

type Centro = { id: number; nombre: string; tipo: string | null }

type TabMode = 'tipo' | 'centro'

const TIPO_COLOR: Record<string, string> = {
  golf:            '#059669',
  cuotas:          '#2563eb',
  rentas_espacios: '#7c3aed',
  caballerizas:    '#d97706',
  otro:            '#64748b',
}
const TIPO_LABEL: Record<string, string> = {
  golf:            'Golf',
  cuotas:          'Cuotas Residenciales',
  rentas_espacios: 'Rentas / Espacios',
  caballerizas:    'Caballerizas',
  otro:            'Otro',
}

export default function ReporteIngresos() {
  const [recibos, setRecibos]   = useState<Recibo[]>([])
  const [centros, setCentros]   = useState<Centro[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<TabMode>('tipo')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Filtros
  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Confirmado')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: rs }, { data: cs }] = await Promise.all([
      dbCtrl.from('recibos_ingreso')
        .select('id, folio, fecha, status, id_centro_ingreso_fk, descripcion, monto_efectivo, monto_transferencia, monto_tarjeta, monto_cheque, monto_total, origen')
        .order('fecha', { ascending: false }),
      dbCfg.from('centros_ingreso').select('id, nombre, tipo').order('nombre'),
    ])
    setCentros(cs ?? [])

    let result: Recibo[] = rs ?? []
    if (filtroStatus) result = result.filter(r => r.status === filtroStatus)
    if (filtroCentro) result = result.filter(r => r.id_centro_ingreso_fk === Number(filtroCentro))
    if (filtroTipo) {
      const idsDelTipo = (cs ?? []).filter((c: any) => c.tipo === filtroTipo).map((c: any) => c.id)
      result = result.filter(r => r.id_centro_ingreso_fk && idsDelTipo.includes(r.id_centro_ingreso_fk))
    }
    if (filtroDe) result = result.filter(r => r.fecha >= filtroDe)
    if (filtroA)  result = result.filter(r => r.fecha <= filtroA)
    setRecibos(result)
    setLoading(false)
  }, [filtroCentro, filtroTipo, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const centroMap = Object.fromEntries(centros.map(c => [c.id, c]))
  const totalGeneral = recibos.reduce((s, r) => s + Number(r.monto_total ?? 0), 0)

  // ── Vista Por Tipo ───────────────────────────────────────────
  const tiposUnicos = Array.from(new Set(
    recibos.map(r => centroMap[r.id_centro_ingreso_fk ?? 0]?.tipo ?? 'otro')
  ))
  const gruposPorTipo = tiposUnicos.map(tipo => {
    const items = recibos.filter(r => (centroMap[r.id_centro_ingreso_fk ?? 0]?.tipo ?? 'otro') === tipo)
    return { key: tipo, label: TIPO_LABEL[tipo] ?? tipo, items, total: items.reduce((s, r) => s + Number(r.monto_total ?? 0), 0) }
  }).sort((a, b) => b.total - a.total)

  // ── Vista Por Centro ─────────────────────────────────────────
  const centroIds = Array.from(new Set(recibos.map(r => r.id_centro_ingreso_fk ?? 0)))
  const gruposPorCentro = centroIds.map(cid => {
    const c = centroMap[cid]
    const items = recibos.filter(r => (r.id_centro_ingreso_fk ?? 0) === cid)
    return {
      key:   String(cid),
      label: c?.nombre ?? 'Sin centro',
      tipo:  c?.tipo ?? 'otro',
      items, total: items.reduce((s, r) => s + Number(r.monto_total ?? 0), 0),
    }
  }).sort((a, b) => b.total - a.total)

  const toggle = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const grupos = tab === 'tipo' ? gruposPorTipo : gruposPorCentro
  const expandAll   = () => setExpanded(new Set(grupos.map(g => g.key)))
  const collapseAll = () => setExpanded(new Set())

  // Forma de pago breakdown
  const fmtPago = (r: Recibo) => {
    const parts = []
    if (r.monto_efectivo      > 0) parts.push(`Eft ${fmt(r.monto_efectivo)}`)
    if (r.monto_transferencia > 0) parts.push(`Trf ${fmt(r.monto_transferencia)}`)
    if (r.monto_tarjeta       > 0) parts.push(`Tdc ${fmt(r.monto_tarjeta)}`)
    if (r.monto_cheque        > 0) parts.push(`Chq ${fmt(r.monto_cheque)}`)
    return parts.join(' · ') || '—'
  }

  // Tipos únicos disponibles en catálogo
  const tiposCatalogo = Array.from(new Set(centros.map(c => c.tipo).filter(Boolean))) as string[]

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 180 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setFiltroCentro('') }}>
          <option value="">Todos los tipos</option>
          {tiposCatalogo.map(t => <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>)}
        </select>
        <select className="select" style={{ minWidth: 200 }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
          <option value="">Todos los centros</option>
          {(filtroTipo ? centros.filter(c => c.tipo === filtroTipo) : centros).map(c =>
            <option key={c.id} value={c.id}>{c.nombre}</option>
          )}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA}  onChange={e => setFiltroA(e.target.value)}  style={{ width: 140 }} />
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 160px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Ingresos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{fmt(totalGeneral)}</div>
        </div>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 120px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recibos</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{recibos.length}</div>
        </div>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 140px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Efectivo</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(recibos.reduce((s, r) => s + Number(r.monto_efectivo ?? 0), 0))}</div>
        </div>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 140px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Transferencia</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(recibos.reduce((s, r) => s + Number(r.monto_transferencia ?? 0), 0))}</div>
        </div>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 140px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>T. Débito/Crédito</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(recibos.reduce((s, r) => s + Number(r.monto_tarjeta ?? 0), 0))}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        {([['tipo', 'Por Tipo de Ingreso'], ['centro', 'Por Centro de Ingreso']] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setExpanded(new Set()) }}
            style={{
              padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: 'transparent', borderBottom: tab === key ? '2px solid var(--blue)' : '2px solid transparent',
              color: tab === key ? 'var(--blue)' : 'var(--text-secondary)', marginBottom: -2,
            }}>{label}</button>
        ))}
      </div>

      <PrintBar title={`Ingresos-${tab}`} count={recibos.length} reportTitle={tab === 'tipo' ? 'Ingresos por Tipo' : 'Ingresos por Centro'} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin ingresos con los filtros aplicados</div>
      ) : (
        <div id="reporte-print-area" className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {tab === 'tipo' ? 'Tipo / Folio' : 'Centro / Folio'}
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fecha</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Descripción</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Forma de Pago</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const color = TIPO_COLOR[(g as any).tipo ?? g.key] ?? TIPO_COLOR[g.key] ?? '#64748b'
                return (
                  <>
                    {/* Fila de grupo */}
                    <tr key={`grp-${g.key}`} onClick={() => toggle(g.key)}
                      style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {expanded.has(g.key)
                            ? <ChevronDown size={14} style={{ color }} />
                            : <ChevronRight size={14} style={{ color }} />}
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          <span style={{ color: 'var(--text-primary)' }}>{g.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({g.items.length} recibo{g.items.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      </td>
                      <td colSpan={3} />
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                        {fmt(g.total)}
                      </td>
                    </tr>
                    {/* Detalle recibos */}
                    {expanded.has(g.key) && g.items.map(r => (
                      <tr key={`r-${r.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 14px 8px 38px', fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)' }}>
                          {r.folio ?? `ING-${r.id}`}
                          {tab === 'tipo' && r.id_centro_ingreso_fk && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'inherit', marginLeft: 6 }}>
                              · {centroMap[r.id_centro_ingreso_fk]?.nombre ?? '—'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtF(r.fecha)}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.descripcion ?? '—'}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)' }}>{fmtPago(r)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{fmt(r.monto_total)}</td>
                      </tr>
                    ))}
                  </>
                )
              })}
              {/* Total general */}
              <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                <td colSpan={4} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  Total General · {recibos.length} recibos
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#6ee7b7' }}>
                  {fmt(totalGeneral)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
