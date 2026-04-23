'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, dbCtrl, dbComp, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, X, Save, Loader, RefreshCw, Eye, Edit2,
  Fuel, Droplets, FileText, Search, Upload, CheckCircle, AlertTriangle
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

const TIPOS_SUMINISTRO = ['Gasolinería', 'Garrafa']
const TIPOS_CARGA      = ['Gasolinería', 'Entrega Garrafa', 'Consumo Garrafa']
const STATUS_VALE      = ['Emitido', 'Parcial', 'Agotado', 'Entregado', 'Cerrado', 'Cancelado']

const VALE_STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Emitido':    { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Parcial':    { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Agotado':    { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  'Entregado':  { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  'Cerrado':    { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Cancelado':  { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}
const CARGA_TIPO_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Gasolinería':       { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  'Entrega Garrafa':   { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  'Consumo Garrafa':   { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
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
const fmtL = (n: number | null | undefined) =>
  n != null ? `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 })} L` : '—'
const fmtF = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ══════════════════════════════════════════════════════════════
export default function CombustibleTab() {
  const { canWrite, authUser } = useAuth()
  const [subTab, setSubTab] = useState<'vales' | 'cargas'>('vales')

  // ── Vales ────────────────────────────────────────────────────
  const [vales,      setVales]      = useState<any[]>([])
  const [loadingV,   setLoadingV]   = useState(true)
  const [filterTipoV, setFilterTipoV] = useState('')
  const [filterStatV, setFilterStatV] = useState('')
  const [searchV,    setSearchV]    = useState('')
  const [modalV,     setModalV]     = useState<{ open: boolean; vale?: any }>({ open: false })
  const [detailV,    setDetailV]    = useState<any | null>(null)

  // ── Cargas ───────────────────────────────────────────────────
  const [cargas,     setCargas]     = useState<any[]>([])
  const [loadingC,   setLoadingC]   = useState(true)
  const [filterTipoC,setFilterTipoC]= useState('')
  const [filterAreaC,setFilterAreaC]= useState('')
  const [searchC,    setSearchC]    = useState('')
  const [modalC,     setModalC]     = useState<{ open: boolean; carga?: any }>({ open: false })

  // ── Catálogos compartidos ─────────────────────────────────────
  const [equipos,  setEquipos]  = useState<any[]>([])
  const [areas,    setAreas]    = useState<any[]>([])
  const [areaMap,  setAreaMap]  = useState<Record<number, string>>({})
  const [equipoMap,setEquipoMap]= useState<Record<number, string>>({})

  const fetchCatalogos = useCallback(async () => {
    const [{ data: eqs }, { data: ars }] = await Promise.all([
      dbCfg.from('equipos').select('id, nombre, placa, unidad_odometro').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setEquipos(eqs ?? [])
    setAreas(ars ?? [])
    const am: Record<number, string> = {}; (ars ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    const em: Record<number, string> = {}; (eqs ?? []).forEach((e: any) => { em[e.id] = e.nombre })
    setAreaMap(am)
    setEquipoMap(em)
  }, [])

  const fetchVales = useCallback(async () => {
    setLoadingV(true)
    let q = dbCtrl.from('vales_combustible')
      .select('*, areas:id_area_fk(nombre), equipos:id_equipo_fk(nombre, placa)')
      .eq('activo', true).order('created_at', { ascending: false })
    if (filterTipoV) q = q.eq('tipo_suministro', filterTipoV)
    if (filterStatV) q = q.eq('status', filterStatV)
    const { data } = await q
    setVales(data ?? [])
    setLoadingV(false)
  }, [filterTipoV, filterStatV])

  const fetchCargas = useCallback(async () => {
    setLoadingC(true)
    let q = dbCtrl.from('cargas_combustible')
      .select('*, areas:id_area_fk(nombre), equipos:id_equipo_fk(nombre, placa), vales:id_vale_fk(folio)')
      .eq('activo', true).order('fecha', { ascending: false })
    if (filterTipoC) q = q.eq('tipo_carga', filterTipoC)
    if (filterAreaC) q = q.eq('id_area_fk', Number(filterAreaC))
    const { data } = await q
    setCargas(data ?? [])
    setLoadingC(false)
  }, [filterTipoC, filterAreaC])

  useEffect(() => { fetchCatalogos() }, [fetchCatalogos])
  useEffect(() => { fetchVales()    }, [fetchVales])
  useEffect(() => { fetchCargas()   }, [fetchCargas])

  // KPIs
  const mesActual = new Date().toISOString().slice(0, 7)
  const cargasMes = cargas.filter(c => c.fecha?.startsWith(mesActual))
  const kpiLitrosMes  = cargasMes.reduce((a, c) => a + (c.litros ?? 0), 0)
  const kpiCostoMes   = cargasMes.reduce((a, c) => a + (c.monto_total ?? 0), 0)
  const kpiValesAbiertos = vales.filter(v => ['Emitido', 'Parcial'].includes(v.status)).length
  const kpiValesPorVencer = vales.filter(v => {
    if (!v.vigencia || !['Emitido', 'Parcial'].includes(v.status)) return false
    const diff = (new Date(v.vigencia).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 5
  }).length

  const filteredVales = vales.filter(v => {
    if (!searchV) return true
    const q = searchV.toLowerCase()
    return (v.folio ?? '').toLowerCase().includes(q)
      || (v.areas?.nombre ?? '').toLowerCase().includes(q)
      || (v.equipos?.nombre ?? '').toLowerCase().includes(q)
      || (v.periodo ?? '').toLowerCase().includes(q)
  })
  const filteredCargas = cargas.filter(c => {
    if (!searchC) return true
    const q = searchC.toLowerCase()
    return (c.equipos?.nombre ?? '').toLowerCase().includes(q)
      || (c.areas?.nombre ?? '').toLowerCase().includes(q)
      || (c.vales?.folio ?? '').toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '16px 0' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Litros este mes',    value: fmtL(kpiLitrosMes),      color: '#0891b2', icon: <Droplets size={16} /> },
          { label: 'Costo este mes',     value: fmt$(kpiCostoMes),       color: '#ea580c', icon: <Fuel size={16} /> },
          { label: 'Vales abiertos',     value: kpiValesAbiertos,        color: '#2563eb', icon: <FileText size={16} /> },
          { label: 'Vales por vencer',   value: kpiValesPorVencer,       color: kpiValesPorVencer > 0 ? '#dc2626' : '#15803d', icon: <AlertTriangle size={16} /> },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: k.color, marginBottom: 4 }}>
              {k.icon}<span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        <button onClick={() => setSubTab('vales')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: subTab === 'vales' ? 600 : 400,
            color: subTab === 'vales' ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: subTab === 'vales' ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
          <FileText size={12} /> Vales
        </button>
        <button onClick={() => setSubTab('cargas')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: subTab === 'cargas' ? 600 : 400,
            color: subTab === 'cargas' ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: subTab === 'cargas' ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
          <Fuel size={12} /> Cargas
        </button>
      </div>

      {/* ── VALES ── */}
      {subTab === 'vales' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 28, fontSize: 12 }} placeholder="Folio, área, equipo…" value={searchV} onChange={e => setSearchV(e.target.value)} />
            </div>
            <select className="select" style={{ fontSize: 12, width: 140 }} value={filterTipoV} onChange={e => setFilterTipoV(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS_SUMINISTRO.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ fontSize: 12, width: 130 }} value={filterStatV} onChange={e => setFilterStatV(e.target.value)}>
              <option value="">Todos los status</option>
              {STATUS_VALE.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn-ghost" onClick={fetchVales} style={{ padding: '6px 8px' }}><RefreshCw size={13} /></button>
            {canWrite('mantenimiento') && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setModalV({ open: true })}>
                <Plus size={12} /> Nuevo Vale
              </button>
            )}
          </div>

          {loadingV ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader size={18} className="animate-spin" style={{ color: 'var(--blue)' }} /></div>
          ) : filteredVales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Sin vales registrados</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Folio', 'Tipo', 'Área', 'Equipo', 'Periodo', 'Litros Auth.', 'Litros Usados', 'Monto Auth.', 'Vigencia', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredVales.map((v, i) => {
                    const pct = v.litros_autorizados > 0 ? (v.litros_usados / v.litros_autorizados) * 100 : 0
                    return (
                      <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{v.folio}</td>
                        <td style={{ padding: '8px 10px' }}><Badge text={v.tipo_suministro} map={CARGA_TIPO_STYLE} /></td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.areas?.nombre ?? '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.equipos ? `${v.equipos.nombre}${v.equipos.placa ? ` (${v.equipos.placa})` : ''}` : '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.periodo ?? '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{fmtL(v.litros_autorizados)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, minWidth: 50 }}>
                              <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(pct, 100)}%`,
                                background: pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#10b981' }} />
                            </div>
                            <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtL(v.litros_usados)}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{fmt$(v.monto_autorizado)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(v.vigencia)}</td>
                        <td style={{ padding: '8px 10px' }}><Badge text={v.status} map={VALE_STATUS_STYLE} /></td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-ghost" style={{ padding: '3px 6px' }} onClick={() => setDetailV(v)}><Eye size={12} /></button>
                            {canWrite('mantenimiento') && !['Cerrado', 'Cancelado', 'Agotado'].includes(v.status) && (
                              <button className="btn-ghost" style={{ padding: '3px 6px' }} onClick={() => setModalV({ open: true, vale: v })}><Edit2 size={12} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CARGAS ── */}
      {subTab === 'cargas' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 28, fontSize: 12 }} placeholder="Equipo, área, folio vale…" value={searchC} onChange={e => setSearchC(e.target.value)} />
            </div>
            <select className="select" style={{ fontSize: 12, width: 160 }} value={filterTipoC} onChange={e => setFilterTipoC(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS_CARGA.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ fontSize: 12, width: 150 }} value={filterAreaC} onChange={e => setFilterAreaC(e.target.value)}>
              <option value="">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <button className="btn-ghost" onClick={fetchCargas} style={{ padding: '6px 8px' }}><RefreshCw size={13} /></button>
            {canWrite('mantenimiento') && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setModalC({ open: true })}>
                <Plus size={12} /> Nueva Carga
              </button>
            )}
          </div>

          {loadingC ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader size={18} className="animate-spin" style={{ color: 'var(--blue)' }} /></div>
          ) : filteredCargas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Sin cargas registradas</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Fecha', 'Tipo', 'Vale', 'Área', 'Equipo', 'Litros', 'Precio/L', 'Total', 'Odómetro', 'Ticket', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCargas.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(c.fecha)}</td>
                      <td style={{ padding: '8px 10px' }}><Badge text={c.tipo_carga} map={CARGA_TIPO_STYLE} /></td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)' }}>{c.vales?.folio ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{c.areas?.nombre ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{c.equipos ? `${c.equipos.nombre}${c.equipos.placa ? ` (${c.equipos.placa})` : ''}` : '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{fmtL(c.litros)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{c.precio_unitario ? `$${Number(c.precio_unitario).toFixed(4)}` : '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, textAlign: 'right', color: '#059669' }}>{fmt$(c.monto_total)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{c.odometro != null ? Number(c.odometro).toLocaleString('es-MX') : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {c.comprobante_url
                          ? <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontSize: 11 }}>Ver</a>
                          : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {canWrite('mantenimiento') && (
                          <button className="btn-ghost" style={{ padding: '3px 6px' }} onClick={() => setModalC({ open: true, carga: c })}><Edit2 size={12} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modales */}
      {modalV.open && (
        <ValeModal
          vale={modalV.vale} equipos={equipos} areas={areas}
          onClose={() => setModalV({ open: false })}
          onSaved={() => { setModalV({ open: false }); fetchVales() }}
        />
      )}
      {modalC.open && (
        <CargaModal
          carga={modalC.carga} equipos={equipos} areas={areas} vales={vales.filter(v => ['Emitido', 'Parcial', 'Entregado'].includes(v.status))}
          onClose={() => setModalC({ open: false })}
          onSaved={() => { setModalC({ open: false }); fetchCargas(); fetchVales() }}
        />
      )}
      {detailV && (
        <ValeDetail vale={detailV} areaMap={areaMap} equipoMap={equipoMap} onClose={() => setDetailV(null)} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Crear / Editar Vale
// ══════════════════════════════════════════════════════════════
function ValeModal({ vale, equipos, areas, onClose, onSaved }: {
  vale?: any; equipos: any[]; areas: any[]; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [ops,    setOps]    = useState<any[]>([])
  const [opSearch, setOpSearch] = useState('')

  const [form, setForm] = useState({
    tipo_suministro:    vale?.tipo_suministro    ?? 'Gasolinería',
    id_area_fk:         vale?.id_area_fk?.toString()   ?? '',
    id_equipo_fk:       vale?.id_equipo_fk?.toString() ?? '',
    periodo:            vale?.periodo            ?? '',
    litros_autorizados: vale?.litros_autorizados?.toString() ?? '',
    monto_autorizado:   vale?.monto_autorizado?.toString()   ?? '',
    vigencia:           vale?.vigencia           ?? '',
    status:             vale?.status             ?? 'Emitido',
    id_op_fk:           vale?.id_op_fk?.toString() ?? '',
    notas:              vale?.notas              ?? '',
  })
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    dbComp.from('ordenes_pago').select('id, folio, concepto, monto, status')
      .in('status', ['Pagada', 'Pendiente']).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setOps(data ?? []))
  }, [])

  const filteredOps = ops.filter(op => {
    if (!opSearch) return true
    const q = opSearch.toLowerCase()
    return (op.folio ?? '').toLowerCase().includes(q) || (op.concepto ?? '').toLowerCase().includes(q)
  })

  const handleSave = async () => {
    if (!form.id_area_fk)          { setError('El área es obligatoria'); return }
    if (!form.litros_autorizados)  { setError('Los litros autorizados son obligatorios'); return }
    if (form.tipo_suministro === 'Gasolinería' && !form.id_equipo_fk) {
      setError('Para Gasolinería el equipo es obligatorio'); return
    }
    setSaving(true); setError('')
    const isNew = !vale?.folio

    const payload: any = {
      tipo_suministro:   form.tipo_suministro,
      id_area_fk:        Number(form.id_area_fk),
      id_equipo_fk:      form.id_equipo_fk ? Number(form.id_equipo_fk) : null,
      periodo:           form.periodo.trim() || null,
      litros_autorizados:Number(form.litros_autorizados),
      monto_autorizado:  form.monto_autorizado ? Number(form.monto_autorizado) : null,
      vigencia:          form.vigencia || null,
      status:            form.status,
      id_op_fk:          form.id_op_fk ? Number(form.id_op_fk) : null,
      notas:             form.notas.trim() || null,
      updated_at:        new Date().toISOString(),
    }

    if (isNew) {
      const { count } = await dbCtrl.from('vales_combustible').select('id', { count: 'exact', head: true })
      payload.folio       = `VAL-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
      payload.emitido_por = authUser?.nombre ?? null
    }

    const { error: err } = isNew
      ? await dbCtrl.from('vales_combustible').insert(payload)
      : await dbCtrl.from('vales_combustible').update(payload).eq('id', vale.id)

    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const esGasolineria = form.tipo_suministro === 'Gasolinería'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
            {vale ? 'Editar Vale' : 'Nuevo Vale de Combustible'}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Tipo de Suministro *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo_suministro} onChange={setF('tipo_suministro')}>
                {TIPOS_SUMINISTRO.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Status</label>
              <select className="select" style={{ fontSize: 12 }} value={form.status} onChange={setF('status')}>
                {STATUS_VALE.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: esGasolineria ? '1' : 'span 2' }}>
              <label className="label" style={{ fontSize: 11 }}>Área *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk} onChange={setF('id_area_fk')}>
                <option value="">— Seleccionar —</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            {esGasolineria && (
              <div>
                <label className="label" style={{ fontSize: 11 }}>Equipo / Vehículo *</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_equipo_fk} onChange={setF('id_equipo_fk')}>
                  <option value="">— Seleccionar —</option>
                  {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.placa ? ` (${e.placa})` : ''}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label" style={{ fontSize: 11 }}>Periodo</label>
              <input className="input" style={{ fontSize: 12 }} placeholder="ej. Abril 2026" value={form.periodo} onChange={setF('periodo')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Vigencia</label>
              <input className="input" type="date" style={{ fontSize: 12 }} value={form.vigencia} onChange={setF('vigencia')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Litros Autorizados *</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 12 }} value={form.litros_autorizados} onChange={setF('litros_autorizados')} placeholder="0.00" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Monto Autorizado ($)</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 12 }} value={form.monto_autorizado} onChange={setF('monto_autorizado')} placeholder="0.00" />
            </div>
          </div>

          {/* Selector de OP */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <label className="label" style={{ fontSize: 11, marginBottom: 6, display: 'block' }}>Orden de Pago vinculada (opcional)</label>
            {form.id_op_fk && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#eff6ff', borderRadius: 6, marginBottom: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, flex: 1 }}>
                  {ops.find(o => o.id === Number(form.id_op_fk))?.folio ?? `OP #${form.id_op_fk}`}
                </span>
                <button className="btn-ghost" style={{ padding: '2px 4px', color: '#dc2626' }} onClick={() => setForm(f => ({ ...f, id_op_fk: '' }))}>
                  <X size={11} />
                </button>
              </div>
            )}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input className="input" style={{ paddingLeft: 26, fontSize: 11, height: 26 }}
                    placeholder="Buscar folio o concepto…" value={opSearch} onChange={e => setOpSearch(e.target.value)} />
                </div>
              </div>
              <div style={{ maxHeight: 130, overflowY: 'auto' }}>
                {filteredOps.length === 0 ? (
                  <div style={{ padding: '10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>Sin OPs disponibles</div>
                ) : filteredOps.slice(0, 40).map(op => (
                  <div key={op.id} onClick={() => setForm(f => ({ ...f, id_op_fk: op.id.toString() }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
                      background: Number(form.id_op_fk) === op.id ? '#eff6ff' : 'transparent',
                      borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => { if (Number(form.id_op_fk) !== op.id) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (Number(form.id_op_fk) !== op.id) e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>{op.folio}</span>
                    <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', flexShrink: 0 }}>{fmt$(op.monto)}</span>
                    {Number(form.id_op_fk) === op.id && <CheckCircle size={12} style={{ color: 'var(--blue)', flexShrink: 0 }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="label" style={{ fontSize: 11 }}>Notas</label>
            <textarea className="input" rows={2} style={{ fontSize: 12, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Nueva / Editar Carga
// ══════════════════════════════════════════════════════════════
function CargaModal({ carga, equipos, areas, vales, onClose, onSaved }: {
  carga?: any; equipos: any[]; areas: any[]; vales: any[]
  onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    tipo_carga:      carga?.tipo_carga     ?? 'Gasolinería',
    id_vale_fk:      carga?.id_vale_fk?.toString()   ?? '',
    id_equipo_fk:    carga?.id_equipo_fk?.toString() ?? '',
    id_area_fk:      carga?.id_area_fk?.toString()   ?? '',
    fecha:           carga?.fecha          ?? new Date().toISOString().slice(0, 10),
    litros:          carga?.litros?.toString()              ?? '',
    precio_unitario: carga?.precio_unitario?.toString()     ?? '',
    monto_total:     carga?.monto_total?.toString()         ?? '',
    odometro:        carga?.odometro?.toString()            ?? '',
    comprobante_url: carga?.comprobante_url ?? '',
    notas:           carga?.notas           ?? '',
  })
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value
    setForm(f => {
      const next = { ...f, [k]: val }
      // Auto-calcular monto_total
      if (k === 'litros' || k === 'precio_unitario') {
        const l = k === 'litros' ? Number(val) : Number(f.litros)
        const p = k === 'precio_unitario' ? Number(val) : Number(f.precio_unitario)
        if (l > 0 && p > 0) next.monto_total = (l * p).toFixed(2)
      }
      // Auto-completar área desde vale seleccionado
      if (k === 'id_vale_fk' && val) {
        const v = vales.find(v => v.id === Number(val))
        if (v) {
          next.id_area_fk   = v.id_area_fk?.toString() ?? f.id_area_fk
          next.id_equipo_fk = v.id_equipo_fk?.toString() ?? f.id_equipo_fk
        }
      }
      return next
    })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `tickets/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('mantenimiento').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('mantenimiento').getPublicUrl(path)
    setForm(f => ({ ...f, comprobante_url: publicUrl }))
    setUploading(false)
  }

  const handleSave = async () => {
    if (!form.id_area_fk)  { setError('El área es obligatoria'); return }
    if (!form.litros)      { setError('Los litros son obligatorios'); return }
    if (form.tipo_carga === 'Gasolinería' && !form.id_equipo_fk) {
      setError('Para Gasolinería el equipo es obligatorio'); return
    }
    setSaving(true); setError('')

    const payload: any = {
      tipo_carga:      form.tipo_carga,
      id_vale_fk:      form.id_vale_fk      ? Number(form.id_vale_fk)      : null,
      id_equipo_fk:    form.id_equipo_fk    ? Number(form.id_equipo_fk)    : null,
      id_area_fk:      Number(form.id_area_fk),
      fecha:           form.fecha,
      litros:          Number(form.litros),
      precio_unitario: form.precio_unitario ? Number(form.precio_unitario) : null,
      monto_total:     form.monto_total     ? Number(form.monto_total)     : null,
      odometro:        form.odometro        ? Number(form.odometro)        : null,
      comprobante_url: form.comprobante_url || null,
      notas:           form.notas.trim()    || null,
      registrado_por:  authUser?.nombre     ?? null,
    }

    const { error: err } = carga
      ? await dbCtrl.from('cargas_combustible').update(payload).eq('id', carga.id)
      : await dbCtrl.from('cargas_combustible').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }

    // Actualizar litros_usados y status del vale
    if (payload.id_vale_fk) {
      const { data: allCargas } = await dbCtrl.from('cargas_combustible')
        .select('litros').eq('id_vale_fk', payload.id_vale_fk).eq('activo', true)
      const totalUsado = (allCargas ?? []).reduce((a: number, c: any) => a + (c.litros ?? 0), 0)
      const { data: valeData } = await dbCtrl.from('vales_combustible')
        .select('litros_autorizados, tipo_suministro').eq('id', payload.id_vale_fk).single()
      let nuevoStatus = 'Parcial'
      if (valeData?.tipo_suministro === 'Garrafa') {
        nuevoStatus = 'Entregado'
      } else if (valeData && totalUsado >= valeData.litros_autorizados) {
        nuevoStatus = 'Agotado'
      }
      await dbCtrl.from('vales_combustible')
        .update({ litros_usados: totalUsado, status: nuevoStatus, updated_at: new Date().toISOString() })
        .eq('id', payload.id_vale_fk)
    }

    onSaved()
  }

  const esGasolineria = form.tipo_carga === 'Gasolinería'
  const esConsumoGarrafa = form.tipo_carga === 'Consumo Garrafa'
  const valesFiltrados = vales.filter(v =>
    form.tipo_carga === 'Gasolinería'     ? v.tipo_suministro === 'Gasolinería' :
    form.tipo_carga === 'Entrega Garrafa' ? v.tipo_suministro === 'Garrafa'     :
    true
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
            {carga ? 'Editar Carga' : 'Registrar Carga'}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Tipo de Carga *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo_carga} onChange={setF('tipo_carga')}>
                {TIPOS_CARGA.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Fecha *</label>
              <input className="input" type="date" style={{ fontSize: 12 }} value={form.fecha} onChange={setF('fecha')} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label className="label" style={{ fontSize: 11 }}>Vale vinculado (opcional)</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_vale_fk} onChange={setF('id_vale_fk')}>
                <option value="">— Sin vale / Emergencia —</option>
                {valesFiltrados.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.folio} · {v.areas?.nombre ?? ''}{v.equipos ? ` · ${v.equipos.nombre}` : ''}{v.periodo ? ` · ${v.periodo}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" style={{ fontSize: 11 }}>Área *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk} onChange={setF('id_area_fk')}>
                <option value="">— Seleccionar —</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>

            {(esGasolineria || esConsumoGarrafa) && (
              <div>
                <label className="label" style={{ fontSize: 11 }}>Equipo *</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_equipo_fk} onChange={setF('id_equipo_fk')}>
                  <option value="">— Seleccionar —</option>
                  {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.placa ? ` (${e.placa})` : ''}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="label" style={{ fontSize: 11 }}>Litros *</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 12 }} value={form.litros} onChange={setF('litros')} placeholder="0.00" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Precio por litro ($)</label>
              <input className="input" type="number" step="0.0001" style={{ fontSize: 12 }} value={form.precio_unitario} onChange={setF('precio_unitario')} placeholder="0.0000" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Total ($)</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 12, fontWeight: 600 }} value={form.monto_total} onChange={setF('monto_total')} placeholder="Auto-calculado" />
            </div>
            {esGasolineria && (
              <div>
                <label className="label" style={{ fontSize: 11 }}>Odómetro al cargar</label>
                <input className="input" type="number" step="0.1" style={{ fontSize: 12 }} value={form.odometro} onChange={setF('odometro')} placeholder="km / hrs" />
              </div>
            )}
          </div>

          {/* Ticket */}
          {esGasolineria && (
            <div>
              <label className="label" style={{ fontSize: 11 }}>Ticket / Comprobante</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                {form.comprobante_url && (
                  <a href={form.comprobante_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'underline' }}>Ver ticket actual</a>
                )}
                <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                  {uploading ? 'Subiendo…' : form.comprobante_url ? 'Reemplazar' : 'Subir ticket'}
                </button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleUpload} />
              </div>
            </div>
          )}

          <div>
            <label className="label" style={{ fontSize: 11 }}>Notas</label>
            <textarea className="input" rows={2} style={{ fontSize: 12, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Detail: Vale
// ══════════════════════════════════════════════════════════════
function ValeDetail({ vale, areaMap, equipoMap, onClose }: {
  vale: any; areaMap: Record<number, string>; equipoMap: Record<number, string>; onClose: () => void
}) {
  const [cargas, setCargas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbCtrl.from('cargas_combustible')
      .select('*, equipos:id_equipo_fk(nombre, placa)')
      .eq('id_vale_fk', vale.id).eq('activo', true)
      .order('fecha', { ascending: false })
      .then(({ data }) => { setCargas(data ?? []); setLoading(false) })
  }, [vale.id])

  const pct = vale.litros_autorizados > 0 ? (vale.litros_usados / vale.litros_autorizados) * 100 : 0

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, margin: 0 }}>{vale.folio}</h2>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{vale.tipo_suministro}{vale.periodo ? ` · ${vale.periodo}` : ''}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge text={vale.status} map={VALE_STATUS_STYLE} />
            <button className="btn-ghost" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Progreso litros */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Litros usados</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtL(vale.litros_usados)} / {fmtL(vale.litros_autorizados)}</span>
            </div>
            <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5 }}>
              <div style={{ height: '100%', borderRadius: 5, width: `${Math.min(pct, 100)}%`,
                background: pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#10b981',
                transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{pct.toFixed(1)}%</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Área',       value: areaMap[vale.id_area_fk] },
              { label: 'Equipo',     value: vale.id_equipo_fk ? equipoMap[vale.id_equipo_fk] : null },
              { label: 'Monto auth.', value: fmt$(vale.monto_autorizado) },
              { label: 'Vigencia',   value: fmtF(vale.vigencia) },
              { label: 'Emitido por',value: vale.emitido_por },
              { label: 'OP vinculada',value: vale.id_op_fk ? `OP #${vale.id_op_fk}` : null },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                <div style={{ fontSize: 13 }}>{value ?? '—'}</div>
              </div>
            ))}
          </div>
          {vale.notas && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>{vale.notas}</div>}

          {/* Cargas del vale */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Cargas registradas ({cargas.length})
            </div>
            {loading ? <Loader size={14} className="animate-spin" style={{ color: 'var(--blue)' }} />
            : cargas.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>Sin cargas</div>
            : cargas.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                background: '#f8fafc', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{fmtF(c.fecha)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.equipos ? `${c.equipos.nombre}${c.equipos.placa ? ` · ${c.equipos.placa}` : ''}` : c.tipo_carga}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{fmtL(c.litros)}</div>
                  <div style={{ fontSize: 11, color: '#059669' }}>{fmt$(c.monto_total)}</div>
                </div>
                {c.comprobante_url && (
                  <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--blue)' }}>Ticket</a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
