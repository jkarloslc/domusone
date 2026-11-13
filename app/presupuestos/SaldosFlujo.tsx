'use client'
import { Fragment, useState } from 'react'
import { Pencil, ChevronRight, ChevronDown, Landmark, AlertTriangle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { FUENTE_LABEL, type DiaSaldo, type FuenteSaldo } from '@/lib/saldosFlujo'

/**
 * UI de saldos de Flujo de Efectivo: tarjeta del periodo, tabla mensual,
 * vista diaria y modal de captura. La lógica vive en lib/saldosFlujo.ts.
 */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fmt = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })
const fmtFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
const colorSaldo = (v: number) => v < 0 ? '#dc2626' : '#1e293b'

type Resumen = {
  inicial: number; inicialCapturado: boolean; ingresos: number; egresos: number; neto: number; final: number
  real: number | null; fechaReal: string | null; fuenteReal: FuenteSaldo | null; diferencia: number | null
}
export type Captura = { tipo: 'inicial' | 'real'; fecha: string; monto: number | null; notas?: string | null }

function AvisoInicial({ inicialCapturado, fechaInicioAnio }: { inicialCapturado: boolean; fechaInicioAnio: boolean }) {
  if (inicialCapturado || !fechaInicioAnio) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#b45309' }}>
      <AlertTriangle size={12} /> Sin saldo inicial capturado: se parte de $0
    </span>
  )
}

// ── Tarjeta del periodo ──────────────────────────────────────────────────────
export function TarjetaSaldos({ r, periodo, fechaIni, fechaFin, esInicioAnio, fuentesActivas, canWrite, onCapturar }: {
  r: Resumen; periodo: string; fechaIni: string; fechaFin: string; esInicioAnio: boolean
  fuentesActivas: FuenteSaldo[]; canWrite: boolean
  onCapturar: (tipo: 'inicial' | 'real', fecha: string, actual: number | null) => void
}) {
  const box: React.CSSProperties = { flex: '1 1 150px', padding: '10px 14px', borderRight: '1px solid #f1f5f9' }
  const lbl: React.CSSProperties = { fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: 6 }
  const val: React.CSSProperties = { fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }
  const editBtn = (tipo: 'inicial' | 'real', fecha: string, actual: number | null) => canWrite && (
    <button className="btn-ghost" title={tipo === 'inicial' ? `Capturar saldo inicial al ${fmtFecha(fecha)}` : `Capturar saldo real al ${fmtFecha(fecha)}`}
      onClick={() => onCapturar(tipo, fecha, actual)} style={{ padding: 2, color: '#64748b' }}><Pencil size={12} /></button>
  )
  return (
    <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#475569', flexWrap: 'wrap' }}>
        <Landmark size={14} /> <strong>Saldos de efectivo · {periodo}</strong>
        <span style={{ color: '#94a3b8' }}>· Consolidado de todas las cuentas · considera todas las partidas (sin filtros)</span>
        <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>Fuentes de saldo real: {fuentesActivas.map(f => FUENTE_LABEL[f]).join(', ')}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={box}>
          <div style={lbl}>Saldo inicial {editBtn('inicial', fechaIni, r.inicialCapturado ? r.inicial : null)}</div>
          <div style={{ ...val, color: colorSaldo(r.inicial) }}>{fmt(r.inicial)}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.inicialCapturado ? 'Capturado' : 'Arrastre del periodo anterior'}</div>
          <AvisoInicial inicialCapturado={r.inicialCapturado} fechaInicioAnio={esInicioAnio} />
        </div>
        <div style={box}>
          <div style={lbl}>+ Ingresos</div>
          <div style={{ ...val, color: '#15803d' }}>{fmt(r.ingresos)}</div>
        </div>
        <div style={box}>
          <div style={lbl}>− Egresos</div>
          <div style={{ ...val, color: '#dc2626' }}>{fmt(r.egresos)}</div>
        </div>
        <div style={box}>
          <div style={lbl}>= Saldo final calculado</div>
          <div style={{ ...val, color: colorSaldo(r.final) }}>{fmt(r.final)}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Flujo neto {fmt(r.neto)}</div>
        </div>
        <div style={box}>
          <div style={lbl}>Saldo real en banco {editBtn('real', r.fechaReal ?? fechaFin, r.real)}</div>
          <div style={{ ...val, color: r.real == null ? '#cbd5e1' : colorSaldo(r.real) }}>{r.real == null ? '—' : fmt(r.real)}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.real == null ? 'Sin capturar' : `${FUENTE_LABEL[r.fuenteReal!]} · al ${fmtFecha(r.fechaReal!)}`}</div>
        </div>
        <div style={{ ...box, borderRight: 'none' }}>
          <div style={lbl}>Diferencia sin conciliar</div>
          <div style={{ ...val, color: r.diferencia == null ? '#cbd5e1' : Math.abs(r.diferencia) < 1 ? '#15803d' : '#b45309' }}>
            {r.diferencia == null ? '—' : fmt(r.diferencia)}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Real − calculado</div>
        </div>
      </div>
    </div>
  )
}

// ── Tabla mensual (debajo de la vista Mensual) ──────────────────────────────
export function SaldosMensuales({ meses, mesSel = 0 }: { meses: (Resumen | null)[]; mesSel?: number }) {
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', textAlign: 'right', background: '#f8fafc', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 10px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const filas: { label: string; v: (r: Resumen) => number | null; bold?: boolean }[] = [
    { label: 'Saldo inicial', v: r => r.inicial },
    { label: '+ Ingresos', v: r => r.ingresos },
    { label: '− Egresos', v: r => r.egresos },
    { label: '= Saldo final calculado', v: r => r.final, bold: true },
    { label: 'Saldo real en banco', v: r => r.real },
    { label: 'Diferencia sin conciliar', v: r => r.diferencia },
  ]
  return (
    <div style={{ overflowX: 'auto', borderTop: '2px solid #e2e8f0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Saldos de efectivo (consolidado)</th>
          {MESES.map((m, i) => <th key={m} style={{ ...th, ...(mesSel && mesSel !== i + 1 ? { color: '#cbd5e1' } : {}) }}>{m}</th>)}
        </tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.label} style={{ borderBottom: '1px solid #f1f5f9', background: f.bold ? '#f1f5f9' : '#fff' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: f.bold ? 700 : 600, color: '#334155' }}>{f.label}</td>
              {meses.map((r, i) => {
                const v = r && (!mesSel || mesSel === i + 1) ? f.v(r) : null
                return <td key={i} style={{ ...td, fontWeight: f.bold ? 700 : 400, color: v == null ? '#cbd5e1' : colorSaldo(v) }}>{v == null ? '—' : fmt(v)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Vista Diario ─────────────────────────────────────────────────────────────
export type MovDia = { fecha: string; tipo: 'ingreso' | 'egreso'; partida: string; folio?: string | null; descripcion?: string | null; monto: number; mensual?: boolean }

export function VistaDiaria({ dias, movs, canWrite, onCapturar, sinMes }: {
  dias: DiaSaldo[]; movs: MovDia[]; canWrite: boolean; sinMes: boolean
  onCapturar: (tipo: 'inicial' | 'real', fecha: string, actual: number | null) => void
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [soloConMov, setSoloConMov] = useState(true)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
  const visibles = dias.filter(d => !soloConMov || d.ingresos || d.egresos || d.real != null || d.inicialCapturado || d.fecha === dias[0]?.fecha)
  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', textAlign: 'right', background: '#f8fafc', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }
  const td: React.CSSProperties = { padding: '7px 12px', fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const edit = (tipo: 'inicial' | 'real', d: DiaSaldo) => canWrite && (
    <button className="btn-ghost" onClick={e => { e.stopPropagation(); onCapturar(tipo, d.fecha, tipo === 'inicial' ? (d.inicialCapturado ? d.inicial : null) : (d.fuenteReal === 'manual' ? d.real : null)) }}
      title={tipo === 'inicial' ? 'Capturar saldo inicial de este día' : 'Capturar saldo real al cierre de este día'}
      style={{ padding: 2, marginLeft: 4, color: '#94a3b8' }}><Pencil size={11} /></button>
  )
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', fontSize: 12, color: '#475569' }}>
        {sinMes && <span style={{ color: '#b45309' }}>Elige un mes en el filtro para ver otro mes; se muestra el mes en curso.</span>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={soloConMov} onChange={e => setSoloConMov(e.target.checked)} /> Solo días con movimiento
        </label>
        <span style={{ color: '#94a3b8' }}>Clic en un día para ver sus recibos y pagos · saldo consolidado, todas las partidas</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Día</th>
            <th style={th}>Saldo inicial</th><th style={th}>+ Ingresos</th><th style={th}>− Egresos</th>
            <th style={th}>Saldo final</th><th style={th}>Saldo real</th><th style={th}>Diferencia</th>
          </tr></thead>
          <tbody>
            {visibles.map(d => {
              const abierto = abiertos.has(d.fecha)
              const delDia = movs.filter(m => m.fecha === d.fecha)
              const futuro = d.fecha > hoy
              return (
                <Fragment key={d.fecha}>
                  <tr onClick={() => delDia.length && setAbiertos(s => { const n = new Set(s); n.has(d.fecha) ? n.delete(d.fecha) : n.add(d.fecha); return n })}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: delDia.length ? 'pointer' : 'default', background: futuro ? '#fcfcfd' : '#fff', opacity: futuro ? 0.6 : 1 }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 14, color: '#94a3b8' }}>{delDia.length ? (abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</span>
                        {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })}
                        {delDia.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>· {delDia.length}</span>}
                      </span>
                    </td>
                    <td style={{ ...td, color: colorSaldo(d.inicial) }}>
                      {fmt(d.inicial)}{d.inicialCapturado && <span title="Capturado" style={{ color: '#0e7490', fontWeight: 700 }}> ●</span>}{edit('inicial', d)}
                    </td>
                    <td style={{ ...td, color: d.ingresos ? '#15803d' : '#cbd5e1' }}>{d.ingresos ? fmt(d.ingresos) : '—'}</td>
                    <td style={{ ...td, color: d.egresos ? '#dc2626' : '#cbd5e1' }}>{d.egresos ? fmt(d.egresos) : '—'}</td>
                    <td style={{ ...td, fontWeight: 700, color: colorSaldo(d.final) }}>{fmt(d.final)}</td>
                    <td style={{ ...td, color: d.real == null ? '#cbd5e1' : colorSaldo(d.real) }}>
                      {d.real == null ? '—' : fmt(d.real)}
                      {d.fuenteReal && d.fuenteReal !== 'manual' && <span style={{ fontSize: 10, color: '#64748b' }}> ({FUENTE_LABEL[d.fuenteReal]})</span>}
                      {edit('real', d)}
                    </td>
                    <td style={{ ...td, color: d.diferencia == null ? '#cbd5e1' : Math.abs(d.diferencia) < 1 ? '#15803d' : '#b45309' }}>
                      {d.diferencia == null ? '—' : fmt(d.diferencia)}
                    </td>
                  </tr>
                  {abierto && delDia.map((m, i) => (
                    <tr key={i} style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      <td colSpan={2} style={{ ...td, textAlign: 'left', paddingLeft: 40, color: '#475569' }}>
                        <span style={{ fontWeight: 600 }}>{m.partida}</span>
                        {m.folio && <span style={{ color: '#94a3b8' }}> · {m.folio}</span>}
                        {m.descripcion && <span style={{ color: '#94a3b8' }}> · {m.descripcion}</span>}
                        {m.mensual && <span style={{ color: '#b45309' }}> · real manual del mes</span>}
                      </td>
                      <td style={{ ...td, color: '#15803d' }}>{m.tipo === 'ingreso' ? fmt(m.monto) : ''}</td>
                      <td style={{ ...td, color: '#dc2626' }}>{m.tipo === 'egreso' ? fmt(m.monto) : ''}</td>
                      <td colSpan={3} />
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Modal de captura ─────────────────────────────────────────────────────────
export function SaldoModal({ captura, onClose, onGuardar }: {
  captura: Captura; onClose: () => void; onGuardar: (c: Captura) => Promise<void>
}) {
  const [fecha, setFecha] = useState(captura.fecha)
  const [monto, setMonto] = useState(captura.monto != null ? String(captura.monto) : '')
  const [notas, setNotas] = useState(captura.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const titulo = captura.tipo === 'inicial' ? 'Saldo inicial' : 'Saldo real en banco'
  const guardar = async (borrar = false) => {
    const n = parseFloat(monto.replace(/,/g, ''))
    if (!borrar && !isFinite(n)) { setError('Escribe un monto'); return }
    setGuardando(true); setError('')
    try { await onGuardar({ tipo: captura.tipo, fecha, monto: borrar ? null : n, notas: notas || null }); onClose() }
    catch (e: any) { setError(e?.message ?? String(e)) }
    finally { setGuardando(false) }
  }
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#374151' }
  return (
    <ModalShell modulo="presupuestos" titulo={titulo} subtitulo="Consolidado de todas las cuentas" icono={Landmark} size="sm" onClose={onClose}
      footer={<>
        {captura.monto != null && <button className="btn-ghost" disabled={guardando} onClick={() => guardar(true)} style={{ color: '#dc2626', marginRight: 'auto' }}>Quitar captura</button>}
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={guardando} onClick={() => guardar(false)}>Guardar</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
          {captura.tipo === 'inicial'
            ? 'Saldo al INICIO del día. El del 1 de enero es el saldo inicial del año; en otra fecha corrige el saldo encadenado desde ese día.'
            : 'Saldo en banco al CIERRE del día. Se compara contra el saldo calculado para mostrar la diferencia sin conciliar.'}
        </p>
        <label style={lbl}>Fecha<input className="input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        <label style={lbl}>Monto *<input className="input" type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" autoFocus /></label>
        <label style={lbl}>Notas<input className="input" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej. según estado de cuenta" /></label>
        {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
      </div>
    </ModalShell>
  )
}
