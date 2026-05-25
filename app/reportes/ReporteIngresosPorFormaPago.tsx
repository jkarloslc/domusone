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
  monto_tarjeta: number; monto_tarjeta_debito: number; monto_tarjeta_credito: number
  monto_cheque: number; monto_deposito: number; monto_total: number
}
type FormaPagoRow = { id_recibo_fk: number; nombre_forma_pago: string; monto: number }
type Centro = { id: number; nombre: string; tipo: string | null }

export default function ReporteIngresosPorFormaPago() {
  const [recibos, setRecibos]     = useState<Recibo[]>([])
  const [centros, setCentros]     = useState<Centro[]>([])
  const [formasMap, setFormasMap] = useState<Record<number, FormaPagoRow[]>>({})
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())

  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Confirmado')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: rs }, { data: cs }] = await Promise.all([
      dbCtrl.from('recibos_ingreso')
        .select('id, folio, fecha, status, id_centro_ingreso_fk, descripcion, monto_efectivo, monto_transferencia, monto_tarjeta, monto_tarjeta_debito, monto_tarjeta_credito, monto_cheque, monto_deposito, monto_total')
        .order('fecha', { ascending: false }),
      dbCfg.from('centros_ingreso').select('id, nombre, tipo').order('nombre'),
    ])
    setCentros(cs ?? [])

    let result: Recibo[] = rs ?? []
    if (filtroStatus)  result = result.filter(r => r.status === filtroStatus)
    if (filtroCentro)  result = result.filter(r => r.id_centro_ingreso_fk === Number(filtroCentro))
    if (filtroDe)      result = result.filter(r => r.fecha >= filtroDe)
    if (filtroA)       result = result.filter(r => r.fecha <= filtroA)
    setRecibos(result)

    if (result.length > 0) {
      const ids = result.map(r => r.id)
      const { data: fp } = await dbCtrl
        .from('recibos_ingreso_formas_pago')
        .select('id_recibo_fk, nombre_forma_pago, monto')
        .in('id_recibo_fk', ids)
      const map: Record<number, FormaPagoRow[]> = {}
      ;(fp ?? []).forEach((f: FormaPagoRow) => {
        if (!map[f.id_recibo_fk]) map[f.id_recibo_fk] = []
        map[f.id_recibo_fk].push(f)
      })
      setFormasMap(map)
    } else {
      setFormasMap({})
    }
    setLoading(false)
  }, [filtroCentro, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const centroMap = Object.fromEntries(centros.map(c => [c.id, c]))

  const getFormasPago = (r: Recibo): { nombre: string; monto: number }[] => {
    const nuevas = formasMap[r.id] ?? []
    if (nuevas.length > 0) return nuevas.filter(f => f.monto > 0).map(f => ({ nombre: f.nombre_forma_pago, monto: f.monto }))
    // Fallback a columnas legacy
    const parts: { nombre: string; monto: number }[] = []
    if (r.monto_efectivo      > 0) parts.push({ nombre: 'Efectivo', monto: r.monto_efectivo })
    if (r.monto_transferencia > 0) parts.push({ nombre: 'Transferencia', monto: r.monto_transferencia })
    const tdb = r.monto_tarjeta_debito > 0 ? r.monto_tarjeta_debito : r.monto_tarjeta_credito === 0 ? r.monto_tarjeta : 0
    if (tdb                       > 0) parts.push({ nombre: 'Tarjeta Débito', monto: tdb })
    if (r.monto_tarjeta_credito   > 0) parts.push({ nombre: 'Tarjeta Crédito', monto: r.monto_tarjeta_credito })
    if (r.monto_cheque            > 0) parts.push({ nombre: 'Cheque', monto: r.monto_cheque })
    if (r.monto_deposito          > 0) parts.push({ nombre: 'Depósito Ventanilla', monto: r.monto_deposito })
    return parts
  }

  // Formas a mostrar como columnas
  const formasColumnas = Array.from(new Set(
    recibos.flatMap(r => getFormasPago(r).map(f => f.nombre))
  )).sort()

  // Agrupados por centro de ingreso
  const centroIds = Array.from(new Set(recibos.map(r => r.id_centro_ingreso_fk ?? 0)))
  const grupos = centroIds.map(cid => {
    const items = recibos.filter(r => (r.id_centro_ingreso_fk ?? 0) === cid)
    const porForma: Record<string, number> = {}
    items.forEach(r =>
      getFormasPago(r).forEach(f => {
        porForma[f.nombre] = (porForma[f.nombre] ?? 0) + f.monto
      })
    )
    return {
      key:   String(cid),
      label: centroMap[cid]?.nombre ?? 'Sin centro',
      items,
      total: items.reduce((s, r) => s + Number(r.monto_total ?? 0), 0),
      porForma,
    }
  }).sort((a, b) => b.total - a.total)

  // Totales generales por forma
  const totalesForma: Record<string, number> = {}
  recibos.forEach(r =>
    getFormasPago(r).forEach(f => {
      totalesForma[f.nombre] = (totalesForma[f.nombre] ?? 0) + f.monto
    })
  )
  const totalGeneral = recibos.reduce((s, r) => s + Number(r.monto_total ?? 0), 0)

  const toggle = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const expandAll   = () => setExpanded(new Set(grupos.map(g => g.key)))
  const collapseAll = () => setExpanded(new Set())

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 150 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select className="select" style={{ minWidth: 200 }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
          <option value="">Todos los centros</option>
          {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA}  onChange={e => setFiltroA(e.target.value)}  style={{ width: 140 }} />
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 180px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Ingresos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{fmt(totalGeneral)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{recibos.length} recibo{recibos.length !== 1 ? 's' : ''} · {grupos.length} centro{grupos.length !== 1 ? 's' : ''}</div>
        </div>
        {Object.entries(totalesForma).sort((a, b) => b[1] - a[1]).map(([nombre, total]) => (
          <div key={nombre} className="card" style={{ padding: '14px 20px', flex: '1 1 140px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{nombre}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(total)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {totalGeneral > 0 ? Math.round((total / totalGeneral) * 100) : 0}% del total
            </div>
          </div>
        ))}
      </div>

      <PrintBar
        title="Ingresos-por-Forma-de-Pago"
        count={recibos.length}
        reportTitle="Ingresos por Centro y Forma de Pago"
      />

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
        <div id="reporte-print-area" className="card" style={{ overflow: 'auto' }}>
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 220 }}>
                  Centro de Ingreso
                </th>
                {formasColumnas.map(f => (
                  <th key={f} style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 130 }}>
                    {f}
                  </th>
                ))}
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 120 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <>
                  {/* Fila de centro */}
                  <tr key={`grp-${g.key}`} onClick={() => toggle(g.key)}
                    style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {expanded.has(g.key)
                          ? <ChevronDown size={14} style={{ color: '#059669' }} />
                          : <ChevronRight size={14} style={{ color: '#059669' }} />}
                        <span style={{ color: 'var(--text-primary)' }}>{g.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                          ({g.items.length} recibo{g.items.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </td>
                    {formasColumnas.map(f => (
                      <td key={f} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: g.porForma[f] ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {g.porForma[f] ? fmt(g.porForma[f]) : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                      {fmt(g.total)}
                    </td>
                  </tr>
                  {/* Detalle de recibos */}
                  {expanded.has(g.key) && g.items.map(r => {
                    const fpsMap = Object.fromEntries(getFormasPago(r).map(f => [f.nombre, f.monto]))
                    return (
                      <tr key={`r-${r.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 14px 8px 38px', fontSize: 12 }}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--blue)' }}>
                            {r.folio ?? `ING-${r.id}`}
                          </span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{fmtF(r.fecha)}</span>
                          {r.descripcion && (
                            <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: 11 }}>
                              {r.descripcion}
                            </span>
                          )}
                        </td>
                        {formasColumnas.map(f => (
                          <td key={f} style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, color: fpsMap[f] ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                            {fpsMap[f] ? fmt(fpsMap[f]) : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                          {fmt(Number(r.monto_total ?? 0))}
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
              {/* Total general */}
              <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  Total General · {recibos.length} recibo{recibos.length !== 1 ? 's' : ''}
                </td>
                {formasColumnas.map(f => (
                  <td key={f} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#6ee7b7' }}>
                    {totalesForma[f] ? fmt(totalesForma[f]) : '—'}
                  </td>
                ))}
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
