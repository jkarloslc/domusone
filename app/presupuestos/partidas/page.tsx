'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Edit2, Loader, Save, ChevronRight, BookOpen } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

type FuenteReal = 'seccion' | 'concepto' | 'op_area' | 'manual'

const MODULOS = ['Golf', 'Mantenimiento', 'Hípico', 'Hospitalidad']

const MODULO_COLOR: Record<string, { bg: string; color: string }> = {
  General:       { bg: '#f1f5f9', color: '#475569' },
  Residencial:   { bg: '#eff6ff', color: '#1d4ed8' },
  Golf:          { bg: '#f0fdf4', color: '#15803d' },
  Mantenimiento: { bg: '#fef3c7', color: '#92400e' },
  Hípico:        { bg: '#fdf4ff', color: '#7e22ce' },
  Eventos:       { bg: '#fff1f2', color: '#be123c' },
  Hospitalidad:  { bg: '#ecfdf5', color: '#065f46' },
}

type Partida = {
  id: number
  nombre: string
  descripcion: string | null
  tipo: 'ingreso' | 'egreso'
  modulo: string
  fuente_real: FuenteReal
  id_centro_costo_fk:   number | null
  id_area_fk:           number | null
  id_centro_ingreso_fk: number | null
  id_seccion_fk:        number | null
  id_concepto_fk:       number | null
  tipo_gasto:           string | null
  orden: number
  activo: boolean
}

type CC       = { id: number; nombre: string }
type Area     = { id: number; nombre: string; id_centro_costo_fk: number }
type CI       = { id: number; nombre: string }
type Seccion  = { id: number; nombre: string }
type Concepto = { id: number; nombre: string; id_centro_ingreso_fk: number | null }

const TIPOS_GASTO = [
  'Servicios Profesionales', 'Mantenimiento', 'Reparación',
  'Arrendamiento', 'Seguros', 'Publicidad', 'Combustible',
  'Electricidad', 'Agua', 'Telefonía / Internet',
  'Honorarios', 'Asesoría', 'Capacitación', 'Nómina', 'Otro',
]

const EMPTY: Omit<Partida, 'id'> = {
  nombre: '', descripcion: null, tipo: 'egreso', modulo: 'Golf', fuente_real: 'op_area',
  id_centro_costo_fk: null, id_area_fk: null, id_centro_ingreso_fk: null,
  id_seccion_fk: null, id_concepto_fk: null, tipo_gasto: null, orden: 0, activo: true,
}

const FUENTE_LABEL: Record<FuenteReal, string> = {
  seccion:  'Por Sección',
  concepto: 'Por Concepto',
  op_area:  'Orden de Pago / Área',
  manual:   'Manual',
}
const FUENTE_COLOR: Record<FuenteReal, { bg: string; color: string }> = {
  seccion:  { bg: '#eff6ff', color: '#1d4ed8' },
  concepto: { bg: '#f5f3ff', color: '#6d28d9' },
  op_area:  { bg: '#fef3c7', color: '#92400e' },
  manual:   { bg: '#f1f5f9', color: '#475569' },
}

export default function PartidasPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('presupuestos')

  const [partidas, setPartidas]       = useState<Partida[]>([])
  const [ccs, setCCs]                 = useState<CC[]>([])
  const [areas, setAreas]             = useState<Area[]>([])
  const [centrosIng, setCentrosIng]   = useState<CI[]>([])
  const [secciones, setSecciones]     = useState<Seccion[]>([])
  const [conceptos, setConceptos]     = useState<Concepto[]>([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(false)
  const [edit, setEdit]               = useState<Partida | null>(null)
  const [form, setForm]               = useState<Omit<Partida, 'id'>>(EMPTY)
  const [saving, setSaving]           = useState(false)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [filterTipo, setFilterTipo]   = useState<'' | 'ingreso' | 'egreso'>('')
  const [filterModulo, setFilterModulo] = useState('')

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
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSecciones((data ?? []) as Seccion[]))
    dbCfg.from('conceptos_ingreso').select('id, nombre, id_centro_ingreso_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setConceptos((data ?? []) as Concepto[]))
  }, [load])

  function openNew() {
    setEdit(null); setForm(EMPTY); setErrorMsg(null); setModal(true)
  }

  function openEdit(p: Partida) {
    setEdit(p); setErrorMsg(null)
    setForm({
      nombre: p.nombre, descripcion: p.descripcion, tipo: p.tipo,
      fuente_real: p.fuente_real ?? (p.tipo === 'egreso' && p.id_area_fk ? 'op_area' : 'manual'),
      modulo: p.modulo ?? 'General',
      id_centro_costo_fk: p.id_centro_costo_fk, id_area_fk: p.id_area_fk,
      id_centro_ingreso_fk: p.id_centro_ingreso_fk,
      id_seccion_fk: p.id_seccion_fk, id_concepto_fk: p.id_concepto_fk,
      tipo_gasto: p.tipo_gasto,
      orden: p.orden, activo: p.activo,
    })
    setModal(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return
    setSaving(true); setErrorMsg(null)
    const payload = {
      nombre:               form.nombre.trim(),
      descripcion:          form.descripcion,
      tipo:                 form.tipo,
      modulo:               form.modulo,
      fuente_real:          form.tipo === 'egreso' ? 'op_area' : form.fuente_real,
      orden:                form.orden,
      activo:               form.activo,
      // Egresos
      id_centro_costo_fk:   form.tipo === 'egreso' ? form.id_centro_costo_fk : null,
      id_area_fk:           form.tipo === 'egreso' ? form.id_area_fk         : null,
      tipo_gasto:           form.tipo === 'egreso' ? form.tipo_gasto         : null,
      // Ingresos
      id_centro_ingreso_fk: form.tipo === 'ingreso' ? form.id_centro_ingreso_fk : null,
      id_seccion_fk:        (form.tipo === 'ingreso' && form.fuente_real === 'seccion')  ? form.id_seccion_fk  : null,
      id_concepto_fk:       (form.tipo === 'ingreso' && form.fuente_real === 'concepto') ? form.id_concepto_fk : null,
    }
    const { error } = edit
      ? await dbCtrl.from('ppto_partidas').update(payload).eq('id', edit.id)
      : await dbCtrl.from('ppto_partidas').insert(payload)
    setSaving(false)
    if (error) { setErrorMsg(error.message); return }
    setModal(false); load()
  }

  const areasFiltradas     = areas.filter(a =>
    form.id_centro_costo_fk ? a.id_centro_costo_fk === Number(form.id_centro_costo_fk) : true)
  const conceptosFiltrados = conceptos.filter(c =>
    form.id_centro_ingreso_fk ? c.id_centro_ingreso_fk === Number(form.id_centro_ingreso_fk) || c.id_centro_ingreso_fk === null : true)

  const ccMap   = Object.fromEntries(ccs.map(c => [c.id, c.nombre]))
  const areaMap = Object.fromEntries(areas.map(a => [a.id, a.nombre]))
  const ciMap   = Object.fromEntries(centrosIng.map(c => [c.id, c.nombre]))
  const secMap  = Object.fromEntries(secciones.map(s => [s.id, s.nombre]))
  const concMap = Object.fromEntries(conceptos.map(c => [c.id, c.nombre]))

  const rows     = partidas
    .filter(p => !filterTipo   || p.tipo   === filterTipo)
    .filter(p => !filterModulo || (p.modulo ?? 'General') === filterModulo)
  const ingresos = rows.filter(p => p.tipo === 'ingreso')
  const egresos  = rows.filter(p => p.tipo === 'egreso')

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#94a3b8', fontSize: 13 }}>
        <Link href="/presupuestos/captura"
          style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <BookOpen size={13} /> Presupuestos
        </Link>
        <ChevronRight size={13} />
        <span style={{ color: '#475569' }}>Catálogo de Partidas</span>
      </div>

      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <h1 className="page-title">Catálogo de Partidas Presupuestales</h1>
          <p className="page-subtitle">Define las partidas y su fuente de datos real automático</p>
        </div>
        <div className="page-header-actions">
          {/* Filtro módulo */}
          <select className="input" style={{ fontSize: 12, padding: '5px 10px' }}
            value={filterModulo} onChange={e => setFilterModulo(e.target.value)}>
            <option value="">Todos los módulos</option>
            {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
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
                  padding: '3px 10px', borderRadius: 12, border: `1px solid ${grupo.border}`,
                  textTransform: 'uppercase', letterSpacing: '.06em',
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
                        <th style={th}>Módulo</th>
                        <th style={th}>Fuente Real</th>
                        <th style={th}>Vínculo</th>
                        <th style={{ ...th, textAlign: 'center' }}>Orden</th>
                        <th style={{ ...th, textAlign: 'center' }}>Activo</th>
                        {puedeEscribir && <th style={th}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.data.map((p, i) => {
                        const fr = (p.fuente_real ?? 'manual') as FuenteReal
                        const fc = FUENTE_COLOR[fr]
                        let vinculo = '—'
                        if (fr === 'seccion'  && p.id_seccion_fk)        vinculo = secMap[p.id_seccion_fk] ?? '—'
                        if (fr === 'concepto' && p.id_concepto_fk)       vinculo = concMap[p.id_concepto_fk] ?? '—'
                        if (fr === 'op_area'  && p.id_area_fk) {
                          vinculo = `${p.id_centro_costo_fk ? ccMap[p.id_centro_costo_fk] + ' / ' : ''}${areaMap[p.id_area_fk] ?? '—'}`
                          if (p.tipo_gasto) vinculo += ` · ${p.tipo_gasto}`
                        }
                        if (fr === 'manual'   && p.id_centro_ingreso_fk) vinculo = ciMap[p.id_centro_ingreso_fk] ?? '—'
                        return (
                          <tr key={p.id} style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: i % 2 === 0 ? '#fff' : '#fafafa',
                          }}>
                            <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</span>
                              {p.descripcion && <span style={{ display: 'block', fontSize: 12, color: '#94a3b8' }}>{p.descripcion}</span>}
                            </td>
                            <td style={td}>
                              {(() => {
                                const mc = MODULO_COLOR[p.modulo ?? 'General'] ?? MODULO_COLOR.General
                                return (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: mc.bg, color: mc.color }}>
                                    {p.modulo ?? 'General'}
                                  </span>
                                )
                              })()}
                            </td>
                            <td style={td}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                background: fc.bg, color: fc.color,
                              }}>
                                {FUENTE_LABEL[fr]}
                              </span>
                            </td>
                            <td style={{ ...td, color: '#475569', fontSize: 13 }}>{vinculo}</td>
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
                        )
                      })}
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
          subtitulo={edit ? `Modificando: ${edit.nombre}` : 'Define nombre, tipo y fuente de datos real'}
          icono={BookOpen}
          maxWidth={520}
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave}
                disabled={saving || !form.nombre.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {errorMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, background: '#fef2f2',
                border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13,
              }}>
                {errorMsg}
              </div>
            )}

            <label style={lbl}>
              Nombre *
              <input className="input" value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Cuotas Agaves" />
            </label>

            <label style={lbl}>
              Descripción
              <input className="input" value={form.descripcion ?? ''}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value || null }))}
                placeholder="Opcional" />
            </label>

            <label style={lbl}>
              Módulo *
              <select className="input" value={form.modulo}
                onChange={e => setForm(f => ({ ...f, modulo: e.target.value }))}>
                {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>

            <label style={lbl}>
              Tipo *
              <select className="input" value={form.tipo}
                onChange={e => {
                  const tipo = e.target.value as 'ingreso' | 'egreso'
                  setForm(f => ({
                    ...f, tipo,
                    fuente_real: tipo === 'egreso' ? 'op_area' : 'manual',
                    id_centro_costo_fk: null, id_area_fk: null,
                    id_centro_ingreso_fk: null, id_seccion_fk: null, id_concepto_fk: null,
                  }))
                }}>
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </label>

            {/* ── EGRESO ── */}
            {form.tipo === 'egreso' && (
              <>
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef3c7',
                  border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
                  Real automático: <strong>Órdenes de Pago</strong> filtradas por Área
                </div>
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
                <label style={lbl}>
                  Tipo de Gasto
                  <select className="input" value={form.tipo_gasto ?? ''}
                    onChange={e => setForm(f => ({ ...f, tipo_gasto: e.target.value || null }))}>
                    <option value="">— Todos (sin filtro) —</option>
                    {TIPOS_GASTO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    Filtra OPs por tipo de gasto dentro del área. Dejar vacío = tomar todo el área.
                  </span>
                </label>
              </>
            )}

            {/* ── INGRESO ── */}
            {form.tipo === 'ingreso' && (
              <>
                <label style={lbl}>
                  Fuente del Real Automático
                  <select className="input" value={form.fuente_real}
                    onChange={e => setForm(f => ({
                      ...f,
                      fuente_real: e.target.value as FuenteReal,
                      id_seccion_fk: null, id_concepto_fk: null,
                    }))}>
                    <option value="seccion">Por Sección (recibos_ingreso_secciones)</option>
                    <option value="concepto">Por Concepto (recibos_ingreso_conceptos)</option>
                    <option value="manual">Manual (sin cálculo automático)</option>
                  </select>
                </label>

                <label style={lbl}>
                  Centro de Ingreso
                  <select className="input" value={form.id_centro_ingreso_fk ?? ''}
                    onChange={e => setForm(f => ({
                      ...f,
                      id_centro_ingreso_fk: e.target.value ? Number(e.target.value) : null,
                      id_concepto_fk: null,
                    }))}>
                    <option value="">— Sin vínculo —</option>
                    {centrosIng.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>

                {form.fuente_real === 'seccion' && (
                  <label style={lbl}>
                    Sección
                    <select className="input" value={form.id_seccion_fk ?? ''}
                      onChange={e => setForm(f => ({ ...f, id_seccion_fk: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">— Selecciona sección —</option>
                      {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </label>
                )}

                {form.fuente_real === 'concepto' && (
                  <label style={lbl}>
                    Concepto de Ingreso
                    <select className="input" value={form.id_concepto_fk ?? ''}
                      onChange={e => setForm(f => ({ ...f, id_concepto_fk: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">— Selecciona concepto —</option>
                      {conceptosFiltrados.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </label>
                )}
              </>
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
