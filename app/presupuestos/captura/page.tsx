'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbPpto } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, BookOpen, Loader, X, Save, ChevronRight, Settings } from 'lucide-react'
import Link from 'next/link'

type Presupuesto = {
  id: number
  anio: number
  nombre: string
  descripcion: string | null
  status: 'borrador' | 'aprobado' | 'cerrado'
}

type Partida = {
  id: number
  nombre: string
  tipo: 'ingreso' | 'egreso'
  orden: number
}

// detMap[partida_id][mes] = monto
type DetMap = Record<number, Record<number, number>>

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtNum = (n: number) =>
  n ? n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'

const parseNum = (s: string) => parseFloat(s.replace(/,/g, '').replace(/\s/g, '')) || 0

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  borrador: { bg: '#fef9c3', color: '#a16207' },
  aprobado: { bg: '#dcfce7', color: '#15803d' },
  cerrado:  { bg: '#f1f5f9', color: '#475569' },
}

const EMPTY_PPTO = { anio: new Date().getFullYear(), nombre: '', descripcion: '', status: 'borrador' as const }

export default function CapturaPpto() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('presupuestos')

  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [selId, setSelId]               = useState<number | null>(null)
  const [partidas, setPartidas]         = useState<Partida[]>([])
  const [detMap, setDetMap]             = useState<DetMap>({})
  const [loading, setLoading]           = useState(true)
  const [loadingDet, setLoadingDet]     = useState(false)

  // celda en edición
  const [editCell, setEditCell] = useState<{ pid: number; mes: number } | null>(null)
  const [editVal, setEditVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // modal nuevo presupuesto
  const [modalNew, setModalNew]   = useState(false)
  const [formNew, setFormNew]     = useState(EMPTY_PPTO)
  const [savingNew, setSavingNew] = useState(false)

  // modal cambio status
  const [modalStatus, setModalStatus] = useState(false)

  const loadPresupuestos = useCallback(async () => {
    const { data } = await dbPpto.from('presupuestos').select('*').order('anio', { ascending: false }).order('nombre')
    const list = (data ?? []) as Presupuesto[]
    setPresupuestos(list)
    return list
  }, [])

  const loadPartidas = useCallback(async () => {
    const { data } = await dbPpto.from('partidas').select('id, nombre, tipo, orden')
      .eq('activo', true).order('tipo').order('orden').order('nombre')
    setPartidas((data ?? []) as Partida[])
  }, [])

  const loadDet = useCallback(async (id: number) => {
    setLoadingDet(true)
    const { data } = await dbPpto.from('presupuesto_det')
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
    const current = detMap[pid]?.[mes] ?? 0
    setEditCell({ pid, mes })
    setEditVal(current ? String(current) : '')
  }

  async function commitCell() {
    if (!editCell || !selId) { setEditCell(null); return }
    const monto = parseNum(editVal)
    setSaving(true)
    await dbPpto.from('presupuesto_det').upsert(
      { id_presupuesto_fk: selId, id_partida_fk: editCell.pid, mes: editCell.mes, monto },
      { onConflict: 'id_presupuesto_fk,id_partida_fk,mes' }
    )
    setDetMap(prev => ({
      ...prev,
      [editCell.pid]: { ...(prev[editCell.pid] ?? {}), [editCell.mes]: monto },
    }))
    setSaving(false)
    setEditCell(null)
  }

  async function handleNewPpto() {
    if (!formNew.nombre.trim()) return
    setSavingNew(true)
    const { data } = await dbPpto.from('presupuestos').insert({
      anio: formNew.anio, nombre: formNew.nombre.trim(),
      descripcion: formNew.descripcion || null, status: 'borrador',
    }).select().single()
    setSavingNew(false)
    setModalNew(false)
    const list = await loadPresupuestos()
    if (data) {
      setSelId((data as any).id)
    } else if (list.length > 0) {
      setSelId(list[0].id)
    }
    setFormNew(EMPTY_PPTO)
  }

  async function handleStatus(newStatus: 'borrador' | 'aprobado' | 'cerrado') {
    if (!selId) return
    await dbPpto.from('presupuestos').update({ status: newStatus }).eq('id', selId)
    setPresupuestos(prev => prev.map(p => p.id === selId ? { ...p, status: newStatus } : p))
    setModalStatus(false)
  }

  const selPpto = presupuestos.find(p => p.id === selId)
  const ingresos = partidas.filter(p => p.tipo === 'ingreso')
  const egresos  = partidas.filter(p => p.tipo === 'egreso')
  const cerrado  = selPpto?.status === 'cerrado'

  function totalPartida(pid: number) {
    return MESES.reduce((s, _, i) => s + (detMap[pid]?.[i + 1] ?? 0), 0)
  }

  function totalMes(mes: number, lista: Partida[]) {
    return lista.reduce((s, p) => s + (detMap[p.id]?.[mes] ?? 0), 0)
  }

  function totalGeneral(lista: Partida[]) {
    return lista.reduce((s, p) => s + totalPartida(p.id), 0)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader size={28} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: '#64748b', fontSize: 13 }}>
        <span style={{ color: '#1e293b', fontWeight: 500 }}>Presupuestos</span>
        <ChevronRight size={14} />
        <span style={{ color: '#64748b' }}>Captura Mensual</span>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Captura de Presupuesto</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>Ingresa los montos mensuales por partida presupuestal</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/presupuestos/partidas"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
              borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', textDecoration: 'none',
              fontSize: 13, color: '#374151', fontWeight: 500 }}>
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

      {/* Selector de presupuesto */}
      {presupuestos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <BookOpen size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
          <p style={{ color: '#64748b', fontWeight: 500, marginBottom: 16 }}>No hay presupuestos registrados</p>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setModalNew(true)}>
              <Plus size={14} /> Crear primer presupuesto
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: '14px 18px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                Presupuesto:
              </label>
              <select className="input" style={{ minWidth: 260 }}
                value={selId ?? ''} onChange={e => setSelId(Number(e.target.value))}>
                {presupuestos.map(p => (
                  <option key={p.id} value={p.id}>{p.anio} — {p.nombre}</option>
                ))}
              </select>
            </div>

            {selPpto && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                  ...STATUS_COLOR[selPpto.status],
                }}>
                  {selPpto.status.charAt(0).toUpperCase() + selPpto.status.slice(1)}
                </span>
                {puedeEscribir && !cerrado && (
                  <button className="btn-ghost" onClick={() => setModalStatus(true)}
                    style={{ fontSize: 12, padding: '4px 10px' }}>
                    Cambiar status
                  </button>
                )}
              </div>
            )}

            {loadingDet && <Loader size={16} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>

          {/* Tabla de captura */}
          {partidas.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#94a3b8' }}>
                No hay partidas activas.{' '}
                <Link href="/presupuestos/partidas" style={{ color: '#1e40af' }}>Crea partidas</Link>
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
                  {/* INGRESOS */}
                  {ingresos.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={14} style={{ padding: '8px 14px', background: '#f0fdf4',
                          fontWeight: 700, fontSize: 12, color: '#15803d',
                          textTransform: 'uppercase', letterSpacing: '.06em', borderTop: '2px solid #bbf7d0' }}>
                          Ingresos
                        </td>
                      </tr>
                      {ingresos.map((p, i) => (
                        <PartidaRow key={p.id} p={p} detMap={detMap} editCell={editCell}
                          editVal={editVal} setEditVal={setEditVal} inputRef={inputRef}
                          onOpen={openCell} onCommit={commitCell} onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitCell() }
                            if (e.key === 'Escape') setEditCell(null)
                          }}
                          saving={saving} puedeEscribir={puedeEscribir && !cerrado}
                          rowBg={i % 2 === 0 ? '#fff' : '#f9fafb'} accentBg="#f0fdf4" />
                      ))}
                      <tr style={{ background: '#dcfce7', fontWeight: 700 }}>
                        <td style={{ ...tdS, position: 'sticky', left: 0, background: '#dcfce7', zIndex: 1,
                          color: '#15803d', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          Total Ingresos
                        </td>
                        {MESES.map((_, i) => (
                          <td key={i} style={{ ...tdS, textAlign: 'right', color: '#15803d' }}>
                            {fmtNum(totalMes(i + 1, ingresos))}
                          </td>
                        ))}
                        <td style={{ ...tdS, textAlign: 'right', color: '#15803d', background: '#bbf7d0' }}>
                          {fmtNum(totalGeneral(ingresos))}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* EGRESOS */}
                  {egresos.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={14} style={{ padding: '8px 14px', background: '#fef2f2',
                          fontWeight: 700, fontSize: 12, color: '#b91c1c',
                          textTransform: 'uppercase', letterSpacing: '.06em', borderTop: '2px solid #fecaca' }}>
                          Egresos
                        </td>
                      </tr>
                      {egresos.map((p, i) => (
                        <PartidaRow key={p.id} p={p} detMap={detMap} editCell={editCell}
                          editVal={editVal} setEditVal={setEditVal} inputRef={inputRef}
                          onOpen={openCell} onCommit={commitCell} onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitCell() }
                            if (e.key === 'Escape') setEditCell(null)
                          }}
                          saving={saving} puedeEscribir={puedeEscribir && !cerrado}
                          rowBg={i % 2 === 0 ? '#fff' : '#f9fafb'} accentBg="#fef2f2" />
                      ))}
                      <tr style={{ background: '#fee2e2', fontWeight: 700 }}>
                        <td style={{ ...tdS, position: 'sticky', left: 0, background: '#fee2e2', zIndex: 1,
                          color: '#b91c1c', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          Total Egresos
                        </td>
                        {MESES.map((_, i) => (
                          <td key={i} style={{ ...tdS, textAlign: 'right', color: '#b91c1c' }}>
                            {fmtNum(totalMes(i + 1, egresos))}
                          </td>
                        ))}
                        <td style={{ ...tdS, textAlign: 'right', color: '#b91c1c', background: '#fecaca' }}>
                          {fmtNum(totalGeneral(egresos))}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* BALANCE */}
                  {ingresos.length > 0 && egresos.length > 0 && (
                    <tr style={{ background: '#1e293b', color: '#fff', fontWeight: 700 }}>
                      <td style={{ ...tdS, position: 'sticky', left: 0, background: '#1e293b', zIndex: 1,
                        fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
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
                          return <span style={{ color: bal >= 0 ? '#86efac' : '#fca5a5' }}>{fmtNum(Math.abs(bal))}{bal < 0 ? ' —' : ''}</span>
                        })()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!puedeEscribir && (
            <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>Solo lectura — sin permisos de escritura</p>
          )}
          {cerrado && (
            <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>Presupuesto cerrado — no se permite modificar</p>
          )}
        </>
      )}

      {/* Modal nuevo presupuesto */}
      {modalNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 420, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nuevo Presupuesto</h2>
              <button className="btn-ghost" onClick={() => setModalNew(false)}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={lbl}>
                Año *
                <input className="input" type="number" min={2020} max={2099}
                  value={formNew.anio}
                  onChange={e => setFormNew(f => ({ ...f, anio: Number(e.target.value) }))} />
              </label>
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
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModalNew(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleNewPpto}
                disabled={savingNew || !formNew.nombre.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {savingNew ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cambio de status */}
      {modalStatus && selPpto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 380, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cambiar Status</h2>
              <button className="btn-ghost" onClick={() => setModalStatus(false)}><X size={18} /></button>
            </div>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
              Status actual: <strong>{selPpto.status}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(['borrador', 'aprobado', 'cerrado'] as const)
                .filter(s => s !== selPpto.status)
                .map(s => (
                  <button key={s} onClick={() => handleStatus(s)}
                    style={{ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontWeight: 600, fontSize: 14, textAlign: 'left',
                      ...STATUS_COLOR[s], transition: 'opacity .15s' }}>
                    Cambiar a <span style={{ textTransform: 'capitalize' }}>{s}</span>
                    {s === 'cerrado' && <span style={{ fontWeight: 400, fontSize: 12, display: 'block', marginTop: 2 }}>
                      El presupuesto no podrá modificarse
                    </span>}
                  </button>
                ))}
            </div>
            <button className="btn-ghost" onClick={() => setModalStatus(false)}
              style={{ marginTop: 14, width: '100%' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente fila de partida ────────────────────────────────────
function PartidaRow({ p, detMap, editCell, editVal, setEditVal, inputRef, onOpen, onCommit, onKeyDown, saving, puedeEscribir, rowBg, accentBg }: {
  p: Partida
  detMap: DetMap
  editCell: { pid: number; mes: number } | null
  editVal: string
  setEditVal: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement>
  onOpen: (pid: number, mes: number) => void
  onCommit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  saving: boolean
  puedeEscribir: boolean
  rowBg: string
  accentBg: string
}) {
  const total = MESES.reduce((s, _, i) => s + (detMap[p.id]?.[i + 1] ?? 0), 0)

  return (
    <tr style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ ...tdS, position: 'sticky', left: 0, background: rowBg, zIndex: 1,
        fontWeight: 600, color: '#1e293b', borderRight: '1px solid #e2e8f0' }}>
        {p.nombre}
      </td>
      {MESES.map((_, i) => {
        const mes = i + 1
        const isEdit = editCell?.pid === p.id && editCell.mes === mes
        const val = detMap[p.id]?.[mes] ?? 0

        return (
          <td key={mes} style={{ ...tdS, textAlign: 'right', padding: 4, position: 'relative' }}
            onClick={() => !isEdit && onOpen(p.id, mes)}>
            {isEdit ? (
              <input
                ref={inputRef}
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={onCommit}
                onKeyDown={onKeyDown}
                style={{ width: '100%', padding: '4px 6px', border: '2px solid #1e40af', borderRadius: 4,
                  textAlign: 'right', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            ) : (
              <span style={{
                display: 'block', padding: '4px 8px', borderRadius: 4, cursor: puedeEscribir ? 'pointer' : 'default',
                color: val ? '#1e293b' : '#cbd5e1',
                background: puedeEscribir && val === 0 ? 'transparent' : 'transparent',
                transition: 'background .1s',
              }}
                onMouseEnter={e => { if (puedeEscribir) (e.currentTarget as HTMLElement).style.background = accentBg }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                {val ? fmtNum(val) : '—'}
              </span>
            )}
          </td>
        )
      })}
      <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, color: '#1e293b',
        background: total ? '#f8fafc' : 'transparent', borderLeft: '1px solid #e2e8f0' }}>
        {total ? fmtNum(total) : '—'}
      </td>
    </tr>
  )
}

const thS: React.CSSProperties = {
  padding: '10px 10px', fontWeight: 600, fontSize: 12,
  textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right',
  borderBottom: '1px solid #334155',
}
const tdS: React.CSSProperties = { padding: '8px 10px', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 13, fontWeight: 500, color: '#374151' }
