'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'

type Socio = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  cat_categorias_socios?: { nombre: string }
}

type Cuota = {
  id: number
  tipo: string
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  status: string
  fecha_emision: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  id_recibo_fk: number | null
}

type Recibo = {
  id: number
  folio: string
  fecha_recibo: string
  subtotal: number
  descuento: number
  total: number
  forma_pago_nombre: string | null
  referencia_pago: string | null
  status: string
  folio_fiscal: string | null
  recibos_golf_det?: { concepto: string; tipo: string | null; monto_final: number }[]
}

const fmtNombre = (s: Socio) =>
  [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'PENDIENTE':  { bg: '#fef9c3', color: '#ca8a04' },
  'PAGADO':     { bg: '#dcfce7', color: '#16a34a' },
  'CANCELADO':  { bg: '#f8fafc', color: '#64748b' },
  'VIGENTE':    { bg: '#dcfce7', color: '#16a34a' },
}

const TIPO_LABEL: Record<string, string> = {
  INSCRIPCION:     'Inscripción',
  MENSUALIDAD:     'Mensualidad',
  PENSION_CARRITO: 'Pensión Carrito',
}

export default function ReporteGolfEstadoCuenta() {
  const hoy = new Date()
  const inicioAnio = `${hoy.getFullYear()}-01-01`
  const hoyStr = hoy.toISOString().split('T')[0]

  const [socios, setSocios] = useState<Socio[]>([])
  const [idSocio, setIdSocio] = useState<number | ''>('')
  const [fechaDesde, setFechaDesde] = useState(inicioAnio)
  const [fechaHasta, setFechaHasta] = useState(hoyStr)

  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)

  useEffect(() => {
    dbGolf.from('cat_socios')
      .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre)')
      .eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setSocios(data ?? []))
  }, [])

  const socioSel = socios.find(s => s.id === idSocio)

  const fetchData = useCallback(async () => {
    if (idSocio === '') return
    setLoading(true); setBuscado(true)

    const [{ data: cuotasData }, { data: recibosData }] = await Promise.all([
      dbGolf.from('cxc_golf')
        .select('id, tipo, concepto, periodo, monto_original, descuento, monto_final, status, fecha_emision, fecha_vencimiento, fecha_pago, id_recibo_fk')
        .eq('id_socio_fk', idSocio)
        .gte('fecha_emision', fechaDesde)
        .lte('fecha_emision', fechaHasta)
        .order('fecha_emision', { ascending: true }),
      dbGolf.from('recibos_golf')
        .select('id, folio, fecha_recibo, subtotal, descuento, total, forma_pago_nombre, referencia_pago, status, folio_fiscal, recibos_golf_det(concepto, tipo, monto_final)')
        .eq('id_socio_fk', idSocio)
        .gte('fecha_recibo', fechaDesde)
        .lte('fecha_recibo', fechaHasta)
        .order('fecha_recibo', { ascending: true }),
    ])

    setCuotas((cuotasData as Cuota[]) ?? [])
    setRecibos((recibosData as Recibo[]) ?? [])
    setLoading(false)
  }, [idSocio, fechaDesde, fechaHasta])

  // KPIs
  const totalCargado   = cuotas.reduce((s, c) => s + c.monto_final, 0)
  const totalCobrado   = recibos.filter(r => r.status === 'VIGENTE').reduce((s, r) => s + r.total, 0)
  const saldoPendiente = cuotas.filter(c => c.status === 'PENDIENTE').reduce((s, c) => s + c.monto_final, 0)
  const totalVencido   = cuotas.filter(c => c.status === 'PENDIENTE' && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date()).reduce((s, c) => s + c.monto_final, 0)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Socio *</label>
          <select className="input" value={idSocio} onChange={e => setIdSocio(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 240 }}>
            <option value="">— Seleccionar —</option>
            {socios.map(s => (
              <option key={s.id} value={s.id}>
                {s.numero_socio ? `${s.numero_socio} — ` : ''}{fmtNombre(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <button className="btn-primary" onClick={fetchData} disabled={idSocio === '' || loading} style={{ fontSize: 12 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && <PrintBar targetId="reporte-print-area" />}
      </div>

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Selecciona un socio y haz clic en Consultar
        </div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          {/* Encabezado impresión */}
          <div className="print-only" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Estado de Cuenta — Club Golf</h2>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>
              {socioSel ? fmtNombre(socioSel) : ''}
              {socioSel?.cat_categorias_socios?.nombre ? ` · ${socioSel.cat_categorias_socios.nombre}` : ''}
              &nbsp;·&nbsp; {fmtFecha(fechaDesde)} al {fmtFecha(fechaHasta)}
            </p>
          </div>

          {/* Info socio */}
          {socioSel && (
            <div className="card" style={{ padding: '12px 18px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
              <div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Socio</span>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmtNombre(socioSel)}</div>
              </div>
              {socioSel.numero_socio && (
                <div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Núm. Socio</span>
                  <div style={{ fontWeight: 600, color: 'var(--gold-light)', fontFamily: 'monospace' }}>{socioSel.numero_socio}</div>
                </div>
              )}
              {socioSel.cat_categorias_socios?.nombre && (
                <div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Categoría</span>
                  <div style={{ fontWeight: 600 }}>{socioSel.cat_categorias_socios.nombre}</div>
                </div>
              )}
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Cargado',    value: fmt$(totalCargado),   color: '#2563eb', bg: '#eff6ff' },
              { label: 'Total Cobrado',    value: fmt$(totalCobrado),   color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Saldo Pendiente',  value: fmt$(saldoPendiente), color: saldoPendiente > 0 ? '#dc2626' : '#16a34a', bg: saldoPendiente > 0 ? '#fef2f2' : '#f0fdf4' },
              { label: 'Vencido',          value: fmt$(totalVencido),   color: '#dc2626', bg: '#fef2f2' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Tabla cuotas */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Cuotas ({cuotas.length})
          </h3>
          {cuotas.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Sin cuotas en el período</p>
            : (
              <div className="card" style={{ overflow: 'hidden', padding: 0, marginBottom: 24 }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      {['Tipo', 'Concepto', 'Período', 'Emisión', 'Vencimiento', 'Monto', 'Descuento', 'Total', 'Status'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cuotas.map((c, i) => {
                      const sc = STATUS_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
                      const vencida = c.status === 'PENDIENTE' && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date()
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                              {TIPO_LABEL[c.tipo] ?? c.tipo}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{c.concepto}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{c.periodo ?? '—'}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{fmtFecha(c.fecha_emision)}</td>
                          <td style={{ padding: '9px 12px', color: vencida ? '#dc2626' : 'var(--text-muted)', fontWeight: vencida ? 600 : 400 }}>{fmtFecha(c.fecha_vencimiento)}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{fmt$(c.monto_original)}</td>
                          <td style={{ padding: '9px 12px', color: c.descuento > 0 ? '#16a34a' : 'var(--text-muted)' }}>
                            {c.descuento > 0 ? `-${fmt$(c.descuento)}` : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt$(c.monto_final)}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status}</span>
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                      <td colSpan={7} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt$(totalCargado)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          }

          {/* Tabla recibos */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Recibos emitidos ({recibos.length})
          </h3>
          {recibos.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin recibos en el período</p>
            : (
              <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      {['Folio', 'Fecha', 'Forma Pago', 'Referencia', 'Conceptos', 'Descuento', 'Total', 'Status', 'Fiscal'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recibos.map((r, i) => {
                      const sc = STATUS_COLOR[r.status] ?? { bg: '#f8fafc', color: '#64748b' }
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--gold-light)', fontFamily: 'monospace', fontSize: 11 }}>{r.folio}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha_recibo)}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{r.forma_pago_nombre ?? '—'}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{r.referencia_pago ?? '—'}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11, maxWidth: 200 }}>
                            {(r.recibos_golf_det ?? []).map((d, j) => (
                              <span key={j}>{d.concepto}{j < (r.recibos_golf_det?.length ?? 0) - 1 ? ', ' : ''}</span>
                            ))}
                          </td>
                          <td style={{ padding: '9px 12px', color: r.descuento > 0 ? '#16a34a' : 'var(--text-muted)' }}>
                            {r.descuento > 0 ? `-${fmt$(r.descuento)}` : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(r.total)}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{r.status}</span>
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 11, color: r.folio_fiscal ? '#16a34a' : 'var(--text-muted)' }}>
                            {r.folio_fiscal ? '✓ ' + r.folio_fiscal.slice(0, 8) + '…' : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                      <td colSpan={6} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL COBRADO</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(totalCobrado)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}
