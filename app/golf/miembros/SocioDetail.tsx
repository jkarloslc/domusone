'use client'
import { useState, useEffect } from 'react'
import { dbGolf, dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { X, Edit2, User, MapPin, ShoppingCart, CreditCard, FileText, Users, NotebookText, Receipt, Target, Flag, ClipboardList, ExternalLink } from 'lucide-react'
import type { Socio } from './SocioModal'
import BitacoraCobranzaTab from '@/components/cobranza/BitacoraCobranzaTab'

type Props = { socio: Socio; onClose: () => void; onEdit: () => void }

const fmt = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const hoy = new Date().toISOString().split('T')[0]

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
    <span style={{ fontSize: 12, color: '#94a3b8', width: 150, flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 13, color: '#1e293b', flex: 1 }}>{value ?? '—'}</span>
  </div>
)

const TABS = [
  { key: 'info',        label: 'Información',      icon: FileText      },
  { key: 'familiares',  label: 'Familiares',        icon: Users         },
  { key: 'accesos',     label: 'Accesos al Campo',  icon: MapPin        },
  { key: 'tee',         label: 'Tee de Práctica',   icon: Target        },
  { key: 'torneos',     label: 'Torneos',           icon: Flag          },
  { key: 'pos',         label: 'Compras POS',       icon: ShoppingCart  },
  { key: 'cuotas',      label: 'Cuotas',            icon: CreditCard    },
  { key: 'seguimiento', label: 'Seguimiento',        icon: ClipboardList },
  { key: 'notas',       label: 'Notas',             icon: NotebookText  },
  { key: 'fiscal',      label: 'Datos Fiscales',    icon: Receipt       },
  { key: 'facturas',   label: 'Facturas',           icon: FileText      },
]

// ── Tab Familiares ────────────────────────────────────────────
function TabFamiliares({ socioId }: { socioId: number }) {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbGolf.from('cat_familiares').select('*').eq('id_socio_fk', socioId).order('created_at')
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [socioId])

  const PARENTESCO_COLOR: Record<string, string> = {
    Cónyuge: '#7c3aed', Hijo: '#2563eb', Hija: '#db2777',
    Padre: '#d97706', Madre: '#d97706', Hermano: '#059669',
    Hermana: '#059669', Otro: '#64748b',
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
  if (rows.length === 0) return (
    <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
      <Users size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
      <div style={{ fontSize: 13 }}>Sin familiares registrados</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: (PARENTESCO_COLOR[f.parentesco] ?? '#64748b') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={15} style={{ color: PARENTESCO_COLOR[f.parentesco] ?? '#64748b' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.nombre}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
              {f.parentesco && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: (PARENTESCO_COLOR[f.parentesco] ?? '#64748b') + '15', color: PARENTESCO_COLOR[f.parentesco] ?? '#64748b' }}>
                  {f.parentesco}
                </span>
              )}
              {f.fecha_nacimiento && <span style={{ fontSize: 11, color: '#94a3b8' }}>Nac. {new Date(f.fecha_nacimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
              {f.telefono && <span style={{ fontSize: 11, color: '#94a3b8' }}>📞 {f.telefono}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {f.activo !== false
              ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>Activo</span>
              : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0' }}>Inactivo</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab Accesos ──────────────────────────────────────────────
function TabAccesos({ socioId }: { socioId: number }) {
  const [rows, setRows]         = useState<any[]>([])
  const [acomps, setAcomps]     = useState<Record<number, number>>({})
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await dbGolf
        .from('ctrl_accesos')
        .select('id, fecha_entrada, fecha_salida, hoyo_inicio, observaciones, cat_espacios_deportivos(nombre)')
        .eq('id_socio_fk', socioId)
        .order('fecha_entrada', { ascending: false })
        .limit(50)
      const list = data ?? []
      setRows(list)

      // Conteo de acompañantes por acceso
      if (list.length > 0) {
        const ids = list.map((r: any) => r.id)
        const { data: aData } = await dbGolf
          .from('ctrl_acceso_acomp')
          .select('id_acceso_fk')
          .in('id_acceso_fk', ids)
        const map: Record<number, number> = {}
        for (const a of (aData ?? [])) {
          map[a.id_acceso_fk] = (map[a.id_acceso_fk] ?? 0) + 1
        }
        setAcomps(map)
      }
      setLoading(false)
    }
    load()
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />
  if (rows.length === 0) return <Empty text="Sin accesos registrados" emoji="⛳" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => {
        const entrada = new Date(r.fecha_entrada)
        const numAcomp = acomps[r.id] ?? 0
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
                {entrada.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>{entrada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                {r.hoyo_inicio  && <span>Hoyo {r.hoyo_inicio}</span>}
                {r.cat_espacios_deportivos?.nombre && <span>{r.cat_espacios_deportivos.nombre}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {numAcomp > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
                  +{numAcomp} acomp.
                </span>
              )}
              {r.fecha_salida
                ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#64748b', fontWeight: 500 }}>Completado</span>
                : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>En campo</span>
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab Tee de Práctica ──────────────────────────────────────
function TabTeePractica({ socioId }: { socioId: number }) {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbGolf.from('ctrl_tee_practica')
      .select('id, fecha, num_bolas, notas')
      .eq('id_socio_fk', socioId)
      .order('fecha', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />
  if (rows.length === 0) return <Empty text="Sin entradas registradas" emoji="🎯" />

  const totalBolas = rows.reduce((a, r) => a + (r.num_bolas ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Total bolas: <strong style={{ color: '#d97706' }}>{totalBolas.toLocaleString('es-MX')}</strong>
          <span style={{ marginLeft: 10 }}>Visitas: <strong>{rows.length}</strong></span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => {
          const dt = new Date(r.fecha)
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
                  {dt.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10 }}>
                  <span>{dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                  {r.notas && <span style={{ fontStyle: 'italic' }}>{r.notas}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }}>#{String(r.id).padStart(6, '0')}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#d97706', marginLeft: 8 }}>{r.num_bolas}</span>
                <span style={{ fontSize: 11, color: '#92400e' }}>bolas</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab Torneos ──────────────────────────────────────────────
const TORNEO_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Pagado:    { bg: '#dcfce7', color: '#16a34a' },
  Pendiente: { bg: '#fef3c7', color: '#d97706' },
  Cancelado: { bg: '#fee2e2', color: '#dc2626' },
}

function TabTorneos({ socioId }: { socioId: number }) {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbCtrl.from('torneo_jugadores')
      .select('id, hoyo, handicap, status, inscripcion, pago, por_cobrar, eventos(folio, nombre, fecha_inicio, status)')
      .eq('id_socio_fk', socioId)
      .order('id', { ascending: false })
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />
  if (rows.length === 0) return <Empty text="Sin torneos registrados" emoji="🏌️" />

  const sorted = [...rows].sort((a, b) => (b.eventos?.fecha_inicio ?? '').localeCompare(a.eventos?.fecha_inicio ?? ''))
  const totalPorCobrar = rows.reduce((a, r) => a + (r.por_cobrar ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Torneos jugados: <strong>{rows.length}</strong>
          {totalPorCobrar > 0 && <span style={{ marginLeft: 10 }}>Por cobrar: <strong style={{ color: '#d97706' }}>{fmt$(totalPorCobrar)}</strong></span>}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map(r => {
          const sc = TORNEO_STATUS_COLORS[r.status] ?? { bg: '#f1f5f9', color: '#64748b' }
          return (
            <div key={r.id} style={{ padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{r.eventos?.nombre ?? '—'}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {r.eventos?.fecha_inicio && <span>{fmt(r.eventos.fecha_inicio)}</span>}
                    {r.eventos?.folio && <span>{r.eventos.folio}</span>}
                    {r.hoyo && <span>Hoyo {r.hoyo}</span>}
                    {r.handicap != null && <span>Hcp {r.handicap}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{fmt$(r.inscripcion ?? 0)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                    {r.status}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab POS ──────────────────────────────────────────────────
function TabPOS({ socioId }: { socioId: number }) {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbGolf.from('ctrl_ventas')
      .select('id, folio_dia, fecha, total, status, id_centro_fk, ctrl_ventas_det(concepto)')
      .eq('id_socio_fk', socioId)
      .order('fecha', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />
  if (rows.length === 0) return <Empty text="Sin compras registradas" emoji="🛒" />

  const total = rows.filter(r => r.status !== 'CANCELADA').reduce((a, r) => a + (r.total ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Total histórico: <strong style={{ color: '#16a34a' }}>{fmt$(total)}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: r.status === 'CANCELADA' ? '#f8fafc' : '#fff', borderRadius: 8, border: '1px solid #e2e8f0', opacity: r.status === 'CANCELADA' ? 0.6 : 1 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
                {r.fecha ? new Date(r.fecha.substring(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                {r.folio_dia && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>#{r.folio_dia}</span>}
              </div>
              {(r.ctrl_ventas_det ?? []).length > 0 && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {(r.ctrl_ventas_det as { concepto: string }[]).map(d => d.concepto).filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {r.status === 'CANCELADA' && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#fee2e2', color: '#dc2626' }}>CANCELADA</span>
              )}
              <span style={{ fontSize: 14, fontWeight: 700, color: r.status === 'CANCELADA' ? '#94a3b8' : '#16a34a' }}>
                {fmt$(r.total ?? 0)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab Cuotas ───────────────────────────────────────────────
function TabCuotas({ socioId }: { socioId: number }) {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro]   = useState<'TODOS' | 'PENDIENTE' | 'PAGADO'>('TODOS')

  useEffect(() => {
    dbGolf.from('cxc_golf')
      .select('id, tipo, concepto, periodo, monto_final, monto_original, descuento, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago')
      .eq('id_socio_fk', socioId)
      .order('fecha_emision', { ascending: false })
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />
  if (rows.length === 0) return <Empty text="Sin cuotas registradas" emoji="💳" />

  const filtered = filtro === 'TODOS' ? rows : rows.filter(r => r.status === filtro)
  const pendMonto = rows.filter(r => r.status === 'PENDIENTE').reduce((a, r) => a + (r.monto_final ?? 0), 0)
  const pagMonto  = rows.filter(r => r.status === 'PAGADO').reduce((a, r) => a + (r.monto_final ?? 0), 0)

  return (
    <div>
      {/* Mini stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, padding: '8px 12px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600, marginBottom: 2 }}>POR PAGAR</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#d97706' }}>{fmt$(pendMonto)}</div>
        </div>
        <div style={{ flex: 1, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, marginBottom: 2 }}>PAGADO</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{fmt$(pagMonto)}</div>
        </div>
      </div>

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['TODOS', 'PENDIENTE', 'PAGADO'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: filtro === f ? '#2563eb' : '#e2e8f0', background: filtro === f ? '#eff6ff' : '#fff', color: filtro === f ? '#1d4ed8' : '#64748b' }}>
            {f === 'TODOS' ? 'Todos' : f === 'PENDIENTE' ? 'Pendientes' : 'Pagados'} ({f === 'TODOS' ? rows.length : rows.filter(r => r.status === f).length})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(r => {
          const vence = r.fecha_vencimiento && r.fecha_vencimiento < hoy && r.status === 'PENDIENTE'
          return (
            <div key={r.id} style={{ padding: '10px 14px', background: vence ? '#fff5f5' : '#fff', borderRadius: 8, border: `1px solid ${vence ? '#fecaca' : '#e2e8f0'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{r.concepto}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {r.periodo && <span>{r.periodo}</span>}
                    {r.fecha_vencimiento && (
                      <span style={{ color: vence ? '#dc2626' : '#64748b' }}>
                        Vence: {new Date(r.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {r.fecha_pago && <span style={{ color: '#16a34a' }}>Pagado: {new Date(r.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                    {r.forma_pago && <span>{r.forma_pago}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: r.status === 'PAGADO' ? '#16a34a' : vence ? '#dc2626' : '#d97706' }}>
                    {fmt$(r.monto_final ?? r.monto_original ?? 0)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                    background: r.status === 'PAGADO' ? '#dcfce7' : vence ? '#fee2e2' : '#fef3c7',
                    color:      r.status === 'PAGADO' ? '#16a34a' : vence ? '#dc2626' : '#d97706',
                  }}>
                    {r.status === 'PAGADO' ? 'PAGADO' : vence ? 'VENCIDA' : 'PENDIENTE'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab Datos Fiscales ───────────────────────────────────────
function TabDatosFiscales({ socioId }: { socioId: number }) {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbGolf.from('cat_socios_datos_fiscales')
      .select('id, alias, rfc, razon_social_fiscal, cp_fiscal, regimen_fiscal, uso_cfdi, email_fiscal, es_principal')
      .eq('id_socio_fk', socioId)
      .order('es_principal', { ascending: false })
      .order('created_at')
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ padding: '10px 14px', background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#6d28d9' }}>
        Datos utilizados para pre-llenar el formulario CFDI al emitir recibos. Al facturar se puede elegir cuál usar.
      </div>
      {rows.length === 0 ? (
        <Empty text="Sin datos fiscales registrados" emoji="🧾" />
      ) : (
        rows.map(f => (
          <div key={f.id} style={{ border: `1px solid ${f.es_principal ? '#ddd6fe' : '#e2e8f0'}`, background: f.es_principal ? '#faf5ff' : '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{f.alias || f.razon_social_fiscal}</span>
              {f.es_principal && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#7c3aed', color: '#fff', letterSpacing: '0.04em' }}>PRINCIPAL</span>
              )}
            </div>
            <Row label="RFC"                value={f.rfc} />
            <Row label="Razón Social Fiscal" value={f.razon_social_fiscal} />
            <Row label="C.P. Fiscal"        value={f.cp_fiscal} />
            <Row label="Régimen Fiscal"     value={f.regimen_fiscal} />
            <Row label="Uso CFDI"           value={f.uso_cfdi} />
            <Row label="Email Fiscal"       value={f.email_fiscal} />
          </div>
        ))
      )}
    </div>
  )
}

// ── Tab Facturas ─────────────────────────────────────────────
function TabFacturas({ socioId }: { socioId: number }) {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: fiscData } = await dbGolf
        .from('cat_socios_datos_fiscales')
        .select('rfc')
        .eq('id_socio_fk', socioId)
      const rfcs = (fiscData ?? []).map((f: any) => f.rfc as string)
      if (rfcs.length === 0) { setRows([]); setLoading(false); return }
      const { data } = await dbCtrl
        .from('facturas')
        .select('id, folio_interno, folio_fiscal, rfc_receptor, razon_social_receptor, total, status, created_at, pdf_url')
        .in('rfc_receptor', rfcs)
        .order('created_at', { ascending: false })
      setRows(data ?? [])
      setLoading(false)
    }
    load()
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />

  const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
    Vigente:   { bg: '#dcfce7', color: '#15803d' },
    Cancelada: { bg: '#fee2e2', color: '#dc2626' },
    Simulada:  { bg: '#fef9c3', color: '#92400e' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#166534' }}>
        Facturas cuyos RFC receptor coinciden con los datos fiscales registrados para este socio.
      </div>
      {rows.length === 0 ? (
        <Empty text="Sin facturas emitidas" emoji="🧾" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Folio', 'RFC Receptor', 'Razón Social', 'Total', 'Status', 'Fecha', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(f => {
                const sc = STATUS_COLOR[f.status] ?? { bg: '#f1f5f9', color: '#475569' }
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {f.folio_interno ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#475569', whiteSpace: 'nowrap' }}>
                      {f.rfc_receptor ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#475569', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.razon_social_receptor ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {f.total != null ? '$' + Number(f.total).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {f.created_at ? new Date(f.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {f.pdf_url && (
                        <a href={f.pdf_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                          title="Ver PDF">
                          <ExternalLink size={12} /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Empty({ text, emoji }: { text: string; emoji?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
      {emoji && <div style={{ fontSize: 28, marginBottom: 8 }}>{emoji}</div>}
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function SocioDetail({ socio, onClose, onEdit }: Props) {
  const { canWrite } = useAuth()
  const [tab, setTab] = useState('info')
  const nombre  = [socio.nombre, socio.apellido_paterno, socio.apellido_materno].filter(Boolean).join(' ')
  const vencido = socio.fecha_vencimiento && new Date(socio.fecha_vencimiento) < new Date()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

        {/* Header con gradiente sutil */}
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', borderRadius: '20px 20px 0 0', padding: '20px 24px 0' }}>
          {/* Fila superior: avatar + info + acciones */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={24} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{nombre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  {socio.numero_socio && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
                      #{socio.numero_socio}
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                    background: socio.activo && !vencido ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)',
                    color: socio.activo && !vencido ? '#86efac' : '#fca5a5',
                    border: `1px solid ${socio.activo && !vencido ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                  }}>
                    {!socio.activo ? 'Inactivo' : vencido ? 'Vencido' : 'Activo'}
                  </span>
                  {socio.cat_categorias_socios?.nombre && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(167,139,250,0.25)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.35)' }}>
                      {socio.cat_categorias_socios.nombre}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                <Edit2 size={13} /> Editar
              </button>
              <button onClick={onClose} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Tabs pill style sobre fondo azul */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', fontSize: 12, fontWeight: active ? 700 : 500,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  borderRadius: '8px 8px 0 0',
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#2563eb' : 'rgba(255,255,255,0.7)',
                  transition: 'all 0.15s',
                  marginBottom: 0,
                }}>
                  <Icon size={13} style={{ opacity: active ? 1 : 0.8 }} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 24px' }}>

          {/* ── Información ── */}
          {tab === 'info' && (
            <>
              <div style={{ margin: '4px 0 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Membresía</div>
              <Row label="Categoría"        value={socio.cat_categorias_socios?.nombre} />
              <Row label="Número de tarjeta" value={socio.numero_tarjeta} />
              <Row label="Fecha de alta"    value={fmt(socio.fecha_alta)} />
              <Row label="Vencimiento"      value={<span style={{ color: vencido ? '#dc2626' : 'inherit' }}>{fmt(socio.fecha_vencimiento)}</span>} />

              <div style={{ margin: '18px 0 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Datos Personales</div>
              <Row label="Fecha de nacimiento" value={fmt(socio.fecha_nacimiento)} />
              <Row label="RFC"    value={socio.rfc} />
              <Row label="CURP"   value={socio.curp} />
              <Row label="Teléfono" value={socio.telefono} />
              <Row label="Email"  value={socio.email} />

              {socio.observaciones && (
                <>
                  <div style={{ margin: '18px 0 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Observaciones</div>
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{socio.observaciones}</div>
                </>
              )}
            </>
          )}

          {tab === 'familiares'  && <TabFamiliares   socioId={socio.id} />}
          {tab === 'accesos'     && <TabAccesos      socioId={socio.id} />}
          {tab === 'tee'         && <TabTeePractica  socioId={socio.id} />}
          {tab === 'torneos'     && <TabTorneos      socioId={socio.id} />}
          {tab === 'pos'         && <TabPOS          socioId={socio.id} />}
          {tab === 'cuotas'      && <TabCuotas       socioId={socio.id} />}
          {tab === 'seguimiento' && (
            <BitacoraCobranzaTab
              entidad="socio"
              idEntidad={socio.id}
              nombreEntidad={nombre}
              puedeEscribir={canWrite('golf-cxc')}
            />
          )}

          {/* ── Notas ── */}
          {tab === 'notas' && (
            <div>
              <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Observaciones internas</div>
              {socio.observaciones ? (
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                  {socio.observaciones}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                  <NotebookText size={28} style={{ color: '#cbd5e1', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Sin notas registradas</div>
                </div>
              )}
            </div>
          )}

          {/* ── Datos Fiscales ── */}
          {tab === 'fiscal'   && <TabDatosFiscales socioId={socio.id} />}

          {/* ── Facturas ── */}
          {tab === 'facturas' && <TabFacturas      socioId={socio.id} />}
        </div>

        <div style={{ padding: '12px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: '0 0 20px 20px' }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Solo lectura · para editar usa el botón Editar</span>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
