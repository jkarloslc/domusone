'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, DollarSign, ChevronLeft, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 30

type ArrendCat   = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type ConceptoCat = { id: number; nombre: string; tipo: string; monto: number }

type Cargo = {
  id: number
  id_arrendatario_fk: number
  id_concepto_fk: number | null
  descripcion: string
  mes_aplicacion: string | null
  monto: number
  saldo: number
  fecha_vencimiento: string | null
  status: string
  notas: string | null
  created_at: string
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
  cat_conceptos_cuota?: { nombre: string }
}

const EMPTY_CARGO = {
  id_arrendatario_fk: null as number | null,
  id_concepto_fk: null as number | null,
  descripcion: '', mes_aplicacion: '', monto: 0, saldo: 0,
  fecha_vencimiento: '', status: 'Pendiente', notas: '',
}

const fmtNombreArr = (a?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}

const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Pendiente': { bg: '#fef9c3', color: '#ca8a04' },
  'Pagado':    { bg: '#dcfce7', color: '#16a34a' },
  'Vencido':   { bg: '#fee2e2', color: '#dc2626' },
  'Cancelado': { bg: '#f8fafc', color: '#64748b' },
}

export default function CobranzaPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('hipico-cobranza')

  const [cargos, setCargos]     = useState<Cargo[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [filtroStatus, setFiltroStatus] = useState<string>('Pendiente')
  const [filtroArr, setFiltroArr]       = useState<number | ''>('')
  const [loading, setLoading]   = useState(true)

  // Nuevo cargo modal
  const [showCargo, setShowCargo] = useState(false)
  const [formCargo, setFormCargo] = useState<typeof EMPTY_CARGO>(EMPTY_CARGO)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  const [arrendatarios, setArrendatarios] = useState<ArrendCat[]>([])
  const [conceptos, setConceptos]         = useState<ConceptoCat[]>([])

  // KPIs
  const [kpis, setKpis] = useState({ pendiente: 0, vencido: 0, pagado: 0, total_cargos: 0 })

  useEffect(() => {
    dbHip.from('cat_arrendatarios').select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
    ;dbHip.from('cat_conceptos_cuota').select('id, nombre, tipo, monto').eq('activo', true).order('nombre')
      .then(({ data }: any) => setConceptos(data ?? []))
    // KPIs globales
    ;dbHip.from('ctrl_cargos').select('status, monto, saldo')
      .then(({ data }: any) => {
        const all = (data ?? []) as { status: string; monto: number; saldo: number }[]
        setKpis({
          pendiente:    all.filter(x => x.status === 'Pendiente').reduce((s, x) => s + x.saldo, 0),
          vencido:      all.filter(x => x.status === 'Vencido').reduce((s, x) => s + x.saldo, 0),
          pagado:       all.filter(x => x.status === 'Pagado').reduce((s, x) => s + x.monto, 0),
          total_cargos: all.length,
        })
      })
  }, [])

  const fetchCargos = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = dbHip
      .from('ctrl_cargos')
      .select('*, cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), cat_conceptos_cuota(nombre)', { count: 'exact' })
      .order('fecha_vencimiento', { ascending: true })
      .range(from, to)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    if (filtroArr !== '') q = q.eq('id_arrendatario_fk', filtroArr)
    const { data, count } = await q
    setCargos((data as Cargo[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filtroStatus, filtroArr])

  useEffect(() => { fetchCargos() }, [fetchCargos])

  const openNuevoCargo = () => { setFormCargo(EMPTY_CARGO); setErr(''); setShowCargo(true) }

  const handleConceptoChange = (idStr: string) => {
    const id = idStr ? Number(idStr) : null
    const concepto = conceptos.find(c => c.id === id)
    setFormCargo(f => ({
      ...f,
      id_concepto_fk: id,
      descripcion: concepto?.nombre ?? f.descripcion,
      monto: concepto?.monto ?? f.monto,
      saldo: concepto?.monto ?? f.saldo,
    }))
  }

  const handleSaveCargo = async () => {
    if (!formCargo.id_arrendatario_fk) { setErr('Selecciona un arrendatario'); return }
    if (!formCargo.descripcion.trim())  { setErr('La descripción es obligatoria'); return }
    if (formCargo.monto <= 0)            { setErr('El monto debe ser mayor a 0'); return }
    setSaving(true); setErr('')
    const payload = {
      id_arrendatario_fk: formCargo.id_arrendatario_fk,
      id_concepto_fk: formCargo.id_concepto_fk ?? null,
      descripcion: formCargo.descripcion.trim(),
      mes_aplicacion: formCargo.mes_aplicacion || null,
      monto: formCargo.monto,
      saldo: formCargo.monto,  // saldo inicial = monto completo
      fecha_vencimiento: formCargo.fecha_vencimiento || null,
      status: 'Pendiente',
      notas: formCargo.notas || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await dbHip.from('ctrl_cargos').insert(payload)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowCargo(false)
    fetchCargos()
  }

  const marcarPagado = async (cargo: Cargo) => {
    if (!confirm(`¿Marcar "${cargo.descripcion}" como Pagado?`)) return
    await dbHip.from('ctrl_cargos').update({ status: 'Pagado', saldo: 0, updated_at: new Date().toISOString() }).eq('id', cargo.id)
    fetchCargos()
  }

  const totalPags = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/hipico" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
          <ChevronLeft size={14} /> Hípico
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Cobranza Hípico</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchCargos}><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNuevoCargo}><Plus size={13} /> Cargo</button>}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Por Cobrar', value: fmt$(kpis.pendiente), icon: <Clock size={14} />, color: '#ca8a04', bg: '#fefce8' },
          { label: 'Vencido',    value: fmt$(kpis.vencido),   icon: <AlertCircle size={14} />, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Pagado',     value: fmt$(kpis.pagado),    icon: <CheckCircle size={14} />, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Total Cargos', value: kpis.total_cargos.toString(), icon: <DollarSign size={14} />, color: '#2563eb', bg: '#eff6ff' },
        ].map(k => (
          <div key={k.label} className="card" style={{ flex: '1 1 160px', padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, flexShrink: 0 }}>
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <select className="input" value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(0) }} style={{ fontSize: 12 }}>
            <option value="">Todos los status</option>
            {['Pendiente', 'Vencido', 'Pagado', 'Cancelado'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <select className="input" value={filtroArr} onChange={e => { setFiltroArr(e.target.value ? Number(e.target.value) : ''); setPage(0) }} style={{ fontSize: 12, minWidth: 200 }}>
            <option value="">Todos los arrendatarios</option>
            {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{total} cargo{total !== 1 ? 's' : ''}</div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
              {['Arrendatario', 'Descripción', 'Mes', 'Vencimiento', 'Monto', 'Saldo', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
            ) : cargos.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin cargos</td></tr>
            ) : cargos.map((c, i) => {
              const sc = STATUS_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
              const vencido = c.fecha_vencimiento && c.status === 'Pendiente' && new Date(c.fecha_vencimiento) < new Date()
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{fmtNombreArr(c.cat_arrendatarios)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{c.descripcion}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{c.mes_aplicacion ? new Date(c.mes_aplicacion + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'}</td>
                  <td style={{ padding: '10px 14px', color: vencido ? '#dc2626' : 'var(--text-muted)', fontWeight: vencido ? 600 : 400, fontSize: 12 }}>{fmtFecha(c.fecha_vencimiento)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(c.monto)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: c.saldo > 0 ? '#dc2626' : '#16a34a' }}>{fmt$(c.saldo)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {puedeEscribir && c.status === 'Pendiente' && (
                      <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 11, color: '#16a34a' }} onClick={() => marcarPagado(c)}>
                        <CheckCircle size={13} /> Cobrar
                      </button>
                    )}
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

      {/* Modal nuevo cargo */}
      {showCargo && (
        <ModalShell modulo="hipico" titulo="Nuevo Cargo" onClose={() => setShowCargo(false)} maxWidth={560}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowCargo(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveCargo} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Arrendatario */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario *</label>
              <select className="input" value={formCargo.id_arrendatario_fk ?? ''} onChange={e => setFormCargo(f => ({ ...f, id_arrendatario_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Seleccionar —</option>
                {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
              </select>
            </div>

            {/* Concepto */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Concepto (opcional)</label>
              <select className="input" value={formCargo.id_concepto_fk ?? ''} onChange={e => handleConceptoChange(e.target.value)} style={{ width: '100%' }}>
                <option value="">— Sin concepto —</option>
                {conceptos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            {/* Descripción */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Descripción *</label>
              <input className="input" value={formCargo.descripcion} onChange={e => setFormCargo(f => ({ ...f, descripcion: e.target.value }))} style={{ width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Monto *</label>
              <input className="input" type="number" value={formCargo.monto} onChange={e => setFormCargo(f => ({ ...f, monto: Number(e.target.value) }))} style={{ width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Mes Aplicación</label>
              <input className="input" type="date" value={formCargo.mes_aplicacion} onChange={e => setFormCargo(f => ({ ...f, mes_aplicacion: e.target.value }))} style={{ width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha Vencimiento</label>
              <input className="input" type="date" value={formCargo.fecha_vencimiento} onChange={e => setFormCargo(f => ({ ...f, fecha_vencimiento: e.target.value }))} style={{ width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea className="input" rows={2} value={formCargo.notas} onChange={e => setFormCargo(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
            </div>

            {err && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
