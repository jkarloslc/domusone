'use client'
// Formato de estado de cuenta tipo bancario, compartido por Golf e Hípico.
// Datos: lib/estadoCuentaLibro.ts (construirEstadoCuenta).
import { Fragment } from 'react'
import type { EstadoCuenta } from '@/lib/estadoCuentaLibro'

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmt$ = (v: number) =>
  (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtMes = (ym: string) =>
  new Date(ym + '-01T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

const NUM: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }
const TH: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, fontSize: 10, color: '#C9CCD3', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'left' }
const TD: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #E6E8EB', verticalAlign: 'top' }
const ETQ: React.CSSProperties = { fontSize: 10, color: '#7A7E87', textTransform: 'uppercase', letterSpacing: '.06em' }

// Detalle compacto: tamaño máximo 6.5 pt en pantalla e impresión. El selector
// con #reporte-print-area gana a las reglas de impresión de PrintBar (10px/8px).
const CSS_DETALLE = `
table.ec-detalle, table.ec-detalle *,
#reporte-print-area table.ec-detalle, #reporte-print-area table.ec-detalle * { font-size: 6.5pt !important; line-height: 1.25 !important; }
table.ec-detalle th, table.ec-detalle td,
#reporte-print-area table.ec-detalle th, #reporte-print-area table.ec-detalle td { padding: 2px 6px !important; }
table.ec-detalle .ec-pill { padding: 0 5px !important; }
`

const CLASE_LABEL: Record<string, string> = {
  cuota: 'Cargo', consumo: 'Consumo', pago: 'Pago', bonificacion: 'Bonificación', ajuste: 'Ajuste',
}

export default function EstadoCuentaBancario({ titulo, titular, campos, desde, hasta, ec }: {
  titulo: string
  titular: string
  campos: { label: string; value: string }[]
  desde: string
  hasta: string
  ec: EstadoCuenta
}) {
  const saldoColor = (v: number) => v > 0.009 ? '#C23B3B' : v < -0.009 ? '#1F7A50' : '#1C1D21'
  const saldoTxt = (v: number) => v < -0.009 ? `${fmt$(-v)} a favor` : fmt$(v)
  const variosMeses = ec.meses.length > 1

  const resumen: { label: string; value: number; signo: string; fuerte?: boolean }[] = [
    { label: 'Saldo anterior', value: ec.saldoAnterior, signo: '' },
    { label: 'Cargos del periodo', value: ec.cargos, signo: '+' },
    ...(ec.ajustesCargo > 0 ? [{ label: 'Ajustes', value: ec.ajustesCargo, signo: '+' }] : []),
    { label: 'Pagos recibidos', value: ec.pagos, signo: '−' },
    ...(ec.bonificaciones > 0 ? [{ label: 'Bonificaciones y descuentos', value: ec.bonificaciones, signo: '−' }] : []),
  ]

  return (
    <div>
      <style>{CSS_DETALLE}</style>
      {/* Encabezado: titular + periodo */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ background: '#1C1D21', color: '#fff', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em' }}>{titulo}</div>
          <div style={{ fontSize: 12, color: '#C9CCD3' }}>
            Periodo: <strong style={{ color: '#fff' }}>{fmtFecha(desde)}</strong> al <strong style={{ color: '#fff' }}>{fmtFecha(hasta)}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* Titular */}
          <div style={{ flex: '1 1 300px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={ETQ}>Titular</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1D21' }}>{titular}</div>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {campos.filter(c => c.value).map(c => (
                <div key={c.label}>
                  <div style={ETQ}>{c.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#33363C', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{c.value}</div>
                </div>
              ))}
              <div>
                <div style={ETQ}>Fecha de corte</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#33363C' }}>{fmtFecha(hasta)}</div>
              </div>
            </div>
          </div>
          {/* Resumen */}
          <div style={{ flex: '1 1 320px', padding: '14px 18px', background: '#F4F5F7', borderLeft: '1px solid #E6E8EB' }}>
            <div style={{ ...ETQ, marginBottom: 6 }}>Resumen del periodo</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {resumen.map(r => (
                  <tr key={r.label}>
                    <td style={{ padding: '3px 0', color: '#4A4D54' }}>
                      <span style={{ display: 'inline-block', width: 14, color: '#7A7E87' }}>{r.signo}</span>{r.label}
                    </td>
                    <td style={{ ...NUM, padding: '3px 0', color: '#1C1D21' }}>{fmt$(r.value)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '8px 0 2px', borderTop: '1px solid #C9CCD3', fontWeight: 700, color: '#1C1D21' }}>
                    <span style={{ display: 'inline-block', width: 14, color: '#7A7E87' }}>=</span>Saldo al corte
                  </td>
                  <td style={{ ...NUM, padding: '8px 0 2px', borderTop: '1px solid #C9CCD3', fontSize: 16, color: saldoColor(ec.saldoFinal) }}>
                    {saldoTxt(ec.saldoFinal)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 0 0 14px', fontSize: 11, color: '#62666E' }}>Vencido / por vencer</td>
                  <td style={{ ...NUM, padding: '2px 0 0', fontSize: 11, fontWeight: 600, color: '#62666E' }}>
                    <span style={{ color: ec.vencido > 0 ? '#C23B3B' : '#62666E' }}>{fmt$(ec.vencido)}</span> / {fmt$(ec.porVencer)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Resumen por mes: el saldo final de cada mes es el inicial del siguiente */}
      {variosMeses && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1C1D21', margin: '0 0 8px' }}>Resumen por mes</h3>
          <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
            <table className="ec-detalle" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr style={{ background: '#1C1D21' }}>
                  <th style={TH}>Mes</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Saldo inicial</th>
                  <th style={{ ...TH, textAlign: 'right' }}>(+) Cargos</th>
                  <th style={{ ...TH, textAlign: 'right' }}>(−) Pagos</th>
                  <th style={{ ...TH, textAlign: 'right' }}>(−) Bonificaciones</th>
                  <th style={{ ...TH, textAlign: 'right' }}>(=) Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {ec.meses.map(r => (
                  <tr key={r.mes}>
                    <td style={{ ...TD, fontWeight: 600, color: '#1C1D21', textTransform: 'capitalize' }}>{fmtMes(r.mes)}</td>
                    <td style={{ ...TD, ...NUM, color: saldoColor(r.saldoInicial) }}>{fmt$(r.saldoInicial)}</td>
                    <td style={{ ...TD, ...NUM, color: '#1C1D21' }}>{r.cargos ? fmt$(r.cargos) : '—'}</td>
                    <td style={{ ...TD, ...NUM, color: '#1F7A50' }}>{r.pagos ? fmt$(r.pagos) : '—'}</td>
                    <td style={{ ...TD, ...NUM, color: '#1F7A50' }}>{r.bonificaciones ? fmt$(r.bonificaciones) : '—'}</td>
                    <td style={{ ...TD, ...NUM, color: saldoColor(r.saldoFinal) }}>{saldoTxt(r.saldoFinal)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#26282D' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fff' }}>Periodo</td>
                  <td style={{ ...NUM, padding: '10px 12px', color: '#fff' }}>{fmt$(ec.saldoAnterior)}</td>
                  <td style={{ ...NUM, padding: '10px 12px', color: '#fff' }}>{fmt$(ec.cargos + ec.ajustesCargo)}</td>
                  <td style={{ ...NUM, padding: '10px 12px', color: '#7CC9A3' }}>{fmt$(ec.pagos)}</td>
                  <td style={{ ...NUM, padding: '10px 12px', color: '#7CC9A3' }}>{fmt$(ec.bonificaciones)}</td>
                  <td style={{ ...NUM, padding: '10px 12px', color: ec.saldoFinal > 0.009 ? '#EBB5B5' : '#7CC9A3' }}>{saldoTxt(ec.saldoFinal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Movimientos */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1C1D21', margin: '0 0 8px' }}>
        Detalle de movimientos ({ec.movimientos.length})
      </h3>
      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table id="reporte-table" className="ec-detalle" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr style={{ background: '#1C1D21' }}>
              <th style={{ ...TH, width: 62 }}>Fecha</th>
              <th style={{ ...TH, width: 72 }}>Referencia</th>
              <th style={TH}>Concepto</th>
              <th style={{ ...TH, textAlign: 'right', width: 78 }}>Cargos</th>
              <th style={{ ...TH, textAlign: 'right', width: 78 }}>Abonos</th>
              <th style={{ ...TH, textAlign: 'right', width: 84 }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#F4F5F7' }}>
              <td style={{ ...TD, color: '#62666E', whiteSpace: 'nowrap' }}>{fmtFecha(desde)}</td>
              <td style={TD}></td>
              <td style={{ ...TD, fontWeight: 600, color: '#33363C' }}>Saldo anterior</td>
              <td style={TD}></td>
              <td style={TD}></td>
              <td style={{ ...TD, ...NUM, color: saldoColor(ec.saldoAnterior) }}>{fmt$(ec.saldoAnterior)}</td>
            </tr>
            {ec.movimientos.length === 0 && (
              <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: '#7A7E87', padding: 20 }}>Sin movimientos en el periodo</td></tr>
            )}
            {ec.movimientos.map((m, i) => {
              const mes = m.fecha.slice(0, 7)
              const cierraMes = variosMeses && (i === ec.movimientos.length - 1 || ec.movimientos[i + 1].fecha.slice(0, 7) !== mes)
              return (<Fragment key={m.key}>
              <tr>
                <td style={{ ...TD, color: '#62666E', whiteSpace: 'nowrap' }}>{fmtFecha(m.fecha)}</td>
                <td style={{ ...TD, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#33363C', fontSize: 11, whiteSpace: 'nowrap' }}>{m.referencia || '—'}</td>
                <td style={{ ...TD, color: '#1C1D21' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#7A7E87', textTransform: 'uppercase', letterSpacing: '.04em', marginRight: 6 }}>{CLASE_LABEL[m.clase]}</span>
                    {m.concepto}
                  </div>
                  {m.detalle && m.detalle !== m.concepto && (
                    <div style={{ fontSize: 11, color: '#7A7E87', marginTop: 1 }}>{m.detalle}</div>
                  )}
                </td>
                <td style={{ ...TD, ...NUM, color: '#1C1D21' }}>{m.cargo ? fmt$(m.cargo) : ''}</td>
                <td style={{ ...TD, ...NUM, color: '#1F7A50' }}>{m.abono ? fmt$(m.abono) : ''}</td>
                <td style={{ ...TD, ...NUM, color: saldoColor(m.saldo) }}>{fmt$(m.saldo)}</td>
              </tr>
              {cierraMes && (
                <tr style={{ background: '#E6E8EB' }}>
                  <td colSpan={5} style={{ ...TD, borderBottom: '1px solid #C9CCD3', fontWeight: 700, color: '#33363C', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Saldo al cierre de {fmtMes(mes)} · pasa al mes siguiente
                  </td>
                  <td style={{ ...TD, ...NUM, borderBottom: '1px solid #C9CCD3', color: saldoColor(m.saldo) }}>{fmt$(m.saldo)}</td>
                </tr>
              )}
              </Fragment>)
            })}
            <tr style={{ background: '#26282D' }}>
              <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, color: '#fff', fontSize: 12 }}>Totales del periodo · Saldo al corte</td>
              <td style={{ ...NUM, padding: '10px 12px', color: '#fff' }}>{fmt$(ec.cargos + ec.ajustesCargo)}</td>
              <td style={{ ...NUM, padding: '10px 12px', color: '#7CC9A3' }}>{fmt$(ec.pagos + ec.bonificaciones)}</td>
              <td style={{ ...NUM, padding: '10px 12px', color: ec.saldoFinal > 0.009 ? '#EBB5B5' : '#7CC9A3' }}>{saldoTxt(ec.saldoFinal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Integración del saldo */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1C1D21', margin: '0 0 8px' }}>
        Integración del saldo al corte ({ec.pendientes.length})
      </h3>
      {ec.pendientes.length === 0 ? (
        <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #1F7A50', color: '#1F7A50', padding: '10px 14px', fontSize: 13, borderRadius: 6 }}>
          Sin cuotas pendientes al {fmtFecha(hasta)}.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="ec-detalle" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
            <thead>
              <tr style={{ background: '#1C1D21' }}>
                <th style={TH}>Concepto</th>
                <th style={{ ...TH, width: 52 }}>Periodo</th>
                <th style={{ ...TH, width: 62 }}>Vencimiento</th>
                <th style={{ ...TH, textAlign: 'right', width: 78 }}>Importe</th>
                <th style={{ ...TH, textAlign: 'right', width: 78 }}>Saldo</th>
                <th style={{ ...TH, width: 60 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ec.pendientes.map(p => (
                <tr key={p.id}>
                  <td style={{ ...TD, color: '#1C1D21' }}>{p.concepto}</td>
                  <td style={{ ...TD, color: '#62666E', fontVariantNumeric: 'tabular-nums' }}>{p.periodo ?? '—'}</td>
                  <td style={{ ...TD, color: p.vencida ? '#C23B3B' : '#62666E', fontWeight: p.vencida ? 600 : 400, whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_vencimiento)}</td>
                  <td style={{ ...TD, ...NUM, color: '#33363C' }}>{fmt$(p.monto_final)}</td>
                  <td style={{ ...TD, ...NUM, color: '#1C1D21' }}>{fmt$(p.saldoCorte)}</td>
                  <td style={TD}>
                    <span className="ec-pill" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, color: '#fff', background: p.vencida ? '#C23B3B' : '#B5761A' }}>
                      {p.vencida ? 'VENCIDA' : 'POR VENCER'}
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#26282D' }}>
                <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700, color: '#fff' }}>Total adeudo en cuotas</td>
                <td style={{ ...NUM, padding: '10px 12px', color: '#fff' }}>{fmt$(ec.vencido + ec.porVencer)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Selector rápido de mes: fija Desde/Hasta al primer y último día del mes.
// El saldo anterior se calcula solo, así que al pasar de un mes al siguiente
// el adeudo se arrastra.
export function SelectorMes({ desde, hasta, onChange, style }: {
  desde: string; hasta: string
  onChange: (desde: string, hasta: string) => void
  style?: React.CSSProperties
}) {
  const hoy = new Date()
  const opciones: string[] = []
  for (let i = -24; i <= 2; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    opciones.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const finMes = (ym: string) => {
    const [y, m] = ym.split('-').map(Number)
    return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  }
  const ym = desde.slice(0, 7)
  const valor = desde === `${ym}-01` && hasta === finMes(ym) ? ym : ''
  const mover = (delta: number) => {
    const base = valor || ym
    const [y, m] = base.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    const n = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    onChange(`${n}-01`, finMes(n))
  }
  const btn: React.CSSProperties = { padding: '0 10px', border: '1px solid #C9CCD3', background: '#fff', borderRadius: 8, cursor: 'pointer', color: '#33363C', fontSize: 14 }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', ...style }}>
      <button type="button" style={btn} onClick={() => mover(-1)} title="Mes anterior">‹</button>
      <select className="input" value={valor} onChange={e => e.target.value && onChange(`${e.target.value}-01`, finMes(e.target.value))}
        style={{ fontSize: 12, minWidth: 160, textTransform: 'capitalize' }}>
        <option value="">Rango personalizado</option>
        {opciones.map(o => <option key={o} value={o}>{fmtMes(o)}</option>)}
      </select>
      <button type="button" style={btn} onClick={() => mover(1)} title="Mes siguiente">›</button>
    </div>
  )
}
