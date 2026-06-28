'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { TrendingUp, CreditCard, CheckCircle, Clock } from 'lucide-react'

type Cuota = {
  id: number
  tipo: string
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  saldo: number | null
  status: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  forma_pago: string | null
  cat_socios: {
    numero_socio: string | null
    nombre: string
    apellido_paterno: string | null
    apellido_materno: string | null
    cat_categorias_socios: { nombre: string } | null
  } | null
}

type Fila = {
  id: number
  socio: string
  numero: string | null
  categoria: string | null
  tipo: string
  concepto: string
  monto_cargo: number   // monto_final (lo que se cargó)
  cobrado: number       // lo que ya se pagó
  por_cobrar: number    // saldo pendiente
  status: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  forma_pago: string | null
}

const fmt$ = (v: number) => '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })
const pct  = (a: number, t: number) => t > 0 ? Math.round((a / t) * 100) : 0

const TIPO_LABEL: Record<string, string> = {
  MENSUALIDAD:     'Membresía',
  PENSION_CARRITO: 'Pensión Carrito',
  INSCRIPCION:     'Inscripción',
}

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  PAGADO:       { bg: '#dcfce7', color: '#15803d', label: 'Pagado'       },
  PENDIENTE:    { bg: '#fef9c3', color: '#ca8a04', label: 'Pendiente'    },
  PAGO_PARCIAL: { bg: '#fff7ed', color: '#ea580c', label: 'Pago Parcial' },
  CANCELADO:    { bg: '#f1f5f9', color: '#64748b', label: 'Cancelado'    },
}

// Genera lista de meses "YYYY-MM" de los últimos 12 meses + próximos 6
function mesesDisponibles() {
  const hoy  = new Date()
  const list: string[] = []
  for (let i = -12; i <= 6; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return list
}

function labelMes(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
}

export default function ReporteProyeccionCobranza() {
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  const [mes, setMes]               = useState(mesActual)
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'MENSUALIDAD' | 'PENSION_CARRITO'>('TODOS')
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'PENDIENTE' | 'PAGADO'>('TODOS')
  const [busqueda, setBusqueda]     = useState('')
  const [filas, setFilas]           = useState<Fila[]>([])
  const [loading, setLoading]       = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbGolf
      .from('cxc_golf')
      .select(`id, tipo, concepto, periodo, monto_original, descuento, monto_final, saldo,
        status, fecha_vencimiento, fecha_pago, forma_pago,
        cat_socios(numero_socio, nombre, apellido_paterno, apellido_materno,
          cat_categorias_socios(nombre))`)
      .eq('periodo', mes)
      .in('tipo', ['MENSUALIDAD', 'PENSION_CARRITO', 'INSCRIPCION'])
      .neq('status', 'CANCELADO')
      .order('status')
      .order('cat_socios(apellido_paterno)')

    const rows = (data as unknown as Cuota[]) ?? []

    setFilas(rows.map(c => {
      const cobrado    = c.status === 'PAGADO' ? c.monto_final
                       : c.status === 'PAGO_PARCIAL' ? c.monto_final - (c.saldo ?? 0)
                       : 0
      const por_cobrar = c.status === 'PAGADO' ? 0
                       : c.status === 'PAGO_PARCIAL' ? (c.saldo ?? 0)
                       : c.monto_final
      const s = c.cat_socios
      return {
        id:               c.id,
        socio:            s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—',
        numero:           s?.numero_socio ?? null,
        categoria:        s?.cat_categorias_socios?.nombre ?? null,
        tipo:             c.tipo,
        concepto:         c.concepto,
        monto_cargo:      c.monto_final,
        cobrado,
        por_cobrar,
        status:           c.status,
        fecha_vencimiento: c.fecha_vencimiento,
        fecha_pago:       c.fecha_pago,
        forma_pago:       c.forma_pago,
      }
    }))
    setLoading(false)
  }, [mes])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtros locales (rápidos, sin ir a BD)
  const filtradas = filas.filter(f => {
    if (filtroTipo !== 'TODOS' && f.tipo !== filtroTipo) return false
    if (filtroStatus === 'PENDIENTE' && f.status === 'PAGADO') return false
    if (filtroStatus === 'PAGADO'    && f.status !== 'PAGADO') return false
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      if (!f.socio.toLowerCase().includes(q) && !(f.numero ?? '').includes(q) && !f.concepto.toLowerCase().includes(q)) return false
    }
    return true
  })

  // KPIs sobre el total sin filtro de status/tipo para mostrar el panorama completo
  const totalCargo    = filas.reduce((a, f) => a + f.monto_cargo,  0)
  const totalCobrado  = filas.reduce((a, f) => a + f.cobrado,      0)
  const totalPendiente= filas.reduce((a, f) => a + f.por_cobrar,   0)
  const countPagadas  = filas.filter(f => f.status === 'PAGADO').length
  const countPend     = filas.filter(f => f.status !== 'PAGADO').length
  const avancePct     = pct(totalCobrado, totalCargo)

  // KPIs por tipo
  const porTipo = ['MENSUALIDAD', 'PENSION_CARRITO'].map(t => ({
    tipo:      t,
    label:     TIPO_LABEL[t],
    cargo:     filas.filter(f => f.tipo === t).reduce((a, f) => a + f.monto_cargo, 0),
    cobrado:   filas.filter(f => f.tipo === t).reduce((a, f) => a + f.cobrado,     0),
    pendiente: filas.filter(f => f.tipo === t).reduce((a, f) => a + f.por_cobrar,  0),
    total:     filas.filter(f => f.tipo === t).length,
    pagadas:   filas.filter(f => f.tipo === t && f.status === 'PAGADO').length,
  }))

  const meses = mesesDisponibles()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Selector de mes */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Período (mes)</label>
          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', minWidth: 200, textTransform: 'capitalize' }}>
            {meses.map(m => (
              <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{labelMes(m)}</option>
            ))}
          </select>
        </div>

        {/* Tipo */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Tipo de cuota</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'TODOS',          label: 'Todos'            },
              { key: 'MENSUALIDAD',    label: 'Membresía'        },
              { key: 'PENSION_CARRITO',label: 'Pensión Carrito'  },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setFiltroTipo(o.key)}
                style={{ padding: '7px 12px', fontSize: 12, fontWeight: filtroTipo === o.key ? 700 : 500, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: filtroTipo === o.key ? '#2563eb' : '#e2e8f0', background: filtroTipo === o.key ? '#eff6ff' : '#fff', color: filtroTipo === o.key ? '#1d4ed8' : '#64748b' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Status</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'TODOS',     label: 'Todos'      },
              { key: 'PENDIENTE', label: 'Por cobrar' },
              { key: 'PAGADO',    label: 'Cobrados'   },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setFiltroStatus(o.key)}
                style={{ padding: '7px 12px', fontSize: 12, fontWeight: filtroStatus === o.key ? 700 : 500, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: filtroStatus === o.key ? '#059669' : '#e2e8f0', background: filtroStatus === o.key ? '#ecfdf5' : '#fff', color: filtroStatus === o.key ? '#15803d' : '#64748b' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Búsqueda */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Buscar socio</label>
          <input
            style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
            placeholder="Nombre, No. socio…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <PrintBar
          title={`Proyección Cobranza — ${labelMes(mes)}`}
          count={filtradas.length}
          reportTitle={`Proyección de Cobranza — ${labelMes(mes)}`}
        />
      </div>

      {/* ── KPIs generales ──────────────────────────────────── */}
      {!loading && filas.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Total cargado',   value: fmt$(totalCargo),    sub: `${filas.length} cuota${filas.length !== 1 ? 's' : ''}`, color: '#2563eb', bg: '#eff6ff', icon: CreditCard  },
              { label: 'Cobrado',         value: fmt$(totalCobrado),  sub: `${countPagadas} pagada${countPagadas !== 1 ? 's' : ''}`, color: '#15803d', bg: '#f0fdf4', icon: CheckCircle },
              { label: 'Por cobrar',      value: fmt$(totalPendiente),sub: `${countPend} pendiente${countPend !== 1 ? 's' : ''}`,  color: '#d97706', bg: '#fffbeb', icon: Clock        },
              { label: 'Avance',          value: `${avancePct}%`,     sub: 'del total cargado',                                     color: '#7c3aed', bg: '#faf5ff', icon: TrendingUp   },
            ].map(k => {
              const Icon = k.icon
              return (
                <div key={k.label} style={{ flex: '1 1 150px', maxWidth: 220, padding: '14px 18px', background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <Icon size={14} style={{ color: k.color }} />
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{k.sub}</div>
                </div>
              )
            })}
          </div>

          {/* Barra de avance */}
          <div style={{ background: '#f1f5f9', borderRadius: 8, height: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${avancePct}%`, background: avancePct >= 80 ? '#15803d' : avancePct >= 50 ? '#d97706' : '#dc2626', borderRadius: 8, transition: 'width 0.4s' }} />
          </div>

          {/* KPIs por tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {porTipo.filter(t => t.total > 0).map(t => (
              <div key={t.tipo} style={{ padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>{t.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                  {[
                    { label: 'Cargo',    value: fmt$(t.cargo),    color: '#2563eb' },
                    { label: 'Cobrado',  value: fmt$(t.cobrado),  color: '#15803d' },
                    { label: 'Pendiente',value: fmt$(t.pendiente),color: '#d97706' },
                  ].map(col => (
                    <div key={col.label}>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{col.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: col.color }}>{col.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                  {t.pagadas} de {t.total} pagadas · {pct(t.cobrado, t.cargo)}% cobrado
                </div>
                <div style={{ marginTop: 4, background: '#e2e8f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct(t.cobrado, t.cargo)}%`, background: '#15803d', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Tabla detalle ─────────────────────────────────── */}
      <div id="reporte-print-area">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
              {loading ? 'Cargando…' : `${filtradas.length} cuota${filtradas.length !== 1 ? 's' : ''}`}
              {filtroTipo !== 'TODOS' && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>· {TIPO_LABEL[filtroTipo]}</span>}
            </span>
            {!loading && filtradas.length > 0 && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Cobrado: <strong style={{ color: '#15803d' }}>{fmt$(filtradas.reduce((a, f) => a + f.cobrado, 0))}</strong>
                {' '}· Por cobrar: <strong style={{ color: '#d97706' }}>{fmt$(filtradas.reduce((a, f) => a + f.por_cobrar, 0))}</strong>
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                  {['No.', 'Socio', 'Categoría', 'Tipo', 'Concepto', 'Cargo', 'Cobrado', 'Por cobrar', 'Status', 'Vencimiento', 'F. Pago', 'Forma Pago'].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: h === 'Cargo' || h === 'Cobrado' || h === 'Por cobrar' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</td></tr>
                ) : filtradas.length === 0 ? (
                  <tr><td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Sin cuotas para el período seleccionado</td></tr>
                ) : (
                  filtradas.map(f => {
                    const sc = STATUS_COLOR[f.status] ?? { bg: '#f1f5f9', color: '#64748b', label: f.status }
                    const venc = f.fecha_vencimiento && f.fecha_vencimiento < new Date().toLocaleDateString('en-CA') && f.status !== 'PAGADO'
                    return (
                      <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                        <td style={{ padding: '9px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {f.numero ?? '—'}
                        </td>
                        <td style={{ padding: '9px 10px', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap' }}>
                          {f.socio}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {f.categoria ?? '—'}
                        </td>
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                            background: f.tipo === 'PENSION_CARRITO' ? '#fff7ed' : '#eff6ff',
                            color:      f.tipo === 'PENSION_CARRITO' ? '#ea580c'  : '#2563eb' }}>
                            {TIPO_LABEL[f.tipo] ?? f.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: '#475569' }}>{f.concepto}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                          {fmt$(f.monto_cargo)}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#15803d', whiteSpace: 'nowrap' }}>
                          {f.cobrado > 0 ? fmt$(f.cobrado) : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: f.por_cobrar > 0 ? '#d97706' : '#94a3b8', whiteSpace: 'nowrap' }}>
                          {f.por_cobrar > 0 ? fmt$(f.por_cobrar) : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: venc ? '#dc2626' : '#64748b', fontWeight: venc ? 600 : 400, whiteSpace: 'nowrap', fontSize: 11 }}>
                          {f.fecha_vencimiento
                            ? new Date(f.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                          {venc && <span style={{ marginLeft: 4 }}>⚠</span>}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#64748b', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {f.fecha_pago
                            ? new Date(f.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#64748b', fontSize: 11 }}>
                          {f.forma_pago ?? '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!loading && filtradas.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: '10px 10px', fontSize: 12, color: '#475569' }}>
                      Total ({filtradas.length} cuotas)
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#1e293b' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.monto_cargo, 0))}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#15803d' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.cobrado, 0))}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#d97706' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.por_cobrar, 0))}
                    </td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
