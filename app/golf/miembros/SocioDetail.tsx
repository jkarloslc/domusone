'use client'
import { useState, useEffect } from 'react'
import { dbGolf, dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Edit2, User, MapPin, ShoppingCart, CreditCard, FileText, Users, NotebookText, Receipt, Target, Flag, ClipboardList, ExternalLink, Award, Printer } from 'lucide-react'
import TabCobranzaSocio from './TabCobranzaSocio'
import TabRecibosSocio from './TabRecibosSocio'
import type { Socio } from './SocioModal'
import BitacoraCobranzaTab from '@/components/cobranza/BitacoraCobranzaTab'
import ModalShell from '@/components/ui/ModalShell'
import ContratosMembresia from './ContratosMembresia'
import TabFederacion from './TabFederacion'

type Props = { socio: Socio; onClose: () => void; onEdit: () => void }

const fmt = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const hoy = new Date().toISOString().split('T')[0]

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid #F4F5F7' }}>
    <span style={{ fontSize: 12, color: '#7A7E87', width: 150, flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 13, color: '#26282D', flex: 1 }}>{value ?? '—'}</span>
  </div>
)

const TABS = [
  { key: 'info',        label: 'Información',      icon: FileText      },
  { key: 'membresia',   label: 'Membresía',         icon: Award         },
  { key: 'familiares',  label: 'Familiares',        icon: Users         },
  { key: 'accesos',     label: 'Accesos al Campo',  icon: MapPin        },
  { key: 'tee',         label: 'Tee de Práctica',   icon: Target        },
  { key: 'torneos',     label: 'Torneos',           icon: Flag          },
  { key: 'pos',         label: 'Compras POS',       icon: ShoppingCart  },
  { key: 'cuotas',      label: 'Cuotas',            icon: CreditCard    },
  { key: 'seguimiento', label: 'Seguimiento',        icon: ClipboardList },
  { key: 'notas',       label: 'Notas',             icon: NotebookText  },
  { key: 'fiscal',      label: 'Datos Fiscales',    icon: Receipt       },
  { key: 'federacion',  label: 'Federación',        icon: Award         },
  { key: 'facturas',   label: 'Facturas',           icon: FileText      },
  { key: 'cobranza',  label: 'Cobranza',           icon: CreditCard    },
  { key: 'recibos',   label: 'Recibos',            icon: Receipt       },
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
    Cónyuge: '#6B4E79', Hijo: '#1C1D21', Hija: '#B34D72',
    Padre: '#B5761A', Madre: '#B5761A', Hermano: '#267F56',
    Hermana: '#267F56', Otro: '#62666E',
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32, color: '#7A7E87', fontSize: 13 }}>Cargando…</div>
  if (rows.length === 0) return (
    <div style={{ textAlign: 'center', padding: 32, color: '#7A7E87' }}>
      <Users size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
      <div style={{ fontSize: 13 }}>Sin familiares registrados</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: '#F8F9FA', border: '1px solid #E6E8EB' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: (PARENTESCO_COLOR[f.parentesco] ?? '#62666E') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={15} style={{ color: PARENTESCO_COLOR[f.parentesco] ?? '#62666E' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#26282D' }}>{f.nombre}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
              {f.parentesco && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: (PARENTESCO_COLOR[f.parentesco] ?? '#62666E'), color: '#fff'}}>
                  {f.parentesco}
                </span>
              )}
              {f.fecha_nacimiento && <span style={{ fontSize: 11, color: '#7A7E87' }}>Nac. {new Date(f.fecha_nacimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
              {f.telefono && <span style={{ fontSize: 11, color: '#7A7E87' }}>{f.telefono}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {f.activo !== false
              ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#1F7A50', color: '#fff', border: '1px solid #1F7A50' }}>Activo</span>
              : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F8F9FA', color: '#7A7E87', border: '1px solid #E6E8EB' }}>Inactivo</span>}
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
  if (rows.length === 0) return <Empty text="Sin accesos registrados" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => {
        const entrada = new Date(r.fecha_entrada)
        const numAcomp = acomps[r.id] ?? 0
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8F9FA', borderRadius: 8, border: '1px solid #E6E8EB' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#26282D' }}>
                {entrada.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 11, color: '#62666E', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>{entrada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                {r.hoyo_inicio  && <span>Hoyo {r.hoyo_inicio}</span>}
                {r.cat_espacios_deportivos?.nombre && <span>{r.cat_espacios_deportivos.nombre}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {numAcomp > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#F4F5F7', color: '#1C1D21' }}>
                  +{numAcomp} acomp.
                </span>
              )}
              {r.fecha_salida
                ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#F4F5F7', color: '#62666E', fontWeight: 500 }}>Completado</span>
                : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#1F7A50', color: '#fff', fontWeight: 600 }}>En campo</span>
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
  if (rows.length === 0) return <Empty text="Sin entradas registradas" />

  const totalBolas = rows.reduce((a, r) => a + (r.num_bolas ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#62666E' }}>
          Total bolas: <strong style={{ color: '#B5761A' }}>{totalBolas.toLocaleString('es-MX')}</strong>
          <span style={{ marginLeft: 10 }}>Visitas: <strong>{rows.length}</strong></span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => {
          const dt = new Date(r.fecha)
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #E6E8EB' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#26282D' }}>
                  {dt.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 11, color: '#62666E', marginTop: 2, display: 'flex', gap: 10 }}>
                  <span>{dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                  {r.notas && <span style={{ fontStyle: 'italic' }}>{r.notas}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 10, color: '#7A7E87' }}>#{String(r.id).padStart(6, '0')}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#B5761A', marginLeft: 8 }}>{r.num_bolas}</span>
                <span style={{ fontSize: 11, color: '#7A4B0C' }}>bolas</span>
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
  Pagado:    { bg: '#E6E8EB', color: '#267F56' },
  Pendiente: { bg: '#E6E8EB', color: '#B5761A' },
  Cancelado: { bg: '#E6E8EB', color: '#C23B3B' },
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
  if (rows.length === 0) return <Empty text="Sin torneos registrados" />

  const sorted = [...rows].sort((a, b) => (b.eventos?.fecha_inicio ?? '').localeCompare(a.eventos?.fecha_inicio ?? ''))
  const totalPorCobrar = rows.reduce((a, r) => a + (r.por_cobrar ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#62666E' }}>
          Torneos jugados: <strong>{rows.length}</strong>
          {totalPorCobrar > 0 && <span style={{ marginLeft: 10 }}>Por cobrar: <strong style={{ color: '#B5761A' }}>{fmt$(totalPorCobrar)}</strong></span>}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map(r => {
          const sc = TORNEO_STATUS_COLORS[r.status] ?? { bg: '#F4F5F7', color: '#62666E' }
          return (
            <div key={r.id} style={{ padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #E6E8EB' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#26282D' }}>{r.eventos?.nombre ?? '—'}</div>
                  <div style={{ fontSize: 11, color: '#62666E', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {r.eventos?.fecha_inicio && <span>{fmt(r.eventos.fecha_inicio)}</span>}
                    {r.eventos?.folio && <span>{r.eventos.folio}</span>}
                    {r.hoyo && <span>Hoyo {r.hoyo}</span>}
                    {r.handicap != null && <span>Hcp {r.handicap}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#26282D' }}>{fmt$(r.inscripcion ?? 0)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: sc.color, color: '#fff'}}>
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
  if (rows.length === 0) return <Empty text="Sin compras registradas" />

  const total = rows.filter(r => r.status !== 'CANCELADA').reduce((a, r) => a + (r.total ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#62666E' }}>
          Total histórico: <strong style={{ color: '#267F56' }}>{fmt$(total)}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: r.status === 'CANCELADA' ? '#F8F9FA' : '#fff', borderRadius: 8, border: '1px solid #E6E8EB', opacity: r.status === 'CANCELADA' ? 0.6 : 1 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#26282D' }}>
                {r.fecha ? new Date(r.fecha.substring(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                {r.folio_dia && <span style={{ fontSize: 11, color: '#7A7E87', marginLeft: 8 }}>#{r.folio_dia}</span>}
              </div>
              {(r.ctrl_ventas_det ?? []).length > 0 && (
                <div style={{ fontSize: 11, color: '#62666E', marginTop: 2 }}>
                  {(r.ctrl_ventas_det as { concepto: string }[]).map(d => d.concepto).filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {r.status === 'CANCELADA' && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#C23B3B', color: '#fff' }}>CANCELADA</span>
              )}
              <span style={{ fontSize: 14, fontWeight: 700, color: r.status === 'CANCELADA' ? '#7A7E87' : '#267F56' }}>
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
const esMembresiaCuota = (tipo: string) => tipo === 'INSCRIPCION' || tipo === 'MENSUALIDAD'
const esPensionCuota   = (tipo: string) => tipo === 'PENSION_CARRITO'

function GridCuotas({ label, rows, filtro }: { label: string; rows: any[]; filtro: 'TODOS' | 'PENDIENTE' | 'PAGADO' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A4D54' }}>
        {label} <span style={{ fontWeight: 500, color: '#7A7E87' }}>({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '14px', background: '#F8F9FA', borderRadius: 8, border: '1px dashed #E6E8EB', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: '#7A7E87' }}>
            {filtro === 'PENDIENTE' ? 'Sin cuotas pendientes' : filtro === 'PAGADO' ? 'Sin cuotas pagadas' : 'Sin cuotas registradas'}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => {
            const vence = r.fecha_vencimiento && r.fecha_vencimiento < hoy && r.status === 'PENDIENTE'
            return (
              <div key={r.id} style={{ padding: '10px 14px', background: vence ? '#F4F5F7' : '#fff', borderRadius: 8, border: '1px solid #E6E8EB' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#26282D' }}>{r.concepto}</div>
                    <div style={{ fontSize: 11, color: '#62666E', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {r.periodo && <span>{r.periodo}</span>}
                      {r.fecha_vencimiento && (
                        <span style={{ color: vence ? '#C23B3B' : '#62666E' }}>
                          Vence: {new Date(r.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {r.fecha_pago && <span style={{ color: '#267F56' }}>Pagado: {new Date(r.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                      {r.forma_pago && <span>{r.forma_pago}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: r.status === 'PAGADO' ? '#267F56' : vence ? '#C23B3B' : '#B5761A' }}>
                      {fmt$(r.monto_final ?? r.monto_original ?? 0)}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                      background: r.status === 'PAGADO' ? '#1F7A50' : vence ? '#C23B3B' : '#B5761A',
                      color:      '#fff',
                    }}>
                      {r.status === 'PAGADO' ? 'PAGADO' : vence ? 'VENCIDA' : 'PENDIENTE'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
  if (rows.length === 0) return <Empty text="Sin cuotas registradas" />

  const filtered = filtro === 'TODOS' ? rows : rows.filter(r => r.status === filtro)
  const pendMonto = rows.filter(r => r.status === 'PENDIENTE').reduce((a, r) => a + (r.monto_final ?? 0), 0)
  const pagMonto  = rows.filter(r => r.status === 'PAGADO').reduce((a, r) => a + (r.monto_final ?? 0), 0)

  const membresia = filtered.filter(r => esMembresiaCuota(r.tipo))
  const pension   = filtered.filter(r => esPensionCuota(r.tipo))

  return (
    <div>
      {/* Mini stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, padding: '8px 12px', background: '#F4F5F7', borderRadius: 8, border: '1px solid #E6E8EB', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#B5761A', fontWeight: 600, marginBottom: 2 }}>POR PAGAR</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#B5761A' }}>{fmt$(pendMonto)}</div>
        </div>
        <div style={{ flex: 1, padding: '8px 12px', background: '#F4F5F7', borderRadius: 8, border: '1px solid #E6E8EB', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#267F56', fontWeight: 600, marginBottom: 2 }}>PAGADO</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#267F56' }}>{fmt$(pagMonto)}</div>
        </div>
      </div>

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['TODOS', 'PENDIENTE', 'PAGADO'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: filtro === f ? '#1C1D21' : '#E6E8EB', background: filtro === f ? '#F4F5F7' : '#fff', color: filtro === f ? '#26282D' : '#62666E' }}>
            {f === 'TODOS' ? 'Todos' : f === 'PENDIENTE' ? 'Pendientes' : 'Pagados'} ({f === 'TODOS' ? rows.length : rows.filter(r => r.status === f).length})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <GridCuotas label="Membresía" rows={membresia} filtro={filtro} />
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <GridCuotas label="Pensión Carrito" rows={pension} filtro={filtro} />
        </div>
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
      <div style={{ padding: '10px 14px', background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #5C4268', borderRadius: 8, fontSize: 12, color: '#5C4268' }}>
        Datos utilizados para pre-llenar el formulario CFDI al emitir recibos. Al facturar se puede elegir cuál usar.
      </div>
      {rows.length === 0 ? (
        <Empty text="Sin datos fiscales registrados" />
      ) : (
        rows.map(f => (
          <div key={f.id} style={{ border: '1px solid #E6E8EB', background: f.es_principal ? '#F4F5F7' : '#F8F9FA', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#26282D' }}>{f.alias || f.razon_social_fiscal}</span>
              {f.es_principal && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#6B4E79', color: '#fff', letterSpacing: '0.04em' }}>PRINCIPAL</span>
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

  // Abrir un PDF en base64 en una pestaña nueva: navegar directo a una data:
  // URL está bloqueado por Chrome ("Not allowed to navigate top frame to data
  // URL"), por eso se convierte a un Blob y se navega a su URL de objeto (blob:).
  const verPdfFactura = (pdfB64: string) => {
    const w = window.open()
    const bin = atob(pdfB64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    if (w) w.location.href = blobUrl
    else alert('El navegador bloqueó la ventana emergente. Habilita pop-ups para este sitio.')
  }

  useEffect(() => {
    const load = async () => {
      // Las facturas de socios se emiten siempre vía ticket POS (Golf), que las
      // guarda en golf.ctrl_ventas / golf.ctrl_ventas_cfdi — NO en ctrl.facturas
      // (esa tabla es de un flujo de facturación distinto, no relacionado a golf).
      const { data: ventas } = await dbGolf
        .from('ctrl_ventas')
        .select('id, folio_dia, fecha, total, folio_fiscal')
        .eq('id_socio_fk', socioId)
        .not('folio_fiscal', 'is', null)
        .order('fecha', { ascending: false })
      const ids = (ventas ?? []).map((v: any) => v.id)
      if (ids.length === 0) { setRows([]); setLoading(false); return }
      const { data: cfdis } = await dbGolf
        .from('ctrl_ventas_cfdi')
        .select('id_venta_fk, folio_factura, receptor_rfc, receptor_nombre, status, fecha_timbrado, pdf_b64')
        .in('id_venta_fk', ids)
        .order('fecha_timbrado', { ascending: true })
      const cfdiMap: Record<number, any> = {}
      for (const c of cfdis ?? []) cfdiMap[c.id_venta_fk] = c
      setRows((ventas ?? []).map((v: any) => ({ ...v, _cfdi: cfdiMap[v.id] ?? null })))
      setLoading(false)
    }
    load()
  }, [socioId])

  if (loading) return <Empty text="Cargando…" />

  const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
    Vigente:   { bg: '#E6E8EB', color: '#1F7A50' },
    Cancelada: { bg: '#E6E8EB', color: '#C23B3B' },
    Simulada:  { bg: '#E6E8EB', color: '#7A4B0C' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '10px 14px', background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #17603F', borderRadius: 8, fontSize: 12, color: '#17603F' }}>
        Tickets POS de este socio que fueron facturados (Golf → POS).
      </div>
      {rows.length === 0 ? (
        <Empty text="Sin facturas emitidas" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F9FA', borderBottom: '2px solid #E6E8EB' }}>
                {['Folio', 'RFC Receptor', 'Razón Social', 'Total', 'Status', 'Fecha', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#4A4D54', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(v => {
                const cfdi = v._cfdi
                const status = cfdi?.status ?? 'Vigente'
                const sc = STATUS_COLOR[status] ?? { bg: '#F4F5F7', color: '#4A4D54' }
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #F4F5F7' }}>
                    <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#26282D', whiteSpace: 'nowrap' }}>
                      {cfdi?.folio_factura ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: '#4A4D54', whiteSpace: 'nowrap' }}>
                      {cfdi?.receptor_rfc ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#4A4D54', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cfdi?.receptor_nombre ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#26282D', whiteSpace: 'nowrap' }}>
                      {v.total != null ? '$' + Number(v.total).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.color, color: '#fff'}}>
                        {status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#62666E', whiteSpace: 'nowrap' }}>
                      {cfdi?.fecha_timbrado ? new Date(cfdi.fecha_timbrado).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : (v.fecha ? new Date(v.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {cfdi?.pdf_b64 && (
                        <button onClick={() => verPdfFactura(cfdi.pdf_b64)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1C1D21', textDecoration: 'none', fontWeight: 600, fontSize: 12 }}
                          title="Ver PDF">
                          <ExternalLink size={12} /> PDF
                        </button>
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

function Empty({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#7A7E87' }}>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  )
}

// ── Tab Membresía ────────────────────────────────────────────
function TabMembresia({ socio, vencido, puedeEscribir }: { socio: Socio; vencido: boolean; puedeEscribir: boolean }) {
  const titulo = (t: string, first = false) => (
    <div style={{ margin: first ? '4px 0 6px' : '18px 0 6px', fontSize: 11, fontWeight: 700, color: '#7A7E87', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t}</div>
  )

  return (
    <>
      {titulo('Membresía', true)}
      <Row label="Número de socio"  value={socio.numero_socio} />
      <Row label="Categoría"        value={socio.cat_categorias_socios?.nombre} />
      <Row label="Ghin"             value={socio.numero_tarjeta} />
      <Row label="Fecha de alta"    value={fmt(socio.fecha_alta)} />
      <Row label="Vencimiento"      value={<span style={{ color: vencido ? '#C23B3B' : 'inherit' }}>{fmt(socio.fecha_vencimiento)}</span>} />
      <Row label="Estatus"          value={!socio.activo ? 'Inactivo' : vencido ? 'Vencido' : 'Activo'} />
      <Row label="Derecho a intercambios" value={socio.derecho_intercambios ? 'Sí' : 'No'} />

      {titulo('Alta / Renovación por ciclo')}
      <ContratosMembresia socio={socio} puedeEscribir={puedeEscribir} />
    </>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function SocioDetail({ socio, onClose, onEdit }: Props) {
  const { canWrite } = useAuth()
  const [tab, setTab] = useState('info')
  const nombre  = [socio.nombre, socio.apellido_paterno, socio.apellido_materno].filter(Boolean).join(' ')
  const vencido = socio.fecha_vencimiento && new Date(socio.fecha_vencimiento) < new Date()

  return (
    <ModalShell
      modulo="default"
      titulo={nombre}
      subtitulo={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {socio.numero_socio && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
            #{socio.numero_socio}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
          background: socio.activo && !vencido ? '#1F7A50' : '#C23B3B',
          color: '#fff',
        }}>
          {!socio.activo ? 'Inactivo' : vencido ? 'Vencido' : 'Activo'}
        </span>
        {socio.cat_categorias_socios?.nombre && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
            {socio.cat_categorias_socios.nombre}
          </span>
        )}
      </div>}
      icono={User}
      maxWidth={960}
      onClose={onClose}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      footer={<>
        <span style={{ fontSize: 11, color: '#7A7E87', marginRight: 'auto' }}>Solo lectura · para editar usa el botón Editar</span>
        {canWrite('golf-miembros') && (
          <button className="btn-secondary" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Edit2 size={13} /> Editar
          </button>
        )}
        <button className="btn-primary" onClick={onClose}>Cerrar</button>
      </>}
    >

          {/* ── Información ── */}
          {tab === 'info' && (
            <>
              <div style={{ margin: '4px 0 6px', fontSize: 11, fontWeight: 700, color: '#7A7E87', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Datos Personales</div>
              <Row label="Fecha de nacimiento" value={fmt(socio.fecha_nacimiento)} />
              <Row label="RFC"    value={socio.rfc} />
              <Row label="CURP"   value={socio.curp} />
              <Row label="Teléfono" value={socio.telefono} />
              <Row label="Email"  value={socio.email} />

              {socio.observaciones && (
                <>
                  <div style={{ margin: '18px 0 6px', fontSize: 11, fontWeight: 700, color: '#7A7E87', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Observaciones</div>
                  <div style={{ fontSize: 13, color: '#4A4D54', lineHeight: 1.6 }}>{socio.observaciones}</div>
                </>
              )}
            </>
          )}

          {tab === 'membresia'   && <TabMembresia    socio={socio} vencido={!!vencido} puedeEscribir={canWrite('golf-miembros')} />}
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
              <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 700, color: '#7A7E87', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Observaciones internas</div>
              {socio.observaciones ? (
                <div style={{ fontSize: 13, color: '#4A4D54', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#F8F9FA', border: '1px solid #E6E8EB', borderRadius: 10, padding: '14px 16px' }}>
                  {socio.observaciones}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#F8F9FA', borderRadius: 10, border: '1px dashed #E6E8EB' }}>
                  <NotebookText size={28} style={{ color: '#C9CCD3', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: '#7A7E87' }}>Sin notas registradas</div>
                </div>
              )}
            </div>
          )}

          {/* ── Datos Fiscales ── */}
          {tab === 'fiscal'   && <TabDatosFiscales socioId={socio.id} />}

          {/* ── Federación ── */}
          {tab === 'federacion' && <TabFederacion socioId={socio.id} editable={false} />}

          {/* ── Facturas ── */}
          {tab === 'facturas'  && <TabFacturas      socioId={socio.id} />}

          {/* ── Cobranza ── */}
          {tab === 'cobranza' && (
            <TabCobranzaSocio
              socioId={socio.id}
              nombreSocio={nombre}
            />
          )}

          {/* ── Recibos ── */}
          {tab === 'recibos' && (
            <TabRecibosSocio
              socioId={socio.id}
              nombreSocio={nombre}
            />
          )}
    </ModalShell>
  )
}
