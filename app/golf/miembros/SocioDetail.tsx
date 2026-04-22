'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Edit2, User, MapPin, ShoppingCart, CreditCard, FileText, Users } from 'lucide-react'
import type { Socio } from './SocioModal'

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
  { key: 'info',       label: 'Información',      icon: FileText     },
  { key: 'familiares', label: 'Familiares',        icon: Users        },
  { key: 'accesos',    label: 'Accesos al Campo',  icon: MapPin       },
  { key: 'pos',        label: 'Compras POS',       icon: ShoppingCart },
  { key: 'cuotas',     label: 'Cuotas',            icon: CreditCard   },
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
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbGolf.from('ctrl_accesos')
      .select('id, fecha, hora_entrada, hoyo_inicio, tipo_juego, num_acompanantes, created_at')
      .eq('id_socio_fk', socioId)
      .order('fecha', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />
  if (rows.length === 0) return <Empty text="Sin accesos registrados" emoji="⛳" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
              {r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10 }}>
              {r.hora_entrada && <span>{r.hora_entrada.slice(0,5)}</span>}
              {r.hoyo_inicio  && <span>Hoyo {r.hoyo_inicio}</span>}
              {r.tipo_juego   && <span>{r.tipo_juego}</span>}
            </div>
          </div>
          {r.num_acompanantes > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
              +{r.num_acompanantes} acomp.
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tab POS ──────────────────────────────────────────────────
function TabPOS({ socioId }: { socioId: number }) {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbGolf.from('ctrl_ventas')
      .select('id, folio_dia, fecha, total, status, id_centro_fk')
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
                {r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                {r.folio_dia && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>#{r.folio_dia}</span>}
              </div>
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
  const [tab, setTab] = useState('info')
  const nombre  = [socio.nombre, socio.apellido_paterno, socio.apellido_materno].filter(Boolean).join(' ')
  const vencido = socio.fecha_vencimiento && new Date(socio.fecha_vencimiento) < new Date()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px 0', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#b8952a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={20} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#1e293b' }}>{nombre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  {socio.numero_socio && <span style={{ fontSize: 11, color: '#94a3b8' }}>#{socio.numero_socio}</span>}
                  <span className={`badge ${socio.activo && !vencido ? 'badge-libre' : 'badge-bloqueado'}`} style={{ fontSize: 10 }}>
                    {!socio.activo ? 'Inactivo' : vencido ? 'Vencido' : 'Activo'}
                  </span>
                  {socio.cat_categorias_socios?.nombre && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed' }}>
                      {socio.cat_categorias_socios.nombre}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost" style={{ padding: '5px 8px' }} onClick={onEdit} title="Editar"><Edit2 size={13} /></button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={17} /></button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 14px', fontSize: 12, background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? '#2563eb' : '#94a3b8',
                  borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s',
                }}>
                  <Icon size={12} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 20px' }}>

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

          {tab === 'familiares' && <TabFamiliares socioId={socio.id} />}
          {tab === 'accesos'    && <TabAccesos   socioId={socio.id} />}
          {tab === 'pos'        && <TabPOS        socioId={socio.id} />}
          {tab === 'cuotas'     && <TabCuotas     socioId={socio.id} />}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
