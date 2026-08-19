'use client'
import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, BookOpen, Loader, Save, Settings, BookMarked, Edit2 } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const MODULOS = ['Golf', 'Mantenimiento', 'Hípico', 'Polo', 'Eventos', "Patron's", 'Locales']

type Presupuesto = {
  id: number
  anio: number
  nombre: string
  descripcion: string | null
  modulo: string
  status: 'borrador' | 'aprobado' | 'cerrado'
}

type Clasificacion = 'operativo' | 'financiero' | 'intercompanias'

type Partida = {
  id: number
  nombre: string
  tipo: 'ingreso' | 'egreso'
  orden: number
  clasificacion: Clasificacion
}

const CLASIFICACIONES: Clasificacion[] = ['operativo', 'financiero', 'intercompanias']
const CLASIFICACION_LABELS: Record<Clasificacion, { ingresos: string; egresos: string; balance: string }> = {
  operativo:      { ingresos: 'Ingresos',                 egresos: 'Egresos',                 balance: 'Balance Operativo' },
  financiero:     { ingresos: 'Ingreso Financiero',        egresos: 'Egreso Financiero',        balance: 'Balance Financiero' },
  intercompanias: { ingresos: 'Ingreso Intercompañías',    egresos: 'Egreso Intercompañías',    balance: 'Balance Intercompañías' },
}

type DetMap = Record<number, Record<number, number>>

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtNum = (n: number) =>
  n ? n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'

const parseNum = (s: string) => parseFloat(s.replace(/,/g, '').replace(/\s/g, '')) || 0

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  borrador: { bg: '#fef9c3', color: '#a16207', label: 'Borrador' },
  aprobado: { bg: '#dcfce7', color: '#15803d', label: 'Aprobado' },
  cerrado:  { bg: '#f1f5f9', color: '#475569', label: 'Cerrado'  },
}

const EMPTY_PPTO = { anio: new Date().getFullYear(), nombre: '', descripcion: '', modulo: 'Golf' }

export default function CapturaPpto() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('presupuestos')

  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [selId, setSelId]               = useState<number | null>(null)
  const [partidas, setPartidas]         = useState<Partida[]>([])
  const [detMap, setDetMap]             = useState<DetMap>({})
  const [loading, setLoading]           = useState(true)
  const [loadingDet, setLoadingDet]     = useState(false)

  const [editCell, setEditCell] = useState<{ pid: number; mes: number } | null>(null)
  const [editVal, setEditVal]   = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [modalNew, setModalNew]     = useState(false)
  const [formNew, setFormNew]       = useState(EMPTY_PPTO)
  const [savingNew, setSavingNew]   = useState(false)
  const [modalStatus, setModalStatus] = useState(false)
  const [modalEdit, setModalEdit]   = useState(false)
  const [formEdit, setFormEdit]     = useState(EMPTY_PPTO)
  const [savingEdit, setSavingEdit] = useState(false)

  const loadPresupuestos = useCallback(async () => {
    const { data } = await dbCtrl.from('ppto_presupuestos')
      .select('*').order('anio', { ascending: false }).order('nombre')
    const list = (data ?? []) as Presupuesto[]
    setPresupuestos(list)
    return list
  }, [])

  const loadPartidas = useCallback(async (modulo?: string) => {
    let q = dbCtrl.from('ppto_partidas').select('id, nombre, tipo, orden, clasificacion')
      .eq('activo', true)
    if (modulo && modulo !== 'General') q = (q as any).eq('modulo', modulo)
    const { data } = await q.order('tipo').order('orden').order('nombre')
    setPartidas((data ?? []) as Partida[])
  }, [])

  const loadDet = useCallback(async (id: number) => {
    setLoadingDet(true)
    const { data } = await dbCtrl.from('ppto_presupuesto_det')
      .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', id)
    const map: DetMap = {}
    ;(data ?? []).forEach((r: any) => {
      if (!map[r.id_partida_fk]) map[r.id_partida_fk] = {}
      map[r.id_partida_fk][r.mes] = Number(r.monto)
    })
    setDetMap(map)
    setLoadingDet(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadPresupuestos(), loadPartidas()]).then(([list]) => {
      if (list.length > 0) {
        setSelId(list[0].id)
        loadDet(list[0].id)
        loadPartidas(list[0].modulo)
      }
      setLoading(false)
    })
  }, [loadPresupuestos, loadPartidas, loadDet])

  useEffect(() => {
    if (selId) loadDet(selId)
  }, [selId, loadDet])

  useEffect(() => {
    if (editCell) inputRef.current?.focus()
  }, [editCell])

  function openCell(pid: number, mes: number) {
    if (!puedeEscribir) return
    const sel = presupuestos.find(p => p.id === selId)
    if (sel?.status === 'cerrado') return
    setEditCell({ pid, mes })
    setEditVal(detMap[pid]?.[mes] ? String(detMap[pid][mes]) : '')
  }

  async function commitCell() {
    if (!editCell || !selId) { setEditCell(null); return }
    const monto = parseNum(editVal)
    await dbCtrl.from('ppto_presupuesto_det').upsert(
      { id_presupuesto_fk: selId, id_partida_fk: editCell.pid, mes: editCell.mes, monto },
      { onConflict: 'id_presupuesto_fk,id_partida_fk,mes' }
    )
    setDetMap(prev => ({
      ...prev,
      [editCell.pid]: { ...(prev[editCell.pid] ?? {}), [editCell.mes]: monto },
    }))
    setEditCell(null)
  }

  async function handleNewPpto() {
    if (!formNew.nombre.trim()) return
    setSavingNew(true)
    const { data } = await dbCtrl.from('ppto_presupuestos').insert({
      anio: formNew.anio, nombre: formNew.nombre.trim(),
      descripcion: formNew.descripcion || null,
      modulo: formNew.modulo, status: 'borrador',
    }).select().single()
    setSavingNew(false)
    setModalNew(false)
    const list = await loadPresupuestos()
    if (data) setSelId((data as any).id)
    else if (list.length > 0) setSelId(list[0].id)
    setFormNew(EMPTY_PPTO)
  }

  function openEdit() {
    if (!selPpto) return
    setFormEdit({ anio: selPpto.anio, nombre: selPpto.nombre, descripcion: selPpto.descripcion ?? '', modulo: selPpto.modulo ?? 'General' })
    setModalEdit(true)
  }

  async function handleEditPpto() {
    if (!selId || !formEdit.nombre.trim()) return
    setSavingEdit(true)
    await dbCtrl.from('ppto_presupuestos').update({
      anio: formEdit.anio, nombre: formEdit.nombre.trim(),
      descripcion: formEdit.descripcion || null,
      modulo: formEdit.modulo,
    }).eq('id', selId)
    setSavingEdit(false)
    setModalEdit(false)
    await loadPresupuestos()
  }

  async function handleStatus(newStatus: 'borrador' | 'aprobado' | 'cerrado') {
    if (!selId) return
    await dbCtrl.from('ppto_presupuestos').update({ status: newStatus }).eq('id', selId)
    setPresupuestos(prev => prev.map(p => p.id === selId ? { ...p, status: newStatus } : p))
    setModalStatus(false)
  }

  const selPpto = presupuestos.find(p => p.id === selId)
  // Ingresos/Egresos combinando TODAS las clasificaciones — usados para el
  // Balance Neto final (grand total) al pie de la tabla.
  const ingresos = partidas.filter(p => p.tipo === 'ingreso')
  const egresos  = partidas.filter(p => p.tipo === 'egreso')
  const porClasificacion = (lista: Partida[], clas: Clasificacion) =>
    lista.filter(p => (p.clasificacion ?? 'operativo') === clas)
  const cerrado  = selPpto?.status === 'cerrado'

  const totalPartida  = (pid: number) => MESES.reduce((s, _, i) => s + (detMap[pid]?.[i + 1] ?? 0), 0)
  const totalMes      = (mes: number, lista: Partida[]) => lista.reduce((s, p) => s + (detMap[p.id]?.[mes] ?? 0), 0)
  const totalGeneral  = (lista: Partida[]) => lista.reduce((s, p) => s + totalPartida(p.id), 0)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader size={28} color="#94a3b8" className="animate-spin" />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Page header estándar */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <h1 className="page-title">Captura de Presupuesto</h1>
          <p className="page-subtitle">Ingresa los montos mensuales por partida presupuestal</p>
        </div>
        <div className="page-header-actions">
          <Link href="/presupuestos/partidas"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff',
              textDecoration: 'none', fontSize: 13, color: '#374151', fontWeight: 500,
            }}>
            <Settings size={14} /> Catálogo de Partidas
          </Link>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setModalNew(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Nuevo Presupuesto
            </button>
          )}
        </div>
      </div>

      {/* Estado vacío */}
      {presupuestos.length === 0 ? (
        <div className="card" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '60px 24px', gap: 12,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={28} color="#94a3b8" />
          </div>
          <p style={{ color: '#64748b', fontWeight: 500, margin: 0 }}>No hay presupuestos registrados</p>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setModalNew(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Crear primer presupuesto
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Selector de presupuesto */}
          <div className="card" style={{
            padding: '12px 18px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                Presupuesto:
              </span>
              <select className="input" style={{ minWidth: 260 }}
                value={selId ?? ''} onChange={e => {
                  const id = Number(e.target.value)
                  setSelId(id)
                  const p = presupuestos.find(x => x.id === id)
                  if (p) loadPartidas(p.modulo)
                }}>
                {presupuestos.map(p => (
                  <option key={p.id} value={p.id}>{p.anio} — [{p.modulo}] {p.nombre}</option>
                ))}
              </select>
            </label>

            {selPpto && (() => {
              const st = STATUS_STYLE[selPpto.status]
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12,
                    background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
                  }}>
                    {selPpto.modulo ?? 'General'}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                    background: st.bg, color: st.color,
                    border: `1px solid ${st.color}33`,
                  }}>
                    {st.label}
                  </span>
                  {puedeEscribir && (
                    <button className="btn-ghost" onClick={openEdit}
                      style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Edit2 size={12} /> Editar
                    </button>
                  )}
                  {puedeEscribir && !cerrado && (
                    <button className="btn-ghost" onClick={() => setModalStatus(true)}
                      style={{ fontSize: 12, padding: '4px 10px' }}>
                      Cambiar status
                    </button>
                  )}
                </div>
              )
            })()}

            {loadingDet && (
              <Loader size={15} color="#94a3b8" className="animate-spin" />
            )}
          </div>

          {/* Grid de captura */}
          {partidas.length === 0 ? (
            <div className="card" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 24px', gap: 10,
            }}>
              <p style={{ color: '#94a3b8', margin: 0 }}>
                No hay partidas activas.{' '}
                <Link href="/presupuestos/partidas" style={{ color: '#1e40af' }}>Crear partidas</Link>
                {' '}para comenzar la captura.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#fff' }}>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 200, position: 'sticky', left: 0, background: '#1e293b', zIndex: 2 }}>
                      Partida
                    </th>
                    {MESES.map(m => <th key={m} style={{ ...thS, minWidth: 88 }}>{m}</th>)}
                    <th style={{ ...thS, minWidth: 110, background: '#0f172a' }}>Total Anual</th>
                  </tr>
                </thead>
                <tbody>
                  {CLASIFICACIONES.map(clas => {
                    const ing = porClasificacion(ingresos, clas)
                    const egr = porClasificacion(egresos, clas)
                    const labels = CLASIFICACION_LABELS[clas]
                    if (ing.length === 0 && egr.length === 0) return null
                    return (
                      <Fragment key={clas}>
                        {ing.length > 0 && (
                          <>
                            <SectionHeader label={labels.ingresos} color="#15803d" bg="#f0fdf4" border="#bbf7d0" />
                            {ing.map((p, i) => (
                              <PartidaRow key={p.id} p={p} detMap={detMap}
                                editCell={editCell} editVal={editVal}
                                setEditVal={setEditVal} inputRef={inputRef}
                                onOpen={openCell} onCommit={commitCell}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitCell() }
                                  if (e.key === 'Escape') setEditCell(null)
                                }}
                                puedeEscribir={puedeEscribir && !cerrado}
                                rowBg={i % 2 === 0 ? '#fff' : '#f9fafb'} accentBg="#f0fdf4" />
                            ))}
                            <TotalRow label={`Total ${labels.ingresos}`} lista={ing} detMap={detMap}
                              color="#15803d" bg="#dcfce7" bgTotal="#bbf7d0"
                              totalMesFn={totalMes} totalGeneralFn={totalGeneral} />
                          </>
                        )}

                        {egr.length > 0 && (
                          <>
                            <SectionHeader label={labels.egresos} color="#b91c1c" bg="#fef2f2" border="#fecaca" />
                            {egr.map((p, i) => (
                              <PartidaRow key={p.id} p={p} detMap={detMap}
                                editCell={editCell} editVal={editVal}
                                setEditVal={setEditVal} inputRef={inputRef}
                                onOpen={openCell} onCommit={commitCell}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitCell() }
                                  if (e.key === 'Escape') setEditCell(null)
                                }}
                                puedeEscribir={puedeEscribir && !cerrado}
                                rowBg={i % 2 === 0 ? '#fff' : '#f9fafb'} accentBg="#fef2f2" />
                            ))}
                            <TotalRow label={`Total ${labels.egresos}`} lista={egr} detMap={detMap}
                              color="#b91c1c" bg="#fee2e2" bgTotal="#fecaca"
                              totalMesFn={totalMes} totalGeneralFn={totalGeneral} />
                          </>
                        )}

                        {ing.length > 0 && egr.length > 0 && (
                          <tr style={{ background: '#334155', color: '#fff', fontWeight: 700 }}>
                            <td style={{ ...tdS, position: 'sticky', left: 0, background: '#334155', zIndex: 1,
                              fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                              {labels.balance}
                            </td>
                            {MESES.map((_, i) => {
                              const bal = totalMes(i + 1, ing) - totalMes(i + 1, egr)
                              return (
                                <td key={i} style={{ ...tdS, textAlign: 'right', color: bal >= 0 ? '#86efac' : '#fca5a5' }}>
                                  {fmtNum(Math.abs(bal))}{bal < 0 ? ' —' : ''}
                                </td>
                              )
                            })}
                            <td style={{ ...tdS, textAlign: 'right', background: '#1e293b' }}>
                              {(() => {
                                const bal = totalGeneral(ing) - totalGeneral(egr)
                                return <span style={{ color: bal >= 0 ? '#86efac' : '#fca5a5' }}>
                                  {fmtNum(Math.abs(bal))}{bal < 0 ? ' —' : ''}
                                </span>
                              })()}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}

                  {/* BALANCE */}
                  {ingresos.length > 0 && egresos.length > 0 && (
                    <tr style={{ background: '#1e293b', color: '#fff', fontWeight: 700 }}>
                      <td style={{ ...tdS, position: 'sticky', left: 0, background: '#1e293b', zIndex: 1,
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Balance Neto
                      </td>
                      {MESES.map((_, i) => {
                        const bal = totalMes(i + 1, ingresos) - totalMes(i + 1, egresos)
                        return (
                          <td key={i} style={{ ...tdS, textAlign: 'right', color: bal >= 0 ? '#86efac' : '#fca5a5' }}>
                            {fmtNum(Math.abs(bal))}{bal < 0 ? ' —' : ''}
                          </td>
                        )
                      })}
                      <td style={{ ...tdS, textAlign: 'right', background: '#0f172a' }}>
                        {(() => {
                          const bal = totalGeneral(ingresos) - totalGeneral(egresos)
                          return <span style={{ color: bal >= 0 ? '#86efac' : '#fca5a5' }}>
                            {fmtNum(Math.abs(bal))}{bal < 0 ? ' —' : ''}
                          </span>
                        })()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!puedeEscribir && (
            <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>Vista de solo lectura</p>
          )}
          {cerrado && (
            <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>Presupuesto cerrado — no se puede modificar</p>
          )}
        </>
      )}

      {/* Modal: Nuevo Presupuesto */}
      {modalNew && (
        <ModalShell
          modulo="presupuestos"
          titulo="Nuevo Presupuesto"
          subtitulo="Crea un presupuesto anual para comenzar la captura"
          icono={BookMarked}
          maxWidth={420}
          onClose={() => setModalNew(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModalNew(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleNewPpto}
                disabled={savingNew || !formNew.nombre.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {savingNew
                  ? <Loader size={14} className="animate-spin" />
                  : <Save size={14} />}
                Crear
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ ...lbl, flex: 1 }}>
                Año *
                <input className="input" type="number" min={2020} max={2099}
                  value={formNew.anio}
                  onChange={e => setFormNew(f => ({ ...f, anio: Number(e.target.value) }))} />
              </label>
              <label style={{ ...lbl, flex: 2 }}>
                Módulo *
                <select className="input" value={formNew.modulo}
                  onChange={e => setFormNew(f => ({ ...f, modulo: e.target.value }))}>
                  {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label style={lbl}>
              Nombre *
              <input className="input" value={formNew.nombre}
                onChange={e => setFormNew(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Presupuesto Anual 2026" />
            </label>
            <label style={lbl}>
              Descripción
              <input className="input" value={formNew.descripcion}
                onChange={e => setFormNew(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Opcional" />
            </label>
          </div>
        </ModalShell>
      )}

      {/* Modal: Editar Presupuesto */}
      {modalEdit && selPpto && (
        <ModalShell
          modulo="presupuestos"
          titulo="Editar Presupuesto"
          subtitulo={`Modificando: ${selPpto.nombre} · ${selPpto.anio}`}
          icono={BookMarked}
          maxWidth={420}
          onClose={() => setModalEdit(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModalEdit(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleEditPpto}
                disabled={savingEdit || !formEdit.nombre.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {savingEdit ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ ...lbl, flex: 1 }}>
                Año *
                <input className="input" type="number" min={2020} max={2099}
                  value={formEdit.anio}
                  onChange={e => setFormEdit(f => ({ ...f, anio: Number(e.target.value) }))} />
              </label>
              <label style={{ ...lbl, flex: 2 }}>
                Módulo *
                <select className="input" value={formEdit.modulo}
                  onChange={e => setFormEdit(f => ({ ...f, modulo: e.target.value }))}>
                  {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label style={lbl}>
              Nombre *
              <input className="input" value={formEdit.nombre}
                onChange={e => setFormEdit(f => ({ ...f, nombre: e.target.value }))} />
            </label>
            <label style={lbl}>
              Descripción
              <input className="input" value={formEdit.descripcion}
                onChange={e => setFormEdit(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Opcional" />
            </label>
          </div>
        </ModalShell>
      )}

      {/* Modal: Cambio de status */}
      {modalStatus && selPpto && (
        <ModalShell
          modulo="presupuestos"
          titulo="Cambiar Status"
          subtitulo={`Presupuesto: ${selPpto.nombre} · ${selPpto.anio}`}
          icono={BookOpen}
          maxWidth={380}
          onClose={() => setModalStatus(false)}
          footer={
            <button className="btn-secondary" onClick={() => setModalStatus(false)}>Cancelar</button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>
              Status actual:{' '}
              <span style={{ fontWeight: 600, color: STATUS_STYLE[selPpto.status].color }}>
                {STATUS_STYLE[selPpto.status].label}
              </span>
            </p>
            {(['borrador', 'aprobado', 'cerrado'] as const)
              .filter(s => s !== selPpto.status)
              .map(s => {
                const st = STATUS_STYLE[s]
                return (
                  <button key={s} onClick={() => handleStatus(s)}
                    style={{
                      padding: '12px 16px', borderRadius: 10, border: `1px solid ${st.color}33`,
                      cursor: 'pointer', fontWeight: 600, fontSize: 14, textAlign: 'left',
                      background: st.bg, color: st.color, transition: 'opacity .15s',
                    }}>
                    Cambiar a {st.label}
                    {s === 'cerrado' && (
                      <span style={{ fontWeight: 400, fontSize: 12, display: 'block', marginTop: 2, color: '#94a3b8' }}>
                        El presupuesto no podrá modificarse
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        </ModalShell>
      )}
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────

function SectionHeader({ label, color, bg, border }: {
  label: string; color: string; bg: string; border: string
}) {
  return (
    <tr>
      <td colSpan={14} style={{
        padding: '7px 14px', background: bg,
        fontWeight: 700, fontSize: 11, color,
        textTransform: 'uppercase', letterSpacing: '.06em',
        borderTop: `2px solid ${border}`,
      }}>
        {label}
      </td>
    </tr>
  )
}

function TotalRow({ label, lista, detMap, color, bg, bgTotal, totalMesFn, totalGeneralFn }: {
  label: string; lista: Partida[]; detMap: DetMap
  color: string; bg: string; bgTotal: string
  totalMesFn: (mes: number, lista: Partida[]) => number
  totalGeneralFn: (lista: Partida[]) => number
}) {
  return (
    <tr style={{ background: bg, fontWeight: 700 }}>
      <td style={{ ...tdS, position: 'sticky', left: 0, background: bg, zIndex: 1,
        color, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </td>
      {MESES.map((_, i) => (
        <td key={i} style={{ ...tdS, textAlign: 'right', color }}>
          {fmtNum(totalMesFn(i + 1, lista))}
        </td>
      ))}
      <td style={{ ...tdS, textAlign: 'right', color, background: bgTotal }}>
        {fmtNum(totalGeneralFn(lista))}
      </td>
    </tr>
  )
}

function PartidaRow({ p, detMap, editCell, editVal, setEditVal, inputRef,
  onOpen, onCommit, onKeyDown, puedeEscribir, rowBg, accentBg }: {
  p: Partida; detMap: DetMap
  editCell: { pid: number; mes: number } | null
  editVal: string; setEditVal: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement>
  onOpen: (pid: number, mes: number) => void
  onCommit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  puedeEscribir: boolean; rowBg: string; accentBg: string
}) {
  const total = MESES.reduce((s, _, i) => s + (detMap[p.id]?.[i + 1] ?? 0), 0)

  return (
    <tr style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ ...tdS, position: 'sticky', left: 0, background: rowBg, zIndex: 1,
        fontWeight: 600, color: '#1e293b', borderRight: '1px solid #e2e8f0' }}>
        {p.nombre}
      </td>
      {MESES.map((_, i) => {
        const mes    = i + 1
        const isEdit = editCell?.pid === p.id && editCell.mes === mes
        const val    = detMap[p.id]?.[mes] ?? 0

        return (
          <td key={mes} style={{ ...tdS, textAlign: 'right', padding: 4 }}
            onClick={() => !isEdit && onOpen(p.id, mes)}>
            {isEdit ? (
              <input ref={inputRef} value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={onCommit} onKeyDown={onKeyDown}
                style={{
                  width: '100%', padding: '4px 6px',
                  border: '2px solid #1d4ed8', borderRadius: 4,
                  textAlign: 'right', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            ) : (
              <span style={{
                display: 'block', padding: '4px 8px', borderRadius: 4,
                cursor: puedeEscribir ? 'pointer' : 'default',
                color: val ? '#1e293b' : '#cbd5e1',
              }}
                onMouseEnter={e => { if (puedeEscribir) (e.currentTarget as HTMLElement).style.background = accentBg }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                {val ? fmtNum(val) : '—'}
              </span>
            )}
          </td>
        )
      })}
      <td style={{ ...tdS, textAlign: 'right', fontWeight: 700,
        color: total ? '#1e293b' : '#cbd5e1',
        background: total ? '#f8fafc' : 'transparent',
        borderLeft: '1px solid #e2e8f0' }}>
        {total ? fmtNum(total) : '—'}
      </td>
    </tr>
  )
}

const thS: React.CSSProperties = {
  padding: '10px 10px', fontWeight: 600, fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right',
  borderBottom: '1px solid #334155',
}
const tdS: React.CSSProperties = { padding: '8px 10px', fontSize: 13 }
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 13, fontWeight: 500, color: '#374151',
}
