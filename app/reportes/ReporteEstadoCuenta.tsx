'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCfg, dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Building2 } from 'lucide-react'

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function ReporteEstadoCuenta() {
  const [cuentas,      setCuentas]     = useState<any[]>([])
  const [filtroCuenta, setFiltroCuenta] = useState('')
  const [filtroDe,     setFiltroDe]    = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().slice(0, 10)          // primer día del mes actual
  })
  const [filtroA, setFiltroA] = useState(new Date().toISOString().slice(0, 10))
  const [movs,        setMovs]        = useState<any[]>([])
  const [cuentaInfo,  setCuentaInfo]  = useState<any | null>(null)
  const [loading,     setLoading]     = useState(false)

  // Cargar catálogo de cuentas
  useEffect(() => {
    dbCfg.from('cuentas_bancarias')
      .select('id, banco, numero_cuenta, clabe, saldo')
      .eq('activo', true).order('banco')
      .then(({ data }) => {
        setCuentas(data ?? [])
        if (data && data.length === 1) setFiltroCuenta(data[0].id.toString())
      })
  }, [])

  const fetchData = useCallback(async () => {
    if (!filtroCuenta) return
    setLoading(true)
    const [{ data: cb }, { data: ms }] = await Promise.all([
      dbCfg.from('cuentas_bancarias').select('*').eq('id', Number(filtroCuenta)).single(),
      dbComp.from('movimientos_bancarios')
        .select('*')
        .eq('id_cuenta_fk', Number(filtroCuenta))
        .gte('fecha_movimiento', filtroDe)
        .lte('fecha_movimiento', filtroA)
        .order('fecha_movimiento', { ascending: true })
        .order('created_at',      { ascending: true }),
    ])
    setCuentaInfo(cb ?? null)
    setMovs(ms ?? [])
    setLoading(false)
  }, [filtroCuenta, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  // Resumen
  const saldoInicial = movs.length > 0 ? (movs[0].saldo_antes ?? 0)                  : (cuentaInfo?.saldo ?? 0)
  const saldoFinal   = movs.length > 0 ? (movs[movs.length - 1].saldo_despues ?? 0)  : saldoInicial
  const totalAbonos  = movs.filter(m => m.tipo === 'Abono').reduce((a, m) => a + (m.monto ?? 0), 0)
  const totalCargos  = movs.filter(m => m.tipo === 'Cargo').reduce((a, m) => a + (m.monto ?? 0), 0)

  const periodoLabel = filtroDe && filtroA
    ? `${fmtD(filtroDe)} — ${fmtD(filtroA)}`
    : 'Sin período definido'

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px', maxWidth: 300 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>
            Cuenta Bancaria
          </label>
          <select className="select" value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)}>
            <option value="">— Seleccionar cuenta —</option>
            {cuentas.map(c => (
              <option key={c.id} value={c.id}>
                {c.banco}{c.numero_cuenta ? ` · ${c.numero_cuenta}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>
            Del
          </label>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 150 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>
            Al
          </label>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 150 }} />
        </div>
        <button className="btn-ghost" style={{ padding: '8px 10px' }} onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Sin cuenta seleccionada */}
      {!filtroCuenta && (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Building2 size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>Selecciona una cuenta bancaria para generar el estado de cuenta</div>
        </div>
      )}

      {/* Loading */}
      {filtroCuenta && loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      )}

      {/* Estado de cuenta */}
      {filtroCuenta && !loading && cuentaInfo && (
        <div>
          <PrintBar
            title={`Estado de Cuenta — ${cuentaInfo.banco}`}
            count={movs.length}
            reportTitle={`Estado de Cuenta · ${cuentaInfo.banco} · ${periodoLabel}`}
          />

          <div id="reporte-print-area" className="card" style={{ overflow: 'hidden' }}>

            {/* Encabezado de cuenta */}
            <div style={{ padding: '20px 24px', borderBottom: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#0f766e18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={18} style={{ color: '#0f766e' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{cuentaInfo.banco}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 2, flexWrap: 'wrap' }}>
                    {cuentaInfo.numero_cuenta && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>No. {cuentaInfo.numero_cuenta}</span>
                    )}
                    {cuentaInfo.clabe && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>CLABE: {cuentaInfo.clabe}</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Período</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{periodoLabel}</div>
              </div>
            </div>

            {/* Resumen de 4 tarjetas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #f1f5f9' }}>
              {[
                { label: 'Saldo Inicial',  value: saldoInicial, color: '#475569' },
                { label: 'Total Abonos',   value: totalAbonos,  color: '#15803d' },
                { label: 'Total Cargos',   value: totalCargos,  color: '#dc2626' },
                { label: 'Saldo Final',    value: saldoFinal,   color: '#0f766e' },
              ].map((s, i) => (
                <div key={s.label} style={{
                  padding: '16px 20px', textAlign: 'center',
                  borderRight: i < 3 ? '1px solid #f1f5f9' : 'none',
                  background: i === 3 ? '#f0fdf4' : 'transparent',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(s.value)}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla de movimientos */}
            {movs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
                Sin movimientos en el período seleccionado
              </div>
            ) : (
              <table id="reporte-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Fecha</th>
                    <th>Concepto</th>
                    <th>Referencia</th>
                    <th style={{ textAlign: 'center', width: 80 }}>Tipo</th>
                    <th style={{ textAlign: 'right', width: 130 }}>Cargo (−)</th>
                    <th style={{ textAlign: 'right', width: 130 }}>Abono (+)</th>
                    <th style={{ textAlign: 'right', width: 140 }}>Saldo</th>
                    <th style={{ width: 110 }}>Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Fila de saldo inicial */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtD(filtroDe)}</td>
                    <td style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-muted)' }}>Saldo al inicio del período</td>
                    <td>—</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                      {fmt(saldoInicial)}
                    </td>
                    <td></td>
                  </tr>

                  {/* Movimientos */}
                  {movs.map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtD(m.fecha_movimiento)}</td>
                      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.concepto ?? '—'}
                      </td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {m.referencia ?? '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                          background: m.tipo === 'Cargo' ? '#fef2f2' : '#f0fdf4',
                          color:      m.tipo === 'Cargo' ? '#dc2626'  : '#15803d',
                          border:     `1px solid ${m.tipo === 'Cargo' ? '#fecaca' : '#bbf7d0'}`,
                        }}>
                          {m.tipo}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13,
                        fontWeight: m.tipo === 'Cargo' ? 700 : 400,
                        color: m.tipo === 'Cargo' ? '#dc2626' : 'var(--text-muted)' }}>
                        {m.tipo === 'Cargo' ? fmt(m.monto ?? 0) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13,
                        fontWeight: m.tipo === 'Abono' ? 700 : 400,
                        color: m.tipo === 'Abono' ? '#15803d' : 'var(--text-muted)' }}>
                        {m.tipo === 'Abono' ? fmt(m.monto ?? 0) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: (m.saldo_despues ?? 0) < 0 ? '#dc2626' : '#0f172a' }}>
                        {m.saldo_despues != null ? fmt(m.saldo_despues) : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.created_by ?? '—'}</td>
                    </tr>
                  ))}

                  {/* Fila de totales */}
                  <tr style={{ background: '#f0fdf4', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={4} style={{ fontSize: 12, color: '#0f766e' }}>Totales del período</td>
                    <td style={{ textAlign: 'right', color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totalCargos)}
                    </td>
                    <td style={{ textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totalAbonos)}
                    </td>
                    <td style={{ textAlign: 'right', color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(saldoFinal)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
