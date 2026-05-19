'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Edit2, Loader, Save, ChevronRight, BookOpen } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

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

type CC   = { id: number; nombre: string }
type Area = { id: number; nombre: string; id_centro_costo_fk: number }
type CI   = { id: number; nombre: string }

const EMPTY: Omit<Partida, 'id'> = {
  nombre: '', descripcion: null, tipo: 'egreso',
  id_centro_costo_fk: null, id_area_fk: null, id_centro_ingreso_fk: null,
  orden: 0, activo: true,
}

export default function PartidasPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('presupuestos')

  const [partidas, setPartidas]     = useState<Partida[]>([])
  const [ccs, setCCs]               = useState<CC[]>([])
  const [areas, setAreas]           = useState<Area[]>([])
  const [centrosIng, setCentrosIng] = useState<CI[]>([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [edit, setEdit]             = useState<Partida | null>(null)
  const [form, setForm]             = useState<Omit<Partida, 'id'>>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [filterTipo, setFilterTipo] = useState<'' | 'ingreso' | 'egreso'>('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCtrl.from('ppto_partidas').select('*').order('tipo').order('orden').order('nombre')
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
    setForm({
      nombre: p.nombre, descripcion: p.descripcion, tipo: p.tipo,
      id_centro_costo_fk: p.id_centro_costo_fk, id_area_fk: p.id_area_fk,
      id_centro_ingreso_fk: p.id_centro_ingreso_fk, orden: p.orden, activo: p.activo,
    })
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
      await dbCtrl.from('ppto_partidas').update(payload).eq('id', edit.id)
    } else {
      await dbCtrl.from('ppto_partidas').insert(payload)
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const areasFiltradas = areas.filter(a =>
    form.id_centro_costo_fk ? a.id_centro_costo_fk === Number(form.id_centro_costo_fk) : true
  )

  const ccMap   = Object.fromEntries(ccs.map(c => [c.id, c.nombre]))
  const areaMap = Object.fromEntries(areas.map(a => [a.id, a.nombre]))
  const ciMap   = Object.fromEntries(centrosIng.map(c => [c.id, c.nombre]))

  const rows     = filterTipo ? partidas.filter(p => p.tipo === filterTipo) : partidas
  const ingresos = rows.filter(p => p.tipo === 'ingreso')
  const egresos  = rows.filter(p => p.tipo === 'egreso')

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        color: '#94a3b8', fontSize: 13 }}>
        <Link href="/presupuestos/captura"
          style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <BookOpen size={13} /> Presupuestos
        </Link>
        <ChevronRight size={13} />
        <span style={{ color: '#475569' }}>Catálogo de Partidas</span>
      </div>

      {/* Page header estándar */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <h1 className="page-title">Catálogo de Partidas Presupuestales</h1>
          <p className="page-subtitle">Define las partidas de ingreso y egreso para el presupuesto</p>
        </div>
        <div className="page-header-actions">
          {/* Filtro tipo */}
          <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 22, padding: '3px 4px' }}>
            {(['', 'ingreso', 'egreso'] as const).map(t => (
              <button key={t} onClick={() => setFilterTipo(t)}
                style={{
                  padding: '4px 14px', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: filterTipo === t ? '#fff' : 'transparent',
                  color: filterTipo === t ? '#1e293b' : '#64748b',
                  fontWeight: filterTipo === t ? 600 : 400,
                  boxShadow: filterTipo === t ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
                  transition: 'all .15s',
                }}>
                {t === '' ? 'Todas' : t === 'ingreso' ? 'Ingresos' : 'Egresos'}
              </button>
            ))}
          </div>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Nueva Partida
            </button>
          )}
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader size={28} color="#94a3b8" className="animate-spin" />
        </div>
      ) : (
        <>
          {[
            { label: 'Ingresos', data: ingresos, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: 'Egresos',  data: egresos,  color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
          ].map(grupo => (
            <div key={grupo.label} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{
                  background: grupo.bg, color: grupo.color, fontWeight: 700, fontSize: 11,
                  padding: '3px 10px', borderRadius: 12,
                  border: `1px solid ${grupo.border}`, textTransform: 'uppercase', letterSpacing: '.06em',
                }}>
                  {grupo.label}
                </span>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>{grupo.data.length} partidas</span>
              </div>

              {grupo.data.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 14, padding: '8px 0' }}>Sin partidas registradas</p>
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
                        <th style={{ ...th, textAlign: 'center' }}>Orden</th>
                        <th style={{ ...th, textAlign: 'center' }}>Activo</th>
                        {puedeEscribir && <th style={th}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.data.map((p, i) => (
                        <tr key={p.id} style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: i % 2 === 0 ? '#fff' : '#fafafa',
                        }}>
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
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: p.activo ? '#dcfce7' : '#f1f5f9',
                              color: p.activo ? '#15803d' : '#64748b',
                            }}>
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

      {/* Modal crear / editar */}
      {modal && (
        <ModalShell
          modulo="presupuestos"
          titulo={edit ? 'Editar Partida' : 'Nueva Partida Presupuestal'}
          subtitulo={edit ? `Modificando: ${edit.nombre}` : 'Define nombre, tipo y vínculo contable'}
          icono={BookOpen}
          maxWidth={500}
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave}
                disabled={saving || !form.nombre.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving
                  ? <Loader size={14} className="animate-spin" />
                  : <Save size={14} />}
                Guardar
              </button>
            </>
          }
        >
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
                onChange={e => setForm(f => ({
                  ...f, tipo: e.target.value as any,
                  id_centro_costo_fk: null, id_area_fk: null, id_centro_ingreso_fk: null,
                }))}>
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </label>

            {form.tipo === 'egreso' && (
              <>
                <label style={lbl}>
                  Centro de Costo
                  <select className="input" value={form.id_centro_costo_fk ?? ''}
                    onChange={e => setForm(f => ({
                      ...f,
                      id_centro_costo_fk: e.target.value ? Number(e.target.value) : null,
                      id_area_fk: null,
                    }))}>
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
        </ModalShell>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11,
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
}
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 14, color: '#374151' }
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 13, fontWeight: 500, color: '#374151',
}
