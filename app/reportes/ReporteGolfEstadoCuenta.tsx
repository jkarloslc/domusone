'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import EstadoCuentaBancario, { SelectorMes } from './EstadoCuentaBancario'
import { construirEstadoCuenta, type CuotaLibro, type ReciboLibro, type EstadoCuenta } from '@/lib/estadoCuentaLibro'

type Socio = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  telefono: string | null
  email: string | null
  cat_categorias_socios?: { nombre: string }
}

const TIPO_LABEL: Record<string, string> = {
  INSCRIPCION:     'Inscripción',
  MENSUALIDAD:     'Mensualidad',
  PENSION_CARRITO: 'Pensión Carrito',
}

const fmtNombre = (s: Socio) =>
  [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

export default function ReporteGolfEstadoCuenta() {
  const hoy = new Date()
  const inicioAnio = `${hoy.getFullYear()}-01-01`
  const hoyStr = hoy.toISOString().split('T')[0]

  const [socios, setSocios] = useState<Socio[]>([])
  const [idSocio, setIdSocio] = useState<number | ''>('')
  const [fechaDesde, setFechaDesde] = useState(inicioAnio)
  const [fechaHasta, setFechaHasta] = useState(hoyStr)

  const [ec, setEc] = useState<EstadoCuenta | null>(null)
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dbGolf.from('cat_socios')
      .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, telefono, email, cat_categorias_socios(nombre)')
      .eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setSocios(data ?? []))
  }, [])

  const socioSel = socios.find(s => s.id === idSocio)

  const fetchData = useCallback(async () => {
    if (idSocio === '') return
    setLoading(true); setBuscado(true); setError('')
    // Historial completo hasta la fecha de corte: el saldo anterior se calcula
    // con los movimientos previos a "Desde".
    const [{ data: cuotasData, error: e1 }, { data: recibosData, error: e2 }] = await Promise.all([
      dbGolf.from('cxc_golf')
        .select('id, tipo, concepto, periodo, monto_final, saldo, status, fecha_emision, fecha_vencimiento, fecha_pago, id_recibo_fk')
        .eq('id_socio_fk', idSocio)
        .order('fecha_emision', { ascending: true }),
      dbGolf.from('recibos_golf')
        .select('id, folio, fecha_recibo, total, forma_pago_nombre, referencia_pago, recibos_golf_det(id_cuota_fk, concepto, monto_final)')
        .eq('id_socio_fk', idSocio)
        .eq('status', 'VIGENTE')
        .lte('fecha_recibo', fechaHasta)
        .order('fecha_recibo', { ascending: true }),
    ])
    if (e1 || e2) { setError((e1 ?? e2)!.message); setEc(null); setLoading(false); return }
    const recibos: ReciboLibro[] = ((recibosData ?? []) as any[]).map(r => ({ ...r, det: r.recibos_golf_det ?? [] }))
    setEc(construirEstadoCuenta((cuotasData ?? []) as CuotaLibro[], recibos, fechaDesde, fechaHasta,
      c => TIPO_LABEL[c.tipo ?? ''] ?? (c.tipo ?? '')))
    setLoading(false)
  }, [idSocio, fechaDesde, fechaHasta])

  // Ya consultado: al cambiar de mes o de titular se actualiza solo
  useEffect(() => { if (buscado) fetchData() }, [fetchData]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Socio *</label>
          <select className="input" value={idSocio} onChange={e => setIdSocio(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 260 }}>
            <option value="">— Seleccionar —</option>
            {socios.map(s => (
              <option key={s.id} value={s.id}>
                {s.numero_socio ? `${s.numero_socio} — ` : ''}{fmtNombre(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Mes</label>
          <SelectorMes desde={fechaDesde} hasta={fechaHasta} onChange={(d, h) => { setFechaDesde(d); setFechaHasta(h) }} style={{ height: 34 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hasta (corte)</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
      </div>
      {/* Barra de acción */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn-primary" onClick={fetchData} disabled={idSocio === '' || loading} style={{ fontSize: 13 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && ec && <PrintBar title={`Estado-Cuenta-Golf-${socioSel ? [socioSel.nombre, socioSel.apellido_paterno].filter(Boolean).join('-') : 'socio'}`} count={ec.movimientos.length} reportTitle="Estado de Cuenta — Club Golf" />}
      </div>

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Selecciona un socio y haz clic en Consultar
        </div>
      )}

      {error && (
        <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #C23B3B', color: '#C23B3B', padding: '10px 14px', fontSize: 13, borderRadius: 6 }}>
          {error}
        </div>
      )}

      {buscado && !loading && ec && socioSel && (
        <div id="reporte-print-area">
          <EstadoCuentaBancario
            titulo="Estado de Cuenta — Club Golf"
            titular={fmtNombre(socioSel)}
            campos={[
              { label: 'Núm. socio', value: socioSel.numero_socio ?? '' },
              { label: 'Categoría', value: socioSel.cat_categorias_socios?.nombre ?? '' },
              { label: 'Teléfono', value: socioSel.telefono ?? '' },
              { label: 'Correo', value: socioSel.email ?? '' },
            ]}
            desde={fechaDesde} hasta={fechaHasta} ec={ec}
          />
        </div>
      )}
    </div>
  )
}
