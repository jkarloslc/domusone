'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Receipt, CreditCard, RefreshCw } from 'lucide-react'
import CobrarCuotaModal from '../carritos/CobrarCuotaModal'

type Cuota = {
  id: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  saldo?: number
  status: string
  fecha_emision: string | null
  fecha_vencimiento: string | null
  fecha_pago: string | null
  forma_pago: string | null
  tipo: string
}

const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const hoyLocal = () => new Date().toLocaleDateString('en-CA')
const vencida  = (f: string | null) => !!f && f < hoyLocal()

const TIPOS_LABEL: Record<string, string> = {
  INSCRIPCION:     'Inscripción',
  MENSUALIDAD:     'Mensualidad',
  PENSION_CARRITO: 'Pensión Carrito',
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  PENDIENTE:    { bg: '#fffbeb', color: '#d97706', label: 'Pendiente'    },
  PAGO_PARCIAL: { bg: '#fff7ed', color: '#ea580c', label: 'Pago Parcial' },
  PAGADO:       { bg: '#f0fdf4', color: '#15803d', label: 'Pagado'       },
}

type FiltroStatus = 'TODOS' | 'PENDIENTE' | 'PAGADO'

const esMembresia = (tipo: string) => tipo === 'INSCRIPCION' || tipo === 'MENSUALIDAD'
const esPension   = (tipo: string) => tipo === 'PENSION_CARRITO'

type Props = {
  socioId: number
  nombreSocio: string
  /** Callback al cerrar después de un cobro exitoso (para que el padre refresque badges, etc.) */
  onRefresh?: () => void
}

export default function TabCobranzaSocio({ socioId, nombreSocio, onRefresh }: Props) {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-cxc')

  const [cuotas, setCuotas]       = useState<Cuota[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtro, setFiltro]       = useState<FiltroStatus>('TODOS')
  const [cuotasACobrar, setCuotasACobrar] = useState<Cuota[] | null>(null)

  const fetchCuotas = useCallback(async () => {
    setLoading(true)
    const { data } = await dbGolf
      .from('cxc_golf')
      .select('id, concepto, periodo, monto_original, descuento, monto_final, saldo, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo')
      .eq('id_socio_fk', socioId)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .order('fecha_emision', { ascending: true })
    setCuotas((data as Cuota[]) ?? [])
    setLoading(false)
  }, [socioId])

  useEffect(() => { fetchCuotas() }, [fetchCuotas])

  const pendientes = cuotas.filter(c => c.status === 'PENDIENTE' || c.status === 'PAGO_PARCIAL')
  const pagadas    = cuotas.filter(c => c.status === 'PAGADO')

  const montoPendiente = pendientes.reduce((a, c) => a + (c.saldo ?? c.monto_final), 0)
  const montoVencido   = pendientes.filter(c => vencida(c.fecha_vencimiento)).reduce((a, c) => a + (c.saldo ?? c.monto_final), 0)

  const filtradas = filtro === 'TODOS'
    ? cuotas
    : filtro === 'PENDIENTE'
      ? pendientes
      : pagadas

  const grupos = [
    { label: 'Membresía',      cuotas: filtradas.filter(c => esMembresia(c.tipo)), pendientes: pendientes.filter(c => esMembresia(c.tipo)) },
    { label: 'Pensión Carrito', cuotas: filtradas.filter(c => esPension(c.tipo)),    pendientes: pendientes.filter(c => esPension(c.tipo))    },
  ]

  const renderGrid = (grupo: typeof grupos[number]) => (
    <div key={grupo.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
          {grupo.label} <span style={{ fontWeight: 500, color: '#94a3b8' }}>({grupo.cuotas.length})</span>
        </div>
        {puedeEscribir && grupo.pendientes.length > 0 && (
          <button onClick={() => setCuotasACobrar(grupo.pendientes)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer' }}>
            <Receipt size={12} /> Cobrar ({grupo.pendientes.length})
          </button>
        )}
      </div>

      {grupo.cuotas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            {filtro === 'PENDIENTE' ? 'Sin cuotas pendientes' : filtro === 'PAGADO' ? 'Sin cuotas pagadas' : 'Sin cuotas registradas'}
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          {grupo.cuotas.map((c, i) => {
            const venc = vencida(c.fecha_vencimiento)
            const isPend = c.status === 'PENDIENTE' || c.status === 'PAGO_PARCIAL'
            const saldo = c.saldo ?? c.monto_final
            const sc = STATUS_CFG[c.status] ?? { bg: '#f1f5f9', color: '#64748b', label: c.status }
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px',
                borderBottom: i < grupo.cuotas.length - 1 ? '1px solid #f1f5f9' : 'none',
                background: venc && isPend ? '#fff5f5' : '#fff',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{c.concepto}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {c.periodo && <span>{c.periodo}</span>}
                    <span style={{ padding: '1px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                      {TIPOS_LABEL[c.tipo] ?? c.tipo}
                    </span>
                    {c.fecha_vencimiento && (
                      <span style={{ color: venc && isPend ? '#dc2626' : '#94a3b8' }}>
                        {venc && isPend ? '⚠ Vencida' : 'Vence'} {new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {c.status === 'PAGADO' && c.fecha_pago && (
                      <span style={{ color: '#15803d' }}>
                        Pagado {new Date(c.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {c.forma_pago ? ` · ${c.forma_pago}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                    {sc.label}
                  </span>
                  <div style={{ textAlign: 'right', minWidth: 80 }}>
                    {c.status === 'PAGO_PARCIAL' && c.monto_final !== saldo && (
                      <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(c.monto_final)}</div>
                    )}
                    {c.status === 'PENDIENTE' && c.descuento > 0 && (
                      <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</div>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 700, color: venc && isPend ? '#dc2626' : c.status === 'PAGADO' ? '#15803d' : c.status === 'PAGO_PARCIAL' ? '#ea580c' : '#1e293b' }}>
                      {fmt$(isPend ? saldo : c.monto_final)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* KPIs mini */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 110px', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Por cobrar</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: montoPendiente > 0 ? '#d97706' : '#15803d' }}>{fmt$(montoPendiente)}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{pendientes.length} cuota{pendientes.length !== 1 ? 's' : ''}</div>
          </div>
          {montoVencido > 0 && (
            <div style={{ flex: '1 1 110px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Vencido</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{fmt$(montoVencido)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{pendientes.filter(c => vencida(c.fecha_vencimiento)).length} vencida{pendientes.filter(c => vencida(c.fecha_vencimiento)).length !== 1 ? 's' : ''}</div>
            </div>
          )}
          <div style={{ flex: '1 1 110px', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#15803d', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Pagado total</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>
              {fmt$(pagadas.reduce((a, c) => a + c.monto_final, 0))}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{pagadas.length} cuota{pagadas.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['TODOS', 'PENDIENTE', 'PAGADO'] as const).map(f => {
              const counts = f === 'TODOS' ? cuotas.length : f === 'PENDIENTE' ? pendientes.length : pagadas.length
              const active = filtro === f
              return (
                <button key={f} onClick={() => setFiltro(f)}
                  style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: active ? '#059669' : '#e2e8f0', background: active ? '#ecfdf5' : '#fff', color: active ? '#15803d' : '#64748b' }}>
                  {f === 'TODOS' ? 'Todas' : f === 'PENDIENTE' ? 'Pendientes' : 'Pagadas'} ({counts})
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={fetchCuotas} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer' }}>
              <RefreshCw size={11} /> Actualizar
            </button>
          </div>
        </div>

        {/* Grids de cuotas por tipo */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
        ) : cuotas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
            <CreditCard size={28} style={{ color: '#cbd5e1', margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Sin cuotas registradas</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {grupos.map(renderGrid)}
          </div>
        )}
      </div>

      {/* El modal de cobro necesita z-index mayor al modal padre (1000) */}
      {cuotasACobrar && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100 }}>
          <CobrarCuotaModal
            cuotas={cuotasACobrar}
            nombreSocio={nombreSocio}
            idSocio={socioId}
            onClose={() => setCuotasACobrar(null)}
            onSaved={() => {
              setCuotasACobrar(null)
              fetchCuotas()
              onRefresh?.()
            }}
          />
        </div>
      )}
    </>
  )
}
