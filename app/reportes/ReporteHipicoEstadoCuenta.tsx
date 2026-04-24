'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbHip } from '@/lib/supabase'
import { PrintBar } from './utils'

type Arrendatario = {
  id: number
  nombre: string
  apellido_paterno: string | null
  razon_social: string | null
  tipo_persona: string
}

type Cargo = {
  id: number
  descripcion: string
  mes_aplicacion: string | null
  monto: number
  saldo: number
  fecha_vencimiento: string | null
  status: string
  created_at: string
}

type Pago = {
  id: number
  folio: string
  fecha_pago: string
  monto_total: number
  forma_pago: string
  referencia: string | null
  ctrl_pagos_det?: { monto: number; ctrl_cargos?: { descripcion: string } }[]
}

const fmtNombre = (a: Arrendatario) => {
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Pendiente': { bg: '#fef9c3', color: '#ca8a04' },
  'Pagado':    { bg: '#dcfce7', color: '#16a34a' },
  'Vencido':   { bg: '#fee2e2', color: '#dc2626' },
  'Cancelado': { bg: '#f8fafc', color: '#64748b' },
}

export default function ReporteHipicoEstadoCuenta() {
  const hoy = new Date()
  const primerMes = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1).toISOString().split('T')[0]
  const ultimoMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0]

  const [arrendatarios, setArrendatarios] = useState<Arrendatario[]>([])
  const [idArr, setIdArr] = useState<number | ''>('')
  const [fechaDesde, setFechaDesde] = useState(primerMes)
  const [fechaHasta, setFechaHasta] = useState(ultimoMes)

  const [cargos, setCargos] = useState<Cargo[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)

  // Cargar arrendatarios
  useEffect(() => {
    dbHip.from('cat_arrendatarios')
      .select('id, nombre, apellido_paterno, razon_social, tipo_persona')
      .eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
  }, [])

  const arrendatarioSel = arrendatarios.find(a => a.id === idArr)

  const fetchData = useCallback(async () => {
    if (idArr === '') return
    setLoading(true); setBuscado(true)

    // Cargos del período
    const { data: cargosData } = await dbHip
      .from('ctrl_cargos')
      .select('id, descripcion, mes_aplicacion, monto, saldo, fecha_vencimiento, status, created_at')
      .eq('id_arrendatario_fk', idArr)
      .gte('created_at', fechaDesde)
      .lte('created_at', fechaHasta + 'T23:59:59')
      .order('created_at', { ascending: true })

    // Pagos del período
    const { data: pagosData } = await dbHip
      .from('ctrl_pagos')
      .select('id, folio, fecha_pago, monto_total, forma_pago, referencia, ctrl_pagos_det(monto, ctrl_cargos(descripcion))')
      .eq('id_arrendatario_fk', idArr)
      .gte('fecha_pago', fechaDesde)
      .lte('fecha_pago', fechaHasta)
      .order('fecha_pago', { ascending: true })

    setCargos((cargosData as unknown as Cargo[]) ?? [])
    setPagos((pagosData as unknown as Pago[]) ?? [])
    setLoading(false)
  }, [idArr, fechaDesde, fechaHasta])

  // KPIs
  const totalCargos   = cargos.reduce((s, c) => s + c.monto, 0)
  const totalPagado   = pagos.reduce((s, p) => s + p.monto_total, 0)
  const saldoPendiente = cargos.filter(c => c.status !== 'Pagado' && c.status !== 'Cancelado').reduce((s, c) => s + c.saldo, 0)
  const cargosVencidos = cargos.filter(c => c.status === 'Vencido' || (c.status === 'Pendiente' && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date()))

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario *</label>
          <select className="input" value={idArr} onChange={e => setIdArr(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 220 }}>
            <option value="">— Seleccionar —</option>
            {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombre(a)}</option>)}
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
        <button className="btn-primary" onClick={fetchData} disabled={idArr === '' || loading} style={{ fontSize: 12 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && <PrintBar title={`Estado-Cuenta-Hipico-${arrendatarioSel ? fmtNombre(arrendatarioSel).replace(/\s+/g,'-') : 'arrendatario'}`} count={cargos.length + pagos.length} reportTitle="Estado de Cuenta — Módulo Hípico" />}
      </div>

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Selecciona un arrendatario y haz clic en Consultar
        </div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          {/* Encabezado impresión */}
          <div className="print-only" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Estado de Cuenta — Módulo Hípico</h2>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>
              {arrendatarioSel ? fmtNombre(arrendatarioSel) : ''} &nbsp;·&nbsp;
              {fmtFecha(fechaDesde)} al {fmtFecha(fechaHasta)}
            </p>
          </div>

          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Cargos',     value: fmt$(totalCargos),     color: '#2563eb', bg: '#eff6ff' },
              { label: 'Total Pagado',     value: fmt$(totalPagado),     color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Saldo Pendiente',  value: fmt$(saldoPendiente),  color: saldoPendiente > 0 ? '#dc2626' : '#16a34a', bg: saldoPendiente > 0 ? '#fef2f2' : '#f0fdf4' },
              { label: 'Cargos Vencidos',  value: cargosVencidos.length.toString(), color: '#dc2626', bg: '#fef2f2' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Tabla cargos */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Cargos ({cargos.length})
          </h3>
          {cargos.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Sin cargos en el período</p>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0, marginBottom: 24 }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    {['Descripción', 'Mes Aplicación', 'Vencimiento', 'Monto', 'Saldo', 'Status'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cargos.map((c, i) => {
                    const sc = STATUS_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
                    const vencido = c.fecha_vencimiento && c.status === 'Pendiente' && new Date(c.fecha_vencimiento) < new Date()
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{c.descripcion}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>
                          {c.mes_aplicacion ? new Date(c.mes_aplicacion + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', color: vencido ? '#dc2626' : 'var(--text-muted)', fontWeight: vencido ? 600 : 400 }}>{fmtFecha(c.fecha_vencimiento)}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(c.monto)}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: c.saldo > 0 ? '#dc2626' : '#16a34a' }}>{fmt$(c.saldo)}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status}</span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                    <td colSpan={3} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt$(totalCargos)}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: saldoPendiente > 0 ? '#dc2626' : '#16a34a' }}>{fmt$(saldoPendiente)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Tabla pagos */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Pagos / Recibos ({pagos.length})
          </h3>
          {pagos.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin pagos registrados en el período</p>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    {['Folio', 'Fecha', 'Forma de Pago', 'Referencia', 'Cargos cubiertos', 'Total'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--gold-light)', fontFamily: 'monospace', fontSize: 11 }}>{p.folio}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{fmtFecha(p.fecha_pago)}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{p.forma_pago}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{p.referencia ?? '—'}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11 }}>
                        {(p.ctrl_pagos_det ?? []).map((d, j) => (
                          <span key={j}>{d.ctrl_cargos?.descripcion ?? '—'}{j < (p.ctrl_pagos_det?.length ?? 0) - 1 ? ', ' : ''}</span>
                        ))}
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(p.monto_total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                    <td colSpan={5} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL PAGADO</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(totalPagado)}</td>
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
