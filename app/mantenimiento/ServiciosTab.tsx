'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, Filter, X, Save, Loader,
  Zap, Droplets, Edit2, Trash2, ChevronDown, ChevronRight,
  History
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

// ── Constantes ───────────────────────────────────────────────
const TIPOS_SERVICIO = ['CFE', 'Agua'] as const
const MODALIDADES    = ['Mensual', 'Bimestral'] as const
type TipoServicio    = typeof TIPOS_SERVICIO[number]

const TIPO_STYLE: Record<TipoServicio, { color: string; bg: string; border: string; Icon: React.FC<any> }> = {
  CFE:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', Icon: Zap      },
  Agua: { color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd', Icon: Droplets },
}

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const fmtConsumo = (n: number | null | undefined, tipo: string) => {
  if (n == null) return '—'
  return `${n.toLocaleString('es-MX')} ${tipo === 'CFE' ? 'kWh' : 'm³'}`
}

const fmtPeriodo = (fecha: string) => {
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
}

const periodoDefault = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
}

// ════════════════════════════════════════════════════════════
export default function ServiciosTab() {
  const { canWrite, canDelete } = useAuth()
  const [catalogo,    setCatalogo]    = useState<any[]>([])
  const [registros,   setRegistros]   = useState<Record<number, any[]>>({})
  const [loading,     setLoading]     = useState(true)
  const [filterTipo,  setFilterTipo]  = useState('')
  const [filterUbic,  setFilterUbic]  = useState('')
  const [expandidos,  setExpandidos]  = useState<Record<number, boolean>>({})
  const [modalCat,    setModalCat]    = useState(false)
  const [editingCat,  setEditingCat]  = useState<any | null>(null)

  // Mini-form inline por servicio
  const [formReg,  setFormReg]  = useState<Record<number, { fecha: string; consumo: string; monto: string }>>({})
  const [savingReg, setSavingReg] = useState<number | null>(null)

  const fetchCatalogo = useCallback(async () => {
    setLoading(true)
    const { data: cats } = await dbCtrl
      .from('servicios_catalogo')
      .select('*')
      .eq('activo', true)
      .order('tipo_servicio')
      .order('ubicacion')

    if (!cats?.length) { setCatalogo([]); setLoading(false); return }

    const ids = cats.map((c: any) => c.id)
    const { data: regs } = await dbCtrl
      .from('servicios_registros')
      .select('*')
      .in('id_servicio_fk', ids)
      .order('fecha_periodo', { ascending: false })

    const regMap: Record<number, any[]> = {}
    ;(regs ?? []).forEach((r: any) => {
      if (!regMap[r.id_servicio_fk]) regMap[r.id_servicio_fk] = []
      regMap[r.id_servicio_fk].push(r)
    })

    setCatalogo(cats)
    setRegistros(regMap)
    setLoading(false)
  }, [])

  useEffect(() => { fetchCatalogo() }, [fetchCatalogo])

  const filteredCat = catalogo.filter(c => {
    if (filterTipo && c.tipo_servicio !== filterTipo) return false
    if (filterUbic && !c.ubicacion?.toLowerCase().includes(filterUbic.toLowerCase())) return false
    return true
  })

  // KPIs: último registro de cada servicio
  const ultimosRegistros = catalogo.map(c => (registros[c.id] ?? [])[0]).filter(Boolean)
  const totalUltimoMes   = ultimosRegistros.reduce((a, r) => a + (r?.monto_periodo ?? 0), 0)
  const totalCFE  = catalogo
    .filter(c => c.tipo_servicio === 'CFE')
    .map(c => (registros[c.id] ?? [])[0])
    .filter(Boolean)
    .reduce((a, r) => a + (r?.monto_periodo ?? 0), 0)
  const totalAgua = catalogo
    .filter(c => c.tipo_servicio === 'Agua')
    .map(c => (registros[c.id] ?? [])[0])
    .filter(Boolean)
    .reduce((a, r) => a + (r?.monto_periodo ?? 0), 0)
  const cntCFE  = catalogo.filter(c => c.tipo_servicio === 'CFE').length
  const cntAgua = catalogo.filter(c => c.tipo_servicio === 'Agua').length

  const toggleExpand = (id: number) =>
    setExpandidos(e => ({ ...e, [id]: !e[id] }))

  const initFormReg = (id: number) =>
    setFormReg(f => ({ ...f, [id]: f[id] ?? { fecha: periodoDefault(), consumo: '', monto: '' } }))

  const handleSaveReg = async (servicio: any) => {
    const f = formReg[servicio.id]
    if (!f?.monto || Number(f.monto) <= 0) return
    setSavingReg(servicio.id)
    const { authUser } = { authUser: null } // hook solo disponible en render — usamos ref local
    await dbCtrl.from('servicios_registros').insert({
      id_servicio_fk:  servicio.id,
      fecha_periodo:   f.fecha,
      consumo_periodo: f.consumo ? Number(f.consumo) : null,
      monto_periodo:   Number(f.monto),
    })
    setFormReg(prev => {
      const next = { ...prev }
      delete next[servicio.id]
      return next
    })
    setSavingReg(null)
    fetchCatalogo()
  }

  const handleDeleteReg = async (regId: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    await dbCtrl.from('servicios_registros').delete().eq('id', regId)
    fetchCatalogo()
  }

  const handleDeleteServicio = async (id: number) => {
    if (!confirm('¿Desactivar este servicio del catálogo?')) return
    await dbCtrl.from('servicios_catalogo').update({ activo: false }).eq('id', id)
    fetchCatalogo()
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: 2 }}>Último periodo (total)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)',
            fontVariantNumeric: 'tabular-nums' }}>{fmt(totalUltimoMes)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {catalogo.length} servicios activos
          </div>
        </div>
        <div className="card" style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <Zap size={11} style={{ color: '#d97706' }} />
            <span style={{ fontSize: 10, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CFE — Último periodo</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706',
            fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCFE)}</div>
          <div style={{ fontSize: 10, color: '#92400e' }}>{cntCFE} servicios</div>
        </div>
        <div className="card" style={{ padding: '10px 14px', background: '#e0f2fe', border: '1px solid #bae6fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <Droplets size={11} style={{ color: '#0369a1' }} />
            <span style={{ fontSize: 10, color: '#075985', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agua — Último periodo</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0369a1',
            fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAgua)}</div>
          <div style={{ fontSize: 10, color: '#075985' }}>{cntAgua} servicios</div>
        </div>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: 2 }}>Total registros</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            {Object.values(registros).reduce((a, arr) => a + arr.length, 0)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>histórico completo</div>
        </div>
      </div>

      {/* Filtros + acción */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
        padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          <Filter size={11} /> Filtros
        </span>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

        <select className="select"
          style={{ width: 120, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Tipo servicio</option>
          {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
        </select>

        <input className="input"
          style={{ flex: '1 1 140px', maxWidth: 220, fontSize: 12, padding: '3px 8px', height: 28 }}
          placeholder="Buscar ubicación…"
          value={filterUbic} onChange={e => setFilterUbic(e.target.value)} />

        {(filterTipo || filterUbic) && (
          <button className="btn-ghost"
            style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setFilterTipo(''); setFilterUbic('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }}
          onClick={fetchCatalogo}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px', height: 28 }}
            onClick={() => { setEditingCat(null); setModalCat(true) }}>
            <Plus size={11} /> Nuevo Servicio
          </button>
        )}
      </div>

      {/* Lista catálogo con expansión */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : filteredCat.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
          {catalogo.length === 0
            ? 'Sin servicios en el catálogo. Agrega el primero con "Nuevo Servicio".'
            : 'Sin resultados para los filtros aplicados.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredCat.map(servicio => {
            const ts       = TIPO_STYLE[servicio.tipo_servicio as TipoServicio]
            const Icon     = ts?.Icon
            const regs     = registros[servicio.id] ?? []
            const ultimo   = regs[0]
            const expanded = !!expandidos[servicio.id]
            const fReg     = formReg[servicio.id]

            return (
              <div key={servicio.id} className="card" style={{ overflow: 'hidden', padding: 0 }}>

                {/* Cabecera del servicio */}
                <div
                  onClick={() => { toggleExpand(servicio.id); if (!expandidos[servicio.id]) initFormReg(servicio.id) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', cursor: 'pointer',
                    background: ts ? ts.bg : 'var(--blue-pale)',
                    borderBottom: expanded ? `1px solid ${ts?.border ?? '#e2e8f0'}` : 'none' }}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {expanded
                      ? <ChevronDown size={13} style={{ color: ts?.color ?? 'var(--blue)', flexShrink: 0 }} />
                      : <ChevronRight size={13} style={{ color: ts?.color ?? 'var(--blue)', flexShrink: 0 }} />}
                    {Icon && (
                      <div style={{ width: 28, height: 28, borderRadius: 6,
                        background: ts.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={13} style={{ color: ts.color }} />
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ts?.color ?? 'var(--blue)',
                        fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                        {servicio.no_servicio}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {servicio.ubicacion ?? 'Sin ubicación'} · {servicio.modalidad}
                        {servicio.titular && (
                          <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>
                            · {servicio.titular}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Último registro */}
                    {ultimo ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: ts?.color,
                          fontVariantNumeric: 'tabular-nums' }}>{fmt(ultimo.monto_periodo)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {fmtPeriodo(ultimo.fecha_periodo)}
                          {ultimo.consumo_periodo != null && (
                            <span style={{ marginLeft: 6 }}>
                              · {fmtConsumo(ultimo.consumo_periodo, servicio.tipo_servicio)}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Sin registros
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10,
                        background: '#f1f5f9', color: 'var(--text-muted)', display: 'flex',
                        alignItems: 'center', gap: 3 }}>
                        <History size={10} /> {regs.length}
                      </span>
                      {canWrite('mantenimiento') && (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => { setEditingCat(servicio); setModalCat(true) }}>
                          <Edit2 size={10} />
                        </button>
                      )}
                      {canDelete() && (
                        <button className="btn-ghost"
                          style={{ fontSize: 11, padding: '3px 6px', color: '#dc2626' }}
                          onClick={() => handleDeleteServicio(servicio.id)}>
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Panel expandido */}
                {expanded && (
                  <div style={{ padding: '10px 14px', background: '#fff' }}>

                    {/* Mini-form para nuevo registro */}
                    {canWrite('mantenimiento') && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12,
                        padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                        borderRadius: 8 }}>
                        <div style={{ flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600,
                            marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            + Agregar Registro
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Periodo</label>
                          <input className="input" type="date"
                            style={{ fontSize: 12, height: 28, padding: '3px 6px', width: 140 }}
                            value={fReg?.fecha ?? periodoDefault()}
                            onChange={e => setFormReg(f => ({
                              ...f, [servicio.id]: { ...f[servicio.id], fecha: e.target.value }
                            }))} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            Consumo {servicio.tipo_servicio === 'CFE' ? '(kWh)' : '(m³)'}
                          </label>
                          <input className="input" type="number" step="0.01"
                            style={{ fontSize: 12, height: 28, padding: '3px 6px', width: 100 }}
                            placeholder="0"
                            value={fReg?.consumo ?? ''}
                            onChange={e => setFormReg(f => ({
                              ...f, [servicio.id]: { ...f[servicio.id], consumo: e.target.value }
                            }))} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Monto *</label>
                          <input className="input" type="number" step="0.01"
                            style={{ fontSize: 12, height: 28, padding: '3px 6px', width: 110, textAlign: 'right' }}
                            placeholder="0.00"
                            value={fReg?.monto ?? ''}
                            onChange={e => setFormReg(f => ({
                              ...f, [servicio.id]: { ...f[servicio.id], monto: e.target.value }
                            }))} />
                        </div>
                        <button className="btn-primary"
                          style={{ fontSize: 12, padding: '4px 12px', height: 28, flexShrink: 0 }}
                          onClick={() => handleSaveReg(servicio)}
                          disabled={savingReg === servicio.id || !fReg?.monto}>
                          {savingReg === servicio.id
                            ? <Loader size={11} className="animate-spin" />
                            : <Save size={11} />}
                          Guardar
                        </button>
                      </div>
                    )}

                    {/* Historial de registros */}
                    {regs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px 0',
                        color: 'var(--text-muted)', fontSize: 12 }}>
                        Sin registros aún
                      </div>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>Periodo</th>
                            <th style={{ textAlign: 'right' }}>
                              Consumo {servicio.tipo_servicio === 'CFE' ? '(kWh)' : '(m³)'}
                            </th>
                            <th style={{ textAlign: 'right' }}>Monto</th>
                            <th style={{ fontSize: 10, color: 'var(--text-muted)' }}>Notas</th>
                            {canDelete() && <th style={{ width: 40 }}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {regs.map((r: any, i: number) => (
                            <tr key={r.id}
                              style={{ background: i === 0 ? (ts?.bg ?? '#fff') : 'transparent' }}>
                              <td style={{ fontSize: 12, fontWeight: i === 0 ? 600 : 400 }}>
                                {fmtPeriodo(r.fecha_periodo)}
                                {i === 0 && (
                                  <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px',
                                    borderRadius: 8, background: ts?.color + '20', color: ts?.color,
                                    fontWeight: 600 }}>
                                    Último
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 12,
                                fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                                {fmtConsumo(r.consumo_periodo, servicio.tipo_servicio)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: i === 0 ? 700 : 500,
                                fontVariantNumeric: 'tabular-nums',
                                color: i === 0 ? (ts?.color ?? 'var(--blue)') : 'var(--text-primary)' }}>
                                {fmt(r.monto_periodo)}
                              </td>
                              <td style={{ fontSize: 11, color: 'var(--text-muted)',
                                maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.notas ?? '—'}
                              </td>
                              {canDelete() && (
                                <td>
                                  <button className="btn-ghost"
                                    style={{ padding: '2px 5px', color: '#dc2626' }}
                                    onClick={() => handleDeleteReg(r.id)}>
                                    <Trash2 size={11} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal catálogo */}
      {modalCat && (
        <CatalogoModal
          row={editingCat}
          onClose={() => setModalCat(false)}
          onSaved={() => { setModalCat(false); fetchCatalogo() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal — Alta / Edición de servicio en catálogo
// ════════════════════════════════════════════════════════════
function CatalogoModal({ row, onClose, onSaved }: {
  row: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [internos,  setInternos]  = useState<{ id: number; nombre: string }[]>([])

  useEffect(() => {
    dbComp.from('proveedores')
      .select('id, nombre')
      .eq('interno', true)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setInternos(data ?? []))
  }, [])

  const [form, setForm] = useState({
    no_servicio:   row?.no_servicio   ?? '',
    ubicacion:     row?.ubicacion     ?? '',
    titular:       row?.titular       ?? '',
    tipo_servicio: row?.tipo_servicio ?? 'CFE',
    modalidad:     row?.modalidad     ?? 'Mensual',
    notas:         row?.notas         ?? '',
  })

  const setF = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.no_servicio.trim()) { setError('El número de servicio es obligatorio'); return }
    setSaving(true); setError('')

    const payload = {
      no_servicio:   form.no_servicio.trim(),
      ubicacion:     form.ubicacion.trim() || null,
      titular:       form.titular.trim() || null,
      tipo_servicio: form.tipo_servicio,
      modalidad:     form.modalidad,
      notas:         form.notas.trim() || null,
      updated_at:    new Date().toISOString(),
    }

    if (row) {
      const { error: err } = await dbCtrl.from('servicios_catalogo').update(payload).eq('id', row.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await dbCtrl.from('servicios_catalogo')
        .insert({ ...payload, created_by: authUser?.nombre ?? null })
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento"
      titulo={row ? 'Editar Servicio' : 'Nuevo Servicio — Catálogo'}
      onClose={onClose} maxWidth={420}>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Tipo de Servicio *</label>
            <select className="select" style={{ fontSize: 12 }}
              value={form.tipo_servicio} onChange={setF('tipo_servicio')}>
              {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Modalidad *</label>
            <select className="select" style={{ fontSize: 12 }}
              value={form.modalidad} onChange={setF('modalidad')}>
              {MODALIDADES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>No. de Servicio *</label>
          <input className="input" style={{ fontSize: 13, fontFamily: 'monospace' }}
            value={form.no_servicio} onChange={setF('no_servicio')}
            placeholder="ej. 123456789012" />
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Ubicación</label>
          <input className="input" style={{ fontSize: 13 }}
            value={form.ubicacion} onChange={setF('ubicacion')}
            placeholder="ej. Caseta principal, Parque Sur…" />
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Titular</label>
          <select className="select" style={{ fontSize: 13 }}
            value={form.titular} onChange={setF('titular')}>
            <option value="">— Sin titular —</option>
            {internos.map(p => (
              <option key={p.id} value={p.nombre}>{p.nombre}</option>
            ))}
          </select>
          {internos.length === 0 && (
            <div style={{ fontSize: 10, color: '#d97706', marginTop: 3 }}>
              Sin empresas internas en el catálogo de proveedores. Marca proveedores como "Empresa interna" primero.
            </div>
          )}
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Notas</label>
          <textarea className="input" rows={2} style={{ fontSize: 12, resize: 'vertical' }}
            value={form.notas} onChange={setF('notas')} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end',
        padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
          {row ? 'Guardar Cambios' : 'Agregar al Catálogo'}
        </button>
      </div>
    </ModalShell>
  )
}
