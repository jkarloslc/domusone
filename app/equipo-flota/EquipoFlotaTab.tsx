'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, dbCtrl, dbComp, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, X, Save, Loader, RefreshCw, Eye, Edit2, Trash2,
  Truck, Wrench, Filter, Search, Camera, ExternalLink, CheckCircle,
  DollarSign, AlertTriangle, ChevronDown, Upload, Fuel
} from 'lucide-react'
import CombustibleTab from './CombustibleTab'
import ModalShell from '@/components/ui/ModalShell'

const TIPOS_EQUIPO  = ['Vehículo', 'Moto / Cuatrimoto','Maquinaria', 'Herramienta']
const STATUS_EQUIPO = ['Activo', 'En Mantenimiento', 'Baja']
const TIPOS_MANT    = ['Preventivo', 'Correctivo', 'Reparación']
const STATUS_MANT   = ['Abierto', 'En Proceso', 'Cerrado']

const EQUIPO_STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Activo':           { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'En Mantenimiento': { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Baja':             { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}
const MANT_STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Abierto':    { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'En Proceso': { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Cerrado':    { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
}
const TIPO_MANT_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Preventivo': { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  'Correctivo': { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  'Reparación': { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

const Badge = ({ text, map }: { text: string; map: Record<string, any> }) => {
  const s = map[text] ?? { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

const fmt$ = (n: number | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'

const fmtF = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ══════════════════════════════════════════════════════════════
export default function EquipoFlotaTab() {
  const { canWrite, canDelete, authUser } = useAuth()
  const [subTab, setSubTab]     = useState<'catalogo' | 'bitacora' | 'combustible'>('catalogo')

  // ── Catálogo ─────────────────────────────────────────────
  const [equipos,   setEquipos]   = useState<any[]>([])
  const [areaMap,   setAreaMap]   = useState<Record<number, string>>({})
  const [loadingEq, setLoadingEq] = useState(true)
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchEq,     setSearchEq]     = useState('')
  const [modalEq,   setModalEq]   = useState<{ open: boolean; eq?: any }>({ open: false })
  const [detailEq,  setDetailEq]  = useState<any | null>(null)

  // ── Bitácora ──────────────────────────────────────────────
  const [bitacora,   setBitacora]   = useState<any[]>([])
  const [equipoMap,  setEquipoMap]  = useState<Record<number, any>>({})
  const [loadingBit, setLoadingBit] = useState(true)
  const [filterEquipo, setFilterEquipo] = useState('')
  const [filterTipoM,  setFilterTipoM]  = useState('')
  const [filterStatusM,setFilterStatusM]= useState('')
  const [modalBit,   setModalBit]   = useState<{ open: boolean; bit?: any }>({ open: false })
  const [detailBit,  setDetailBit]  = useState<any | null>(null)

  const fetchEquipos = useCallback(async () => {
    setLoadingEq(true)
    const [{ data: eqs }, { data: areas }] = await Promise.all([
      dbCfg.from('equipos').select('*, marcas_vehiculos(id, nombre)').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre').eq('activo', true),
    ])
    setEquipos(eqs ?? [])
    const am: Record<number, string> = {}
    ;(areas ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    setAreaMap(am)
    const em: Record<number, any> = {}
    ;(eqs ?? []).forEach((e: any) => { em[e.id] = e })
    setEquipoMap(em)
    setLoadingEq(false)
  }, [])

  const fetchBitacora = useCallback(async () => {
    setLoadingBit(true)
    let q = dbCtrl.from('bitacora_equipos').select('*').eq('activo', true)
      .order('created_at', { ascending: false })
    if (filterEquipo) q = q.eq('id_equipo_fk', Number(filterEquipo))
    if (filterTipoM)  q = q.eq('tipo', filterTipoM)
    if (filterStatusM)q = q.eq('status', filterStatusM)
    const { data } = await q
    setBitacora(data ?? [])
    setLoadingBit(false)
  }, [filterEquipo, filterTipoM, filterStatusM])

  useEffect(() => { fetchEquipos() }, [fetchEquipos])
  useEffect(() => { fetchBitacora() }, [fetchBitacora])

  // Equipos filtrados (client-side search)
  const filteredEq = equipos.filter(e => {
    if (filterTipo   && e.tipo !== filterTipo)     return false
    if (filterStatus && e.status !== filterStatus) return false
    if (searchEq) {
      const q = searchEq.toLowerCase()
      return (e.nombre ?? '').toLowerCase().includes(q)
        || (e.placa ?? '').toLowerCase().includes(q)
        || (e.no_serie ?? '').toLowerCase().includes(q)
        || (e.marcas_vehiculos?.nombre ?? '').toLowerCase().includes(q)
    }
    return true
  })

  // KPIs catálogo
  const kpiActivos     = equipos.filter(e => e.status === 'Activo').length
  const kpiMantto      = equipos.filter(e => e.status === 'En Mantenimiento').length
  const kpiBaja        = equipos.filter(e => e.status === 'Baja').length
  const costoFlota     = equipos.reduce((a, e) => a + (e.costo_adquisicion ?? 0), 0)

  // KPIs bitácora
  const bitAbiertos    = bitacora.filter(b => b.status === 'Abierto').length
  const bitEnProceso   = bitacora.filter(b => b.status === 'En Proceso').length
  const costoTotal     = bitacora.reduce((a, b) => a + (b.costo_total ?? 0), 0)

  const handleDeleteEq = async (id: number) => {
    if (!confirm('¿Eliminar este equipo?')) return
    await dbCfg.from('equipos').update({ activo: false }).eq('id', id)
    fetchEquipos()
  }

  const handleDeleteBit = async (id: number) => {
    if (!confirm('¿Eliminar esta entrada de bitácora?')) return
    await dbCtrl.from('bitacora_equipos').update({ activo: false }).eq('id', id)
    fetchBitacora()
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        {([['catalogo', 'Catálogo de Equipos', Truck], ['bitacora', 'Bitácora', Wrench], ['combustible', 'Combustible', Fuel]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setSubTab(key)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
              fontWeight: subTab === key ? 600 : 400,
              color: subTab === key ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: subTab === key ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1 }}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: CATÁLOGO ══════════ */}
      {subTab === 'catalogo' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Activos',          value: kpiActivos,  color: '#15803d', bg: '#f0fdf4' },
              { label: 'En Mantenimiento', value: kpiMantto,   color: '#d97706', bg: '#fffbeb' },
              { label: 'Baja',             value: kpiBaja,     color: '#94a3b8', bg: '#f8fafc' },
              { label: 'Valor Flota',      value: fmt$(costoFlota), color: '#2563eb', bg: '#eff6ff' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: '10px 12px', background: k.bg }}>
                <div style={{ fontSize: typeof k.value === 'number' ? 22 : 16, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
            padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Filter size={11} /> Filtros
            </span>
            <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
            <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 26, fontSize: 12, height: 28 }}
                placeholder="Nombre, placa, serie…" value={searchEq} onChange={e => setSearchEq(e.target.value)} />
            </div>
            <select className="select" style={{ flex: '1 1 110px', maxWidth: 160, fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
              <option value="">Tipo</option>
              {TIPOS_EQUIPO.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 130px', maxWidth: 180, fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Status</option>
              {STATUS_EQUIPO.map(s => <option key={s}>{s}</option>)}
            </select>
            {(searchEq || filterTipo || filterStatus) && (
              <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
                onClick={() => { setSearchEq(''); setFilterTipo(''); setFilterStatus('') }}>
                <X size={11} /> Limpiar
              </button>
            )}
            <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }} onClick={fetchEquipos}>
              <RefreshCw size={11} className={loadingEq ? 'animate-spin' : ''} />
            </button>
            {canWrite('mantenimiento') && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }}
                onClick={() => setModalEq({ open: true })}>
                <Plus size={12} /> Nuevo Equipo
              </button>
            )}
          </div>

          {/* Tabla equipos */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  {['Equipo', 'Tipo', 'Marca / Modelo', 'Placa / Serie', 'Área', 'Odómetro', 'Adquisición', 'Status', ''].map(h => (
                    <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingEq ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                    <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                  </td></tr>
                ) : filteredEq.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                    Sin equipos registrados
                  </td></tr>
                ) : filteredEq.map(eq => (
                  <tr key={eq.id} style={{ opacity: eq.status === 'Baja' ? 0.55 : 1 }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {eq.foto_url
                          ? <img src={eq.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Truck size={14} style={{ color: 'var(--text-muted)' }} />
                            </div>
                        }
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{eq.nombre}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{eq.tipo}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 12 }}>{eq.marcas_vehiculos?.nombre ?? '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{eq.modelo ?? ''} {eq.anio ? `· ${eq.anio}` : ''}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 11 }}>{eq.placa ?? '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{eq.no_serie ?? ''}</div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>
                      {eq.id_area_fk ? (areaMap[eq.id_area_fk] ?? '—') : '—'}
                    </td>
                    <td style={{ fontSize: 11, padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {eq.odometro_actual != null ? `${Number(eq.odometro_actual).toLocaleString('es-MX')} ${eq.unidad_odometro}` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 11 }}>{fmtF(eq.fecha_adquisicion)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmt$(eq.costo_adquisicion)}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}><Badge text={eq.status} map={EQUIPO_STATUS_STYLE} /></td>
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                      <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setDetailEq(eq)}>
                        <Eye size={12} />
                      </button>
                      {canWrite('mantenimiento') && (
                        <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setModalEq({ open: true, eq })}>
                          <Edit2 size={12} />
                        </button>
                      )}
                      {canDelete() && (
                        <button className="btn-ghost" style={{ padding: '3px 5px', color: '#dc2626' }} onClick={() => handleDeleteEq(eq.id)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════ TAB: BITÁCORA ══════════ */}
      {subTab === 'bitacora' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Abiertos',   value: bitAbiertos,  color: '#2563eb', bg: '#eff6ff' },
              { label: 'En Proceso', value: bitEnProceso, color: '#d97706', bg: '#fffbeb' },
              { label: 'Costo Total',value: fmt$(costoTotal), color: '#059669', bg: '#f0fdf4' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: '10px 12px', background: k.bg }}>
                <div style={{ fontSize: typeof k.value === 'number' ? 22 : 16, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
            padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Filter size={11} /> Filtros
            </span>
            <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
            <select className="select" style={{ flex: '1 1 150px', maxWidth: 220, fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filterEquipo} onChange={e => setFilterEquipo(e.target.value)}>
              <option value="">Todos los equipos</option>
              {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 110px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filterTipoM} onChange={e => setFilterTipoM(e.target.value)}>
              <option value="">Tipo</option>
              {TIPOS_MANT.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 110px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filterStatusM} onChange={e => setFilterStatusM(e.target.value)}>
              <option value="">Status</option>
              {STATUS_MANT.map(s => <option key={s}>{s}</option>)}
            </select>
            {(filterEquipo || filterTipoM || filterStatusM) && (
              <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
                onClick={() => { setFilterEquipo(''); setFilterTipoM(''); setFilterStatusM('') }}>
                <X size={11} /> Limpiar
              </button>
            )}
            <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }} onClick={fetchBitacora}>
              <RefreshCw size={11} className={loadingBit ? 'animate-spin' : ''} />
            </button>
            {canWrite('mantenimiento') && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }}
                onClick={() => setModalBit({ open: true })}>
                <Plus size={12} /> Nueva Entrada
              </button>
            )}
          </div>

          {/* Tabla bitácora */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  {['Folio', 'Equipo', 'Tipo', 'Descripción', 'F. Inicio', 'F. Fin', 'Responsable', 'Costo', 'Status', ''].map(h => (
                    <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingBit ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}>
                    <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                  </td></tr>
                ) : bitacora.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                    Sin registros en bitácora
                  </td></tr>
                ) : bitacora.map(b => {
                  const eq = equipoMap[b.id_equipo_fk]
                  return (
                    <tr key={b.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, padding: '8px 10px' }}>{b.folio}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{eq?.nombre ?? `#${b.id_equipo_fk}`}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{eq?.placa ?? eq?.no_serie ?? ''}</div>
                      </td>
                      <td style={{ padding: '8px 10px' }}><Badge text={b.tipo} map={TIPO_MANT_STYLE} /></td>
                      <td style={{ fontSize: 12, padding: '8px 10px', maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.descripcion ?? '—'}
                        </div>
                      </td>
                      <td style={{ fontSize: 11, padding: '8px 10px' }}>{fmtF(b.fecha_inicio)}</td>
                      <td style={{ fontSize: 11, padding: '8px 10px', color: 'var(--text-muted)' }}>{fmtF(b.fecha_fin)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{b.responsable ?? '—'}</td>
                      <td style={{ fontSize: 12, fontWeight: 600, color: '#059669', padding: '8px 10px', textAlign: 'right' }}>{fmt$(b.costo_total)}</td>
                      <td style={{ padding: '8px 10px' }}><Badge text={b.status} map={MANT_STATUS_STYLE} /></td>
                      <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                        <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setDetailBit(b)}>
                          <Eye size={12} />
                        </button>
                        {canWrite('mantenimiento') && (
                          <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setModalBit({ open: true, bit: b })}>
                            <Edit2 size={12} />
                          </button>
                        )}
                        {canDelete() && (
                          <button className="btn-ghost" style={{ padding: '3px 5px', color: '#dc2626' }} onClick={() => handleDeleteBit(b.id)}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modales */}
      {modalEq.open && (
        <EquipoModal eq={modalEq.eq} areaMap={areaMap}
          onClose={() => setModalEq({ open: false })}
          onSaved={() => { setModalEq({ open: false }); fetchEquipos() }} />
      )}
      {detailEq && (
        <EquipoDetail eq={detailEq} areaMap={areaMap}
          bitacora={bitacora.filter(b => b.id_equipo_fk === detailEq.id)}
          onClose={() => setDetailEq(null)}
          onNewBit={() => { setDetailEq(null); setSubTab('bitacora'); setModalBit({ open: true, bit: { id_equipo_fk: detailEq.id } }) }} />
      )}
      {modalBit.open && (
        <BitacoraModal bit={modalBit.bit} equipos={equipos} areaMap={areaMap}
          onClose={() => setModalBit({ open: false })}
          onSaved={() => { setModalBit({ open: false }); fetchBitacora(); fetchEquipos() }} />
      )}
      {detailBit && (
        <BitacoraDetail bit={detailBit} equipoMap={equipoMap}
          onClose={() => setDetailBit(null)}
          onEdit={b => { setDetailBit(null); setModalBit({ open: true, bit: b }) }} />
      )}

      {/* ══════════ TAB: COMBUSTIBLE ══════════ */}
      {subTab === 'combustible' && <CombustibleTab />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Crear / Editar Equipo
// ══════════════════════════════════════════════════════════════
function EquipoModal({ eq, areaMap, onClose, onSaved }: {
  eq?: any; areaMap: Record<number, string>; onClose: () => void; onSaved: () => void
}) {
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const [areas,     setAreas]     = useState<any[]>([])
  const [marcas,    setMarcas]    = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    nombre:             eq?.nombre             ?? '',
    tipo:               eq?.tipo               ?? 'Vehículo',
    id_marca_fk:        eq?.id_marca_fk?.toString() ?? '',
    modelo:             eq?.modelo             ?? '',
    anio:               eq?.anio?.toString()   ?? '',
    no_serie:           eq?.no_serie           ?? '',
    placa:              eq?.placa              ?? '',
    id_area_fk:         eq?.id_area_fk?.toString() ?? '',
    fecha_adquisicion:  eq?.fecha_adquisicion  ?? '',
    costo_adquisicion:  eq?.costo_adquisicion?.toString() ?? '',
    unidad_odometro:    eq?.unidad_odometro    ?? 'km',
    odometro_actual:    eq?.odometro_actual?.toString() ?? '',
    status:             eq?.status             ?? 'Activo',
    foto_url:           eq?.foto_url           ?? '',
    notas:              eq?.notas              ?? '',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    Promise.all([
      dbCfg.from('areas').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('marcas_vehiculos').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([{ data: a }, { data: m }]) => {
      setAreas(a ?? [])
      setMarcas(m ?? [])
    })
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `equipos/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('mantenimiento').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('mantenimiento').getPublicUrl(path)
    setForm(f => ({ ...f, foto_url: publicUrl }))
    setUploading(false)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre:            form.nombre.trim(),
      tipo:              form.tipo,
      id_marca_fk:       form.id_marca_fk ? Number(form.id_marca_fk) : null,
      modelo:            form.modelo.trim() || null,
      anio:              form.anio ? Number(form.anio) : null,
      no_serie:          form.no_serie.trim() || null,
      placa:             form.placa.trim() || null,
      id_area_fk:        form.id_area_fk ? Number(form.id_area_fk) : null,
      fecha_adquisicion: form.fecha_adquisicion || null,
      costo_adquisicion: form.costo_adquisicion ? Number(form.costo_adquisicion) : null,
      unidad_odometro:   form.unidad_odometro,
      odometro_actual:   form.odometro_actual ? Number(form.odometro_actual) : 0,
      status:            form.status,
      foto_url:          form.foto_url || null,
      notas:             form.notas.trim() || null,
    }
    const { error: err } = eq
      ? await dbCfg.from('equipos').update(payload).eq('id', eq.id)
      : await dbCfg.from('equipos').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={eq ? 'Editar Equipo' : 'Nuevo Equipo'} onClose={onClose} maxWidth={560}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          {/* Foto */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 10, border: '2px dashed #e2e8f0', overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
              {form.foto_url
                ? <img src={form.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Truck size={24} style={{ color: 'var(--text-muted)' }} />
              }
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Foto del equipo</label>
              <button className="btn-secondary" style={{ fontSize: 11, marginTop: 4 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />} {uploading ? 'Subiendo…' : 'Subir foto'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="label" style={{ fontSize: 11 }}>Nombre *</label>
              <input className="input" style={{ fontSize: 13 }} value={form.nombre} onChange={setF('nombre')} placeholder="Ej. Excavadora CAT 320" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Tipo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo} onChange={setF('tipo')}>
                {TIPOS_EQUIPO.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Status</label>
              <select className="select" style={{ fontSize: 12 }} value={form.status} onChange={setF('status')}>
                {STATUS_EQUIPO.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Marca</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_marca_fk} onChange={setF('id_marca_fk')}>
                <option value="">— Sin marca —</option>
                {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Modelo</label>
              <input className="input" style={{ fontSize: 13 }} value={form.modelo} onChange={setF('modelo')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Año</label>
              <input className="input" type="number" style={{ fontSize: 13 }} value={form.anio} onChange={setF('anio')} placeholder="2022" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Placa</label>
              <input className="input" style={{ fontSize: 13 }} value={form.placa} onChange={setF('placa')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>No. Serie</label>
              <input className="input" style={{ fontSize: 13 }} value={form.no_serie} onChange={setF('no_serie')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Área</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk} onChange={setF('id_area_fk')}>
                <option value="">—</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Fecha adquisición</label>
              <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_adquisicion} onChange={setF('fecha_adquisicion')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Costo adquisición</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 13 }} value={form.costo_adquisicion} onChange={setF('costo_adquisicion')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Odómetro actual</label>
              <input className="input" type="number" step="0.1" style={{ fontSize: 13 }} value={form.odometro_actual} onChange={setF('odometro_actual')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Unidad odómetro</label>
              <select className="select" style={{ fontSize: 12 }} value={form.unidad_odometro} onChange={setF('unidad_odometro')}>
                <option value="km">Kilómetros (km)</option>
                <option value="hrs">Horas (hrs)</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="label" style={{ fontSize: 11 }}>Notas</label>
              <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
            </div>
          </div>
        </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Detail: Equipo
// ══════════════════════════════════════════════════════════════
function EquipoDetail({ eq, areaMap, bitacora, onClose, onNewBit }: {
  eq: any; areaMap: Record<number, string>; bitacora: any[]
  onClose: () => void; onNewBit: () => void
}) {
  const DI = ({ label, value }: { label: string; value: any }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value ?? '—'}</div>
    </div>
  )
  const costoTotal = bitacora.reduce((a, b) => a + (b.costo_total ?? 0), 0)
  return (
    <ModalShell modulo="mantenimiento" titulo={eq.nombre} onClose={onClose} maxWidth={520}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cerrar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={onNewBit}>
        <Plus size={11} /> Nueva Entrada Bitácora
        </button>
      </>}
    >
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {eq.foto_url && <img src={eq.foto_url} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10 }} />}
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge text={eq.status} map={EQUIPO_STATUS_STYLE} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>{eq.tipo}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DI label="Marca"   value={eq.marcas_vehiculos?.nombre ?? null} />
            <DI label="Modelo"  value={`${eq.modelo ?? ''} ${eq.anio ? `(${eq.anio})` : ''}`.trim() || null} />
            <DI label="Placa"   value={eq.placa} />
            <DI label="No. Serie" value={eq.no_serie} />
            <DI label="Área"    value={eq.id_area_fk ? areaMap[eq.id_area_fk] : null} />
            <DI label="Odómetro" value={eq.odometro_actual != null ? `${Number(eq.odometro_actual).toLocaleString('es-MX')} ${eq.unidad_odometro}` : null} />
            <DI label="Adquisición" value={fmtF(eq.fecha_adquisicion)} />
            <DI label="Costo adquisición" value={fmt$(eq.costo_adquisicion)} />
          </div>
          {eq.notas && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>{eq.notas}</div>}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Historial de Mantenimiento ({bitacora.length})
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>Costo total: {fmt$(costoTotal)}</div>
            </div>
            {bitacora.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Sin registros</div>
            ) : bitacora.slice(0, 5).map(b => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--blue)' }}>{b.folio}</span>
                  {' · '}<Badge text={b.tipo} map={TIPO_MANT_STYLE} />
                  {' · '}<span style={{ color: 'var(--text-muted)' }}>{fmtF(b.fecha_inicio)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#059669' }}>{fmt$(b.costo_total)}</span>
                  <Badge text={b.status} map={MANT_STATUS_STYLE} />
                </div>
              </div>
            ))}
          </div>
        </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Crear / Editar Entrada de Bitácora
// ══════════════════════════════════════════════════════════════
function BitacoraModal({ bit, equipos, areaMap, onClose, onSaved }: {
  bit?: any; equipos: any[]; areaMap: Record<number, string>; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const isNew = !bit?.folio
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const [ops,       setOps]       = useState<any[]>([])
  const [opSearch,  setOpSearch]  = useState('')
  const [selectedOps, setSelectedOps] = useState<any[]>([])
  const [evidencias, setEvidencias] = useState<{ url: string; nombre: string; linkId?: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    id_equipo_fk:  (bit?.id_equipo_fk ?? '').toString(),
    tipo:          bit?.tipo          ?? 'Preventivo',
    descripcion:   bit?.descripcion   ?? '',
    fecha_inicio:  bit?.fecha_inicio  ?? new Date().toISOString().slice(0,10),
    fecha_fin:     bit?.fecha_fin     ?? '',
    status:        bit?.status        ?? 'Abierto',
    odometro_inicio: bit?.odometro_inicio?.toString() ?? '',
    odometro_fin:    bit?.odometro_fin?.toString()    ?? '',
    responsable:   bit?.responsable   ?? '',
    notas:         bit?.notas         ?? '',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Cargar OPs pagadas
  useEffect(() => {
    dbComp.from('ordenes_pago').select('id, folio, concepto, monto, status')
      .in('status', ['Pagada', 'Pendiente'])
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) console.error('[EquipoFlota] OPs error:', error)
        setOps(data ?? [])
      })
  }, [])

  // Si es edición, cargar OPs y evidencias vinculadas
  useEffect(() => {
    if (!isNew && bit?.id) {
      Promise.all([
        dbCtrl.from('bitacora_equipo_ops').select('*, ordenes_pago:id_op_fk(id, folio, concepto, monto)').eq('id_bitacora_fk', bit.id),
        dbCtrl.from('bitacora_equipo_evidencias').select('*').eq('id_bitacora_fk', bit.id).order('created_at'),
      ]).then(([{ data: linkedOps }, { data: evs }]) => {
        setSelectedOps((linkedOps ?? []).map((lo: any) => ({
          id:          lo.id_op_fk,
          folio:       lo.ordenes_pago?.folio ?? '',
          concepto:    lo.ordenes_pago?.concepto ?? '',
          monto:       lo.monto ?? lo.ordenes_pago?.monto ?? 0,
          linkId:      lo.id,
        })))
        setEvidencias((evs ?? []).map((e: any) => ({ url: e.url, nombre: e.nombre ?? '' })))
      })
    }
  }, [bit?.id, isNew])

  const costoTotal = selectedOps.reduce((a, o) => a + Number(o.monto || 0), 0)

  const toggleOp = (op: any) => {
    setSelectedOps(prev => {
      const exists = prev.find(o => o.id === op.id)
      if (exists) return prev.filter(o => o.id !== op.id)
      return [...prev, { ...op, monto: op.monto }]
    })
  }

  const updateMonto = (opId: number, val: string) => {
    setSelectedOps(prev => prev.map(o => o.id === opId ? { ...o, monto: val } : o))
  }

  const handleUploadEv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    const newEvs: { url: string; nombre: string }[] = []
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const path = `bitacora/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('mantenimiento').upload(path, file, { upsert: true, contentType: file.type })
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('mantenimiento').getPublicUrl(path)
        newEvs.push({ url: publicUrl, nombre: file.name })
      }
    }
    setEvidencias(prev => [...prev, ...newEvs])
    setUploading(false)
  }

  const handleSave = async () => {
    if (!form.id_equipo_fk) { setError('Selecciona un equipo'); return }
    if (!form.fecha_inicio)  { setError('La fecha de inicio es obligatoria'); return }
    setSaving(true); setError('')

    let bitId = bit?.id
    if (isNew) {
      const { count } = await dbCtrl.from('bitacora_equipos').select('id', { count: 'exact', head: true })
      const folio = `BIT-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4,'0')}`
      const { data: newBit, error: err } = await dbCtrl.from('bitacora_equipos').insert({
        folio, id_equipo_fk: Number(form.id_equipo_fk),
        tipo: form.tipo, descripcion: form.descripcion.trim() || null,
        fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin || null,
        status: form.status,
        odometro_inicio: form.odometro_inicio ? Number(form.odometro_inicio) : null,
        odometro_fin:    form.odometro_fin    ? Number(form.odometro_fin)    : null,
        responsable: form.responsable.trim() || null,
        notas:       form.notas.trim() || null,
        costo_total: costoTotal,
        created_by:  authUser?.nombre ?? null,
      }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      bitId = newBit.id
    } else {
      const { error: err } = await dbCtrl.from('bitacora_equipos').update({
        id_equipo_fk: Number(form.id_equipo_fk),
        tipo: form.tipo, descripcion: form.descripcion.trim() || null,
        fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin || null,
        status: form.status,
        odometro_inicio: form.odometro_inicio ? Number(form.odometro_inicio) : null,
        odometro_fin:    form.odometro_fin    ? Number(form.odometro_fin)    : null,
        responsable: form.responsable.trim() || null,
        notas:       form.notas.trim() || null,
        costo_total: costoTotal,
        updated_at: new Date().toISOString(),
      }).eq('id', bit.id)
      if (err) { setError(err.message); setSaving(false); return }
      // Limpiar y re-insertar OPs vinculadas
      await dbCtrl.from('bitacora_equipo_ops').delete().eq('id_bitacora_fk', bit.id)
    }

    // Insertar OPs
    if (selectedOps.length && bitId) {
      await dbCtrl.from('bitacora_equipo_ops').insert(
        selectedOps.map(o => ({ id_bitacora_fk: bitId, id_op_fk: o.id, monto: Number(o.monto || 0) }))
      )
    }

    // Insertar evidencias nuevas (sin URL ya guardada como linkId)
    const newEvs = evidencias.filter(ev => !ev.linkId)
    if (newEvs.length && bitId) {
      await dbCtrl.from('bitacora_equipo_evidencias').insert(
        newEvs.map(ev => ({ id_bitacora_fk: bitId, url: ev.url, nombre: ev.nombre }))
      )
    }

    // Actualizar odómetro del equipo si se cerró
    if (form.status === 'Cerrado' && form.odometro_fin) {
      await dbCfg.from('equipos').update({
        odometro_actual: Number(form.odometro_fin),
        status: 'Activo',
      }).eq('id', Number(form.id_equipo_fk))
    } else if (form.status === 'En Proceso' || form.status === 'Abierto') {
      await dbCfg.from('equipos').update({ status: 'En Mantenimiento' }).eq('id', Number(form.id_equipo_fk))
    }

    setSaving(false); onSaved()
  }

  const filteredOps = ops.filter(op => {
    if (!opSearch) return true
    const q = opSearch.toLowerCase()
    return (op.folio ?? '').toLowerCase().includes(q) || (op.concepto ?? '').toLowerCase().includes(q)
  })

  return (
    <ModalShell modulo="mantenimiento" titulo={isNew ? 'Nueva Entrada de Bitácora' : `Editar — ${bit?.folio}`} onClose={onClose} maxWidth={660}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          {/* Equipo + tipo + status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ gridColumn: 'span 3' }}>
              <label className="label" style={{ fontSize: 11 }}>Equipo *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_equipo_fk} onChange={setF('id_equipo_fk')}>
                <option value="">— Seleccionar —</option>
                {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre} {e.placa ? `(${e.placa})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Tipo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo} onChange={setF('tipo')}>
                {TIPOS_MANT.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Status</label>
              <select className="select" style={{ fontSize: 12 }} value={form.status} onChange={setF('status')}>
                {STATUS_MANT.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Responsable</label>
              <input className="input" style={{ fontSize: 13 }} value={form.responsable} onChange={setF('responsable')} />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="label" style={{ fontSize: 11 }}>Descripción del trabajo</label>
            <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.descripcion} onChange={setF('descripcion')} />
          </div>

          {/* Fechas + odómetro */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 11 }}>F. Inicio *</label>
              <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_inicio} onChange={setF('fecha_inicio')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>F. Fin</label>
              <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_fin} onChange={setF('fecha_fin')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Odómetro Inicio</label>
              <input className="input" type="number" step="0.1" style={{ fontSize: 13 }} value={form.odometro_inicio} onChange={setF('odometro_inicio')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Odómetro Fin</label>
              <input className="input" type="number" step="0.1" style={{ fontSize: 13 }} value={form.odometro_fin} onChange={setF('odometro_fin')} />
            </div>
          </div>

          {/* OPs vinculadas */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Órdenes de Pago vinculadas
            </div>
            {/* Selected OPs */}
            {selectedOps.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {selectedOps.map(op => (
                  <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#eff6ff', borderRadius: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>{op.folio}</span>
                    <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto}</span>
                    <input type="number" step="0.01" className="input"
                      style={{ width: 90, fontSize: 11, textAlign: 'right', padding: '2px 6px' }}
                      value={op.monto} onChange={e => updateMonto(op.id, e.target.value)} />
                    <button className="btn-ghost" style={{ padding: '2px 4px', color: '#dc2626', flexShrink: 0 }} onClick={() => toggleOp(op)}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#059669', marginTop: 4 }}>
                  Total: {fmt$(costoTotal)}
                </div>
              </div>
            )}
            {/* OP Selector */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input className="input" style={{ paddingLeft: 26, fontSize: 11, height: 26 }}
                    placeholder="Buscar folio o concepto…"
                    value={opSearch} onChange={e => setOpSearch(e.target.value)} />
                </div>
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {filteredOps.length === 0 ? (
                  <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>Sin OPs disponibles</div>
                ) : filteredOps.slice(0, 50).map(op => {
                  const isSelected = selectedOps.some(o => o.id === op.id)
                  return (
                    <div key={op.id} onClick={() => toggleOp(op)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
                        background: isSelected ? '#eff6ff' : 'transparent',
                        borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${isSelected ? 'var(--blue)' : '#cbd5e1'}`,
                        background: isSelected ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {isSelected && <CheckCircle size={9} style={{ color: 'white' }} />}
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>{op.folio}</span>
                      <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', flexShrink: 0 }}>{fmt$(op.monto)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Evidencias */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Evidencia fotográfica
              </div>
              <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader size={11} className="animate-spin" /> : <Camera size={11} />} {uploading ? 'Subiendo…' : 'Agregar fotos'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUploadEv} />
            </div>
            {evidencias.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {evidencias.map((ev, i) => (
                  <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <img src={ev.url} alt={ev.nombre} style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                    <button onClick={() => setEvidencias(p => p.filter((_,j) => j !== i))}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={10} style={{ color: 'white' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="label" style={{ fontSize: 11 }}>Notas adicionales</label>
            <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
          </div>
        </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Detail: Entrada de Bitácora
// ══════════════════════════════════════════════════════════════
function BitacoraDetail({ bit, equipoMap, onClose, onEdit }: {
  bit: any; equipoMap: Record<number, any>; onClose: () => void; onEdit: (b: any) => void
}) {
  const [ops,       setOps]       = useState<any[]>([])
  const [evidencias,setEvidencias]= useState<any[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      dbCtrl.from('bitacora_equipo_ops')
        .select('*, op:id_op_fk(folio, concepto, monto)')
        .eq('id_bitacora_fk', bit.id),
      dbCtrl.from('bitacora_equipo_evidencias')
        .select('*').eq('id_bitacora_fk', bit.id).order('created_at'),
    ]).then(([{ data: o }, { data: e }]) => {
      setOps(o ?? [])
      setEvidencias(e ?? [])
      setLoading(false)
    })
  }, [bit.id])

  const eq = equipoMap[bit.id_equipo_fk]
  const DI = ({ label, value }: { label: string; value: any }) => (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value ?? '—'}</div>
    </div>
  )

  return (
    <ModalShell modulo="mantenimiento" titulo={bit.folio} onClose={onClose} maxWidth={580}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cerrar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => onEdit(bit)}>
        <Edit2 size={11} /> Editar
        </button>
      </>}
    >
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge text={bit.tipo} map={TIPO_MANT_STYLE} />
            <Badge text={bit.status} map={MANT_STATUS_STYLE} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DI label="F. Inicio"   value={fmtF(bit.fecha_inicio)} />
            <DI label="F. Fin"      value={fmtF(bit.fecha_fin)} />
            <DI label="Responsable" value={bit.responsable} />
            <DI label="Costo total" value={<span style={{ fontWeight: 700, color: '#059669' }}>{fmt$(bit.costo_total)}</span>} />
            {bit.odometro_inicio != null && <DI label="Odómetro inicio" value={`${Number(bit.odometro_inicio).toLocaleString('es-MX')} ${eq?.unidad_odometro ?? ''}`} />}
            {bit.odometro_fin    != null && <DI label="Odómetro fin"    value={`${Number(bit.odometro_fin).toLocaleString('es-MX')} ${eq?.unidad_odometro ?? ''}`} />}
          </div>
          {bit.descripcion && (
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>{bit.descripcion}</div>
          )}

          {/* OPs */}
          {loading ? <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} /> : (
            ops.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Órdenes de Pago vinculadas
                </div>
                {ops.map((o: any) => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', background: '#f8fafc', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{o.op?.folio}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{o.op?.concepto ?? '—'}</span>
                    </div>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{fmt$(o.monto)}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Evidencias */}
          {evidencias.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Evidencia fotográfica
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {evidencias.map((ev: any) => (
                  <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer"
                    style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', display: 'block' }}>
                    <img src={ev.url} alt={ev.nombre} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {bit.notas && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
              <strong>Notas:</strong> {bit.notas}
            </div>
          )}
        </div>
    </ModalShell>
  )
}
