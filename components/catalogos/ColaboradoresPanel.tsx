'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit2, Save, Loader, RefreshCw, ToggleLeft, ToggleRight,
  CheckCircle, Search, Users, ArrowLeft, Eye,
} from 'lucide-react'
import { dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { antiguedad } from '@/lib/dateUtils'
import { Colaborador, TipoColaborador, nombreCompletoColaborador } from '@/lib/colaboradores'
import ModalShell from '@/components/ui/ModalShell'

const TIPOS_COLABORADOR: TipoColaborador[] = ['Interno', 'Externo']

// ══════════════════════════════════════════════════════════════
// Colaboradores — personal operativo (Asignado a / Supervisor de OT)
// Compartido entre /catalogos y /hr/colaboradores
// ══════════════════════════════════════════════════════════════
const PUESTOS_COLABORADOR = [
  'Administrador de Fraccionamiento', 'Auxiliar de Motor Lobby', 'Auxiliar de Operaciones', 'Ayudante General',
  'Caja de Mantto Residencial', 'Cajera Recepcionista', 'Coordinador de Servicios Generales',
  'Electricista', 'Encargado', 'Encargado de Taller', 'Mantenimiento Tee De Practica',
  'Operador', 'Operador Especializado', 'Profesional de Golf', 'Servicios Generales',
  'Starter', 'Superintendente', 'Supervisor', 'Vigilancia',
]
const CC_MANTENIMIENTO_RESIDENCIAL = 'Mantenimiento Residencial'

const emptyColabForm = () => ({
  nombre: '', apellido_paterno: '', apellido_materno: '', tipo: 'Interno' as TipoColaborador, fecha_ingreso: '', puesto: '',
  sueldo_bruto_mensual: '', sueldo_neto_mensual: '', sueldo_diario: '',
  id_centro_costo_fk: '', id_cuadrante_fk: '', id_area_fk: '',
  es_asignado: false, es_supervisor: false,
})

export default function ColaboradoresPanel({ onBack }: { onBack?: () => void }) {
  const { authUser } = useAuth()
  const puedeEscribir = authUser?.rol === 'superadmin' || authUser?.rol === 'admin' || authUser?.rol === 'admin_organismo'
  const [items, setItems]       = useState<Colaborador[]>([])
  const [centrosCosto, setCentrosCosto] = useState<{ id: number; nombre: string }[]>([])
  const [areas, setAreas] = useState<{ id: number; nombre: string; id_centro_costo_fk: number | null; id_cuadrante_fk: number | null }[]>([])
  const [cuadrantes, setCuadrantes] = useState<{ id: number; nombre: string }[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing]   = useState<Colaborador | null>(null)
  const [editing, setEditing]   = useState<Colaborador | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState(emptyColabForm())

  const [busqueda, setBusqueda]     = useState('')
  const [filtroTipo, setFTipo]      = useState('all')
  const [filtroAsignado, setFA]     = useState('all')
  const [filtroSupervisor, setFS]   = useState('all')
  const [filtroCC, setFCC]          = useState('all')
  const [filtroStatus, setFStatus]  = useState('activos')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: colabs }, { data: ccs }, { data: areasData }, { data: cuadrantesData }] = await Promise.all([
      dbCfg.from('colaboradores').select('*').order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk, id_cuadrante_fk').eq('activo', true).order('nombre'),
      dbCfg.from('cuadrantes').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setItems((colabs as Colaborador[]) ?? [])
    setCentrosCosto(ccs ?? [])
    setAreas(areasData ?? [])
    setCuadrantes(cuadrantesData ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  const openNew = () => { setEditing(null); setForm(emptyColabForm()); setError(''); setShowForm(true) }
  const openEdit = (c: Colaborador) => {
    setEditing(c)
    setForm({
      nombre: c.nombre, apellido_paterno: c.apellido_paterno ?? '', apellido_materno: c.apellido_materno ?? '',
      tipo: c.tipo ?? 'Interno',
      fecha_ingreso: c.fecha_ingreso ?? '', puesto: c.puesto ?? '',
      sueldo_bruto_mensual: c.sueldo_bruto_mensual?.toString() ?? '', sueldo_neto_mensual: c.sueldo_neto_mensual?.toString() ?? '',
      sueldo_diario: c.sueldo_diario?.toString() ?? '',
      id_centro_costo_fk: c.id_centro_costo_fk?.toString() ?? '',
      id_cuadrante_fk: c.id_cuadrante_fk?.toString() ?? '',
      id_area_fk: c.id_area_fk?.toString() ?? '',
      es_asignado: c.es_asignado, es_supervisor: c.es_supervisor,
    })
    setError(''); setViewing(null); setShowForm(true)
  }

  const ccSeleccionado = centrosCosto.find(c => c.id === Number(form.id_centro_costo_fk))
  const esManttoResidencial = ccSeleccionado?.nombre === CC_MANTENIMIENTO_RESIDENCIAL
  const areasDelCuadrante = areas.filter(a => a.id_cuadrante_fk === Number(form.id_cuadrante_fk))

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload: any = {
      nombre: form.nombre.trim(),
      apellido_paterno: form.apellido_paterno.trim() || null,
      apellido_materno: form.apellido_materno.trim() || null,
      tipo: form.tipo,
      fecha_ingreso: form.fecha_ingreso || null,
      puesto: form.puesto.trim() || null,
      sueldo_bruto_mensual: form.sueldo_bruto_mensual ? Number(form.sueldo_bruto_mensual) : null,
      sueldo_neto_mensual: form.sueldo_neto_mensual ? Number(form.sueldo_neto_mensual) : null,
      sueldo_diario: form.sueldo_diario ? Number(form.sueldo_diario) : null,
      id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      id_cuadrante_fk: esManttoResidencial && form.id_cuadrante_fk ? Number(form.id_cuadrante_fk) : null,
      id_area_fk: esManttoResidencial && form.id_area_fk ? Number(form.id_area_fk) : null,
      es_asignado: form.es_asignado,
      es_supervisor: form.es_supervisor,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { error: err } = await dbCfg.from('colaboradores').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      payload.activo = true
      const { error: err } = await dbCfg.from('colaboradores').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); fetchAll()
  }

  const toggleActivo = async (c: Colaborador) => {
    await dbCfg.from('colaboradores').update({ activo: !c.activo, updated_at: new Date().toISOString() }).eq('id', c.id)
    setViewing(null)
    fetchAll()
  }

  const filtered = items.filter(c => {
    if (busqueda.trim() && !nombreCompletoColaborador(c).toLowerCase().includes(busqueda.trim().toLowerCase())) return false
    if (filtroTipo !== 'all' && c.tipo !== filtroTipo) return false
    if (filtroAsignado   !== 'all' && c.es_asignado   !== (filtroAsignado === 'true'))   return false
    if (filtroSupervisor !== 'all' && c.es_supervisor !== (filtroSupervisor === 'true')) return false
    if (filtroCC !== 'all' && (c.id_centro_costo_fk?.toString() ?? '') !== filtroCC) return false
    if (filtroStatus === 'activos'   && !c.activo) return false
    if (filtroStatus === 'inactivos' && c.activo)  return false
    return true
  })

  const fmt$ = (v: number | null) => v == null ? '—' : '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const activos      = items.filter(i => i.activo).length
  const asignados    = items.filter(i => i.activo && i.es_asignado).length
  const supervisores = items.filter(i => i.activo && i.es_supervisor).length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {onBack && (
            <button className="btn-back" onClick={onBack} title="Regresar" style={{ marginTop: 1 }}><ArrowLeft size={15} /></button>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#b4530918', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={15} style={{ color: '#b45309' }} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Colaboradores</h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>
              Personal operativo — usado para asignar OT (Asignado a / Supervisor) y Rol de Pagos
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAll} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nuevo colaborador
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12 }}><strong style={{ color: '#15803d' }}>{activos}</strong> activos</span>
        </div>
        <div className="card" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 12 }}><strong style={{ color: '#0369a1' }}>{asignados}</strong> asignables</span>
        </div>
        <div className="card" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 12 }}><strong style={{ color: '#7c3aed' }}>{supervisores}</strong> supervisores</span>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 28 }} placeholder="Buscar nombre…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <select className="select" style={{ flex: '1 1 110px', maxWidth: 150 }} value={filtroTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="all">Tipo: todos</option>
          <option value="Interno">Interno</option>
          <option value="Externo">Externo</option>
        </select>
        <select className="select" style={{ flex: '1 1 130px', maxWidth: 170 }} value={filtroAsignado} onChange={e => setFA(e.target.value)}>
          <option value="all">Asignado: todos</option>
          <option value="true">Solo asignables</option>
          <option value="false">No asignables</option>
        </select>
        <select className="select" style={{ flex: '1 1 130px', maxWidth: 170 }} value={filtroSupervisor} onChange={e => setFS(e.target.value)}>
          <option value="all">Supervisor: todos</option>
          <option value="true">Solo supervisores</option>
          <option value="false">No supervisores</option>
        </select>
        <select className="select" style={{ flex: '1 1 150px', maxWidth: 200 }} value={filtroCC} onChange={e => setFCC(e.target.value)}>
          <option value="all">Centro de Costo: todos</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 110px', maxWidth: 150 }} value={filtroStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
          <option value="all">Todos</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} registros</span>
      </div>

      {/* Modal de captura / edición */}
      {showForm && (
        <ModalShell
          modulo="hr"
          titulo={editing ? 'Editar colaborador' : 'Nuevo colaborador'}
          subtitulo="HR · Colaboradores"
          icono={Users}
          maxWidth={640}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                {editing ? 'Guardar cambios' : 'Crear colaborador'}
              </button>
            </>
          }
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Nombre(s) *</label>
                <input className="input" value={form.nombre} autoFocus onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre(s)" />
              </div>
              <div>
                <label className="label">Apellido Paterno</label>
                <input className="input" value={form.apellido_paterno} onChange={e => setForm(f => ({ ...f, apellido_paterno: e.target.value }))} />
              </div>
              <div>
                <label className="label">Apellido Materno</label>
                <input className="input" value={form.apellido_materno} onChange={e => setForm(f => ({ ...f, apellido_materno: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Tipo *</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {TIPOS_COLABORADOR.map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: form.tipo === t ? 600 : 400 }}>
                      <input type="radio" name="tipo-colaborador" checked={form.tipo === t} onChange={() => setForm(f => ({ ...f, tipo: t }))} style={{ width: 15, height: 15 }} />
                      {t}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>
                  {form.tipo === 'Interno' ? 'Empleado en nómina de la organización.' : 'Personal externo (empresa/tercero) contratado por servicio.'}
                </div>
              </div>
              <div>
                <label className="label">Fecha de Ingreso</label>
                <input className="input" type="date" value={form.fecha_ingreso} onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))} />
              </div>
              <div>
                <label className="label">Antigüedad</label>
                <input className="input" value={antiguedad(form.fecha_ingreso)} disabled style={{ color: 'var(--text-muted)' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Puesto / Cargo</label>
                <select className="select" value={form.puesto} onChange={e => setForm(f => ({ ...f, puesto: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  {PUESTOS_COLABORADOR.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Centro de Costo</label>
                <select className="select" value={form.id_centro_costo_fk} onChange={e => setForm(f => ({ ...f, id_centro_costo_fk: e.target.value, id_cuadrante_fk: '', id_area_fk: '' }))}>
                  <option value="">— Sin asignar —</option>
                  {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              {esManttoResidencial && (
                <div>
                  <label className="label">Cuadrante</label>
                  <select className="select" value={form.id_cuadrante_fk} onChange={e => setForm(f => ({ ...f, id_cuadrante_fk: e.target.value, id_area_fk: '' }))}>
                    <option value="">— Sin asignar —</option>
                    {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}
              {esManttoResidencial && (
                <div>
                  <label className="label">Área asignada</label>
                  <select className="select" value={form.id_area_fk} disabled={!form.id_cuadrante_fk} onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value }))}>
                    <option value="">{form.id_cuadrante_fk ? '— Sin asignar —' : 'Elige Cuadrante primero'}</option>
                    {areasDelCuadrante.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Sueldo Bruto Mensual</label>
                <input className="input" type="number" min="0" step="0.01" value={form.sueldo_bruto_mensual} onChange={e => setForm(f => ({ ...f, sueldo_bruto_mensual: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="label">Sueldo Neto Mensual</label>
                <input className="input" type="number" min="0" step="0.01" value={form.sueldo_neto_mensual} onChange={e => setForm(f => ({ ...f, sueldo_neto_mensual: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="label">Sueldo Diario (jornal)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" type="number" min="0" step="0.01" value={form.sueldo_diario} onChange={e => setForm(f => ({ ...f, sueldo_diario: e.target.value }))} placeholder="0.00" />
                  {form.sueldo_bruto_mensual && (
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '0 10px', whiteSpace: 'nowrap' }}
                      onClick={() => setForm(f => ({ ...f, sueldo_diario: (Number(f.sueldo_bruto_mensual) / 30).toFixed(2) }))}>
                      Usar mensual/30
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>Se usa como costo de mano de obra real al capturarlo en una OT o en Rol de Pagos.</div>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 24, paddingTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  <input type="checkbox" checked={form.es_asignado} onChange={e => setForm(f => ({ ...f, es_asignado: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  Es Asignado <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(en "Asignado a" de OT)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  <input type="checkbox" checked={form.es_supervisor} onChange={e => setForm(f => ({ ...f, es_supervisor: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  Es Supervisor <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(en "Supervisor" de OT)</span>
                </label>
              </div>
            </div>
            {error && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>{error}</div>}
        </ModalShell>
      )}

      {/* Modal de consulta */}
      {viewing && (
        <ModalShell
          modulo="hr"
          titulo={nombreCompletoColaborador(viewing)}
          subtitulo={viewing.puesto ?? 'Sin puesto asignado'}
          icono={Users}
          maxWidth={560}
          onClose={() => setViewing(null)}
          footer={
            <>
              {puedeEscribir && (
                <button className="btn-ghost" style={{ fontSize: 12, color: viewing.activo ? '#dc2626' : '#15803d', marginRight: 'auto' }}
                  onClick={() => toggleActivo(viewing)}>
                  {viewing.activo ? 'Dar de baja' : 'Reactivar'}
                </button>
              )}
              {puedeEscribir && (
                <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => openEdit(viewing)}>
                  <Edit2 size={13} /> Editar
                </button>
              )}
            </>
          }
        >
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: viewing.tipo === 'Externo' ? '#fff7ed' : '#eff6ff', color: viewing.tipo === 'Externo' ? '#c2410c' : '#0369a1' }}>
                {viewing.tipo ?? 'Interno'}
              </span>
              {viewing.es_asignado && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#eff6ff', color: '#0369a1' }}>
                  <CheckCircle size={11} /> Asignado a OT
                </span>
              )}
              {viewing.es_supervisor && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed' }}>
                  <CheckCircle size={11} /> Supervisor OT
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: viewing.activo ? '#f0fdf4' : '#f8fafc', color: viewing.activo ? '#15803d' : '#94a3b8' }}>
                {viewing.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13 }}>
              {[
                { label: 'Fecha de Ingreso', value: viewing.fecha_ingreso ? new Date(viewing.fecha_ingreso + 'T00:00:00').toLocaleDateString('es-MX') : '—' },
                { label: 'Antigüedad', value: antiguedad(viewing.fecha_ingreso) || '—' },
                { label: 'Sueldo Bruto', value: fmt$(viewing.sueldo_bruto_mensual) },
                { label: 'Sueldo Neto', value: fmt$(viewing.sueldo_neto_mensual) },
                { label: 'Sueldo Diario (jornal)', value: fmt$(viewing.sueldo_diario) },
                { label: 'Centro de Costo', value: viewing.id_centro_costo_fk ? (centrosCosto.find(c => c.id === viewing.id_centro_costo_fk)?.nombre ?? '—') : '—' },
                ...(viewing.id_cuadrante_fk ? [{ label: 'Cuadrante', value: cuadrantes.find(c => c.id === viewing.id_cuadrante_fk)?.nombre ?? '—' }] : []),
                ...(viewing.id_area_fk ? [{ label: 'Área Asignada', value: areas.find(a => a.id === viewing.id_area_fk)?.nombre ?? '—' }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  <div style={{ color: '#1e293b', fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
        </ModalShell>
      )}

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Puesto</th>
              <th>Centro de Costo</th>
              <th>Fecha Ingreso</th>
              <th>Antigüedad</th>
              <th style={{ textAlign: 'right' }}>Sueldo Bruto</th>
              <th style={{ textAlign: 'right' }}>Sueldo Neto</th>
              <th style={{ textAlign: 'right' }}>Sueldo Diario</th>
              <th style={{ textAlign: 'center' }}>Asignado</th>
              <th style={{ textAlign: 'center' }}>Supervisor</th>
              <th style={{ textAlign: 'center', width: 80 }}>Status</th>
              <th style={{ textAlign: 'right', width: 90 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                {items.length === 0 ? 'Sin colaboradores. Crea el primero.' : 'Sin resultados con los filtros aplicados.'}
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.45 }}>
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{nombreCompletoColaborador(c)}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: c.tipo === 'Externo' ? '#fff7ed' : '#eff6ff', color: c.tipo === 'Externo' ? '#c2410c' : '#0369a1' }}>
                    {c.tipo ?? 'Interno'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.puesto ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.id_centro_costo_fk ? (centrosCosto.find(cc => cc.id === c.id_centro_costo_fk)?.nombre ?? '—') : '—'}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{c.fecha_ingreso ? new Date(c.fecha_ingreso + 'T00:00:00').toLocaleDateString('es-MX') : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{antiguedad(c.fecha_ingreso)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_bruto_mensual)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_neto_mensual)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_diario)}</td>
                <td style={{ textAlign: 'center' }}>{c.es_asignado ? <CheckCircle size={15} style={{ color: '#0369a1' }} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={{ textAlign: 'center' }}>{c.es_supervisor ? <CheckCircle size={15} style={{ color: '#7c3aed' }} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={{ textAlign: 'center' }}>
                  {c.activo ? <ToggleRight size={20} style={{ color: '#15803d' }} /> : <ToggleLeft size={20} style={{ color: '#cbd5e1' }} />}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Ver detalle" onClick={() => setViewing(c)}>
                      <Eye size={13} />
                    </button>
                    {puedeEscribir && (
                      <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Editar" onClick={() => openEdit(c)}>
                        <Edit2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
