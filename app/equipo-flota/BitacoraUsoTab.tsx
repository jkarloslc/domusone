'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg, dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, X, Save, Loader, RefreshCw, Edit2, Trash2,
  Filter, Gauge, Activity,
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

const TIPOS_COMBUSTIBLE = ['Magna', 'Premium', 'Diesel', 'Gas LP', 'Eléctrico']

// Mapeo hacia el Kardex de Combustible (comp.combustible_movimientos), que solo
// controla los 3 combustibles de tanque. Gas LP / Eléctrico no generan salida ahí.
const KARDEX_TIPO_MAP: Record<string, 'magna' | 'premium' | 'diesel' | undefined> = {
  'Magna': 'magna', 'Premium': 'premium', 'Diesel': 'diesel',
}

const fmt$ = (n: number | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'

const fmtN = (n: number | null | undefined, dec = 1) =>
  n != null
    ? Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : '—'

const fmtF = (d: string | null) =>
  d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—'

// ──────────────────────────────────────────────────────────────
export default function BitacoraUsoTab({
  equipos,
  equipoMap,
}: {
  equipos: any[]
  equipoMap: Record<number, any>
}) {
  const { canWrite, canDelete } = useAuth()
  const [registros,   setRegistros]   = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filterEq,    setFilterEq]    = useState('')
  const [filterDesde, setFilterDesde] = useState('')
  const [filterHasta, setFilterHasta] = useState('')
  const [modal,       setModal]       = useState<{ open: boolean; reg?: any }>({ open: false })

  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl
      .from('bitacora_uso_equipos')
      .select('*')
      .eq('activo', true)
      .order('fecha', { ascending: false })
    if (filterEq)    q = q.eq('id_equipo_fk', Number(filterEq))
    if (filterDesde) q = q.gte('fecha', filterDesde)
    if (filterHasta) q = q.lte('fecha', filterHasta)
    const { data } = await q
    setRegistros(data ?? [])
    setLoading(false)
  }, [filterEq, filterDesde, filterHasta])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    const reg = registros.find(r => r.id === id)
    await dbCtrl.from('bitacora_uso_equipos').update({ activo: false }).eq('id', id)
    if (reg?.id_combustible_mov_fk) {
      await dbComp.from('combustible_movimientos').delete().eq('id', reg.id_combustible_mov_fk)
    }
    fetchRegistros()
  }

  // ── KPIs globales ────────────────────────────────────────────
  const totalLitros    = registros.reduce((a, r) => a + (r.litros ?? 0), 0)
  const totalRecorrido = registros.reduce((a, r) => {
    const rec =
      r.odometro_inicio != null && r.odometro_fin != null
        ? Math.max(0, r.odometro_fin - r.odometro_inicio)
        : 0
    return a + rec
  }, 0)
  const totalHoras = registros.reduce((a, r) => a + (r.horas_uso ?? 0), 0)
  const totalCosto = registros.reduce((a, r) => a + (r.costo_combustible ?? 0), 0)

  const regsConRend = registros.filter(
    r =>
      (r.litros ?? 0) > 0 &&
      r.odometro_inicio != null &&
      r.odometro_fin != null &&
      r.odometro_fin > r.odometro_inicio,
  )
  const rendGlobal =
    regsConRend.length > 0
      ? regsConRend.reduce((a, r) => a + (r.odometro_fin - r.odometro_inicio), 0) /
        regsConRend.reduce((a, r) => a + (r.litros ?? 0), 0)
      : null

  // ── Resumen por equipo ───────────────────────────────────────
  const resumenPorEquipo = Object.values(
    registros.reduce((acc: Record<number, any>, r) => {
      const id = r.id_equipo_fk
      if (!acc[id])
        acc[id] = { id, count: 0, recorrido: 0, horas: 0, litros: 0, costo: 0, recConLitros: 0, litConRec: 0 }
      const rec =
        r.odometro_inicio != null && r.odometro_fin != null
          ? Math.max(0, r.odometro_fin - r.odometro_inicio)
          : 0
      acc[id].count++
      acc[id].recorrido += rec
      acc[id].horas     += r.horas_uso ?? 0
      acc[id].litros    += r.litros    ?? 0
      acc[id].costo     += r.costo_combustible ?? 0
      if ((r.litros ?? 0) > 0 && rec > 0) {
        acc[id].recConLitros += rec
        acc[id].litConRec    += r.litros
      }
      return acc
    }, {}),
  ).sort((a: any, b: any) => b.litros - a.litros)

  return (
    <div>
      {/* ── KPIs ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Registros',     value: registros.length,                                          color: '#2563eb', bg: '#eff6ff' },
          { label: 'Litros totales',value: totalLitros    > 0 ? `${fmtN(totalLitros)} L`  : '—',     color: '#d97706', bg: '#fffbeb' },
          { label: 'Recorrido',     value: totalRecorrido > 0 ? fmtN(totalRecorrido)        : '—',    color: '#0891b2', bg: '#ecfeff' },
          { label: 'Horas uso',     value: totalHoras     > 0 ? `${fmtN(totalHoras, 2)} h` : '—',    color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Rendim. prom.', value: rendGlobal != null ? `${fmtN(rendGlobal, 2)} km/L` : '—', color: '#059669', bg: '#f0fdf4' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 12px', background: k.bg }}>
            <div style={{ fontSize: typeof k.value === 'number' ? 22 : 15, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
        padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          <Filter size={11} /> Filtros
        </span>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        <select className="select"
          style={{ flex: '1 1 150px', maxWidth: 220, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterEq} onChange={e => setFilterEq(e.target.value)}>
          <option value="">Todos los equipos</option>
          {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <input className="input" type="date" title="Desde"
          style={{ flex: '1 1 120px', maxWidth: 160, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterDesde} onChange={e => setFilterDesde(e.target.value)} />
        <input className="input" type="date" title="Hasta"
          style={{ flex: '1 1 120px', maxWidth: 160, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterHasta} onChange={e => setFilterHasta(e.target.value)} />
        {(filterEq || filterDesde || filterHasta) && (
          <button className="btn-ghost"
            style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setFilterEq(''); setFilterDesde(''); setFilterHasta('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }} onClick={fetchRegistros}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }}
            onClick={() => setModal({ open: true })}>
            <Plus size={12} /> Nuevo Registro
          </button>
        )}
      </div>

      {/* ── Tabla de registros ────────────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              {['Fecha', 'Equipo', 'Operador', 'Actividad', 'Odóm. inicio', 'Odóm. fin', 'Recorrido', 'Hrs uso', 'Litros', 'Rendim.', 'Costo', ''].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: 'var(--text-muted)', padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                Sin registros de uso. Usa <strong>Nuevo Registro</strong> para comenzar.
              </td></tr>
            ) : registros.map(r => {
              const eq      = equipoMap[r.id_equipo_fk]
              const unidad  = eq?.unidad_odometro ?? 'km'
              const recorrido =
                r.odometro_inicio != null && r.odometro_fin != null
                  ? Math.max(0, r.odometro_fin - r.odometro_inicio)
                  : null
              const rendimiento =
                recorrido != null && (r.litros ?? 0) > 0 ? recorrido / r.litros : null
              return (
                <tr key={r.id}>
                  <td style={{ fontSize: 11, padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtF(r.fecha)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{eq?.nombre ?? `#${r.id_equipo_fk}`}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{eq?.placa ?? ''}</div>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{r.operador ?? '—'}</td>
                  <td style={{ fontSize: 11, padding: '8px 10px', maxWidth: 160 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.actividad ?? '—'}</div>
                  </td>
                  <td style={{ fontSize: 11, padding: '8px 10px', textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                    {r.odometro_inicio != null ? `${fmtN(r.odometro_inicio)} ${unidad}` : '—'}
                  </td>
                  <td style={{ fontSize: 11, padding: '8px 10px', textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                    {r.odometro_fin != null ? `${fmtN(r.odometro_fin)} ${unidad}` : '—'}
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 600, padding: '8px 10px', textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: recorrido != null && recorrido > 0 ? '#2563eb' : 'var(--text-muted)' }}>
                    {recorrido != null ? `${fmtN(recorrido)} ${unidad}` : '—'}
                  </td>
                  <td style={{ fontSize: 11, padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.horas_uso != null ? `${fmtN(r.horas_uso, 2)} h` : '—'}
                  </td>
                  <td style={{ fontSize: 11, fontWeight: 600, padding: '8px 10px', textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums', color: '#d97706' }}>
                    {r.litros != null ? `${fmtN(r.litros)} L` : '—'}
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 700, padding: '8px 10px', textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: rendimiento != null ? '#059669' : 'var(--text-muted)' }}>
                    {rendimiento != null ? `${fmtN(rendimiento, 2)} km/L` : '—'}
                  </td>
                  <td style={{ fontSize: 11, padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.costo_combustible != null ? fmt$(r.costo_combustible) : '—'}
                  </td>
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                    {canWrite('mantenimiento') && (
                      <button className="btn-ghost" style={{ padding: '3px 5px' }}
                        onClick={() => setModal({ open: true, reg: r })}>
                        <Edit2 size={12} />
                      </button>
                    )}
                    {canDelete() && (
                      <button className="btn-ghost" style={{ padding: '3px 5px', color: '#dc2626' }}
                        onClick={() => handleDelete(r.id)}>
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

      {/* ── Rendimiento por equipo ────────────────────────────── */}
      {resumenPorEquipo.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', gap: 6 }}>
            <Gauge size={13} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)',
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Rendimiento por Equipo
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
              {filterDesde || filterHasta ? '— período filtrado' : '— acumulado'}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                {['Equipo', 'Registros', 'Recorrido total', 'Horas uso', 'Litros', 'Rendim. (km/L)', 'Costo comb.'].map(h => (
                  <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: 'var(--text-muted)', padding: '8px 10px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumenPorEquipo.map((row: any) => {
                const equipo = equipoMap[row.id]
                const unidad = equipo?.unidad_odometro ?? 'km'
                const rend   = row.litConRec > 0 ? row.recConLitros / row.litConRec : null
                return (
                  <tr key={row.id}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{equipo?.nombre ?? `#${row.id}`}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{equipo?.tipo ?? ''}</div>
                    </td>
                    <td style={{ fontSize: 12, padding: '8px 10px', textAlign: 'center' }}>{row.count}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, padding: '8px 10px', textAlign: 'right',
                      color: '#2563eb', fontVariantNumeric: 'tabular-nums' }}>
                      {row.recorrido > 0 ? `${fmtN(row.recorrido)} ${unidad}` : '—'}
                    </td>
                    <td style={{ fontSize: 12, padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.horas > 0 ? `${fmtN(row.horas, 2)} hrs` : '—'}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600, padding: '8px 10px', textAlign: 'right',
                      color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>
                      {row.litros > 0 ? `${fmtN(row.litros)} L` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {rend != null
                        ? <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{fmtN(rend, 2)} km/L</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.costo > 0 ? fmt$(row.costo) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <UsoModal
          reg={modal.reg}
          equipos={equipos}
          equipoMap={equipoMap}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); fetchRegistros() }}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Modal: Crear / Editar Registro de Uso
// ──────────────────────────────────────────────────────────────
function UsoModal({ reg, equipos, equipoMap, onClose, onSaved }: {
  reg?: any
  equipos: any[]
  equipoMap: Record<number, any>
  onClose: () => void
  onSaved: () => void
}) {
  const { authUser } = useAuth()
  const isNew = !reg?.id
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [form, setForm] = useState({
    id_equipo_fk:     (reg?.id_equipo_fk ?? '').toString(),
    fecha:            reg?.fecha              ?? new Date().toISOString().slice(0, 10),
    operador:         reg?.operador           ?? '',
    actividad:        reg?.actividad          ?? '',
    odometro_inicio:  reg?.odometro_inicio?.toString() ?? '',
    odometro_fin:     reg?.odometro_fin?.toString()    ?? '',
    horas_uso:        reg?.horas_uso?.toString()       ?? '',
    litros:           reg?.litros?.toString()          ?? '',
    tipo_combustible: reg?.tipo_combustible            ?? 'Magna',
    costo_combustible:reg?.costo_combustible?.toString() ?? '',
    notas:            reg?.notas ?? '',
  })

  const setF = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const equipo  = equipos.find(e => e.id === Number(form.id_equipo_fk))
  const unidad  = equipo?.unidad_odometro ?? 'km'
  const recorrido =
    form.odometro_inicio && form.odometro_fin
      ? Math.max(0, Number(form.odometro_fin) - Number(form.odometro_inicio))
      : null
  const rendimiento =
    recorrido != null && Number(form.litros) > 0 ? recorrido / Number(form.litros) : null

  const handleSave = async () => {
    if (!form.id_equipo_fk) { setError('Selecciona un equipo'); return }
    if (!form.fecha)         { setError('La fecha es obligatoria'); return }
    setSaving(true); setError('')

    const payload = {
      id_equipo_fk:      Number(form.id_equipo_fk),
      fecha:             form.fecha,
      operador:          form.operador.trim()  || null,
      actividad:         form.actividad.trim() || null,
      odometro_inicio:   form.odometro_inicio  ? Number(form.odometro_inicio)   : null,
      odometro_fin:      form.odometro_fin     ? Number(form.odometro_fin)      : null,
      horas_uso:         form.horas_uso        ? Number(form.horas_uso)         : null,
      litros:            form.litros           ? Number(form.litros)            : null,
      tipo_combustible:  form.litros           ? form.tipo_combustible          : null,
      costo_combustible: form.costo_combustible ? Number(form.costo_combustible) : null,
      notas:             form.notas.trim() || null,
      created_by:        authUser?.nombre ?? null,
    }

    let regId = reg?.id
    if (isNew) {
      const { data, error: err } = await dbCtrl.from('bitacora_uso_equipos').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      regId = data.id
    } else {
      const { error: err } = await dbCtrl.from('bitacora_uso_equipos').update(payload).eq('id', reg.id)
      if (err) { setError(err.message); setSaving(false); return }
    }

    // Actualizar odómetro del equipo si la lectura fin es mayor a la actual
    if (form.odometro_fin && equipo) {
      const newOdo = Number(form.odometro_fin)
      if (newOdo > (equipo.odometro_actual ?? 0)) {
        await dbCfg.from('equipos').update({ odometro_actual: newOdo }).eq('id', equipo.id)
      }
    }

    // Sincroniza la salida en el Kardex de Combustible (comp.combustible_movimientos):
    // si ya había una ligada a este registro, se reemplaza para reflejar el cambio.
    if (reg?.id_combustible_mov_fk) {
      await dbComp.from('combustible_movimientos').delete().eq('id', reg.id_combustible_mov_fk)
    }
    const tipoKardex = payload.litros ? KARDEX_TIPO_MAP[payload.tipo_combustible ?? ''] : undefined
    if (tipoKardex && payload.litros) {
      const { data: mov } = await dbComp.from('combustible_movimientos').insert({
        tipo_combustible: tipoKardex,
        tipo_mov:         'SALIDA',
        fecha:            payload.fecha,
        litros:           payload.litros,
        monto_total:      payload.costo_combustible,
        referencia:       `Bitácora de uso · ${equipo?.nombre ?? `Equipo #${payload.id_equipo_fk}`}`,
        observaciones:    payload.actividad,
        created_by:       authUser?.nombre ?? null,
      }).select('id').single()
      if (mov) {
        await dbCtrl.from('bitacora_uso_equipos').update({ id_combustible_mov_fk: mov.id }).eq('id', regId)
      }
    } else if (reg?.id_combustible_mov_fk) {
      await dbCtrl.from('bitacora_uso_equipos').update({ id_combustible_mov_fk: null }).eq('id', regId)
    }

    onSaved()
  }

  return (
    <ModalShell
      modulo="mantenimiento"
      titulo={isNew ? 'Nuevo Registro de Uso' : 'Editar Registro de Uso'}
      onClose={onClose}
      maxWidth={540}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)',
        display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>
        )}

        {/* Equipo, fecha, operador, actividad */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="label" style={{ fontSize: 11 }}>Equipo *</label>
            <select className="select" style={{ fontSize: 12 }} value={form.id_equipo_fk} onChange={setF('id_equipo_fk')}>
              <option value="">— Seleccionar —</option>
              {equipos
                .filter(e => e.status !== 'Baja')
                .map(e => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}{e.placa ? ` (${e.placa})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Fecha *</label>
            <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha} onChange={setF('fecha')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Operador / Conductor</label>
            <input className="input" style={{ fontSize: 13 }} value={form.operador} onChange={setF('operador')} placeholder="Nombre del operador" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="label" style={{ fontSize: 11 }}>Actividad / Propósito</label>
            <input className="input" style={{ fontSize: 13 }} value={form.actividad} onChange={setF('actividad')}
              placeholder="Ej. Traslado de materiales, Excavación sector 3, Corte de césped…" />
          </div>
        </div>

        {/* Odómetro */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Odómetro ({unidad})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Inicio</label>
              <input className="input" type="number" step="0.1" style={{ fontSize: 13 }}
                value={form.odometro_inicio} onChange={setF('odometro_inicio')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Fin</label>
              <input className="input" type="number" step="0.1" style={{ fontSize: 13 }}
                value={form.odometro_fin} onChange={setF('odometro_fin')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Recorrido</label>
              <div className="input" style={{
                fontSize: 13, background: '#f8fafc', display: 'flex', alignItems: 'center',
                color: recorrido != null && recorrido > 0 ? '#2563eb' : 'var(--text-muted)',
                fontWeight: recorrido != null && recorrido > 0 ? 700 : 400,
              }}>
                {recorrido != null
                  ? `${recorrido.toLocaleString('es-MX', { minimumFractionDigits: 1 })} ${unidad}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Horas de uso */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Horas de Uso
          </div>
          <div style={{ maxWidth: 160 }}>
            <label className="label" style={{ fontSize: 11 }}>Horas trabajadas</label>
            <input className="input" type="number" step="0.25" style={{ fontSize: 13 }}
              value={form.horas_uso} onChange={setF('horas_uso')} placeholder="0.00" />
          </div>
        </div>

        {/* Combustible */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Combustible
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Litros</label>
              <input className="input" type="number" step="0.1" style={{ fontSize: 13 }}
                value={form.litros} onChange={setF('litros')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Tipo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo_combustible} onChange={setF('tipo_combustible')}>
                {TIPOS_COMBUSTIBLE.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Costo ($)</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 13 }}
                value={form.costo_combustible} onChange={setF('costo_combustible')} />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Rendimiento</label>
              <div className="input" style={{
                fontSize: 13, background: '#f8fafc', display: 'flex', alignItems: 'center',
                color: rendimiento != null ? '#059669' : 'var(--text-muted)',
                fontWeight: rendimiento != null ? 700 : 400,
              }}>
                {rendimiento != null ? `${rendimiento.toFixed(2)} km/L` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Notas */}
        <div>
          <label className="label" style={{ fontSize: 11 }}>Notas</label>
          <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }}
            value={form.notas} onChange={setF('notas')} />
        </div>
      </div>
    </ModalShell>
  )
}
