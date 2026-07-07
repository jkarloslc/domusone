'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, Filter, X, Save, Loader,
  Zap, Droplets, Edit2, Trash2, ChevronDown, ChevronRight,
  History, Network, BarChart2, List
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

// ── Constantes ───────────────────────────────────────────────
const TIPOS_SERVICIO  = ['CFE', 'Agua'] as const
const MODALIDADES     = ['Mensual', 'Bimestral'] as const
type TipoServicio     = typeof TIPOS_SERVICIO[number]
const TIPOS_CONEXION  = ['Medidor', 'Toma', 'Circuito', 'Interruptor', 'Tablero', 'Válvula', 'Hidrante', 'Otro'] as const

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

const fmtFecha = (f: string | null | undefined) => {
  if (!f) return '—'
  const d = new Date(f + 'T12:00:00')
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtRango = (inicio: string | null | undefined, fin: string | null | undefined) => {
  if (!inicio) return '—'
  if (!fin) return fmtFecha(inicio)
  // Si mismo año, omite año en la fecha de inicio
  const dI = new Date(inicio + 'T12:00:00')
  const dF = new Date(fin    + 'T12:00:00')
  const mismoAnio = dI.getFullYear() === dF.getFullYear()
  const labelI = dI.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', ...(mismoAnio ? {} : { year: 'numeric' }) })
  const labelF = dF.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${labelI} – ${labelF}`
}

const periodoInicioDefault = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
}

const periodoFinDefault = () => {
  const hoy = new Date()
  // Último día del mes actual
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`
}

// ════════════════════════════════════════════════════════════
export default function ServiciosTab() {
  const { canWrite, canDelete } = useAuth()
  const [catalogo,      setCatalogo]      = useState<any[]>([])
  const [registros,     setRegistros]     = useState<Record<number, any[]>>({})
  const [centrosCosto,  setCentrosCosto]  = useState<any[]>([])
  const [ccMap,         setCcMap]         = useState<Record<number, string>>({})
  const [loading,       setLoading]       = useState(true)
  const [filterTipo,      setFilterTipo]      = useState('')
  const [filterUbic,      setFilterUbic]      = useState('')
  const [filterCC,        setFilterCC]        = useState('')
  const [filterNoServicio, setFilterNoServicio] = useState('')
  const [expandidos,    setExpandidos]    = useState<Record<number, boolean>>({})
  const [vistaReporte,  setVistaReporte]  = useState(false)
  const [modalCat,      setModalCat]      = useState(false)
  const [editingCat,    setEditingCat]    = useState<any | null>(null)

  // Mini-form inline por servicio
  const [formReg,  setFormReg]  = useState<Record<number, { fechaInicio: string; fechaFin: string; consumo: string; monto: string }>>({})
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
      .order('fecha_inicio', { ascending: false })

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

  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setCentrosCosto(data ?? [])
        const m: Record<number, string> = {}
        ;(data ?? []).forEach((c: any) => { m[c.id] = c.nombre })
        setCcMap(m)
      })
  }, [])

  const filteredCat = catalogo.filter(c => {
    if (filterTipo       && c.tipo_servicio !== filterTipo) return false
    if (filterUbic       && !c.ubicacion?.toLowerCase().includes(filterUbic.toLowerCase())) return false
    if (filterCC         && String(c.id_centro_costo_fk) !== filterCC) return false
    if (filterNoServicio && !c.no_servicio?.toLowerCase().includes(filterNoServicio.toLowerCase())) return false
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
    setFormReg(f => ({ ...f, [id]: f[id] ?? { fechaInicio: periodoInicioDefault(), fechaFin: periodoFinDefault(), consumo: '', monto: '' } }))

  const handleSaveReg = async (servicio: any) => {
    const f = formReg[servicio.id]
    if (!f?.monto || Number(f.monto) <= 0) return
    setSavingReg(servicio.id)
    const { authUser } = { authUser: null } // hook solo disponible en render — usamos ref local
    await dbCtrl.from('servicios_registros').insert({
      id_servicio_fk:  servicio.id,
      fecha_inicio:    f.fechaInicio,
      fecha_fin:       f.fechaFin || null,
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
          style={{ flex: '1 1 150px', maxWidth: 210, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterCC} onChange={e => setFilterCC(e.target.value)}>
          <option value="">Centro de costo</option>
          {centrosCosto.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <select className="select"
          style={{ width: 110, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Tipo servicio</option>
          {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
        </select>

        <input className="input"
          style={{ flex: '1 1 120px', maxWidth: 180, fontSize: 12, padding: '3px 8px', height: 28 }}
          placeholder="No. Servicio…"
          value={filterNoServicio} onChange={e => setFilterNoServicio(e.target.value)} />

        <input className="input"
          style={{ flex: '1 1 120px', maxWidth: 180, fontSize: 12, padding: '3px 8px', height: 28 }}
          placeholder="Ubicación…"
          value={filterUbic} onChange={e => setFilterUbic(e.target.value)} />

        {(filterCC || filterTipo || filterUbic || filterNoServicio) && (
          <button className="btn-ghost"
            style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setFilterCC(''); setFilterTipo(''); setFilterUbic(''); setFilterNoServicio('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }}
          onClick={fetchCatalogo}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          className={vistaReporte ? 'btn-primary' : 'btn-ghost'}
          style={{ fontSize: 12, padding: '4px 10px', height: 28, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => setVistaReporte(v => !v)}>
          {vistaReporte ? <List size={11} /> : <BarChart2 size={11} />}
          {vistaReporte ? 'Lista' : 'Reporte'}
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px', height: 28 }}
            onClick={() => { setEditingCat(null); setModalCat(true) }}>
            <Plus size={11} /> Nuevo Servicio
          </button>
        )}
      </div>

      {vistaReporte && (
        <ReporteServicios
          catalogo={catalogo}
          registros={registros}
          ccMap={ccMap}
          centrosCosto={centrosCosto}
        />
      )}

      {/* Lista catálogo con expansión */}
      {!vistaReporte && (loading ? (
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: ts?.color ?? 'var(--blue)',
                          fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                          {servicio.no_servicio}
                        </div>
                        {servicio.ubicacion && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px',
                            borderRadius: 20, background: (ts?.color ?? '#64748b') + '15',
                            color: ts?.color ?? '#64748b', border: `1px solid ${ts?.color ?? '#64748b'}30` }}>
                            {servicio.ubicacion}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {servicio.modalidad}
                        {servicio.id_centro_costo_fk && ccMap[servicio.id_centro_costo_fk] && (
                          <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>
                            · {ccMap[servicio.id_centro_costo_fk]}
                          </span>
                        )}
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
                          {fmtRango(ultimo.fecha_inicio, ultimo.fecha_fin)}
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
                          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Inicio</label>
                          <input className="input" type="date"
                            style={{ fontSize: 12, height: 28, padding: '3px 6px', width: 130 }}
                            value={fReg?.fechaInicio ?? periodoInicioDefault()}
                            onChange={e => setFormReg(f => ({
                              ...f, [servicio.id]: { ...f[servicio.id], fechaInicio: e.target.value }
                            }))} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fin</label>
                          <input className="input" type="date"
                            style={{ fontSize: 12, height: 28, padding: '3px 6px', width: 130 }}
                            value={fReg?.fechaFin ?? periodoFinDefault()}
                            onChange={e => setFormReg(f => ({
                              ...f, [servicio.id]: { ...f[servicio.id], fechaFin: e.target.value }
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
                            <th>Inicio</th>
                            <th>Fin</th>
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
                              <td style={{ fontSize: 12, fontWeight: i === 0 ? 600 : 400, whiteSpace: 'nowrap' }}>
                                {fmtFecha(r.fecha_inicio)}
                                {i === 0 && (
                                  <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px',
                                    borderRadius: 8, background: ts?.color + '20', color: ts?.color,
                                    fontWeight: 600 }}>
                                    Último
                                  </span>
                                )}
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {fmtFecha(r.fecha_fin)}
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
      ))}

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
// Reporte de consumo por servicio
// ════════════════════════════════════════════════════════════
function ReporteServicios({
  catalogo, registros, ccMap, centrosCosto,
}: {
  catalogo: any[]
  registros: Record<number, any[]>
  ccMap: Record<number, string>
  centrosCosto: any[]
}) {
  const currentYear = new Date().getFullYear()
  const [filterAnio,  setFilterAnio]  = useState(String(currentYear))
  const [filterTipoR, setFilterTipoR] = useState('')
  const [filterCCR,   setFilterCCR]   = useState('')

  const servicioInfo: Record<number, { tipo: string; cc: number | null }> = {}
  catalogo.forEach(c => { servicioInfo[c.id] = { tipo: c.tipo_servicio, cc: c.id_centro_costo_fk } })

  // Flatten all records with their service metadata
  const todos: { sid: number; tipo: string; cc: number | null; fecha: string; monto: number; consumo: number | null }[] = []
  Object.entries(registros).forEach(([sidStr, regs]) => {
    const sid = Number(sidStr)
    const info = servicioInfo[sid]
    if (!info) return
    regs.forEach(r => {
      todos.push({ sid, tipo: info.tipo, cc: info.cc, fecha: r.fecha_inicio ?? '', monto: r.monto_periodo ?? 0, consumo: r.consumo_periodo ?? null })
    })
  })

  // Available years from actual data
  const anosDisp = Array.from(new Set(todos.map(r => r.fecha.slice(0, 4)).filter(Boolean))).sort((a, b) => Number(b) - Number(a))
  if (!anosDisp.includes(String(currentYear))) anosDisp.unshift(String(currentYear))

  const filtered = todos.filter(r => {
    if (filterAnio && !r.fecha.startsWith(filterAnio)) return false
    if (filterTipoR && r.tipo !== filterTipoR) return false
    if (filterCCR && String(r.cc) !== filterCCR) return false
    return true
  })

  // Group by YYYY-MM
  type MesData = { CFE: number; Agua: number; consumoCFE: number; consumoAgua: number }
  const byMes: Record<string, MesData> = {}
  filtered.forEach(r => {
    const mes = r.fecha.slice(0, 7) || 'sin-mes'
    if (!byMes[mes]) byMes[mes] = { CFE: 0, Agua: 0, consumoCFE: 0, consumoAgua: 0 }
    if (r.tipo === 'CFE') { byMes[mes].CFE += r.monto; byMes[mes].consumoCFE += r.consumo ?? 0 }
    else                  { byMes[mes].Agua += r.monto; byMes[mes].consumoAgua += r.consumo ?? 0 }
  })
  const meses = Object.keys(byMes).sort()

  const totalCFE       = filtered.filter(r => r.tipo === 'CFE').reduce((a, r) => a + r.monto, 0)
  const totalAgua      = filtered.filter(r => r.tipo === 'Agua').reduce((a, r) => a + r.monto, 0)
  const totalConsuCFE  = filtered.filter(r => r.tipo === 'CFE' && r.consumo != null).reduce((a, r) => a + (r.consumo ?? 0), 0)
  const totalConsuAgua = filtered.filter(r => r.tipo === 'Agua' && r.consumo != null).reduce((a, r) => a + (r.consumo ?? 0), 0)

  const showCFE  = !filterTipoR || filterTipoR === 'CFE'
  const showAgua = !filterTipoR || filterTipoR === 'Agua'
  const nBars    = (showCFE ? 1 : 0) + (showAgua ? 1 : 0)

  // SVG chart geometry
  const SVG_W = 760, SVG_H = 230
  const PAD = { l: 70, r: 16, t: 16, b: 46 }
  const plotW = SVG_W - PAD.l - PAD.r
  const plotH = SVG_H - PAD.t - PAD.b

  const maxVal = meses.length === 0 ? 1 :
    Math.max(...meses.flatMap(m => [showCFE ? byMes[m].CFE : 0, showAgua ? byMes[m].Agua : 0]), 1)

  // Nice Y ceiling
  const yMax = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(maxVal)))
    const c = [1, 2, 2.5, 5, 10].map(f => f * mag)
    return (c.find(v => v >= maxVal * 1.1) ?? maxVal * 1.15)
  })()

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => yMax * t)
  const groupW    = meses.length > 0 ? plotW / meses.length : plotW
  const barW      = Math.min(Math.max((groupW - 8) / nBars - 3, 5), 40)
  const gap       = 3
  const innerW    = nBars * barW + (nBars - 1) * gap
  const groupOff  = (groupW - innerW) / 2
  const toY       = (v: number) => PAD.t + plotH - (v / yMax) * plotH

  const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const fmtMes   = (ym: string) => {
    const [y, m] = ym.split('-')
    return `${MESES_ES[Number(m) - 1] ?? m} ${y?.slice(2)}`
  }

  return (
    <div>
      {/* Filtros reporte */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
        padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4 }}>
          <Filter size={11} /> Reporte
        </span>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        <select className="select"
          style={{ width: 88, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterAnio} onChange={e => setFilterAnio(e.target.value)}>
          <option value="">Todos</option>
          {anosDisp.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="select"
          style={{ width: 112, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterTipoR} onChange={e => setFilterTipoR(e.target.value)}>
          <option value="">CFE + Agua</option>
          {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select"
          style={{ flex: '1 1 150px', maxWidth: 210, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterCCR} onChange={e => setFilterCCR(e.target.value)}>
          <option value="">Todos los centros</option>
          {centrosCosto.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {(filterTipoR || filterCCR) && (
          <button className="btn-ghost"
            style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626' }}
            onClick={() => { setFilterTipoR(''); setFilterCCR('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '.05em', marginBottom: 2 }}>Total periodo</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)',
            fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCFE + totalAgua)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{filtered.length} registros · {meses.length} meses</div>
        </div>
        <div className="card" style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 10, color: '#92400e', textTransform: 'uppercase',
            letterSpacing: '.05em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={10} style={{ color: '#d97706' }} /> CFE
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706',
            fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCFE)}</div>
          <div style={{ fontSize: 10, color: '#92400e' }}>
            {totalConsuCFE > 0 ? `${totalConsuCFE.toLocaleString('es-MX')} kWh` : 'Sin consumo registrado'}
          </div>
        </div>
        <div className="card" style={{ padding: '10px 14px', background: '#e0f2fe', border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: 10, color: '#075985', textTransform: 'uppercase',
            letterSpacing: '.05em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Droplets size={10} style={{ color: '#0369a1' }} /> Agua
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0369a1',
            fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAgua)}</div>
          <div style={{ fontSize: 10, color: '#075985' }}>
            {totalConsuAgua > 0 ? `${totalConsuAgua.toLocaleString('es-MX')} m³` : 'Sin consumo registrado'}
          </div>
        </div>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '.05em', marginBottom: 2 }}>Promedio mensual</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums' }}>
            {fmt(meses.length > 0 ? (totalCFE + totalAgua) / meses.length : 0)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>por mes</div>
        </div>
      </div>

      {/* Gráfica */}
      {meses.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 13 }}>
          Sin datos para los filtros seleccionados.
        </div>
      ) : (
        <div className="card" style={{ padding: '14px 12px 10px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Consumo por periodo — Monto ($)
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
              {showCFE && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#d97706', display: 'inline-block' }} />
                  CFE
                </span>
              )}
              {showAgua && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0369a1', display: 'inline-block' }} />
                  Agua
                </span>
              )}
            </div>
          </div>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              style={{ width: '100%', minWidth: Math.max(meses.length * 55, 280), display: 'block' }}>

              {/* Y gridlines + labels */}
              {yTicks.map((v, i) => {
                const y = toY(v)
                return (
                  <g key={i}>
                    <line x1={PAD.l} y1={y} x2={SVG_W - PAD.r} y2={y}
                      stroke={i === 0 ? '#94a3b8' : '#e2e8f0'}
                      strokeWidth={i === 0 ? 1 : 0.5} />
                    <text x={PAD.l - 6} y={y + 3.5} textAnchor="end" fontSize={9} fill="#94a3b8">
                      {v >= 1000
                        ? `$${(v / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}k`
                        : `$${Math.round(v)}`}
                    </text>
                  </g>
                )
              })}

              {/* Bars per month */}
              {meses.map((mes, mi) => {
                const gx   = PAD.l + mi * groupW + groupOff
                const data = byMes[mes]
                const bars: { color: string; val: number }[] = []
                if (showCFE)  bars.push({ color: '#d97706', val: data.CFE })
                if (showAgua) bars.push({ color: '#0369a1', val: data.Agua })
                return (
                  <g key={mes}>
                    {bars.map((b, bi) => {
                      const bx = gx + bi * (barW + gap)
                      const h  = Math.max((b.val / yMax) * plotH, b.val > 0 ? 2 : 0)
                      const y  = PAD.t + plotH - h
                      return (
                        <g key={bi}>
                          <rect x={bx} y={y} width={barW} height={h} rx={2}
                            fill={b.color} opacity={0.82} />
                          {h > 18 && (
                            <text x={bx + barW / 2} y={y + h - 4}
                              textAnchor="middle" fontSize={7.5} fill="#fff" fontWeight={600}>
                              {b.val >= 1000
                                ? `${(b.val / 1000).toFixed(0)}k`
                                : Math.round(b.val).toString()}
                            </text>
                          )}
                        </g>
                      )
                    })}
                    {/* X label */}
                    <text
                      x={PAD.l + mi * groupW + groupW / 2}
                      y={SVG_H - PAD.b + 14}
                      textAnchor="middle" fontSize={9} fill="#64748b">
                      {fmtMes(mes)}
                    </text>
                  </g>
                )
              })}

              {/* Y axis line */}
              <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + plotH}
                stroke="#94a3b8" strokeWidth={1} />
            </svg>
          </div>
        </div>
      )}

      {/* Tabla detalle por mes */}
      {meses.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0',
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Detalle por periodo
          </div>
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                {showCFE && <>
                  <th style={{ textAlign: 'right' }}>Monto CFE</th>
                  <th style={{ textAlign: 'right' }}>Consumo (kWh)</th>
                </>}
                {showAgua && <>
                  <th style={{ textAlign: 'right' }}>Monto Agua</th>
                  <th style={{ textAlign: 'right' }}>Consumo (m³)</th>
                </>}
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {[...meses].reverse().map(mes => {
                const d     = byMes[mes]
                const total = (showCFE ? d.CFE : 0) + (showAgua ? d.Agua : 0)
                return (
                  <tr key={mes}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMes(mes)}</td>
                    {showCFE && <>
                      <td style={{ textAlign: 'right', color: '#d97706',
                        fontVariantNumeric: 'tabular-nums' }}>{fmt(d.CFE)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)',
                        fontVariantNumeric: 'tabular-nums' }}>
                        {d.consumoCFE > 0 ? d.consumoCFE.toLocaleString('es-MX') : '—'}
                      </td>
                    </>}
                    {showAgua && <>
                      <td style={{ textAlign: 'right', color: '#0369a1',
                        fontVariantNumeric: 'tabular-nums' }}>{fmt(d.Agua)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)',
                        fontVariantNumeric: 'tabular-nums' }}>
                        {d.consumoAgua > 0 ? d.consumoAgua.toLocaleString('es-MX') : '—'}
                      </td>
                    </>}
                    <td style={{ textAlign: 'right', fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                <td>Total</td>
                {showCFE && <>
                  <td style={{ textAlign: 'right', color: '#d97706',
                    fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCFE)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {totalConsuCFE > 0 ? `${totalConsuCFE.toLocaleString('es-MX')} kWh` : '—'}
                  </td>
                </>}
                {showAgua && <>
                  <td style={{ textAlign: 'right', color: '#0369a1',
                    fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAgua)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {totalConsuAgua > 0 ? `${totalConsuAgua.toLocaleString('es-MX')} m³` : '—'}
                  </td>
                </>}
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(totalCFE + totalAgua)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [internos,        setInternos]        = useState<{ id: number; nombre: string }[]>([])
  const [centrosCosto,    setCentrosCosto]    = useState<any[]>([])

  // Puntos de conexión
  const [puntos,          setPuntos]          = useState<any[]>([])
  const [puntosLoading,   setPuntosLoading]   = useState(false)
  const [newPuntoForm,    setNewPuntoForm]     = useState<{ nombre: string; tipo: string; referencia: string; ubicacion: string } | null>(null)
  const [editingPuntoId,  setEditingPuntoId]  = useState<number | null>(null)
  const [editPuntoForm,   setEditPuntoForm]   = useState({ nombre: '', tipo: '', referencia: '', ubicacion: '' })
  const [savingPunto,     setSavingPunto]     = useState(false)

  const reloadPuntos = async () => {
    const { data } = await dbCtrl.from('servicios_puntos_conexion')
      .select('*').eq('id_servicio_fk', row!.id).eq('activo', true).order('id')
    setPuntos(data ?? [])
  }

  useEffect(() => {
    Promise.all([
      dbComp.from('proveedores').select('id, nombre').eq('interno', true).eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([{ data: provs }, { data: ccs }]) => {
      setInternos(provs ?? [])
      setCentrosCosto(ccs ?? [])
    })
  }, [])

  useEffect(() => {
    if (!row?.id) return
    setPuntosLoading(true)
    dbCtrl.from('servicios_puntos_conexion')
      .select('*').eq('id_servicio_fk', row.id).eq('activo', true).order('id')
      .then(({ data }) => { setPuntos(data ?? []); setPuntosLoading(false) })
  }, [row?.id])

  const handleAddPunto = async () => {
    if (!newPuntoForm?.nombre.trim()) return
    setSavingPunto(true)
    await dbCtrl.from('servicios_puntos_conexion').insert({
      id_servicio_fk: row!.id,
      nombre:         newPuntoForm.nombre.trim(),
      tipo:           newPuntoForm.tipo || null,
      referencia:     newPuntoForm.referencia.trim() || null,
      ubicacion:      newPuntoForm.ubicacion.trim()  || null,
    })
    setNewPuntoForm(null)
    await reloadPuntos()
    setSavingPunto(false)
  }

  const handleEditPunto = async (id: number) => {
    if (!editPuntoForm.nombre.trim()) return
    setSavingPunto(true)
    await dbCtrl.from('servicios_puntos_conexion').update({
      nombre:     editPuntoForm.nombre.trim(),
      tipo:       editPuntoForm.tipo || null,
      referencia: editPuntoForm.referencia.trim() || null,
      ubicacion:  editPuntoForm.ubicacion.trim()  || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setEditingPuntoId(null)
    await reloadPuntos()
    setSavingPunto(false)
  }

  const handleDeletePunto = async (id: number) => {
    if (!confirm('¿Eliminar este punto de conexión?')) return
    await dbCtrl.from('servicios_puntos_conexion').update({ activo: false }).eq('id', id)
    setPuntos(prev => prev.filter(p => p.id !== id))
  }

  const [form, setForm] = useState({
    no_servicio:         row?.no_servicio                   ?? '',
    ubicacion:           row?.ubicacion                     ?? '',
    titular:             row?.titular                       ?? '',
    id_centro_costo_fk:  row?.id_centro_costo_fk?.toString() ?? '',
    tipo_servicio:       row?.tipo_servicio                 ?? 'CFE',
    modalidad:           row?.modalidad                     ?? 'Mensual',
    notas:               row?.notas                         ?? '',
  })

  const setF = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.no_servicio.trim()) { setError('El número de servicio es obligatorio'); return }
    setSaving(true); setError('')

    const payload = {
      no_servicio:        form.no_servicio.trim(),
      ubicacion:          form.ubicacion.trim() || null,
      titular:            form.titular.trim() || null,
      id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      tipo_servicio:      form.tipo_servicio,
      modalidad:          form.modalidad,
      notas:              form.notas.trim() || null,
      updated_at:         new Date().toISOString(),
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
      onClose={onClose} maxWidth={560}>

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
          <label className="label" style={{ fontSize: 11 }}>Centro de Costo</label>
          <select className="select" style={{ fontSize: 13 }}
            value={form.id_centro_costo_fk} onChange={setF('id_centro_costo_fk')}>
            <option value="">— Sin asignar —</option>
            {centrosCosto.map((c: any) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
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

        {/* ── Puntos de Conexión ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="label" style={{ fontSize: 11, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Network size={11} style={{ color: 'var(--blue)' }} /> Puntos de Conexión
              {puntos.length > 0 && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: 'var(--blue-pale)', color: 'var(--blue)', fontWeight: 600 }}>
                  {puntos.length}
                </span>
              )}
            </label>
            {row && !newPuntoForm && (
              <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 8px', height: 24 }}
                onClick={() => setNewPuntoForm({ nombre: '', tipo: '', referencia: '', ubicacion: '' })}>
                <Plus size={10} /> Agregar
              </button>
            )}
          </div>

          {!row ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 10px',
              background: '#f8fafc', borderRadius: 6, border: '1px dashed #e2e8f0' }}>
              Guarda el servicio primero para agregar puntos de conexión.
            </div>
          ) : puntosLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8, textAlign: 'center' }}>
              <RefreshCw size={11} className="animate-spin" style={{ display: 'inline', marginRight: 4 }} />
              Cargando…
            </div>
          ) : puntos.length === 0 && !newPuntoForm ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 10px',
              background: '#f8fafc', borderRadius: 6, border: '1px dashed #e2e8f0' }}>
              Sin puntos de conexión. Usa "+ Agregar" para añadir.
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Nombre', 'Tipo', 'Referencia', 'Ubicación'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600,
                        color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase',
                        letterSpacing: '.04em' }}>{h}</th>
                    ))}
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {puntos.map((p: any, idx: number) => editingPuntoId === p.id ? (
                    <tr key={p.id} style={{ background: '#fffbeb', borderTop: idx > 0 ? '1px solid #f1f5f9' : undefined }}>
                      <td style={{ padding: '4px 6px' }}>
                        <input className="input" autoFocus
                          style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={editPuntoForm.nombre}
                          onChange={e => setEditPuntoForm(f => ({ ...f, nombre: e.target.value }))}
                          placeholder="Nombre *" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select className="select" style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={editPuntoForm.tipo}
                          onChange={e => setEditPuntoForm(f => ({ ...f, tipo: e.target.value }))}>
                          <option value="">—</option>
                          {TIPOS_CONEXION.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className="input" style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={editPuntoForm.referencia}
                          onChange={e => setEditPuntoForm(f => ({ ...f, referencia: e.target.value }))}
                          placeholder="ej. 123456" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className="input" style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={editPuntoForm.ubicacion}
                          onChange={e => setEditPuntoForm(f => ({ ...f, ubicacion: e.target.value }))}
                          placeholder="ej. Caseta" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn-primary" style={{ padding: '3px 6px' }}
                            onClick={() => handleEditPunto(p.id)}
                            disabled={savingPunto || !editPuntoForm.nombre.trim()}>
                            {savingPunto ? <Loader size={10} className="animate-spin" /> : <Save size={10} />}
                          </button>
                          <button className="btn-ghost" style={{ padding: '3px 6px' }}
                            onClick={() => setEditingPuntoId(null)}><X size={10} /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} style={{ borderTop: idx > 0 ? '1px solid #f1f5f9' : undefined }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 11 }}>{p.tipo ?? '—'}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {p.referencia ?? '—'}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)',
                        maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.ubicacion ?? '—'}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn-ghost" style={{ padding: '3px 5px' }}
                            onClick={() => {
                              setEditingPuntoId(p.id)
                              setEditPuntoForm({ nombre: p.nombre, tipo: p.tipo ?? '', referencia: p.referencia ?? '', ubicacion: p.ubicacion ?? '' })
                            }}>
                            <Edit2 size={10} />
                          </button>
                          <button className="btn-ghost" style={{ padding: '3px 5px', color: '#dc2626' }}
                            onClick={() => handleDeletePunto(p.id)}>
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Fila para nuevo punto */}
                  {newPuntoForm && (
                    <tr style={{ background: '#f0fdf4', borderTop: puntos.length > 0 ? '1px solid #bbf7d0' : undefined }}>
                      <td style={{ padding: '4px 6px' }}>
                        <input className="input" autoFocus
                          style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={newPuntoForm.nombre}
                          onChange={e => setNewPuntoForm(f => f ? { ...f, nombre: e.target.value } : f)}
                          placeholder="Nombre *" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select className="select" style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={newPuntoForm.tipo}
                          onChange={e => setNewPuntoForm(f => f ? { ...f, tipo: e.target.value } : f)}>
                          <option value="">—</option>
                          {TIPOS_CONEXION.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className="input" style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={newPuntoForm.referencia}
                          onChange={e => setNewPuntoForm(f => f ? { ...f, referencia: e.target.value } : f)}
                          placeholder="ej. 123456" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input className="input" style={{ padding: '3px 6px', fontSize: 11, height: 28 }}
                          value={newPuntoForm.ubicacion}
                          onChange={e => setNewPuntoForm(f => f ? { ...f, ubicacion: e.target.value } : f)}
                          placeholder="ej. Caseta" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn-primary" style={{ padding: '3px 6px' }}
                            onClick={handleAddPunto}
                            disabled={savingPunto || !newPuntoForm.nombre.trim()}>
                            {savingPunto ? <Loader size={10} className="animate-spin" /> : <Save size={10} />}
                          </button>
                          <button className="btn-ghost" style={{ padding: '3px 6px' }}
                            onClick={() => setNewPuntoForm(null)}><X size={10} /></button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
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
