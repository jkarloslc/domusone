'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtF = (s: string | null) => {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const MODULO_LABEL: Record<string, string> = {
  golf: 'Golf', hipico: 'Hípico', locales: 'Locales', residencial: 'Fraccionamiento',
}
const MODULO_COLOR: Record<string, string> = {
  golf: '#b8952a', hipico: '#7c3aed', locales: '#0f766e', residencial: 'var(--blue)',
}

type Cancelacion = {
  id: number; modulo: string; folio: string | null; id_origen: number
  id_venta_pos_fk: number | null; monto: number | null; cuotas_afectadas: number
  motivo: string | null; usuario: string | null; fecha_cancelacion: string
  revertida: boolean; revertida_fecha: string | null; revertida_por: string | null
}

export default function ReporteCancelaciones() {
  const [rows,    setRows]    = useState<Cancelacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [filtroModulo, setFiltroModulo] = useState('')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')
  const [busqueda,     setBusqueda]     = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await dbCtrl.from('cancelaciones')
      .select('*').order('fecha_cancelacion', { ascending: false }).limit(1000)
    if (error) setError(error.message)
    else { setRows((data as Cancelacion[]) ?? []); setError('') }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => rows.filter(r => {
    if (filtroModulo && r.modulo !== filtroModulo) return false
    if (filtroDe && r.fecha_cancelacion.slice(0, 10) < filtroDe) return false
    if (filtroA  && r.fecha_cancelacion.slice(0, 10) > filtroA)  return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!(r.folio ?? '').toLowerCase().includes(q) && !(r.motivo ?? '').toLowerCase().includes(q) && !(r.usuario ?? '').toLowerCase().includes(q)) return false
    }
    return true
  }), [rows, filtroModulo, filtroDe, filtroA, busqueda])

  const totalMonto  = useMemo(() => filtered.reduce((s, r) => s + (r.monto ?? 0), 0), [filtered])
  const totalCuotas = useMemo(() => filtered.reduce((s, r) => s + (r.cuotas_afectadas ?? 0), 0), [filtered])

  const exportXLSX = () => {
    const data = filtered.map(r => ({
      Fecha:              fmtF(r.fecha_cancelacion),
      Módulo:             MODULO_LABEL[r.modulo] ?? r.modulo,
      Folio:              r.folio ?? '—',
      Status:             r.revertida ? 'Revertida' : 'Cancelada',
      Monto:              r.monto ?? 0,
      'Cuotas Afectadas': r.cuotas_afectadas,
      'Ticket POS':       r.id_venta_pos_fk ?? '—',
      Motivo:             r.motivo ?? '',
      'Cancelado por':    r.usuario ?? '',
      'Reabierto por':    r.revertida_por ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 36 }, { wch: 18 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cancelaciones')
    XLSX.writeFile(wb, `Cancelaciones_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const selStyle: React.CSSProperties = {
    height: 32, padding: '0 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, fontSize: 13, background: '#fff',
    fontFamily: 'var(--font-body)', color: 'var(--text-primary)',
  }

  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center', color: '#dc2626' }}>
      No se pudo cargar la bitácora de cancelaciones: {error}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Si la tabla ctrl.cancelaciones no existe aún, hace falta ejecutar la migración correspondiente.
      </div>
    </div>
  )

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Módulo</div>
          <select style={{ ...selStyle, width: 160 }} value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}>
            <option value="">Todos</option>
            <option value="golf">Golf</option>
            <option value="hipico">Hípico</option>
            <option value="locales">Locales</option>
            <option value="residencial">Fraccionamiento</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha de</div>
          <input type="date" style={{ ...selStyle, width: 140 }} value={filtroDe} onChange={e => setFiltroDe(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha a</div>
          <input type="date" style={{ ...selStyle, width: 140 }} value={filtroA} onChange={e => setFiltroA(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buscar</div>
          <input style={{ ...selStyle, width: 220 }} placeholder="Folio, motivo o usuario…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Refrescar" style={{ height: 32, alignSelf: 'flex-end' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Cancelaciones',      value: filtered.length.toString(),  color: '#dc2626', bg: '#fef2f2' },
          { label: 'Monto Cancelado',    value: fmt(totalMonto),             color: '#dc2626', bg: '#fef2f2' },
          { label: 'Cuotas Liberadas',   value: totalCuotas.toString(),      color: '#0f766e', bg: '#f0fdfa' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', background: k.bg, flex: '1 1 160px', maxWidth: 240 }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }} id="reporte-print-area">
        <div style={{ padding: '14px 18px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <PrintBar title="Cancelaciones" count={filtered.length} reportTitle="Bitácora de Cancelaciones" />
            <button className="btn-secondary" onClick={exportXLSX} style={{ fontSize: 12 }}>
              <FileSpreadsheet size={13} /> Exportar Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Sin cancelaciones con los filtros seleccionados</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Fecha', 'Módulo', 'Folio', 'Status', 'Cuotas', 'Ticket POS', 'Motivo', 'Cancelado por', 'Monto'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: h === 'Monto' || h === 'Cuotas' ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtF(r.fecha_cancelacion)}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: (MODULO_COLOR[r.modulo] ?? '#64748b') + '18', color: MODULO_COLOR[r.modulo] ?? '#64748b' }}>
                        {MODULO_LABEL[r.modulo] ?? r.modulo}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.folio ?? `#${r.id_origen}`}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {r.revertida ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#15803d' }} title={r.revertida_por ? `Reabierto por ${r.revertida_por}` : undefined}>
                          Revertida
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#dc2626' }}>
                          Cancelada
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.cuotas_afectadas}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>{r.id_venta_pos_fk ? `#${String(r.id_venta_pos_fk).padStart(6, '0')}` : '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.motivo ?? ''}>{r.motivo ?? '—'}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontSize: 12 }}>{r.usuario ?? '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#dc2626', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmt(r.monto ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fef2f2', borderTop: '2px solid #fecaca' }}>
                  <td colSpan={8} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 13, color: '#dc2626' }}>Total</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totalMonto)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
