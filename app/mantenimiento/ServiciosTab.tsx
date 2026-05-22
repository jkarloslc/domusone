'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, Filter, X, Save, Loader,
  Zap, Droplets, Edit2, Trash2
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

// ── Constantes ──────────────────────────────────────────────
const TIPOS_SERVICIO = ['CFE', 'Agua'] as const
const MODALIDADES    = ['Mensual', 'Bimestral'] as const
type TipoServicio    = typeof TIPOS_SERVICIO[number]

const TIPO_STYLE: Record<TipoServicio, { color: string; bg: string; border: string; icon: React.FC<any> }> = {
  CFE:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: Zap },
  Agua:  { color: '#0369a1', bg: '#e0f2fe', border: '#bae6fd', icon: Droplets },
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

const ANIOS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i)
const MESES = [
  { v: '',  l: 'Todos' },
  { v: '01', l: 'Enero' }, { v: '02', l: 'Febrero' }, { v: '03', l: 'Marzo' },
  { v: '04', l: 'Abril' }, { v: '05', l: 'Mayo' },    { v: '06', l: 'Junio' },
  { v: '07', l: 'Julio' }, { v: '08', l: 'Agosto' },  { v: '09', l: 'Septiembre' },
  { v: '10', l: 'Octubre'},{ v: '11', l: 'Noviembre'},{ v: '12', l: 'Diciembre' },
]

// ════════════════════════════════════════════════════════════
export default function ServiciosTab() {
  const { canWrite, canDelete } = useAuth()
  const [rows,        setRows]        = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filterTipo,  setFilterTipo]  = useState('')
  const [filterUbic,  setFilterUbic]  = useState('')
  const [filterAnio,  setFilterAnio]  = useState(String(new Date().getFullYear()))
  const [filterMes,   setFilterMes]   = useState('')
  const [modal,       setModal]       = useState(false)
  const [editing,     setEditing]     = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('servicios_suministros').select('*').eq('activo', true)
    if (filterTipo) q = q.eq('tipo_servicio', filterTipo)
    if (filterAnio) {
      const y = filterAnio
      if (filterMes) {
        q = q.gte('fecha_periodo', `${y}-${filterMes}-01`)
             .lte('fecha_periodo', `${y}-${filterMes}-28`)
      } else {
        q = q.gte('fecha_periodo', `${y}-01-01`).lte('fecha_periodo', `${y}-12-31`)
      }
    }
    q = q.order('fecha_periodo', { ascending: false }).order('tipo_servicio')
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [filterTipo, filterAnio, filterMes])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredRows = filterUbic
    ? rows.filter(r => r.ubicacion?.toLowerCase().includes(filterUbic.toLowerCase()))
    : rows

  const totalMonto = filteredRows.reduce((a, r) => a + (r.monto_periodo ?? 0), 0)
  const totalCFE   = filteredRows.filter(r => r.tipo_servicio === 'CFE').reduce((a, r) => a + (r.monto_periodo ?? 0), 0)
  const totalAgua  = filteredRows.filter(r => r.tipo_servicio === 'Agua').reduce((a, r) => a + (r.monto_periodo ?? 0), 0)
  const cntCFE     = filteredRows.filter(r => r.tipo_servicio === 'CFE').length
  const cntAgua    = filteredRows.filter(r => r.tipo_servicio === 'Agua').length

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    await dbCtrl.from('servicios_suministros').update({ activo: false }).eq('id', id)
    fetchData()
  }

  const openNew = () => { setEditing(null); setModal(true) }
  const openEdit = (r: any) => { setEditing(r); setModal(true) }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Total Periodo</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalMonto)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{filteredRows.length} registros</div>
        </div>
        <div className="card" style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <Zap size={11} style={{ color: '#d97706' }} />
            <span style={{ fontSize: 11, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CFE</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCFE)}</div>
          <div style={{ fontSize: 10, color: '#92400e' }}>{cntCFE} servicios</div>
        </div>
        <div className="card" style={{ padding: '10px 14px', background: '#e0f2fe', border: '1px solid #bae6fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <Droplets size={11} style={{ color: '#0369a1' }} />
            <span style={{ fontSize: 11, color: '#075985', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agua</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0369a1', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAgua)}</div>
          <div style={{ fontSize: 10, color: '#075985' }}>{cntAgua} servicios</div>
        </div>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Año</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{filterAnio || '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{filterMes ? MESES.find(m => m.v === filterMes)?.l : 'Todos los meses'}</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
        padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          <Filter size={11} /> Filtros
        </span>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

        <select className="select" style={{ width: 72, fontSize: 12, padding: '3px 6px', height: 28 }}
          value={filterAnio} onChange={e => setFilterAnio(e.target.value)}>
          {ANIOS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select className="select" style={{ width: 120, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterMes} onChange={e => setFilterMes(e.target.value)}>
          {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>

        <select className="select" style={{ width: 110, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Tipo servicio</option>
          {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
        </select>

        <input className="input" style={{ flex: '1 1 130px', maxWidth: 200, fontSize: 12,
          padding: '3px 8px', height: 28 }}
          placeholder="Buscar ubicación…"
          value={filterUbic} onChange={e => setFilterUbic(e.target.value)} />

        {(filterTipo || filterUbic || filterMes) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28,
            color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setFilterTipo(''); setFilterUbic(''); setFilterMes('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }}
          onClick={fetchData}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px', height: 28 }}
            onClick={openNew}>
            <Plus size={11} /> Nuevo
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : filteredRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
          Sin registros para los filtros seleccionados
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>No. Servicio</th>
                <th>Ubicación</th>
                <th>Tipo</th>
                <th>Modalidad</th>
                <th>Periodo</th>
                <th style={{ textAlign: 'right' }}>Consumo</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ width: 72 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(r => {
                const ts = TIPO_STYLE[r.tipo_servicio as TipoServicio]
                const Icon = ts?.icon
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                      color: 'var(--blue)' }}>{r.no_servicio}</td>
                    <td style={{ fontSize: 13 }}>{r.ubicacion ?? '—'}</td>
                    <td>
                      {ts && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                          color: ts.color, background: ts.bg, border: `1px solid ${ts.border}` }}>
                          <Icon size={10} /> {r.tipo_servicio}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.modalidad}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {fmtPeriodo(r.fecha_periodo)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text-secondary)' }}>
                      {fmtConsumo(r.consumo_periodo, r.tipo_servicio)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums', color: 'var(--blue)' }}>
                      {fmt(r.monto_periodo)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                        {canWrite('mantenimiento') && (
                          <button className="btn-ghost" style={{ padding: '3px 6px', fontSize: 11 }}
                            onClick={() => openEdit(r)} title="Editar">
                            <Edit2 size={12} />
                          </button>
                        )}
                        {canDelete() && (
                          <button className="btn-ghost" style={{ padding: '3px 6px', fontSize: 11,
                            color: '#dc2626' }} onClick={() => handleDelete(r.id)} title="Eliminar">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={6} style={{ color: 'var(--blue)', fontSize: 12 }}>TOTAL</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  fontSize: 15, color: 'var(--blue)' }}>{fmt(totalMonto)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ServicioModal
          row={editing}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchData() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal Nuevo / Editar
// ════════════════════════════════════════════════════════════
function ServicioModal({ row, onClose, onSaved }: {
  row: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const today = new Date()
  const defaultPeriodo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  const [form, setForm] = useState({
    no_servicio:     row?.no_servicio     ?? '',
    ubicacion:       row?.ubicacion       ?? '',
    tipo_servicio:   row?.tipo_servicio   ?? 'CFE',
    modalidad:       row?.modalidad       ?? 'Mensual',
    consumo_periodo: row?.consumo_periodo?.toString() ?? '',
    monto_periodo:   row?.monto_periodo?.toString()   ?? '',
    fecha_periodo:   row?.fecha_periodo   ?? defaultPeriodo,
    notas:           row?.notas           ?? '',
  })

  const setF = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.no_servicio.trim()) { setError('El número de servicio es obligatorio'); return }
    if (!form.monto_periodo || Number(form.monto_periodo) < 0) { setError('El monto es obligatorio'); return }
    if (!form.fecha_periodo) { setError('La fecha del periodo es obligatoria'); return }
    setSaving(true); setError('')

    const payload = {
      no_servicio:     form.no_servicio.trim(),
      ubicacion:       form.ubicacion.trim() || null,
      tipo_servicio:   form.tipo_servicio,
      modalidad:       form.modalidad,
      consumo_periodo: form.consumo_periodo ? Number(form.consumo_periodo) : null,
      monto_periodo:   Number(form.monto_periodo),
      fecha_periodo:   form.fecha_periodo,
      notas:           form.notas.trim() || null,
      updated_at:      new Date().toISOString(),
    }

    if (row) {
      const { error: err } = await dbCtrl.from('servicios_suministros').update(payload).eq('id', row.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await dbCtrl.from('servicios_suministros')
        .insert({ ...payload, created_by: authUser?.nombre ?? null })
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento"
      titulo={row ? 'Editar Servicio' : 'Nuevo Registro de Servicio'}
      onClose={onClose} maxWidth={480}>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
        overflowY: 'auto', maxHeight: 'calc(90vh - 110px)' }}>

        {error && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>
        )}

        {/* Tipo + Modalidad */}
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

        {/* No. Servicio */}
        <div>
          <label className="label" style={{ fontSize: 11 }}>No. de Servicio *</label>
          <input className="input" style={{ fontSize: 13, fontFamily: 'monospace' }}
            value={form.no_servicio} onChange={setF('no_servicio')}
            placeholder="ej. 123456789012" />
        </div>

        {/* Ubicación */}
        <div>
          <label className="label" style={{ fontSize: 11 }}>Ubicación</label>
          <input className="input" style={{ fontSize: 13 }}
            value={form.ubicacion} onChange={setF('ubicacion')}
            placeholder="ej. Caseta principal, Parque Sur…" />
        </div>

        {/* Periodo + Consumo + Monto */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Fecha de Periodo *</label>
            <input className="input" type="date" style={{ fontSize: 12 }}
              value={form.fecha_periodo} onChange={setF('fecha_periodo')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>
              Consumo {form.tipo_servicio === 'CFE' ? '(kWh)' : '(m³)'}
            </label>
            <input className="input" type="number" step="0.01" style={{ fontSize: 13 }}
              value={form.consumo_periodo} onChange={setF('consumo_periodo')}
              placeholder="0" />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Monto del Periodo *</label>
            <input className="input" type="number" step="0.01" style={{ fontSize: 13, textAlign: 'right' }}
              value={form.monto_periodo} onChange={setF('monto_periodo')}
              placeholder="0.00" />
          </div>
        </div>

        {/* Notas */}
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
          {row ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </ModalShell>
  )
}
