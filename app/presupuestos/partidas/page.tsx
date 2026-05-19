'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbPpto, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Edit2, Loader, X, Save, ChevronRight } from 'lucide-react'
import Link from 'next/link'

type Partida = {
  id: number
  nombre: string
  descripcion: string | null
  tipo: 'ingreso' | 'egreso'
  id_centro_costo_fk: number | null
  id_area_fk: number | null
  id_centro_ingreso_fk: number | null
  orden: number
  activo: boolean
}

type CC  = { id: number; nombre: string }
type Area = { id: number; nombre: string; id_centro_costo_fk: number }
type CI  = { id: number; nombre: string }

const EMPTY: Omit<Partida, 'id'> = {
  nombre: '', descripcion: null, tipo: 'egreso',
  id_centro_costo_fk: null, id_area_fk: null, id_centro_ingreso_fk: null,
  orden: 0, activo: true,
}

export default function PartidasPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('presupuestos')

  const [partidas, setPartidas] = useState<Partida[]>([])
  const [ccs, setCCs]           = useState<CC[]>([])
  const [areas, setAreas]       = useState<Area[]>([])
  const [centrosIng, setCentrosIng] = useState<CI[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [edit, setEdit]         = useState<Partida | null>(null)
  const [form, setForm]         = useState<Omit<Partida, 'id'>>(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [filterTipo, setFilterTipo] = useState<'' | 'ingreso' | 'egreso'>('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await dbPpto.from('partidas').select('*').order('tipo').order('orden').order('nombre')
    setPartidas((data ?? []) as Partida[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCCs((data ?? []) as CC[]))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setAreas((data ?? []) as Area[]))
    dbCfg.from('centros_ingreso').select('id, nombre').order('nombre')
      .then(({ data }) => setCentrosIng((data ?? []) as CI[]))
  }, [load])

  function openNew() {
    setEdit(null)
    setForm(EMPTY)
    setModal(true)
  }

  function openEdit(p: Partida) {
    setEdit(p)
    setForm({ nombre: p.nombre, descripcion: p.descripcion, tipo: p.tipo,
      id_centro_costo_fk: p.id_centro_costo_fk, id_area_fk: p.id_area_fk,
      id_centro_ingreso_fk: p.id_centro_ingreso_fk, orden: p.orden, activo: p.activo })
    setModal(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      nombre: form.nombre.trim(),
      id_centro_costo_fk:   form.tipo === 'egreso'  ? form.id_centro_costo_fk   : null,
      id_area_fk:           form.tipo === 'egreso'  ? form.id_area_fk           : null,
      id_centro_ingreso_fk: form.tipo === 'ingreso' ? form.id_centro_ingreso_fk : null,
    }
    if (edit) {
      await dbPpto.from('partidas').update(payload).eq('id', edit.id)
    } else {
      await dbPpto.from('partidas').insert(payload)
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const areasFiltradas = areas.filter(a =>
    form.id_centro_costo_fk ? a.id_centro_costo_fk === Number(form.id_centro_costo_fk) : true
  )

  const ccMap = Object.fromEntries(ccs.map(c => [c.id, c.nombre]))
  const areaMap = Object.fromEntries(areas.map(a => [a.id, a.nombre]))
  const ciMap = Object.fromEntries(centrosIng.map(c => [c.id, c.nombre]))

  const rows = filterTipo ? partidas.filter(p => p.tipo === filterTipo) : partidas
  const ingresos = rows.filter(p => p.tipo === 'ingreso')
  const egresos  = rows.filter(p => p.tipo === 'egreso')

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: '#64748b', fontSize: 13 }}>
        <Link href="/presupuestos/captura" style={{ color: '#64748b', textDecoration: 'none' }}>Presupuestos</Link>
        <ChevronRight size={14} />
        <span style={{ color: '#1e293b' }}>Catálogo de Partidas</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Catálogo de Partidas Presupuestales</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>Define las partidas de ingreso y egreso para el presupuesto</p>
        </div>
        {puedeEscribir && (
          <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nueva Partida
          </button>
        )}
      </div>

      {/* Filtro tipo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['', 'ingreso', 'egreso'] as const).map(t => (
          <button key={t} onClick={() => setFilterTipo(t)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
              background: filterTipo === t ? '#1e40af' : '#f1f5f9',
              color: filterTipo === t ? '#fff' : '#475569',
              fontWeight: filterTipo === t ? 600 : 400,
            }}>
            {t === '' ? 'Todas' : t === 'ingreso' ? 'Ingresos' : 'Egresos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <Loader size={28} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <>
          {[{ label: 'Ingresos', data: ingresos, color: '#15803d', bg: '#f0fdf4' },
            { label: 'Egresos',  data: egresos,  color: '#b91c1c', bg: '#fef2f2' }]
            .filter(g => g.data.length > 0 || filterTipo === '' || filterTipo === g.label.toLowerCase().slice(0,-1) as any)
            .map(grupo => (
            <div key={grupo.label} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ background: grupo.bg, color: grupo.color, fontWeight: 700, fontSize: 12,
                  padding: '3px 10px', borderRadius: 12, border: `1px solid ${grupo.color}33` }}>
                  {grupo.label}
                </span>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>{grupo.data.length} partidas</span>
              </div>

              {grupo.data.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 14, padding: '12px 0' }}>Sin partidas registradas</p>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={th}>Nombre</th>
                        <th style={th}>Descripción</th>
                        {grupo.label === 'Egresos'
                          ? <><th style={th}>Centro de Costo</th><th style={th}>Área</th></>
                          : <th style={th}>Centro de Ingreso</th>
                        }
                        <th style={th}>Orden</th>
                        <th style={th}>Activo</th>
                        {puedeEscribir && <th style={th}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.data.map((p, i) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
                          background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</span></td>
                          <td style={{ ...td, color: '#64748b', fontSize: 13 }}>{p.descripcion || '—'}</td>
                          {grupo.label === 'Egresos' ? (
                            <>
                              <td style={td}>{p.id_centro_costo_fk ? ccMap[p.id_centro_costo_fk] || '—' : '—'}</td>
                              <td style={td}>{p.id_area_fk ? areaMap[p.id_area_fk] || '—' : '—'}</td>
                            </>
                          ) : (
                            <td style={td}>{p.id_centro_ingreso_fk ? ciMap[p.id_centro_ingreso_fk] || '—' : '—'}</td>
                          )}
                          <td style={{ ...td, textAlign: 'center' }}>{p.orden}</td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                              background: p.activo ? '#dcfce7' : '#f1f5f9',
                              color: p.activo ? '#15803d' : '#64748b' }}>
                              {p.activo ? 'Sí' : 'No'}
                            </span>
                          </td>
                          {puedeEscribir && (
                            <td style={{ ...td, textAlign: 'right' }}>
                              <button className="btn-ghost" onClick={() => openEdit(p)}
                                style={{ padding: '4px 8px', fontSize: 12 }}>
                                <Edit2 size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 480, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {edit ? 'Editar Partida' : 'Nueva Partida'}
              </h2>
              <button className="btn-ghost" onClick={() => setModal(false)} style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={lbl}>
                Nombre *
                <input className="input" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Cuotas de Mantenimiento" />
              </label>

              <label style={lbl}>
                Descripción
                <input className="input" value={form.descripcion ?? ''}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value || null }))}
                  placeholder="Opcional" />
              </label>

              <label style={lbl}>
                Tipo *
                <select className="input" value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any,
                    id_centro_costo_fk: null, id_area_fk: null, id_centro_ingreso_fk: null }))}>
                  <option value="egreso">Egreso</option>
                  <option value="ingreso">Ingreso</option>
                </select>
              </label>

              {form.tipo === 'egreso' && (
                <>
                  <label style={lbl}>
                    Centro de Costo
                    <select className="input" value={form.id_centro_costo_fk ?? ''}
                      onChange={e => setForm(f => ({ ...f,
                        id_centro_costo_fk: e.target.value ? Number(e.target.value) : null,
                        id_area_fk: null }))}>
                      <option value="">— Sin vínculo —</option>
                      {ccs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </label>
                  <label style={lbl}>
                    Área
                    <select className="input" value={form.id_area_fk ?? ''}
                      onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">— Sin vínculo —</option>
                      {areasFiltradas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </label>
                </>
              )}

              {form.tipo === 'ingreso' && (
                <label style={lbl}>
                  Centro de Ingreso
                  <select className="input" value={form.id_centro_ingreso_fk ?? ''}
                    onChange={e => setForm(f => ({ ...f, id_centro_ingreso_fk: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">— Sin vínculo —</option>
                    {centrosIng.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ ...lbl, flex: 1 }}>
                  Orden
                  <input className="input" type="number" min={0} value={form.orden}
                    onChange={e => setForm(f => ({ ...f, orden: Number(e.target.value) }))} />
                </label>
                <label style={{ ...lbl, flex: 1 }}>
                  Activo
                  <select className="input" value={form.activo ? 'si' : 'no'}
                    onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'si' }))}>
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving || !form.nombre.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
}
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 14, color: '#374151' }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13,
  fontWeight: 500, color: '#374151' }
