'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtF = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ReportePagosAplicados() {
  const [abonos,   setAbonos]   = useState<any[]>([])
  const [ops,      setOps]      = useState<any[]>([])
  const [provs,    setProvs]    = useState<any[]>([])
  const [cuentas,  setCuentas]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  // Filtros
  const [filtroProv,    setFiltroProv]    = useState('')
  const [filtroCuenta,  setFiltroCuenta]  = useState('')
  const [filtroDe,      setFiltroDe]      = useState('')
  const [filtroA,       setFiltroA]       = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ab }, { data: opRows }, { data: provRows }, { data: cbRows }] = await Promise.all([
      dbComp.from('cxp_abonos').select('*').order('fecha_abono', { ascending: false }),
      dbComp.from('ordenes_pago').select('id, folio, concepto, id_proveedor_fk'),
      dbComp.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('cuentas_bancarias').select('id, banco').order('banco'),
    ])
    setAbonos(ab ?? [])
    setOps(opRows ?? [])
    setProvs(provRows ?? [])
    setCuentas(cbRows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Lookup maps
  const opMap      = useMemo(() => Object.fromEntries((ops).map(o => [o.id, o])), [ops])
  const provMap    = useMemo(() => Object.fromEntries((provs).map(p => [p.id, p.nombre])), [provs])
  const cuentaMap  = useMemo(() => Object.fromEntries((cuentas).map(c => [c.id, c.banco])), [cuentas])

  // Enriquecer abonos con datos de OP y proveedor
  const enriched = useMemo(() => abonos.map(a => {
    const op      = opMap[a.id_op_fk] ?? {}
    const provId  = op.id_proveedor_fk ?? null
    return {
      ...a,
      folio:         op.folio      ?? '—',
      concepto:      op.concepto   ?? '—',
      id_proveedor:  provId,
      proveedor:     provId ? (provMap[provId] ?? '—') : '—',
      cuenta_nombre: a.id_cuenta_bancaria_fk ? (cuentaMap[a.id_cuenta_bancaria_fk] ?? '—') : '—',
    }
  }), [abonos, opMap, provMap, cuentaMap])

  // Filtrado
  const filtered = useMemo(() => enriched.filter(a => {
    if (filtroProv   && String(a.id_proveedor) !== filtroProv) return false
    if (filtroCuenta && String(a.id_cuenta_bancaria_fk) !== filtroCuenta) return false
    if (filtroDe && a.fecha_abono < filtroDe) return false
    if (filtroA  && a.fecha_abono > filtroA)  return false
    return true
  }), [enriched, filtroProv, filtroCuenta, filtroDe, filtroA])

  // KPIs
  const totalPagado    = useMemo(() => filtered.reduce((s, a) => s + (a.monto ?? 0), 0), [filtered])
  const numProveedores = useMemo(() => new Set(filtered.map(a => a.id_proveedor).filter(Boolean)).size, [filtered])

  // Proveedores que aparecen en los abonos enriquecidos (no en catálogo completo)
  const provsEnAbonos = useMemo(() => {
    const ids = Array.from(new Set(enriched.map(a => a.id_proveedor).filter(Boolean)))
    return ids.map(id => ({ id, nombre: provMap[id] ?? `#${id}` }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [enriched, provMap])

  const exportXLSX = () => {
    const rows = filtered.map(a => ({
      Fecha:           a.fecha_abono ?? '',
      'Folio OP':      a.folio,
      Concepto:        a.concepto,
      Proveedor:       a.proveedor,
      'Forma de Pago': a.forma_pago ?? '—',
      Referencia:      a.referencia ?? '—',
      'Cuenta Bancaria': a.cuenta_nombre,
      'Monto Pagado':  a.monto ?? 0,
      Notas:           a.notas ?? '',
      'Registrado por': a.created_by ?? '',
    }))
    const ws  = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 28 },
      { wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 14 },
      { wch: 30 }, { wch: 18 },
    ]
    const wb  = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos Aplicados')
    const fecha = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Pagos-Aplicados_${fecha}.xlsx`)
  }

  const selStyle: React.CSSProperties = {
    height: 32, padding: '0 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, fontSize: 13, background: '#fff',
    fontFamily: 'var(--font-body)', color: 'var(--text-primary)',
  }
  const inputStyle: React.CSSProperties = { ...selStyle, width: 130 }

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proveedor</div>
          <select style={{ ...selStyle, width: 220 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
            <option value="">Todos</option>
            {provsEnAbonos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cuenta Bancaria</div>
          <select style={{ ...selStyle, width: 200 }} value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)}>
            <option value="">Todas</option>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha de</div>
          <input type="date" style={inputStyle} value={filtroDe} onChange={e => setFiltroDe(e.target.value)} />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha a</div>
          <input type="date" style={inputStyle} value={filtroA} onChange={e => setFiltroA(e.target.value)} />
        </div>

        <button className="btn-ghost" onClick={fetchData} title="Refrescar"
          style={{ height: 32, alignSelf: 'flex-end' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Pagado',     value: fmt(totalPagado),        color: '#0f766e', bg: '#f0fdfa' },
          { label: 'Pagos Registrados', value: filtered.length.toString(), color: 'var(--blue)', bg: 'var(--blue-pale)' },
          { label: 'Proveedores',      value: numProveedores.toString(), color: '#7c3aed', bg: '#f5f3ff' },
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
            <PrintBar title="Pagos-Aplicados" count={filtered.length} reportTitle="Reporte de Pagos Aplicados" />
            <button className="btn-secondary" onClick={exportXLSX} style={{ fontSize: 12 }}>
              <FileSpreadsheet size={13} /> Exportar Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Sin registros con los filtros seleccionados</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Fecha', 'Folio OP', 'Concepto', 'Proveedor', 'Forma Pago', 'Referencia', 'Cuenta Bancaria', 'Monto'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: h === 'Monto' ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtF(a.fecha_abono)}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.folio}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: 280,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.concepto}>{a.concepto}</td>
                    <td style={{ padding: '8px 12px', maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.proveedor}>{a.proveedor}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>{a.forma_pago ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 12, maxWidth: 160,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.referencia ?? ''}>{a.referencia ?? '—'}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontSize: 12 }}>{a.cuenta_nombre}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600,
                      color: '#0f766e', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmt(a.monto ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0fdfa', borderTop: '2px solid #99f6e4' }}>
                  <td colSpan={7} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 13, color: '#0f766e' }}>Total</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14,
                    color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totalPagado)}
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
