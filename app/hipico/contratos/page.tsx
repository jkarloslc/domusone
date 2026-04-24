'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, Edit2, Trash2, Eye, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 25

type ArrendCat  = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type CabCat     = { id: number; clave: string; nombre: string | null }

export type Contrato = {
  id: number
  folio: string
  id_arrendatario_fk: number
  id_caballeriza_fk: number
  fecha_inicio: string
  fecha_fin: string | null
  renta_mensual: number
  deposito_garantia: number | null
  moneda: string
  dia_pago: number | null
  status: string
  notas: string | null
  created_at: string
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
  cat_caballerizas?: { clave: string; nombre: string | null }
}

const EMPTY = {
  folio: '', id_arrendatario_fk: null as number | null, id_caballeriza_fk: null as number | null,
  fecha_inicio: '', fecha_fin: '', renta_mensual: 0, deposito_garantia: 0,
  moneda: 'MXN', dia_pago: 1, status: 'Vigente', notas: '',
}

const fmtNombreArr = (a?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}

const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmt$ = (v: number | null) => v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Vigente':          { bg: '#dcfce7', color: '#16a34a' },
  'Vencido':          { bg: '#fee2e2', color: '#dc2626' },
  'Cancelado':        { bg: '#f8fafc', color: '#64748b' },
  'En negociación':   { bg: '#fef9c3', color: '#ca8a04' },
}

export default function ContratosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('hipico-contratos')
  const puedeEliminar = canDelete()

  const [items, setItems]       = useState<Contrato[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Contrato | null>(null)
  const [detailItem, setDetailItem] = useState<Contrato | null>(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState<typeof EMPTY>(EMPTY)
  const [err, setErr]           = useState('')

  const [arrendatarios, setArrendatarios] = useState<ArrendCat[]>([])
  const [caballerizas, setCaballerizas]   = useState<CabCat[]>([])

  useEffect(() => {
    (dbHip as any).from('cat_arrendatarios').select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
    ;(dbHip as any).from('cat_caballerizas').select('id, clave, nombre').eq('activo', true).order('clave')
      .then(({ data }: any) => setCaballerizas(data ?? []))
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    const { data, count } = await (dbHip as any)
      .from('ctrl_contratos')
      .select('*, cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), cat_caballerizas(clave, nombre)', { count: 'exact' })
      .order('fecha_inicio', { ascending: false })
      .range(from, to)
    setItems((data as Contrato[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page])

  useEffect(() => { fetchItems() }, [fetchItems])

  const genFolio = () => `HIP-${new Date().getFullYear()}-${String(total + 1).padStart(3, '0')}`

  const openNew = () => { setForm({ ...EMPTY, folio: genFolio() }); setEditItem(null); setErr(''); setShowModal(true) }
  const openEdit = (c: Contrato) => {
    setForm({
      folio: c.folio, id_arrendatario_fk: c.id_arrendatario_fk, id_caballeriza_fk: c.id_caballeriza_fk,
      fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin ?? '',
      renta_mensual: c.renta_mensual, deposito_garantia: c.deposito_garantia ?? 0,
      moneda: c.moneda, dia_pago: c.dia_pago ?? 1, status: c.status, notas: c.notas ?? '',
    })
    setEditItem(c); setErr(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.folio.trim()) { setErr('El folio es obligatorio'); return }
    if (!form.id_arrendatario_fk) { setErr('Selecciona un arrendatario'); return }
    if (!form.id_caballeriza_fk)  { setErr('Selecciona una caballeriza'); return }
    if (!form.fecha_inicio)        { setErr('Fecha de inicio obligatoria'); return }
    setSaving(true); setErr('')
    const payload = {
      folio: form.folio.trim().toUpperCase(),
      id_arrendatario_fk: form.id_arrendatario_fk,
      id_caballeriza_fk: form.id_caballeriza_fk,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
      renta_mensual: form.renta_mensual,
      deposito_garantia: form.deposito_garantia ?? null,
      moneda: form.moneda,
      dia_pago: form.dia_pago ?? 1,
      status: form.status,
      notas: form.notas || null,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editItem) {
      ;({ error } = await (dbHip as any).from('ctrl_contratos').update(payload).eq('id', editItem.id))
    } else {
      ;({ error } = await (dbHip as any).from('ctrl_contratos').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false)
    fetchItems()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este contrato?')) return
    setDeleting(id)
    await (dbHip as any).from('ctrl_contratos').delete().eq('id', id)
    setDeleting(null)
    fetchItems()
  }

  const totalPags = Math.ceil(total / PAGE_SIZE)

  const Num = (label: string, key: 'renta_mensual' | 'deposito_garantia' | 'dia_pago', opts?: { half?: boolean }) => (
    <div style={{ gridColumn: opts?.half ? 'span 1' : 'span 2' }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input className="input" type="number" value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} style={{ width: '100%' }} />
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/hipico" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
          <ChevronLeft size={14} /> Hípico
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Contratos de Arrendamiento</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchItems}><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNew}><Plus size={13} /> Nuevo</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        {total} contrato{total !== 1 ? 's' : ''}
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
              {['Folio', 'Arrendatario', 'Caballeriza', 'Renta Mensual', 'Inicio', 'Fin', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin contratos</td></tr>
            ) : items.map((c, i) => {
              const sc = STATUS_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--gold-light)' }}>{c.folio}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{fmtNombreArr(c.cat_arrendatarios)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{c.cat_caballerizas?.clave ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(c.renta_mensual)} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.moneda}</span></td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{fmtFecha(c.fecha_inicio)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{fmtFecha(c.fecha_fin)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setDetailItem(c)}><Eye size={13} /></button>
                      {puedeEscribir && <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => openEdit(c)}><Edit2 size={13} /></button>}
                      {puedeEliminar && <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} disabled={deleting === c.id} onClick={() => handleDelete(c.id)}><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPags > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Pág. {page + 1} / {totalPags}</span>
          <button className="btn-ghost" disabled={page >= totalPags - 1} onClick={() => setPage(p => p + 1)}>Siguiente</button>
        </div>
      )}

      {/* Detalle */}
      {detailItem && (
        <ModalShell modulo="hipico" titulo={detailItem.folio} subtitulo={`${fmtNombreArr(detailItem.cat_arrendatarios)} · ${detailItem.cat_caballerizas?.clave ?? ''}`}
          onClose={() => setDetailItem(null)} maxWidth={520}
          footer={puedeEscribir ? <button className="btn-secondary" onClick={() => { setDetailItem(null); openEdit(detailItem) }}><Edit2 size={13} /> Editar</button> : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              ['Arrendatario', fmtNombreArr(detailItem.cat_arrendatarios)],
              ['Caballeriza', detailItem.cat_caballerizas ? `${detailItem.cat_caballerizas.clave}${detailItem.cat_caballerizas.nombre ? ' — ' + detailItem.cat_caballerizas.nombre : ''}` : null],
              ['Renta Mensual', `${fmt$(detailItem.renta_mensual)} ${detailItem.moneda}`],
              ['Depósito Garantía', fmt$(detailItem.deposito_garantia)],
              ['Día de pago', detailItem.dia_pago ? `Día ${detailItem.dia_pago} de cada mes` : null],
              ['Vigencia', `${fmtFecha(detailItem.fecha_inicio)} → ${fmtFecha(detailItem.fecha_fin)}`],
              ['Status', detailItem.status],
              ['Notas', detailItem.notas],
            ] as [string, string | null][]).map(([label, val]) => val ? (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }}>{val}</span>
              </div>
            ) : null)}
          </div>
        </ModalShell>
      )}

      {/* Form modal */}
      {showModal && (
        <ModalShell modulo="hipico" titulo={editItem ? `Editar — ${editItem.folio}` : 'Nuevo Contrato'}
          onClose={() => setShowModal(false)} maxWidth={640}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Folio */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Folio *</label>
              <input className="input" value={form.folio} onChange={e => setForm(f => ({ ...f, folio: e.target.value }))} style={{ width: '100%' }} />
            </div>

            {/* Status */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                {['Vigente', 'Vencido', 'Cancelado', 'En negociación'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* Arrendatario */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario *</label>
              <select className="input" value={form.id_arrendatario_fk ?? ''} onChange={e => setForm(f => ({ ...f, id_arrendatario_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Seleccionar —</option>
                {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
              </select>
            </div>

            {/* Caballeriza */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Caballeriza *</label>
              <select className="input" value={form.id_caballeriza_fk ?? ''} onChange={e => setForm(f => ({ ...f, id_caballeriza_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Seleccionar —</option>
                {caballerizas.map(c => <option key={c.id} value={c.id}>{c.clave}{c.nombre ? ` — ${c.nombre}` : ''}</option>)}
              </select>
            </div>

            {/* Fechas */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha Inicio *</label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha Fin</label>
              <input className="input" type="date" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} style={{ width: '100%' }} />
            </div>

            {Num('Renta Mensual *', 'renta_mensual', { half: true })}
            {Num('Depósito Garantía', 'deposito_garantia', { half: true })}

            {/* Moneda */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Moneda</label>
              <select className="input" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} style={{ width: '100%' }}>
                {['MXN', 'USD'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>

            {Num('Día de Pago', 'dia_pago', { half: true })}

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea className="input" rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
            </div>

            {err && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
