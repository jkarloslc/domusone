'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { RefreshCw, CreditCard, Search, X, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import CobrarCuotaModal from '../carritos/CobrarCuotaModal'

type Cuota = {
  id: number
  id_socio_fk: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  status: string
  fecha_emision: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  forma_pago: string | null
  tipo: string
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null
}

const hoy = new Date().toISOString().split('T')[0]
const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const vencida = (f: string | null) => f ? f < hoy : false

export default function CXCGolfPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-cxc')

  const [cuotas, setCuotas]           = useState<Cuota[]>([])
  const [loading, setLoading]         = useState(true)
  const [busqueda, setBusqueda]       = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('PENDIENTE')
  const [filtroTipo, setFiltroTipo]   = useState<string>('')
  const [showCobrar, setShowCobrar]   = useState<{ cuotas: Cuota[]; nombreSocio: string } | null>(null)

  // Stats
  const [stats, setStats] = useState({ pendiente: 0, montoPendiente: 0, vencidas: 0, pagadas: 0 })

  const fetchCuotas = useCallback(async () => {
    setLoading(true)
    let q = dbGolf.from('cxc_golf')
      .select(`id, id_socio_fk, concepto, periodo, monto_original, descuento, monto_final,
        status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo,
        cat_socios(nombre, apellido_paterno, apellido_materno)`)
      .order('fecha_vencimiento', { ascending: true })
    if (filtroStatus) q = q.eq('status', filtroStatus)
    if (filtroTipo)   q = q.eq('tipo', filtroTipo)
    const { data } = await q
    const rows = (data as Cuota[]) ?? []
    setCuotas(rows)

    // Stats siempre sobre todos los registros pendientes
    const { data: all } = await dbGolf.from('cxc_golf').select('status, monto_final, fecha_vencimiento')
    const allRows = all ?? []
    const pend = allRows.filter((r: any) => r.status === 'PENDIENTE')
    setStats({
      pendiente:      pend.length,
      montoPendiente: pend.reduce((a: number, r: any) => a + (r.monto_final ?? 0), 0),
      vencidas:       pend.filter((r: any) => vencida(r.fecha_vencimiento)).length,
      pagadas:        allRows.filter((r: any) => r.status === 'PAGADO').length,
    })

    setLoading(false)
  }, [filtroStatus, filtroTipo])

  useEffect(() => { fetchCuotas() }, [fetchCuotas])

  const cuotasF = cuotas.filter(c => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    return nc(c.cat_socios).toLowerCase().includes(q) || c.concepto.toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', textDecoration: 'none', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2563eb'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94a3b8'}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>/</span>
            <CreditCard size={13} style={{ color: '#059669' }} />
            <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>CXC Golf</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            CXC Golf
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Cuentas por cobrar — Membresías y Pensiones de Carrito
          </p>
        </div>
        <button className="btn-ghost" onClick={fetchCuotas} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Cuotas Pendientes', value: stats.pendiente,              color: '#d97706', bg: '#fffbeb' },
          { label: 'Monto por Cobrar',  value: fmt$(stats.montoPendiente),   color: '#dc2626', bg: '#fef2f2' },
          { label: 'Cuotas Vencidas',   value: stats.vencidas,               color: '#dc2626', bg: '#fef2f2' },
          { label: 'Pagadas',           value: stats.pagadas,                color: '#059669', bg: '#ecfdf5' },
        ].map(c => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', maxWidth: 220, padding: '12px 16px', background: c.bg, border: `1px solid ${c.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            placeholder="Buscar socio o concepto…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          {busqueda && (
            <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
              <X size={12} />
            </button>
          )}
        </div>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todos los status</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PAGADO">Pagado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todos los tipos</option>
          <option value="PENSION_CARRITO">Pensión Carrito</option>
          <option value="MEMBRESIA">Membresía</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
      ) : cuotasF.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin cuotas</div>
          <div style={{ fontSize: 12 }}>No hay registros con los filtros actuales</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cuotasF.map(c => {
            const venc = vencida(c.fecha_vencimiento) && c.status === 'PENDIENTE'
            const statusColor = c.status === 'PAGADO' ? '#15803d' : c.status === 'CANCELADO' ? '#64748b' : venc ? '#dc2626' : '#d97706'
            const statusBg   = c.status === 'PAGADO' ? '#f0fdf4' : c.status === 'CANCELADO' ? '#f8fafc' : venc ? '#fef2f2' : '#fffbeb'
            return (
              <div key={c.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{c.concepto}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {nc(c.cat_socios)}
                    {c.periodo && <span style={{ marginLeft: 8, color: '#94a3b8' }}>· {c.periodo}</span>}
                    {c.fecha_vencimiento && (
                      <span style={{ marginLeft: 8, color: venc ? '#dc2626' : '#94a3b8' }}>
                        · {venc ? '⚠ Vencida' : 'Vence'} {new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {c.status === 'PAGADO' && c.fecha_pago && (
                      <span style={{ marginLeft: 8, color: '#15803d' }}>
                        · Pagado {new Date(c.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {c.forma_pago && ` (${c.forma_pago})`}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: c.tipo === 'PENSION_CARRITO' ? '#ecfdf5' : '#eff6ff', color: c.tipo === 'PENSION_CARRITO' ? '#065f46' : '#1d4ed8', fontWeight: 600 }}>
                    {c.tipo === 'PENSION_CARRITO' ? '🚗 Pensión' : '🏌️ Membresía'}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: statusBg, color: statusColor, fontWeight: 600 }}>
                    {c.status}
                  </span>
                  {c.descuento > 0 && (
                    <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 700, color: statusColor }}>{fmt$(c.monto_final)}</span>
                  {c.status === 'PENDIENTE' && puedeEscribir && (
                    <button
                      onClick={() => setShowCobrar({ cuotas: [c], nombreSocio: nc(c.cat_socios) })}
                      style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                      Cobrar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total de resultados */}
      {!loading && cuotasF.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
          {cuotasF.length} registro{cuotasF.length !== 1 ? 's' : ''}
          {filtroStatus === 'PENDIENTE' && (
            <span style={{ marginLeft: 8, fontWeight: 600, color: '#d97706' }}>
              · Total pendiente: {fmt$(cuotasF.reduce((a, c) => a + c.monto_final, 0))}
            </span>
          )}
        </div>
      )}

      {/* Modal cobro */}
      {showCobrar && (
        <CobrarCuotaModal
          cuotas={showCobrar.cuotas}
          nombreSocio={showCobrar.nombreSocio}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { setShowCobrar(null); fetchCuotas() }}
        />
      )}
    </div>
  )
}
