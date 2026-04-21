'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, ChevronLeft, Car, Settings, Search, X, ChevronDown, ChevronRight, AlertCircle, CreditCard } from 'lucide-react'
import Link from 'next/link'
import CarritoModal from './CarritoModal'
import PensionModal from './PensionModal'
import CobrarCuotaModal from './CobrarCuotaModal'

// ── Tipos ─────────────────────────────────────────────────────
type Pension = {
  id: number
  id_socio_fk: number
  id_carrito_fk: number
  id_slot_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  monto_mensual: number
  activo: boolean
  observaciones: string | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_carritos: { marca: string | null; modelo: string | null; tipo: string; color: string | null; placa: string | null } | null
  cat_slots: { numero: string } | null
  pendientes: number    // cuotas pendientes (calculado)
  monto_pendiente: number
}

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

type Slot = { id: number; numero: string }

const hoy = new Date().toISOString().split('T')[0]
const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const vencida = (f: string | null) => f ? f < hoy : false

type Tab = 'pensiones' | 'config'

export default function CarritosPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-carritos')

  const [tab, setTab] = useState<Tab>('pensiones')

  // ── Pensiones ─────────────────────────────────────────────
  const [pensiones, setPensiones]       = useState<Pension[]>([])
  const [loadingP, setLoadingP]         = useState(true)
  const [expandido, setExpandido]       = useState<number | null>(null)
  const [soloActivas, setSoloActivas]   = useState(true)
  const [busquedaP, setBusquedaP]       = useState('')

  // modales
  const [showCarrito, setShowCarrito]   = useState(false)
  const [showPension, setShowPension]   = useState<{ idSocio: number; idCarrito: number; nombreSocio: string; descCarrito: string } | null>(null)
  const [carritoNuevo, setCarritoNuevo] = useState<{ id: number; id_socio_fk: number } | null>(null)

  const [showCobrar, setShowCobrar]     = useState<{ cuotas: Cuota[]; nombreSocio: string; idSocio: number } | null>(null)

  // ── Config ────────────────────────────────────────────────
  const [tarifa, setTarifa]             = useState<number>(0)
  const [tarifaEdit, setTarifaEdit]     = useState<number>(0)
  const [savingConfig, setSavingConfig] = useState(false)
  const [slots, setSlots]               = useState<Slot[]>([])
  const [nuevoSlot, setNuevoSlot]       = useState('')
  const [savingSlot, setSavingSlot]     = useState(false)

  // ── Stats ─────────────────────────────────────────────────
  const [stats, setStats] = useState({ pensionesActivas: 0, cuotasPendientes: 0, montoPendiente: 0, vencidas: 0 })

  // ── Fetch pensiones ───────────────────────────────────────
  const fetchPensiones = useCallback(async () => {
    setLoadingP(true)
    let q = dbGolf.from('ctrl_pensiones')
      .select(`id, id_socio_fk, id_carrito_fk, id_slot_fk, fecha_inicio, fecha_fin, monto_mensual, activo, observaciones,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
        cat_carritos(marca, modelo, tipo, color, placa),
        cat_slots(numero)`)
      .order('created_at', { ascending: false })
    if (soloActivas) q = q.eq('activo', true)
    const { data: pData } = await q

    // Cuotas pendientes por pensión
    const { data: cxcData } = await dbGolf.from('cxc_golf')
      .select('id_pension_fk, monto_final, status')
      .eq('status', 'PENDIENTE')
      .eq('tipo', 'PENSION_CARRITO')

    const pendPorPension: Record<number, { count: number; monto: number }> = {}
    for (const c of cxcData ?? []) {
      if (!c.id_pension_fk) continue
      if (!pendPorPension[c.id_pension_fk]) pendPorPension[c.id_pension_fk] = { count: 0, monto: 0 }
      pendPorPension[c.id_pension_fk].count++
      pendPorPension[c.id_pension_fk].monto += c.monto_final
    }

    const result: Pension[] = (pData ?? []).map((p: any) => ({
      ...p,
      pendientes: pendPorPension[p.id]?.count ?? 0,
      monto_pendiente: pendPorPension[p.id]?.monto ?? 0,
    }))

    setPensiones(result)
    const activas = result.filter(p => p.activo)
    setStats({
      pensionesActivas: activas.length,
      cuotasPendientes: activas.reduce((a, p) => a + p.pendientes, 0),
      montoPendiente:   activas.reduce((a, p) => a + p.monto_pendiente, 0),
      vencidas:         0, // se calcula en CXC
    })
    setLoadingP(false)
  }, [soloActivas])

  // ── Fetch Config ──────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    const { data: cfg } = await dbGolf.from('cfg_carritos').select('tarifa_mensual').single()
    const t = cfg?.tarifa_mensual ?? 0
    setTarifa(t); setTarifaEdit(t)
    const { data: sl } = await dbGolf.from('cat_slots').select('id, numero').eq('activo', true).order('numero')
    setSlots(sl ?? [])
  }, [])

  useEffect(() => { fetchPensiones() }, [fetchPensiones])
  useEffect(() => { if (tab === 'config') fetchConfig() }, [tab, fetchConfig])

  const guardarTarifa = async () => {
    setSavingConfig(true)
    await dbGolf.from('cfg_carritos').update({ tarifa_mensual: tarifaEdit, updated_at: new Date().toISOString() }).eq('id', 1)
    setTarifa(tarifaEdit)
    setSavingConfig(false)
  }

  const agregarSlot = async () => {
    if (!nuevoSlot.trim()) return
    setSavingSlot(true)
    await dbGolf.from('cat_slots').insert({ numero: nuevoSlot.trim() })
    setNuevoSlot('')
    setSavingSlot(false)
    fetchConfig()
  }

  const desactivarSlot = async (id: number) => {
    if (!confirm('¿Desactivar este slot?')) return
    await dbGolf.from('cat_slots').update({ activo: false }).eq('id', id)
    fetchConfig()
  }

  // Tras crear carrito, abrir modal de pensión
  const handleCarritoSaved = (c: { id: number; id_socio_fk: number }) => {
    setShowCarrito(false)
    setCarritoNuevo(c)
    fetchPensiones()
  }

  const handlePensionSaved = () => {
    setShowPension(null)
    setCarritoNuevo(null)
    fetchPensiones()
  }

  // Cuotas pendientes del socio de una pensión
  const abrirCobro = async (pension: Pension) => {
    const { data } = await dbGolf.from('cxc_golf')
      .select('id, concepto, periodo, monto_original, descuento, monto_final, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo, id_socio_fk, cat_socios(nombre, apellido_paterno, apellido_materno)')
      .eq('id_socio_fk', pension.id_socio_fk)
      .eq('status', 'PENDIENTE')
      .order('fecha_vencimiento', { ascending: true })
    setShowCobrar({
      cuotas: (data as unknown as Cuota[]) ?? [],
      nombreSocio: nc(pension.cat_socios),
      idSocio: pension.id_socio_fk,
    })
  }

  const pensionesF = pensiones.filter(p => {
    if (!busquedaP.trim()) return true
    const q = busquedaP.toLowerCase()
    const nombre = nc(p.cat_socios).toLowerCase()
    const placa = (p.cat_carritos?.placa ?? '').toLowerCase()
    return nombre.includes(q) || placa.includes(q)
  })

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'pensiones', label: 'Pensiones',     icon: Car      },
    { key: 'config',    label: 'Configuración', icon: Settings },
  ]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
            <Link href="/golf" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span>/</span>
            <span style={{ color: '#475569', fontWeight: 500 }}>Carritos</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Carritos & Pensiones
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => { fetchPensiones() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && tab === 'pensiones' && (
            <button className="btn-primary" onClick={() => setShowCarrito(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669' }}>
              <Plus size={14} /> Nuevo Carrito
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Pensiones Activas',  value: stats.pensionesActivas,  color: '#059669', bg: '#ecfdf5' },
          { label: 'Cuotas Pendientes',  value: stats.cuotasPendientes,  color: '#d97706', bg: '#fffbeb' },
          { label: 'Monto por Cobrar',   value: fmt$(stats.montoPendiente), color: '#dc2626', bg: '#fef2f2' },
        ].map(c => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', maxWidth: 220, padding: '12px 16px', background: c.bg, border: `1px solid ${c.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#059669' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #059669' : '2px solid transparent',
              marginBottom: -1,
            }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB: PENSIONES ───────────────────────────────── */}
      {tab === 'pensiones' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar socio o placa…" value={busquedaP} onChange={e => setBusquedaP(e.target.value)} />
              {busquedaP && <button onClick={() => setBusquedaP('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={soloActivas} onChange={e => setSoloActivas(e.target.checked)} />
              Solo activas
            </label>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                    {['', 'Socio', 'Carrito', 'Cajón', 'Placa', 'Tarifa/mes', 'Pendientes', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingP ? (
                    <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                  ) : pensionesF.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin pensiones registradas</div>
                      <div style={{ fontSize: 12 }}>Registra un nuevo carrito para comenzar</div>
                    </td></tr>
                  ) : pensionesF.map(p => {
                    const abierto = expandido === p.id
                    const carDesc = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
                    return (
                      <>
                        <tr key={p.id}
                          onClick={() => setExpandido(abierto ? null : p.id)}
                          style={{ borderBottom: abierto ? 'none' : '1px solid var(--border)', cursor: 'pointer', opacity: p.activo ? 1 : 0.55, transition: 'background 0.1s', background: abierto ? '#f0fdf4' : '' }}
                          onMouseEnter={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                          onMouseLeave={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = '' }}>
                          <td style={{ padding: '10px 10px 10px 14px', width: 28, color: '#94a3b8' }}>
                            {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nc(p.cat_socios)}</div>
                            {p.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{p.cat_socios.numero_socio}</div>}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>{carDesc}</div>
                            {p.cat_carritos?.tipo && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: p.cat_carritos.tipo === 'ELECTRICO' ? '#eff6ff' : '#fffbeb', color: p.cat_carritos.tipo === 'ELECTRICO' ? '#1d4ed8' : '#92400e', fontWeight: 600 }}>
                                {p.cat_carritos.tipo === 'ELECTRICO' ? '⚡ Eléctrico' : '⛽ Combustión'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {p.cat_slots ? `Cajón ${p.cat_slots.numero}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {p.cat_carritos?.placa ?? '—'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>
                            {fmt$(p.monto_mensual)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {p.pendientes > 0
                              ? <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{p.pendientes} · {fmt$(p.monto_pendiente)}</span>
                              : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: p.activo ? '#dcfce7' : '#f1f5f9', color: p.activo ? '#15803d' : '#64748b' }}>
                              {p.activo ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {puedeEscribir && p.activo && p.pendientes > 0 && (
                              <button onClick={e => { e.stopPropagation(); abrirCobro(p) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <CreditCard size={12} /> Cobrar
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Fila expandida */}
                        {abierto && (
                          <tr key={`${p.id}-det`}>
                            <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                              <div style={{ padding: '14px 20px 16px 48px', background: '#fafafa', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                  <span style={{ fontWeight: 600, color: '#475569' }}>Inicio de pensión: </span>
                                  {new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                                  {p.observaciones && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{p.observaciones}</div>}
                                </div>
                                {puedeEscribir && p.activo && (
                                  <button onClick={e => {
                                    e.stopPropagation()
                                    const carDesc2 = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
                                    setShowPension({ idSocio: p.id_socio_fk, idCarrito: p.id_carrito_fk, nombreSocio: nc(p.cat_socios), descCarrito: carDesc2 })
                                  }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                                    <Plus size={12} /> Nueva cuota
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── TAB: CONFIGURACIÓN ───────────────────────────── */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>

          {/* Tarifa mensual */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Tarifa de Pensión Mensual</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Monto mensual ($)</label>
                <input style={{ width: '100%', padding: '8px 12px', fontSize: 16, fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  type="number" min={0} step={0.01} value={tarifaEdit} onChange={e => setTarifaEdit(parseFloat(e.target.value) || 0)} />
              </div>
              <button onClick={guardarTarifa} disabled={savingConfig || tarifaEdit === tarifa}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (savingConfig || tarifaEdit === tarifa) ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {savingConfig ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Esta tarifa se usa como valor predeterminado al crear nuevas pensiones. Las pensiones existentes mantienen su tarifa original.
            </div>
          </div>

          {/* Slots */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Slots / Cajones ({slots.length})</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                placeholder="Número de cajón (ej. 42, A-12)…" value={nuevoSlot} onChange={e => setNuevoSlot(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarSlot()} />
              <button onClick={agregarSlot} disabled={savingSlot || !nuevoSlot.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (!nuevoSlot.trim() || savingSlot) ? 0.6 : 1 }}>
                <Plus size={13} /> Agregar
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {slots.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>Cajón {s.numero}</span>
                  <button onClick={() => desactivarSlot(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 1, lineHeight: 1 }}><X size={11} /></button>
                </div>
              ))}
              {slots.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No hay slots configurados</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      {showCarrito && (
        <CarritoModal onClose={() => setShowCarrito(false)} onSaved={handleCarritoSaved} />
      )}

      {carritoNuevo && !showPension && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Carrito registrado</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>¿Deseas asignar un slot y generar cuotas de pensión ahora?</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setCarritoNuevo(null)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Después
              </button>
              <button onClick={async () => {
                const { data: s } = await dbGolf.from('cat_socios').select('nombre, apellido_paterno, apellido_materno').eq('id', carritoNuevo.id_socio_fk).single()
                const { data: c } = await dbGolf.from('cat_carritos').select('marca, modelo').eq('id', carritoNuevo.id).single()
                const nombreS = s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : ''
                const descC = c ? [c.marca, c.modelo].filter(Boolean).join(' ') || 'Carrito' : 'Carrito'
                setShowPension({ idSocio: carritoNuevo.id_socio_fk, idCarrito: carritoNuevo.id, nombreSocio: nombreS, descCarrito: descC })
              }}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer' }}>
                Asignar Pensión
              </button>
            </div>
          </div>
        </div>
      )}

      {showPension && (
        <PensionModal
          idSocio={showPension.idSocio}
          idCarrito={showPension.idCarrito}
          nombreSocio={showPension.nombreSocio}
          descripcionCarrito={showPension.descCarrito}
          onClose={() => { setShowPension(null); setCarritoNuevo(null) }}
          onSaved={handlePensionSaved}
        />
      )}

      {showCobrar && (
        <CobrarCuotaModal
          cuotas={showCobrar.cuotas}
          nombreSocio={showCobrar.nombreSocio}
          idSocio={showCobrar.idSocio}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { setShowCobrar(null); fetchPensiones() }}
        />
      )}
    </div>
  )
}
