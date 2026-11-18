'use client'
// Formato de estado de cuenta tipo bancario, compartido por Golf e Hípico.
// Datos: lib/estadoCuentaLibro.ts (construirEstadoCuenta).
import type { EstadoCuenta } from '@/lib/estadoCuentaLibro'

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmt$ = (v: number) =>
  (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const NUM: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }
const TH: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, fontSize: 10, color: '#C9CCD3', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'left' }
const TD: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #E6E8EB', verticalAlign: 'top' }
const ETQ: React.CSSProperties = { fontSize: 10, color: '#7A7E87', textTransform: 'uppercase', letterSpacing: '.06em' }

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

  const resumen: { label: string; value: number; signo: string; fuerte?: boolean }[] = [
    { label: 'Saldo anterior', value: ec.saldoAnterior, signo: '' },
    { label: 'Cargos del periodo', value: ec.cargos, signo: '+' },
    ...(ec.ajustesCargo > 0 ? [{ label: 'Ajustes', value: ec.ajustesCargo, signo: '+' }] : []),
    { label: 'Pagos recibidos', value: ec.pagos, signo: '−' },
    ...(ec.bonificaciones > 0 ? [{ label: 'Bonificaciones y descuentos', value: ec.bonificaciones, signo: '−' }] : []),
  ]

  return (
    <div>
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#33363C', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
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

      {/* Movimientos */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1C1D21', margin: '0 0 8px' }}>
        Detalle de movimientos ({ec.movimientos.length})
      </h3>
      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#1C1D21' }}>
              <th style={{ ...TH, width: 96 }}>Fecha</th>
              <th style={{ ...TH, width: 110 }}>Referencia</th>
              <th style={TH}>Concepto</th>
              <th style={{ ...TH, textAlign: 'right', width: 120 }}>Cargos</th>
              <th style={{ ...TH, textAlign: 'right', width: 120 }}>Abonos</th>
              <th style={{ ...TH, textAlign: 'right', width: 130 }}>Saldo</th>
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
            {ec.movimientos.map(m => (
              <tr key={m.key}>
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
            ))}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#1C1D21' }}>
                <th style={TH}>Concepto</th>
                <th style={{ ...TH, width: 100 }}>Periodo</th>
                <th style={{ ...TH, width: 110 }}>Vencimiento</th>
                <th style={{ ...TH, textAlign: 'right', width: 120 }}>Importe</th>
                <th style={{ ...TH, textAlign: 'right', width: 120 }}>Saldo</th>
                <th style={{ ...TH, width: 100 }}>Estado</th>
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
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, color: '#fff', background: p.vencida ? '#C23B3B' : '#B5761A' }}>
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
