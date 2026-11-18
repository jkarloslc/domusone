'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { PrintBar } from './utils'
import EstadoCuentaBancario from './EstadoCuentaBancario'
import { construirEstadoCuenta, type CuotaLibro, type ReciboLibro, type EstadoCuenta } from '@/lib/estadoCuentaLibro'

type Arrendatario = {
  id: number
  nombre: string
  apellido_paterno: string | null
  razon_social: string | null
  tipo_persona: string
}

const fmtNombre = (a: Arrendatario) => {
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}

const fmtMes = (p: string | null) =>
  p && /^\d{4}-\d{2}$/.test(p)
    ? new Date(p + '-01T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    : (p ?? '')

export default function ReporteHipicoEstadoCuenta() {
  const hoy = new Date()
  const inicioAnio = `${hoy.getFullYear()}-01-01`
  const hoyIso     = hoy.toISOString().split('T')[0]

  const [arrendatarios, setArrendatarios] = useState<Arrendatario[]>([])
  const [idArr, setIdArr] = useState<number | ''>('')
  const [fechaDesde, setFechaDesde] = useState(inicioAnio)
  const [fechaHasta, setFechaHasta] = useState(hoyIso)

  const [ec, setEc] = useState<EstadoCuenta | null>(null)
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dbHip.from('cat_arrendatarios')
      .select('id, nombre, apellido_paterno, razon_social, tipo_persona')
      .eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
  }, [])

  const arrendatarioSel = arrendatarios.find(a => a.id === idArr)

  const fetchData = useCallback(async () => {
    if (idArr === '') return
    setLoading(true); setBuscado(true); setError('')
    // Historial completo hasta la fecha de corte: el saldo anterior se calcula
    // con los movimientos previos a "Desde".
    const [{ data: cargosData, error: e1 }, { data: pagosData, error: e2 }] = await Promise.all([
      dbHip.from('cxc_hip')
        .select('id, tipo, concepto, periodo, monto_final, saldo, status, fecha_emision, fecha_vencimiento, fecha_pago')
        .eq('id_arrendatario_fk', idArr)
        .order('fecha_vencimiento', { ascending: true }),
      dbHip.from('recibos_hip')
        .select('id, folio, fecha_recibo, total, forma_pago_nombre, referencia_pago, recibos_hip_det(id_cuota_fk, concepto, monto_final)')
        .eq('id_arrendatario_fk', idArr)
        .eq('status', 'VIGENTE')
        .lte('fecha_recibo', fechaHasta)
        .order('fecha_recibo', { ascending: true }),
    ])
    if (e1 || e2) { setError((e1 ?? e2)!.message); setEc(null); setLoading(false); return }
    const recibos: ReciboLibro[] = ((pagosData ?? []) as any[]).map(r => ({ ...r, det: r.recibos_hip_det ?? [] }))
    setEc(construirEstadoCuenta((cargosData ?? []) as CuotaLibro[], recibos, fechaDesde, fechaHasta,
      c => fmtMes(c.periodo)))
    setLoading(false)
  }, [idArr, fechaDesde, fechaHasta])

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Arrendatario *</label>
          <select className="input" value={idArr} onChange={e => setIdArr(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 13, minWidth: 240, height: 36 }}>
            <option value="">— Seleccionar —</option>
            {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombre(a)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            style={{ fontSize: 13, height: 36, width: 150 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Hasta (corte)</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            style={{ fontSize: 13, height: 36, width: 150 }} />
        </div>
        <button className="btn-primary" onClick={fetchData} disabled={idArr === '' || loading}
          style={{ fontSize: 13, height: 36, padding: '0 20px', alignSelf: 'flex-end' }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && ec && (
          <div style={{ alignSelf: 'flex-end' }}>
            <PrintBar title={`Estado-Cuenta-Hipico-${arrendatarioSel ? fmtNombre(arrendatarioSel).replace(/\s+/g, '-') : 'arrendatario'}`} count={ec.movimientos.length} reportTitle="Estado de Cuenta — Módulo Hípico" />
          </div>
        )}
      </div>

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Selecciona un arrendatario y haz clic en Consultar
        </div>
      )}

      {error && (
        <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #C23B3B', color: '#C23B3B', padding: '10px 14px', fontSize: 13, borderRadius: 6 }}>
          {error}
        </div>
      )}

      {buscado && !loading && ec && arrendatarioSel && (
        <div id="reporte-print-area">
          <EstadoCuentaBancario
            titulo="Estado de Cuenta — Hípico"
            titular={fmtNombre(arrendatarioSel)}
            campos={[{ label: 'Tipo de persona', value: arrendatarioSel.tipo_persona ?? '' }]}
            desde={fechaDesde} hasta={fechaHasta} ec={ec}
          />
        </div>
      )}
    </div>
  )
}
