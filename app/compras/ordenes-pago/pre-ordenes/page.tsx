'use client'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { dbComp, dbCfg, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useCatalogoTiposGasto } from '@/lib/tiposGasto'
import { useDebounce } from '@/lib/useDebounce'
import { Plus, Search, RefreshCw, Eye, Edit2, X, Loader, Upload, ExternalLink, CheckCircle, Send, Ban, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, nextFolio } from '../../types'
import ModalShell from '@/components/ui/ModalShell'
import PageHeader from '@/components/layout/PageHeader'

const ESQUEMAS = ['Factura previa al pago', 'Factura posterior al pago'] as const
const URGENCIAS = ['Crítica', 'Alta', 'Media', 'Baja'] as const
const STATUS_COLOR: Record<string, string> = {
  Borrador: '#64748b', Vigente: '#2563eb', Convertida: '#15803d', Descartada: '#94a3b8', Vencida: '#dc2626',
}
const hoy = () => new Date().toISOString().slice(0, 10)
const mesKey = (f: string) => f.slice(0, 7)
const mesLabel = (k: string) => {
  const [y, m] = k.split('-')
  return `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][Number(m) - 1]} ${y}`
}

// Vencida = cotización con vigencia pasada que aún no se convirtió ni descartó
const statusVisible = (r: any) =>
  (r.status === 'Borrador' || r.status === 'Vigente') && r.vigencia_cotizacion && r.vigencia_cotizacion < hoy()
    ? 'Vencida' : r.status

const Badge = ({ s }: { s: string }) => (
  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, color: STATUS_COLOR[s] ?? '#64748b',
    background: `${STATUS_COLOR[s] ?? '#64748b'}14`, border: `1px solid ${STATUS_COLOR[s] ?? '#64748b'}40` }}>{s}</span>
)

const FORM0 = {
  id_proveedor_fk: '', proveedor_prospecto: '', concepto: '', subtotal: '', iva: '', monto: '',
  fecha_estimada_pago: '', vigencia_cotizacion: '', esquema_comprobante: ESQUEMAS[0] as string,
  id_centro_costo_fk: '', id_area_fk: '', id_frente_fk: '', id_tipo_gasto_fk: '',
  urgencia: 'Media', adjunto_cotizacion: '', notas: '',
}

export default function PreOrdenesPage() {
  const router = useRouter()
  const { canWrite, canAuth, authUser } = useAuth()
  const catTG = useCatalogoTiposGasto()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debSearch = useDebounce(search, 300)
  const [filterStatus, setFilterStatus] = useState('')
  const [provs, setProvs] = useState<{ id: number; nombre: string }[]>([])
  const [ccs, setCcs] = useState<any[]>([])
  const [areas, setAreas] = useState<any[]>([])
  const [frentes, setFrentes] = useState<any[]>([])
  const [modal, setModal] = useState<{ row: any | null; ver: boolean } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('pre_ordenes_pago').select('*').order('fecha_estimada_pago', { ascending: true })
    if (debSearch) q = q.or(`folio.ilike.%${debSearch}%,concepto.ilike.%${debSearch}%,proveedor_prospecto.ilike.%${debSearch}%`)
    const { data, error } = await q
    if (error) alert('Error al cargar pre-órdenes: ' + error.message)
    setRows(data ?? [])
    setLoading(false)
  }, [debSearch])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    dbComp.from('proveedores').select('id, nombre').order('nombre').then(({ data }) => setProvs((data ?? []) as any))
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => setCcs(data ?? []))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre').then(({ data }) => setAreas(data ?? []))
    dbCfg.from('frentes').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => setFrentes(data ?? []))
  }, [])

  const provN = useMemo(() => Object.fromEntries(provs.map(p => [p.id, p.nombre])), [provs])
  const ccN = useMemo(() => Object.fromEntries(ccs.map((c: any) => [c.id, c.nombre])), [ccs])
  const arN = useMemo(() => Object.fromEntries(areas.map((a: any) => [a.id, a.nombre])), [areas])

  const filtradas = rows.filter(r => !filterStatus || statusVisible(r) === filterStatus)

  // Exposición futura por mes: solo Borrador/Vigente no vencidas
  const porMes = useMemo(() => {
    const m: Record<string, { vigente: number; borrador: number }> = {}
    rows.forEach(r => {
      const s = statusVisible(r)
      if (s !== 'Vigente' && s !== 'Borrador') return
      const k = mesKey(r.fecha_estimada_pago)
      m[k] ||= { vigente: 0, borrador: 0 }
      m[k][s === 'Vigente' ? 'vigente' : 'borrador'] += Number(r.monto) || 0
    })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])
  const totVig = rows.filter(r => statusVisible(r) === 'Vigente').reduce((a, r) => a + (Number(r.monto) || 0), 0)
  const totBor = rows.filter(r => statusVisible(r) === 'Borrador').reduce((a, r) => a + (Number(r.monto) || 0), 0)

  const cambiarStatus = async (r: any, patch: any, msg?: string) => {
    if (msg && !confirm(msg)) return
    const { error } = await dbComp.from('pre_ordenes_pago').update(patch).eq('id', r.id)
    if (error) { alert('Error: ' + error.message); return }
    fetchData()
  }

  const descartar = async (r: any) => {
    const motivo = prompt('Motivo del descarte:')
    if (!motivo?.trim()) return
    await cambiarStatus(r, { status: 'Descartada', motivo_descarte: motivo.trim() })
  }

  const convertir = async (r: any) => {
    if (!r.id_proveedor_fk) { alert('Para convertir a OP el proveedor debe estar en el catálogo. Edita la pre-orden y selecciona uno.'); return }
    if (!confirm(`Convertir ${r.folio} en Orden de Pago por ${fmt(r.monto)}?\nLa OP nace en "Pendiente Auth" y sigue el flujo normal de doble autorización.`)) return
    try {
      const folio = await nextFolio(dbComp, 'OP')
      const { data: op, error } = await dbComp.from('ordenes_pago').insert({
        folio, status: 'Pendiente Auth',
        id_proveedor_fk: r.id_proveedor_fk, forma_pago: 'Transferencia',
        concepto: r.concepto, monto: r.monto, subtotal: r.subtotal, iva: r.iva,
        fecha_vencimiento: r.fecha_estimada_pago,
        id_centro_costo_fk: r.id_centro_costo_fk, id_area_fk: r.id_area_fk, id_frente_fk: r.id_frente_fk,
        id_tipo_gasto_fk: r.id_tipo_gasto_fk, urgencia: r.urgencia,
        soporte_url: r.adjunto_cotizacion, notas: r.notas,
        esquema_comprobante: r.esquema_comprobante, id_pre_orden_fk: r.id,
        created_by: authUser?.nombre ?? null, created_by_id: authUser?.user.id ?? null,
      }).select('id, folio').single()
      if (error) throw error
      const { error: e2 } = await dbComp.from('pre_ordenes_pago').update({
        status: 'Convertida', id_op_fk: op.id, convertido_por: authUser?.nombre ?? null, fecha_conversion: new Date().toISOString(),
      }).eq('id', r.id)
      if (e2) throw e2
      alert(`Se generó ${op.folio} en Pendiente Auth.`)
      fetchData()
    } catch (e: any) { alert('Error al convertir: ' + (e.message ?? e)) }
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <PageHeader
        onBack={() => router.push('/compras/ordenes-pago')}
        title="Pre-órdenes de Pago"
        subtitle="Compromisos futuros cotizados · no afectan CXP, Flujo ni Presupuesto"
        actions={canWrite('ordenes-pago') ? (
          <button className="btn-primary" onClick={() => setModal({ row: null, ver: false })}><Plus size={14} /> Nueva Pre-orden</button>
        ) : undefined}
      />

      {/* Exposición futura */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 16px', flex: '1 1 180px', maxWidth: 240 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Vigentes (autorizadas)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: STATUS_COLOR.Vigente }}>{fmt(totVig)}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', flex: '1 1 180px', maxWidth: 240 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Borradores</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: STATUS_COLOR.Borrador }}>{fmt(totBor)}</div>
        </div>
        {porMes.slice(0, 6).map(([k, v]) => (
          <div key={k} className="card" style={{ padding: '12px 16px', flex: '1 1 150px', maxWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mesLabel(k)}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(v.vigente + v.borrador)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Vigente {fmt(v.vigente)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, concepto, proveedor…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 170 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todas</option>
          {['Borrador', 'Vigente', 'Vencida', 'Convertida', 'Descartada'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Folio</th><th>Proveedor</th><th>Concepto</th><th>CC / Área</th>
                <th style={{ width: 110 }}>Pago est.</th><th style={{ width: 110 }}>Vigencia</th>
                <th>Comprobante</th>
                <th style={{ textAlign: 'right', width: 110 }}>Monto</th><th style={{ width: 100 }}>Status</th>
                <th style={{ width: 150 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" /></td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin pre-órdenes</td></tr>
              ) : filtradas.map(r => {
                const st = statusVisible(r)
                const editable = r.status === 'Borrador' || r.status === 'Vigente'
                return (
                  <tr key={r.id} style={{ opacity: st === 'Descartada' ? 0.5 : 1 }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.folio}</td>
                    <td>{r.id_proveedor_fk ? provN[r.id_proveedor_fk] : <span style={{ fontStyle: 'italic' }}>{r.proveedor_prospecto} (prospecto)</span>}</td>
                    <td>{r.concepto}</td>
                    <td style={{ fontSize: 12 }}>{[ccN[r.id_centro_costo_fk], arN[r.id_area_fk]].filter(Boolean).join(' / ') || '—'}</td>
                    <td>{fmtFecha(r.fecha_estimada_pago)}</td>
                    <td>{r.vigencia_cotizacion ? fmtFecha(r.vigencia_cotizacion) : '—'}</td>
                    <td style={{ fontSize: 11 }}>{r.esquema_comprobante === ESQUEMAS[0] ? 'Previa' : 'Posterior'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto)}</td>
                    <td><Badge s={st} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-ghost" title="Ver" style={{ padding: '4px 6px' }} onClick={() => setModal({ row: r, ver: true })}><Eye size={13} /></button>
                        {editable && canWrite('ordenes-pago') && (
                          <button className="btn-ghost" title="Editar" style={{ padding: '4px 6px' }} onClick={() => setModal({ row: r, ver: false })}><Edit2 size={13} /></button>
                        )}
                        {r.status === 'Borrador' && canAuth() && (
                          <button className="btn-ghost" title="Marcar Vigente" style={{ padding: '4px 6px', color: STATUS_COLOR.Vigente }}
                            onClick={() => cambiarStatus(r, { status: 'Vigente', autorizado_por: authUser?.nombre ?? null, fecha_autorizacion: new Date().toISOString() }, `¿Marcar ${r.folio} como Vigente?`)}><CheckCircle size={13} /></button>
                        )}
                        {r.status === 'Vigente' && canAuth() && (
                          <button className="btn-ghost" title="Convertir a OP" style={{ padding: '4px 6px', color: '#15803d' }} onClick={() => convertir(r)}><Send size={13} /></button>
                        )}
                        {editable && canAuth() && (
                          <button className="btn-ghost" title="Descartar" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => descartar(r)}><Ban size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <PreOrdenModal row={modal.row} soloVer={modal.ver} provs={provs} ccs={ccs} areas={areas} frentes={frentes}
          tiposGasto={catTG.activos} provN={provN}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />
      )}
    </div>
  )
}

function PreOrdenModal({ row, soloVer, provs, ccs, areas, frentes, tiposGasto, provN, onClose, onSaved }: any) {
  const { authUser } = useAuth()
  const [form, setForm] = useState<any>(() => row ? {
    id_proveedor_fk: row.id_proveedor_fk ?? '', proveedor_prospecto: row.proveedor_prospecto ?? '', concepto: row.concepto ?? '',
    subtotal: row.subtotal ?? '', iva: row.iva ?? '', monto: row.monto ?? '',
    fecha_estimada_pago: row.fecha_estimada_pago ?? '', vigencia_cotizacion: row.vigencia_cotizacion ?? '',
    esquema_comprobante: row.esquema_comprobante, id_centro_costo_fk: row.id_centro_costo_fk ?? '', id_area_fk: row.id_area_fk ?? '',
    id_frente_fk: row.id_frente_fk ?? '', id_tipo_gasto_fk: row.id_tipo_gasto_fk ?? '', urgencia: row.urgencia ?? 'Media',
    adjunto_cotizacion: row.adjunto_cotizacion ?? '', notas: row.notas ?? '',
  } : FORM0)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const ro = soloVer

  // Monto = Subtotal + IVA cuando se capturan ambos; si no, captura directa
  const setMonto = (k: 'subtotal' | 'iva', v: string) => setForm((f: any) => {
    const n = { ...f, [k]: v }
    const s = Number(n.subtotal) || 0, i = Number(n.iva) || 0
    if (n.subtotal !== '') n.monto = +(s + i).toFixed(2)
    return n
  })

  const upload = async (file: File) => {
    setUploading(true)
    const path = `pre-op/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: e } = await supabase.storage.from('cxp-docs').upload(path, file, { upsert: true })
    if (e) { setError('Error al subir archivo: ' + e.message); setUploading(false); return }
    set('adjunto_cotizacion', supabase.storage.from('cxp-docs').getPublicUrl(path).data.publicUrl)
    setUploading(false)
  }

  const save = async () => {
    setError('')
    if (!form.concepto.trim()) return setError('El concepto es obligatorio')
    if (!form.id_proveedor_fk && !form.proveedor_prospecto.trim()) return setError('Indica un proveedor del catálogo o un prospecto')
    if (!form.fecha_estimada_pago) return setError('La fecha estimada de pago es obligatoria')
    if (!(Number(form.monto) > 0)) return setError('El monto debe ser mayor a 0')
    setSaving(true)
    const payload: any = {
      id_proveedor_fk: form.id_proveedor_fk ? Number(form.id_proveedor_fk) : null,
      proveedor_prospecto: form.id_proveedor_fk ? null : form.proveedor_prospecto.trim(),
      concepto: form.concepto.trim(), monto: Number(form.monto),
      subtotal: form.subtotal !== '' ? Number(form.subtotal) : null, iva: form.iva !== '' ? Number(form.iva) : null,
      fecha_estimada_pago: form.fecha_estimada_pago, vigencia_cotizacion: form.vigencia_cotizacion || null,
      esquema_comprobante: form.esquema_comprobante,
      id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      id_area_fk: form.id_area_fk ? Number(form.id_area_fk) : null,
      id_frente_fk: form.id_frente_fk ? Number(form.id_frente_fk) : null,
      id_tipo_gasto_fk: form.id_tipo_gasto_fk ? Number(form.id_tipo_gasto_fk) : null,
      urgencia: form.urgencia || null, adjunto_cotizacion: form.adjunto_cotizacion || null, notas: form.notas.trim() || null,
    }
    const { error: err } = row
      ? await dbComp.from('pre_ordenes_pago').update(payload).eq('id', row.id)
      : await dbComp.from('pre_ordenes_pago').insert({ ...payload, created_by: authUser?.nombre ?? null, created_by_id: authUser?.user.id ?? null })
    setSaving(false)
    if (err) return setError(err.message)
    onSaved()
  }

  const Field = ({ label, children, w }: any) => (
    <div style={{ flex: w ?? '1 1 220px' }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
  const areasCC = areas.filter((a: any) => !form.id_centro_costo_fk || a.id_centro_costo_fk === Number(form.id_centro_costo_fk))

  return (
    <ModalShell modulo="compras" titulo={row ? row.folio : 'Nueva Pre-orden de Pago'}
      subtitulo={ro ? 'Consulta' : 'No genera CXP ni afecta Flujo/Presupuesto hasta convertirse en OP'}
      size="lg" onClose={onClose}
      footer={ro ? <button className="btn-ghost" onClick={onClose}>Cerrar</button> : (
        <>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving || uploading}>{saving ? <Loader size={13} className="animate-spin" /> : null} Guardar</button>
        </>
      )}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <Field label="Proveedor (catálogo)">
          <select className="select" disabled={ro} value={form.id_proveedor_fk} onChange={e => set('id_proveedor_fk', e.target.value)}>
            <option value="">— Prospecto (sin alta) —</option>
            {provs.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Field>
        {!form.id_proveedor_fk && (
          <Field label="Proveedor prospecto"><input className="input" disabled={ro} value={form.proveedor_prospecto} onChange={e => set('proveedor_prospecto', e.target.value)} /></Field>
        )}
        <Field label="Concepto / servicio cotizado" w="1 1 100%"><input className="input" disabled={ro} value={form.concepto} onChange={e => set('concepto', e.target.value)} /></Field>
        <Field label="Subtotal" w="1 1 140px"><input className="input" type="number" disabled={ro} value={form.subtotal} onChange={e => setMonto('subtotal', e.target.value)} /></Field>
        <Field label="IVA" w="1 1 140px"><input className="input" type="number" disabled={ro} value={form.iva} onChange={e => setMonto('iva', e.target.value)} /></Field>
        <Field label="Monto total" w="1 1 140px"><input className="input" type="number" disabled={ro} value={form.monto} onChange={e => set('monto', e.target.value)} /></Field>
        <Field label="Fecha estimada de pago" w="1 1 160px"><input className="input" type="date" disabled={ro} value={form.fecha_estimada_pago} onChange={e => set('fecha_estimada_pago', e.target.value)} /></Field>
        <Field label="Vigencia de la cotización" w="1 1 160px"><input className="input" type="date" disabled={ro} value={form.vigencia_cotizacion} onChange={e => set('vigencia_cotizacion', e.target.value)} /></Field>
        <Field label="Comprobante" w="1 1 220px">
          <select className="select" disabled={ro} value={form.esquema_comprobante} onChange={e => set('esquema_comprobante', e.target.value)}>
            {ESQUEMAS.map(e => <option key={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="Centro de costo">
          <select className="select" disabled={ro} value={form.id_centro_costo_fk} onChange={e => { set('id_centro_costo_fk', e.target.value); set('id_area_fk', '') }}>
            <option value="">—</option>{ccs.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Área">
          <select className="select" disabled={ro} value={form.id_area_fk} onChange={e => set('id_area_fk', e.target.value)}>
            <option value="">—</option>{areasCC.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Field>
        <Field label="Frente">
          <select className="select" disabled={ro} value={form.id_frente_fk} onChange={e => set('id_frente_fk', e.target.value)}>
            <option value="">—</option>{frentes.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </Field>
        <Field label="Tipo de gasto">
          <select className="select" disabled={ro} value={form.id_tipo_gasto_fk} onChange={e => set('id_tipo_gasto_fk', e.target.value)}>
            <option value="">—</option>{tiposGasto.map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Field>
        <Field label="Urgencia" w="1 1 140px">
          <select className="select" disabled={ro} value={form.urgencia} onChange={e => set('urgencia', e.target.value)}>
            {URGENCIAS.map(u => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Cotización adjunta" w="1 1 100%">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {form.adjunto_cotizacion && (
              <a href={form.adjunto_cotizacion} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><ExternalLink size={12} /> Ver archivo</a>
            )}
            {!ro && (
              <label className="btn-ghost" style={{ cursor: 'pointer', fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                {uploading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />} {form.adjunto_cotizacion ? 'Reemplazar' : 'Adjuntar'}
                <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            )}
          </div>
        </Field>
        <Field label="Notas" w="1 1 100%"><textarea className="input" rows={2} disabled={ro} value={form.notas} onChange={e => set('notas', e.target.value)} /></Field>
        {ro && row?.id_op_fk && <div style={{ fontSize: 12 }}>Convertida a OP (id {row.id_op_fk}) por {row.convertido_por}</div>}
        {ro && row?.motivo_descarte && <div style={{ fontSize: 12, color: '#dc2626' }}>Descartada: {row.motivo_descarte}</div>}
        {error && <div style={{ color: '#dc2626', fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><AlertTriangle size={13} /> {error}</div>}
      </div>
    </ModalShell>
  )
}
