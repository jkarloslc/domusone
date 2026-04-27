'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, CheckCircle, XCircle, ArrowLeftRight,
  Truck, PackageCheck, ClipboardList, Printer
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge, nextFolio } from '../types'
import ModalShell from '@/components/ui/ModalShell'

// ── Stepper visual ────────────────────────────────────────────
const PASOS = [
  { key: 'Solicitada',  label: 'Solicitud',    icon: ClipboardList },
  { key: 'Autorizada',  label: 'Autorización', icon: CheckCircle },
  { key: 'Enviada',     label: 'Despacho',     icon: Truck },
  { key: 'Completada',  label: 'Recepción',    icon: PackageCheck },
]

function Stepper({ status }: { status: string }) {
  const idx = PASOS.findIndex(p => p.key === status)
  const rechazada = status === 'Rechazada'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '16px 0' }}>
      {PASOS.map((p, i) => {
        const done    = idx > i
        const current = idx === i
        const Icon    = p.icon
        const color   = rechazada && i > 0 ? '#94a3b8'
                      : done    ? '#15803d'
                      : current ? 'var(--blue)'
                      : '#cbd5e1'
        return (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%',
                background: done ? '#f0fdf4' : current ? 'var(--blue-pale)' : '#f8fafc',
                border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} style={{ color }} />
              </div>
              <span style={{ fontSize: 10, color, fontWeight: current ? 700 : 400, whiteSpace: 'nowrap' }}>
                {p.label}
              </span>
            </div>
            {i < 3 && (
              <div style={{ flex: 1, height: 2, background: done ? '#15803d' : '#e2e8f0',
                margin: '0 4px', marginBottom: 18 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
export default function TransferenciasPage() {
  const router = useRouter()
  const { authUser, canAuth, canWrite } = useAuth()
  const [rows, setRows]         = useState<any[]>([])
  const [almMap, setAlmMap]     = useState<Record<number, string>>({})
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const debouncedSearch         = useDebounce(search, 300)
  const [filterStatus, setFilter] = useState('')
  const [modal, setModal]       = useState(false)
  const [detail, setDetail]     = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('transferencias').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (filterStatus)     q = q.eq('status', filterStatus)
    if (debouncedSearch)  q = q.or(`folio.ilike.%${debouncedSearch}%,solicitante.ilike.%${debouncedSearch}%,area_solicitante.ilike.%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0)

    const { data: alms } = await dbComp.from('almacenes').select('id, nombre')
    const m: Record<number, string> = {}
    ;(alms ?? []).forEach((a: any) => { m[a.id] = a.nombre })
    setAlmMap(m)
    setLoading(false)
  }, [debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  // PASO 2: Autorizar / Rechazar
  const handleAuth = async (id: number, aprobar: boolean, comentario?: string) => {
    await dbComp.from('transferencias').update({
      status:             aprobar ? 'Autorizada' : 'Rechazada',
      autorizado_por:     authUser?.nombre ?? 'Sistema',
      fecha_autorizacion: new Date().toISOString(),
      comentario_auth:    comentario || null,
    }).eq('id', id)
    setDetail(null); fetchData()
  }

  // PASO 3: Almacenista confirma envío físico (NO mueve inventario)
  const handleEnviar = async (trans: any, det: any[]) => {
    for (const d of det) {
      if (d.cantidad_enviada_input !== undefined) {
        await dbComp.from('transferencias_det')
          .update({ cantidad_enviada: Number(d.cantidad_enviada_input) })
          .eq('id', d.id)
      }
    }
    await dbComp.from('transferencias').update({
      status:      'Enviada',
      enviado_por: authUser?.nombre ?? 'Sistema',
      fecha_transferencia: new Date().toISOString().slice(0, 10),
    }).eq('id', trans.id)
    setDetail(null); fetchData()
  }

  // PASO 4: Solicitante confirma recepción → AQUÍ se mueve el inventario
  const handleRecibir = async (trans: any, det: any[]) => {
    for (const d of det) {
      if (d.id_articulo_fk) {
        await dbComp.rpc('fn_transferencia_inventario', {
          p_articulo_id:  d.id_articulo_fk,
          p_almacen_orig: trans.id_almacen_origen,
          p_almacen_dest: trans.id_almacen_destino,
          p_cantidad:     d.cantidad_enviada ?? d.cantidad_solicitada,
          p_ref_id:       trans.id,
          p_ref_folio:    trans.folio,
          p_usuario:      authUser?.nombre ?? 'Sistema',
        } as any)
      }
    }
    await dbComp.from('transferencias').update({
      status:     'Completada',
      updated_at: new Date().toISOString(),
    }).eq('id', trans.id)
    setDetail(null); fetchData()
  }

  const isAlmacenista = authUser?.rol === 'superadmin' || authUser?.rol === 'admin' || authUser?.rol === 'almacen' || authUser?.rol === 'compras_supervisor'
  const puedeAutorizar = canAuth('transferencias')

  const statusColor = (s: string) =>
    s === 'Solicitada'  ? '#d97706' :
    s === 'Autorizada'  ? '#2563eb' :
    s === 'Enviada'     ? '#7c3aed' :
    s === 'Completada'  ? '#15803d' :
    s === 'Rechazada'   ? '#dc2626' : '#64748b'

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/compras')} title="Regresar"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">Transferencias</h1>
            <p className="page-subtitle">
              Movimientos entre centros de costo · {total} registros
            </p>
          </div>
        </div>
        {canWrite('transferencias') && (
          <div className="page-header-actions">
            <button className="btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Nueva Solicitud</button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, solicitante, área…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 170 }} value={filterStatus} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos los status</option>
          {['Solicitada','Autorizada','Rechazada','Enviada','Completada'].map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Área / Solicitante</th>
              <th>Origen</th>
              <th>Destino</th>
              <th>Fecha</th>
              <th>Status</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Sin transferencias registradas
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.area_solicitante || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.solicitante}</div>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {almMap[r.id_almacen_origen] ?? `#${r.id_almacen_origen}`}
                </td>
                <td style={{ fontSize: 12, fontWeight: 500 }}>
                  {almMap[r.id_almacen_destino] ?? `#${r.id_almacen_destino}`}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtFecha(r.fecha_solicitud)}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    color: statusColor(r.status),
                    background: statusColor(r.status) + '15',
                    border: `1px solid ${statusColor(r.status)}40` }}>
                    {r.status}
                  </span>
                </td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }}
                    onClick={() => setDetail(r)}><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <TransferenciaModal
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchData() }}
        />
      )}
      {detail && (
        <TransferenciaDetail
          trans={detail}
          almMap={almMap}
          puedeAutorizar={puedeAutorizar}
          isAlmacenista={isAlmacenista}
          solicitante={authUser?.nombre ?? ''}
          onClose={() => { setDetail(null); fetchData() }}
          onAuth={handleAuth}
          onEnviar={handleEnviar}
          onRecibir={handleRecibir}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal nueva transferencia
// ════════════════════════════════════════════════════════════
function TransferenciaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [almacenes, setAlms]  = useState<any[]>([])
  const [artSearches, setArtSearches] = useState<string[]>([''])
  const [artOptions,  setArtOptions]  = useState<any[][]>([[]])
  const [areasSolic, setAreasSolic] = useState<any[]>([])
  const [invMap, setInvMap]   = useState<Record<string, number>>({})  // artId_almId → saldo

  const [form, setForm] = useState({
    id_almacen_origen:  '',
    id_almacen_destino: '',
    area_solicitante:   '',
    solicitante:        authUser?.nombre ?? '',
    justificacion:      '',
  })
  const [det, setDet] = useState([
    { id_articulo_fk: '', cantidad_solicitada: '1', unidad: 'PZA', notas: '' }
  ])

  useEffect(() => {
    Promise.all([
      dbComp.from('almacenes').select('*').eq('activo', true).order('nombre'),
      dbComp.from('areas_solicitantes').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([{ data: alms }, { data: solic }]) => {
      setAlms(alms ?? [])
      setAreasSolic(solic ?? [])
    })
  }, [])

  // Cargar inventario del almacén origen al seleccionarlo
  useEffect(() => {
    if (!form.id_almacen_origen) return
    dbComp.from('inventario').select('id_articulo_fk, cantidad')
      .eq('id_almacen_fk', Number(form.id_almacen_origen))
      .then(({ data }) => {
        const m: Record<string, number> = {}
        ;(data ?? []).forEach((i: any) => { m[i.id_articulo_fk] = Number(i.cantidad) })
        setInvMap(m)
      })
  }, [form.id_almacen_origen])

  const setD = (i: number, k: string, v: string) =>
    setDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const buscarArticulos = async (i: number, q: string) => {
    setArtSearches(p => { const n = [...p]; n[i] = q; return n })
    if (q.trim().length < 2) {
      setArtOptions(p => { const n = [...p]; n[i] = []; return n })
      return
    }
    const { data } = await dbComp.from('articulos')
      .select('id, clave, nombre, unidad').eq('activo', true)
      .or(`clave.ilike.%${q}%,nombre.ilike.%${q}%`)
      .order('nombre').limit(20)
    setArtOptions(p => { const n = [...p]; n[i] = data ?? []; return n })
  }

  const seleccionarArticulo = (i: number, art: any) => {
    setDet(d => d.map((x, j) => j === i
      ? { ...x, id_articulo_fk: String(art.id), unidad: art.unidad ?? x.unidad }
      : x
    ))
    setArtSearches(p => { const n = [...p]; n[i] = `${art.clave} — ${art.nombre}`; return n })
    setArtOptions(p => { const n = [...p]; n[i] = []; return n })
  }

  const addDetLine = () => {
    setDet(d => [...d, { id_articulo_fk: '', cantidad_solicitada: '1', unidad: 'PZA', notas: '' }])
    setArtSearches(p => [...p, ''])
    setArtOptions(p => [...p, []])
  }

  const handleSave = async () => {
    if (!form.id_almacen_origen || !form.id_almacen_destino) {
      setError('Selecciona almacén origen y destino'); return
    }
    if (form.id_almacen_origen === form.id_almacen_destino) {
      setError('Origen y destino deben ser diferentes'); return
    }
    if (!form.area_solicitante) { setError('Selecciona el área solicitante'); return }
    const detValidos = det.filter(d => d.id_articulo_fk && Number(d.cantidad_solicitada) > 0)
    if (!detValidos.length) { setError('Agrega al menos un artículo'); return }
    setSaving(true); setError('')

    let folio: string
    try { folio = await nextFolio(dbComp, 'TRF') } catch (e: any) { setError(e.message); setSaving(false); return }

    const { data: trf, error: err } = await dbComp.from('transferencias').insert({
      folio,
      id_almacen_origen:  Number(form.id_almacen_origen),
      id_almacen_destino: Number(form.id_almacen_destino),
      area_solicitante:   form.area_solicitante.trim(),
      solicitante:        form.solicitante.trim(),
      justificacion:      form.justificacion.trim() || null,
      status:             'Solicitada',
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }

    await dbComp.from('transferencias_det').insert(
      detValidos.map(d => ({
        id_transferencia_fk: trf.id,
        id_articulo_fk:      Number(d.id_articulo_fk),
        cantidad_solicitada: Number(d.cantidad_solicitada),
        unidad:              d.unidad,
        notas:               d.notas.trim() || null,
      }))
    )
    setSaving(false); onSaved()
  }

  const almOrigNombre = almacenes.find(a => a.id.toString() === form.id_almacen_origen)?.nombre

  return (
    <ModalShell modulo="almacenes" titulo="Solicitud de Transferencia" onClose={onClose} maxWidth={660}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />}
        Enviar Solicitud
        </button>
      </>}
    >

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* Almacenes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Almacén Origen *</label>
              <select className="select" value={form.id_almacen_origen}
                onChange={e => setForm(f => ({ ...f, id_almacen_origen: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Almacén Destino *</label>
              <select className="select" value={form.id_almacen_destino}
                onChange={e => setForm(f => ({ ...f, id_almacen_destino: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {almacenes.filter(a => a.id.toString() !== form.id_almacen_origen)
                  .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Área y solicitante */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Área Solicitante *</label>
              <select className="select" value={form.area_solicitante}
                onChange={e => setForm(f => ({ ...f, area_solicitante: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {areasSolic.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Solicitante</label>
              <input className="input" value={form.solicitante}
                onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Justificación</label>
            <textarea className="input" rows={2} value={form.justificacion}
              onChange={e => setForm(f => ({ ...f, justificacion: e.target.value }))}
              style={{ resize: 'vertical' }} />
          </div>

          {/* Artículos */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em',
            textTransform: 'uppercase', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
            Artículos a Transferir
          </div>

          {det.map((d, i) => {
            const saldoOrigen = d.id_articulo_fk ? (invMap[d.id_articulo_fk] ?? 0) : null
            const insuficiente = saldoOrigen !== null && Number(d.cantidad_solicitada) > saldoOrigen
            return (
              <div key={i} style={{ padding: '10px 12px', background: insuficiente ? '#fef2f2' : '#f8fafc',
                border: `1px solid ${insuficiente ? '#fecaca' : '#e2e8f0'}`, borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 28px', gap: 8, alignItems: 'end' }}>
                <div style={{ position: 'relative' }}>
                    <label className="label">Artículo</label>
                    <input className="input"
                      placeholder="Escribe clave o nombre…"
                      value={artSearches[i] ?? ''}
                      onChange={e => buscarArticulos(i, e.target.value)}
                    />
                    {(artOptions[i]?.length ?? 0) > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                        {artOptions[i].map((a: any) => (
                          <button key={a.id}
                            onMouseDown={e => { e.preventDefault(); seleccionarArticulo(i, a) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left',
                              padding: '8px 12px', background: 'none', border: 'none',
                              cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)' }}>{a.clave}</span>
                            <span style={{ fontSize: 13, marginLeft: 8 }}>{a.nombre}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{a.unidad}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label">Cantidad</label>
                    <input className="input" type="number" min="0.001" step="0.001"
                      value={d.cantidad_solicitada}
                      onChange={e => setD(i, 'cantidad_solicitada', e.target.value)}
                      style={{ textAlign: 'right' }} />
                  </div>
                  <div>
                    <label className="label">Unidad</label>
                    <input className="input" value={d.unidad}
                      onChange={e => setD(i, 'unidad', e.target.value)} />
                  </div>
                  <button className="btn-ghost" style={{ padding: '6px 4px', marginBottom: 0 }}
                    onClick={() => {
                      setDet(d => d.filter((_, j) => j !== i))
                      setArtSearches(p => p.filter((_, j) => j !== i))
                      setArtOptions(p => p.filter((_, j) => j !== i))
                    }}>
                    <X size={13} />
                  </button>
                </div>
                {/* Saldo disponible en origen */}
                {d.id_articulo_fk && form.id_almacen_origen && (
                  <div style={{ fontSize: 11, marginTop: 6, color: insuficiente ? '#dc2626' : '#15803d' }}>
                    {insuficiente
                      ? `⚠ Saldo insuficiente en ${almOrigNombre ?? 'origen'}: ${saldoOrigen} disponibles`
                      : `✓ Saldo en ${almOrigNombre ?? 'origen'}: ${saldoOrigen}`}
                  </div>
                )}
              </div>
            )
          })}

          <button className="btn-ghost" style={{ fontSize: 13, alignSelf: 'flex-start' }}
            onClick={addDetLine}>            <Plus size={12} /> Agregar artículo
          </button>
        </div>

    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════
// Detalle — 4 pasos con acciones por rol
// ════════════════════════════════════════════════════════════
function TransferenciaDetail({ trans, almMap, puedeAutorizar, isAlmacenista, solicitante, onClose, onAuth, onEnviar, onRecibir }: {
  trans: any; almMap: Record<number, string>
  puedeAutorizar: boolean; isAlmacenista: boolean; solicitante: string
  onClose: () => void
  onAuth:   (id: number, ap: boolean, com?: string) => void
  onEnviar: (t: any, det: any[]) => void
  onRecibir:(t: any, det: any[]) => void
}) {
  const [det, setDet]           = useState<any[]>([])
  const [artsMap, setArtsMap]   = useState<Record<number, string>>({})
  const [loading, setLoading]   = useState(true)
  const [comentario, setComentario] = useState('')
  const [showRechazo, setShowRechazo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    Promise.all([
      dbComp.from('transferencias_det').select('*').eq('id_transferencia_fk', trans.id),
      dbComp.from('articulos').select('id, clave, nombre'),
    ]).then(([{ data: d }, { data: arts }]) => {
      setDet((d ?? []).map((x: any) => ({ ...x, cantidad_enviada_input: x.cantidad_enviada?.toString() ?? x.cantidad_solicitada?.toString() })))
      const m: Record<number, string> = {}
      ;(arts ?? []).forEach((a: any) => { m[a.id] = `${a.clave} — ${a.nombre}` })
      setArtsMap(m)
      setLoading(false)
    })
  }, [trans.id])

  const updateEnviado = (id: number, v: string) =>
    setDet(d => d.map(x => x.id === id ? { ...x, cantidad_enviada_input: v } : x))

  // ── Vale de Transferencia imprimible ──────────────────────
  const imprimirVale = async () => {
    let orgNombre = 'Organización'
    let orgSubtitulo = ''
    let orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
    const filasDet = det.map(d => {
      const art = artsMap[d.id_articulo_fk] ?? `Art #${d.id_articulo_fk}`
      const enviado = d.cantidad_enviada ?? d.cantidad_enviada_input ?? '—'
      return `<tr>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:13px">${art}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;font-size:13px">${d.cantidad_solicitada}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;font-size:13px;font-weight:600;color:#0D4F80">${enviado}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px;color:#64748b">${d.unidad ?? ''}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:11px;color:#94a3b8">${d.notas ?? ''}</td>
      </tr>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><title>Vale de Transferencia ${trans.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 18px; }
        .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 600; color: #0D4F80; margin-bottom: 2px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 18px; }
        .info-item label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
        .info-item span { font-size: 13px; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        thead th { background: #f1f5f9; padding: 8px 10px; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.05em; text-align: left; border: 1px solid #e2e8f0; color: #64748b; }
        thead th.right { text-align: right; }
        .firmas { display: flex; gap: 40px; margin-top: 64px; justify-content: space-around; }
        .firma { text-align: center; min-width: 160px; }
        .firma-linea { border-top: 1px solid #1e293b; padding-top: 8px; margin-top: 48px; font-size: 11px; color: #64748b; }
        .firma-nombre { font-size: 12px; font-weight: 600; color: #1e293b; margin-bottom: 2px; }
        .nota { font-size: 11px; color: #94a3b8; font-style: italic; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 8px; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">Vale de Transferencia</div>
          <div style="font-size:16px;font-weight:700;color:#0D4F80;font-family:monospace">${trans.folio}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item"><label>Almacén Origen</label><span>${almMap[trans.id_almacen_origen] ?? `#${trans.id_almacen_origen}`}</span></div>
        <div class="info-item"><label>Almacén Destino</label><span style="font-weight:600;color:#0D4F80">${almMap[trans.id_almacen_destino] ?? `#${trans.id_almacen_destino}`}</span></div>
        <div class="info-item"><label>Área Solicitante</label><span>${trans.area_solicitante ?? '—'}</span></div>
        <div class="info-item"><label>Solicitante</label><span>${trans.solicitante ?? '—'}</span></div>
        <div class="info-item"><label>Fecha Solicitud</label><span>${fmtFecha(trans.fecha_solicitud)}</span></div>
        <div class="info-item"><label>Fecha Despacho</label><span>${trans.fecha_transferencia ? fmtFecha(trans.fecha_transferencia) : '______________________'}</span></div>
        ${trans.autorizado_por ? `<div class="info-item"><label>Autorizado por</label><span>${trans.autorizado_por}</span></div>` : ''}
        ${trans.justificacion ? `<div class="info-item" style="grid-column:span 2"><label>Justificación</label><span>${trans.justificacion}</span></div>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>Artículo</th>
            <th class="right">Cant. Solicitada</th>
            <th class="right">Cant. Despachada</th>
            <th>Unidad</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>${filasDet}</tbody>
      </table>

      <div class="firmas">
        <div class="firma">
          <div class="firma-nombre">${trans.autorizado_por ?? ''}</div>
          <div class="firma-linea">Autorizó</div>
        </div>
        <div class="firma">
          <div class="firma-nombre">${trans.enviado_por ?? ''}</div>
          <div class="firma-linea">Despachó</div>
        </div>
        <div class="firma">
          <div class="firma-nombre">${trans.solicitante ?? ''}</div>
          <div class="firma-linea">Recibió conforme</div>
        </div>
      </div>
      <div class="nota">Este documento es un vale de control interno. La firma de "Recibió conforme" acredita la recepción física de los artículos descritos.</div>
      </body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  // El solicitante puede confirmar recepción cuando sea "Enviada"
  const esSolicitante = trans.solicitante === solicitante || true // por ahora cualquier usuario puede confirmar

  return (
    <ModalShell modulo="almacenes" titulo="Modal" onClose={onClose} maxWidth={620}
    >

        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 80px)', padding: '0 24px 20px' }}>
          {/* Stepper */}
          {trans.status !== 'Rechazada'
            ? <Stepper status={trans.status} />
            : <div style={{ padding: '12px', background: '#fef2f2', borderRadius: 8, margin: '12px 0',
                color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
                ✕ Solicitud rechazada
                {trans.comentario_auth && <div style={{ fontWeight: 400, marginTop: 4 }}>{trans.comentario_auth}</div>}
              </div>}

          {/* Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 16 }}>
            <DI label="Área Solicitante" value={trans.area_solicitante} />
            <DI label="Solicitante"      value={trans.solicitante} />
            <DI label="Fecha Solicitud"  value={fmtFecha(trans.fecha_solicitud)} />
            {trans.justificacion && <DI label="Justificación" value={trans.justificacion} />}
            {trans.autorizado_por && <DI label="Autorizado por" value={`${trans.autorizado_por} · ${fmtFecha(trans.fecha_autorizacion?.slice(0,10))}`} />}
            {trans.enviado_por && <DI label="Despachado por" value={trans.enviado_por} />}
          </div>

          {/* Tabla artículos */}
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th style={{ textAlign: 'right' }}>Solicitado</th>
                  <th style={{ textAlign: 'right' }}>
                    {trans.status === 'Autorizada' && isAlmacenista ? 'Enviar' : 'Enviado'}
                  </th>
                  <th>Unidad</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>
                    <RefreshCw size={14} className="animate-spin" style={{ margin: '0 auto' }} />
                  </td></tr>
                ) : det.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontSize: 12 }}>{artsMap[d.id_articulo_fk] ?? `Art #${d.id_articulo_fk}`}</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{d.cantidad_solicitada}</td>
                    <td style={{ textAlign: 'right' }}>
                      {/* Almacenista puede editar cantidad enviada */}
                      {trans.status === 'Autorizada' && isAlmacenista ? (
                        <input className="input" type="number" min="0" step="0.001"
                          value={d.cantidad_enviada_input}
                          onChange={e => updateEnviado(d.id, e.target.value)}
                          style={{ textAlign: 'right', width: 80, padding: '4px 8px' }} />
                      ) : (
                        <span style={{ color: d.cantidad_enviada ? '#15803d' : 'var(--text-muted)', fontWeight: 600 }}>
                          {d.cantidad_enviada ?? '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── PASO 2: Botones de autorización ── */}
          {puedeAutorizar && trans.status === 'Solicitada' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
              padding: '14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>Paso 2 — Autorización</div>
              {showRechazo && (
                <div>
                  <label className="label">Motivo del rechazo</label>
                  <textarea className="input" rows={2} value={comentario}
                    onChange={e => setComentario(e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {!showRechazo ? (
                  <>
                    <button className="btn-primary" style={{ flex: 1 }}
                      onClick={() => onAuth(trans.id, true)}>
                      <CheckCircle size={13} /> Autorizar Transferencia
                    </button>
                    <button style={{ padding: '8px 16px', borderRadius: 7, background: '#fef2f2',
                      color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 13,
                      fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => setShowRechazo(true)}>
                      <XCircle size={13} /> Rechazar
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-secondary" onClick={() => setShowRechazo(false)}>Cancelar</button>
                    <button style={{ padding: '8px 16px', borderRadius: 7, background: '#dc2626',
                      color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13,
                      fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => onAuth(trans.id, false, comentario)}>
                      <XCircle size={13} /> Confirmar Rechazo
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── PASO 3: Almacenista despacha ── */}
          {isAlmacenista && trans.status === 'Autorizada' && (
            <div style={{ padding: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', marginBottom: 8 }}>
                Paso 3 — Despacho de Mercancía
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Ajusta las cantidades enviadas si difieren de lo solicitado, luego confirma el despacho.
                El inventario se moverá cuando el solicitante confirme la recepción.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimirVale}>
                  <Printer size={13} /> Imprimir Vale
                </button>
                <button className="btn-primary" style={{ flex: 1 }}
                  onClick={() => onEnviar(trans, det)}>
                  <Truck size={13} /> Confirmar Despacho
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 4: Solicitante confirma recepción ── */}
          {trans.status === 'Enviada' && (
            <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 8 }}>
                Paso 4 — Confirmar Recepción
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Al confirmar, el inventario se actualiza automáticamente:
                se descuenta del origen y se acredita a {almMap[trans.id_almacen_destino] ?? 'destino'}.
              </p>
              {!confirmando ? (
                <button className="btn-primary" style={{ width: '100%', background: '#15803d' }}
                  onClick={() => setConfirmando(true)}>
                  <PackageCheck size={13} /> Confirmar Recepción de Mercancía
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmando(false)}>
                    Cancelar
                  </button>
                  <button style={{ flex: 2, padding: '8px 16px', borderRadius: 7, background: '#15803d',
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13,
                    fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => onRecibir(trans, det)}>
                    <CheckCircle size={13} /> Sí, confirmar recepción
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Completada */}
          {trans.status === 'Completada' && (
            <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={18} style={{ color: '#15803d', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>Transferencia completada</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Inventario actualizado — {almMap[trans.id_almacen_destino]} recibió la mercancía
                </div>
              </div>
            </div>
          )}
        </div>
    </ModalShell>
  )
}

const DI = ({ label, value }: { label: string; value?: string | null }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
) : null
