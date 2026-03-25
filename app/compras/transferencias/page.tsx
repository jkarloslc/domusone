'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, CheckCircle, XCircle, ArrowLeftRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge } from '../types'

export default function TransferenciasPage() {
  const router = useRouter()
  const { authUser } = useAuth()
  const [rows, setRows]       = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilter] = useState('')
  const [modal, setModal]     = useState(false)
  const [detail, setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('transferencias').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    if (search) q = q.or(`folio.ilike.%${search}%,solicitante.ilike.%${search}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0); setLoading(false)
  }, [search, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const canAuth = authUser?.rol === 'admin' || authUser?.rol === 'cobranza'

  const handleAuth = async (id: number, aprobar: boolean) => {
    await dbComp.from('transferencias').update({
      status:             aprobar ? 'Autorizada' : 'Rechazada',
      autorizado_por:     authUser?.nombre ?? 'Sistema',
      fecha_autorizacion: new Date().toISOString(),
    }).eq('id', id)
    setDetail(null); fetchData()
  }

  const handleEnviar = async (trans: any) => {
    // Ejecutar transferencia en inventario por cada artículo
    const { data: det } = await dbComp.from('transferencias_det').select('*').eq('id_transferencia_fk', trans.id)
    for (const d of det ?? []) {
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
        await dbComp.from('transferencias_det').update({
          cantidad_enviada: d.cantidad_enviada ?? d.cantidad_solicitada
        }).eq('id', d.id)
      }
    }
    await dbComp.from('transferencias').update({
      status:   'Enviada',
      enviado_por: authUser?.nombre ?? 'Sistema',
    }).eq('id', trans.id)
    setDetail(null); fetchData()
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Transferencias</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Movimientos entre almacenes · {total} registros</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, solicitante…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select" style={{ width: 160 }} value={filterStatus} onChange={e => setFilter(e.target.value)}>
            <option value="">Todos</option>
            {['Solicitada','Autorizada','Rechazada','Enviada'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Nueva Transferencia</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr><th>Folio</th><th>Área Solicitante</th><th>Origen → Destino</th><th>Fecha</th><th>Status</th><th style={{ width: 60 }}></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin transferencias</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 13 }}>{r.area_solicitante} · <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.solicitante}</span></td>
                <td style={{ fontSize: 12 }}>
                  <span>Alm. #{r.id_almacen_origen}</span>
                  <ArrowLeftRight size={11} style={{ margin: '0 6px', color: 'var(--text-muted)' }} />
                  <span>Alm. #{r.id_almacen_destino}</span>
                </td>
                <td style={{ fontSize: 12 }}>{fmtFecha(r.fecha_solicitud)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(r)}><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <TransferenciaModal onClose={() => setModal(false)} onSaved={() => { setModal(false); fetchData() }} />}
      {detail && <TransferenciaDetail trans={detail} canAuth={canAuth} isAlmacenista={authUser?.rol === 'admin'} onClose={() => { setDetail(null); fetchData() }} onAuth={handleAuth} onEnviar={handleEnviar} />}
    </div>
  )
}

function TransferenciaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [almacenes, setAlms]  = useState<any[]>([])
  const [articulos, setArts]  = useState<any[]>([])
  const [form, setForm] = useState({
    id_almacen_origen:  '',
    id_almacen_destino: '',
    area_solicitante:   '',
    solicitante:        authUser?.nombre ?? '',
    justificacion:      '',
  })
  const [det, setDet] = useState<any[]>([{ id_articulo_fk: '', cantidad_solicitada: '1', unidad: 'PZA', notas: '' }])

  useEffect(() => {
    dbComp.from('almacenes').select('*').eq('activo', true).order('clave')
      .then(({ data }) => setAlms(data ?? []))
    dbComp.from('articulos').select('id, clave, nombre, unidad').eq('activo', true).order('nombre')
      .then(({ data }) => setArts(data ?? []))
  }, [])

  const setD = (i: number, k: string, v: string) =>
    setDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const aplicarArticulo = (i: number, artId: string) => {
    const art = articulos.find(a => a.id === Number(artId))
    setDet(d => d.map((x, j) => j === i ? { ...x, id_articulo_fk: artId, unidad: art?.unidad ?? x.unidad } : x))
  }

  const handleSave = async () => {
    if (!form.id_almacen_origen || !form.id_almacen_destino) { setError('Selecciona almacén origen y destino'); return }
    if (form.id_almacen_origen === form.id_almacen_destino) { setError('Origen y destino deben ser diferentes'); return }
    const detValidos = det.filter(d => d.id_articulo_fk && Number(d.cantidad_solicitada) > 0)
    if (!detValidos.length) { setError('Agrega al menos un artículo'); return }
    setSaving(true); setError('')

    const { count } = await dbComp.from('transferencias').select('id', { count: 'exact', head: true })
    const folio = folioGen('TRF', (count ?? 0) + 1)
    const { data: trf, error: err } = await dbComp.from('transferencias').insert({
      folio, id_almacen_origen: Number(form.id_almacen_origen),
      id_almacen_destino: Number(form.id_almacen_destino),
      area_solicitante: form.area_solicitante.trim(), solicitante: form.solicitante.trim(),
      justificacion: form.justificacion.trim() || null, status: 'Solicitada',
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

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Solicitud de Transferencia</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Almacén Origen *</label>
              <select className="select" value={form.id_almacen_origen}
                onChange={e => setForm(f => ({ ...f, id_almacen_origen: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div><label className="label">Almacén Destino *</label>
              <select className="select" value={form.id_almacen_destino}
                onChange={e => setForm(f => ({ ...f, id_almacen_destino: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {almacenes.filter(a => a.id.toString() !== form.id_almacen_origen)
                  .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Área Solicitante</label>
              <input className="input" value={form.area_solicitante}
                onChange={e => setForm(f => ({ ...f, area_solicitante: e.target.value }))} />
            </div>
            <div><label className="label">Solicitante</label>
              <input className="input" value={form.solicitante}
                onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))} />
            </div>
          </div>
          <div><label className="label">Justificación</label>
            <textarea className="input" rows={2} value={form.justificacion}
              onChange={e => setForm(f => ({ ...f, justificacion: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Artículos a Transferir</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 70px 28px', gap: 6, marginBottom: 2 }}>
            {['Artículo','Descripción','Cantidad','Unidad',''].map(h => (
              <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
            ))}
          </div>
          {det.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 70px 28px', gap: 6 }}>
              <select className="select" value={d.id_articulo_fk} onChange={e => aplicarArticulo(i, e.target.value)}>
                <option value="">— Seleccionar —</option>
                {articulos.map(a => <option key={a.id} value={a.id}>{a.clave} — {a.nombre}</option>)}
              </select>
              <input className="input" value={d.notas} onChange={e => setD(i,'notas',e.target.value)} placeholder="Notas" />
              <input className="input" type="number" min="0.001" step="0.001" value={d.cantidad_solicitada}
                onChange={e => setD(i,'cantidad_solicitada',e.target.value)} style={{ textAlign: 'right' }} />
              <input className="input" value={d.unidad} onChange={e => setD(i,'unidad',e.target.value)} />
              <button className="btn-ghost" style={{ padding: '4px' }}
                onClick={() => setDet(d => d.filter((_,j)=>j!==i))}>✕</button>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => setDet(d => [...d, { id_articulo_fk:'', cantidad_solicitada:'1', unidad:'PZA', notas:'' }])}>
            <Plus size={12} /> Agregar artículo
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />} Enviar Solicitud
          </button>
        </div>
      </div>
    </div>
  )
}

function TransferenciaDetail({ trans, canAuth, isAlmacenista, onClose, onAuth, onEnviar }:
  { trans: any; canAuth: boolean; isAlmacenista: boolean; onClose: () => void; onAuth: (id: number, ap: boolean) => void; onEnviar: (t: any) => void }) {
  const [det, setDet]       = useState<any[]>([])
  const [almacenes, setAlms] = useState<Record<number, string>>({})
  const [artsMap, setArtsMap] = useState<Record<number, string>>({})

  useEffect(() => {
    dbComp.from('transferencias_det').select('*').eq('id_transferencia_fk', trans.id)
      .then(({ data }) => setDet(data ?? []))
    dbComp.from('almacenes').select('id, nombre')
      .then(({ data }) => {
        const m: Record<number, string> = {}
        ;(data ?? []).forEach((a: any) => { m[a.id] = a.nombre })
        setAlms(m)
      })
    dbComp.from('articulos').select('id, nombre, clave')
      .then(({ data }) => {
        const m: Record<number, string> = {}
        ;(data ?? []).forEach((a: any) => { m[a.id] = `${a.clave} — ${a.nombre}` })
        setArtsMap(m)
      })
  }, [trans.id])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{trans.folio}</span>
              <StatusBadge status={trans.status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {almacenes[trans.id_almacen_origen] ?? `Alm #${trans.id_almacen_origen}`}
              {' → '}
              {almacenes[trans.id_almacen_destino] ?? `Alm #${trans.id_almacen_destino}`}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            <DI label="Solicitante" value={`${trans.area_solicitante} · ${trans.solicitante}`} />
            <DI label="Fecha" value={fmtFecha(trans.fecha_solicitud)} />
            {trans.justificacion && <DI label="Justificación" value={trans.justificacion} />}
            {trans.autorizado_por && <DI label="Autorizado por" value={trans.autorizado_por} />}
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead><tr><th>Artículo</th><th style={{ textAlign: 'right' }}>Solicitado</th><th style={{ textAlign: 'right' }}>Enviado</th><th>Unidad</th></tr></thead>
              <tbody>
                {det.map((d,i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 13 }}>{artsMap[d.id_articulo_fk] ?? `Art #${d.id_articulo_fk}`}</td>
                    <td style={{ textAlign: 'right' }}>{d.cantidad_solicitada}</td>
                    <td style={{ textAlign: 'right', color: d.cantidad_enviada ? '#15803d' : 'var(--text-muted)' }}>{d.cantidad_enviada ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canAuth && trans.status === 'Solicitada' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => onAuth(trans.id, true)}><CheckCircle size={13} /> Autorizar</button>
              <button style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}
                onClick={() => onAuth(trans.id, false)}><XCircle size={13} /> Rechazar</button>
            </div>
          )}

          {isAlmacenista && trans.status === 'Autorizada' && (
            <button className="btn-primary" onClick={() => onEnviar(trans)}>
              <ArrowLeftRight size={13} /> Confirmar Envío de Mercancía
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const DI = ({ label, value }: { label: string; value?: string | null }) => value ? (
  <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div></div>
) : null
