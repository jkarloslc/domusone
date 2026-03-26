'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, Printer, CheckCircle, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge, FORMAS_PAGO_COMP } from '../types'

const PAGE_SIZE = 25

// ── Tipos de gasto para OPs sin OC ────────────────────────────
const TIPOS_GASTO = [
  'Servicios Profesionales', 'Mantenimiento', 'Reparación',
  'Arrendamiento', 'Seguros', 'Publicidad', 'Combustible',
  'Electricidad', 'Agua', 'Telefonía / Internet',
  'Honorarios', 'Asesoría', 'Capacitación', 'Otro',
]

export default function OrdenesPagoPage() {
  const router = useRouter()
  const { authUser } = useAuth()
  const [rows, setRows]         = useState<any[]>([])
  const [provMap, setProvMap]   = useState<Record<number, string>>({})
  const [almMap, setAlmMap]     = useState<Record<number, string>>({})
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter] = useState('')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [detail, setDetail]     = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('ordenes_pago').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (debouncedSearch) q = q.or(`folio.ilike.%${debouncedSearch}%,concepto.ilike.%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? [])
    setTotal(count ?? 0)

    // Catálogos para display
    const [{ data: provs }, { data: alms }] = await Promise.all([
      dbComp.from('proveedores').select('id, nombre'),
      dbComp.from('almacenes').select('id, nombre'),
    ])
    const pm: Record<number, string> = {}
    const am: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    ;(alms  ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    setProvMap(pm)
    setAlmMap(am)
    setLoading(false)
  }, [page, debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Stats
  const pendientes = rows.filter(r => r.status === 'Pendiente').reduce((a, r) => a + (r.monto ?? 0), 0)
  const pagadas    = rows.filter(r => r.status === 'Pagada').length

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Órdenes de Pago</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Con o sin OC relacionada · {total} registros</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Nueva Orden de Pago</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Por pagar',  value: fmt(pendientes),  color: '#d97706', bg: '#fffbeb' },
          { label: 'Pagadas',    value: String(pagadas),  color: '#15803d', bg: '#f0fdf4' },
          { label: 'Total reg.', value: String(total),    color: 'var(--blue)', bg: 'var(--blue-pale)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 18px', background: s.bg, minWidth: 140 }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, concepto…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
          <option value="">Todas</option>
          <option value="Pendiente">Pendientes</option>
          <option value="Pagada">Pagadas</option>
          <option value="Cancelada">Canceladas</option>
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Proveedor</th>
              <th>Concepto / Tipo</th>
              <th>Centro de Costo</th>
              <th>Fecha</th>
              <th>Vencimiento</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
              <th>Forma Pago</th>
              <th>Status</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Sin órdenes de pago registradas
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: r.status === 'Cancelada' ? 0.45 : 1 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 13 }}>{r.id_proveedor_fk ? (provMap[r.id_proveedor_fk] ?? `#${r.id_proveedor_fk}`) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.concepto ?? '—'}
                  {r.tipo_gasto && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)', background: '#f1f5f9', padding: '1px 6px', borderRadius: 10 }}>{r.tipo_gasto}</span>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {r.id_almacen_fk ? (almMap[r.id_almacen_fk] ?? `#${r.id_almacen_fk}`) : '—'}
                </td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha_op)}</td>
                <td style={{ fontSize: 12, color: r.fecha_vencimiento && new Date(r.fecha_vencimiento) < new Date() && r.status === 'Pendiente' ? '#dc2626' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {fmtFecha(r.fecha_vencimiento)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(r.monto)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.forma_pago}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail({ ...r, _provNombre: provMap[r.id_proveedor_fk], _almNombre: almMap[r.id_almacen_fk] })} title="Ver">
                      <Eye size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pág. {page+1} de {totalPages} · {total} registros</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page===0} onClick={() => setPage(p=>p-1)}><ChevronLeft size={13}/></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page>=totalPages-1} onClick={() => setPage(p=>p+1)}><ChevronRight size={13}/></button>
            </div>
          </div>
        )}
      </div>

      {modal  && <OPModal   onClose={() => setModal(false)} onSaved={() => { setModal(false); fetchData() }} />}
      {detail && <OPDetail  op={detail}  onClose={() => { setDetail(null); fetchData() }} onCanceled={() => { setDetail(null); fetchData() }} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal nueva Orden de Pago
// ════════════════════════════════════════════════════════════
function OPModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [proveedores, setProvs]   = useState<any[]>([])
  const [almacenes, setAlms]      = useState<any[]>([])
  const [ocsDisp, setOcsDisp]     = useState<any[]>([])
  const [ocsSelected, setOcsSel]  = useState<{ id: number; folio: string; total: number; monto: string }[]>([])
  const [conOC, setConOC]         = useState<boolean | null>(null)  // null=sin elegir

  const [form, setForm] = useState({
    id_proveedor_fk:   '',
    id_almacen_fk:     '',
    forma_pago:        'Transferencia',
    fecha_vencimiento: '',
    concepto:          '',
    tipo_gasto:        '',
    banco_destino:     '',
    cuenta_clabe:      '',
    notas:             '',
    monto_manual:      '',  // para OPs sin OC
  })

  useEffect(() => {
    Promise.all([
      dbComp.from('proveedores').select('id, nombre, banco, cuenta_clabe, condiciones_pago').eq('activo', true).order('nombre'),
      dbComp.from('almacenes').select('id, nombre, tipo').eq('activo', true).order('nombre'),
      dbComp.from('ordenes_compra').select('id, folio, total, id_proveedor_fk').eq('status', 'Autorizada').order('folio'),
    ]).then(([{ data: provs }, { data: alms }, { data: ocs }]) => {
      setProvs(provs ?? [])
      setAlms(alms ?? [])
      setOcsDisp(ocs ?? [])
    })
  }, [])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Auto-llenar datos bancarios del proveedor
  const aplicarProveedor = (provId: string) => {
    const prov = proveedores.find(p => p.id === Number(provId))
    setForm(f => ({
      ...f,
      id_proveedor_fk: provId,
      banco_destino:   prov?.banco ?? f.banco_destino,
      cuenta_clabe:    prov?.cuenta_clabe ?? f.cuenta_clabe,
    }))
    // Filtrar OCs del proveedor seleccionado
    setOcsSel([])
  }

  const addOC = (ocId: string) => {
    const oc = ocsDisp.find(o => o.id === Number(ocId))
    if (!oc || ocsSelected.some(o => o.id === oc.id)) return
    setOcsSel(prev => [...prev, { id: oc.id, folio: oc.folio, total: oc.total, monto: oc.total?.toString() ?? '' }])
  }

  const removeOC = (id: number) => setOcsSel(prev => prev.filter(o => o.id !== id))

  const setOCMonto = (id: number, v: string) =>
    setOcsSel(prev => prev.map(o => o.id === id ? { ...o, monto: v } : o))

  // Monto total calculado
  const montoTotal = conOC
    ? ocsSelected.reduce((a, o) => a + (Number(o.monto) || 0), 0)
    : Number(form.monto_manual) || 0

  const ocsDelProv = form.id_proveedor_fk
    ? ocsDisp.filter(o => o.id_proveedor_fk === Number(form.id_proveedor_fk) && !ocsSelected.some(s => s.id === o.id))
    : ocsDisp.filter(o => !ocsSelected.some(s => s.id === o.id))

  const handleSave = async () => {
    if (!form.id_proveedor_fk && !form.concepto.trim()) {
      setError('Ingresa proveedor o concepto'); return
    }
    if (montoTotal <= 0) { setError('El monto debe ser mayor a cero'); return }
    if (conOC && ocsSelected.length === 0) { setError('Selecciona al menos una OC'); return }
    setSaving(true); setError('')

    const { count } = await dbComp.from('ordenes_pago').select('id', { count: 'exact', head: true })
    const folio = folioGen('OP', (count ?? 0) + 1)

    const payload: any = {
      folio,
      id_proveedor_fk:   form.id_proveedor_fk ? Number(form.id_proveedor_fk) : null,
      id_almacen_fk:     form.id_almacen_fk   ? Number(form.id_almacen_fk)   : null,
      id_oc_fk:          (!conOC || ocsSelected.length === 0) ? null : ocsSelected[0].id,  // OC principal
      forma_pago:        form.forma_pago,
      fecha_vencimiento: form.fecha_vencimiento || null,
      concepto:          form.concepto.trim() || null,
      tipo_gasto:        form.tipo_gasto || null,
      banco_destino:     form.banco_destino.trim() || null,
      cuenta_clabe:      form.cuenta_clabe.trim() || null,
      notas:             form.notas.trim() || null,
      monto:             montoTotal,
      status:            'Pendiente',
      created_by:        authUser?.nombre ?? null,
    }

    const { data: op, error: err } = await dbComp.from('ordenes_pago').insert(payload).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }

    // Registrar relación con múltiples OCs
    if (conOC && ocsSelected.length > 0) {
      await dbComp.from('ordenes_pago_oc').insert(
        ocsSelected.map(o => ({ id_op_fk: op.id, id_oc_fk: o.id, monto: Number(o.monto) }))
      )
      // Actualizar status de las OCs a En Proceso de Pago
      for (const o of ocsSelected) {
        await dbComp.from('ordenes_compra').update({ status: 'Enviada al Prov' }).eq('id', o.id)
      }
    }

    setSaving(false); onSaved()
  }

  // Paso 1: elegir si tiene OC o no
  if (conOC === null) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Nueva Orden de Pago</h2>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
          <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>¿Esta orden de pago está relacionada con una compra?</p>
            <button onClick={() => setConOC(true)}
              style={{ padding: '16px', border: '1px solid #bfdbfe', borderRadius: 10, background: '#eff6ff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#bfdbfe')}>
              <div style={{ fontWeight: 600, color: 'var(--blue)', marginBottom: 4 }}>✓ Con Orden de Compra</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Vincula una o varias OC autorizadas. El monto se calcula automáticamente.</div>
            </button>
            <button onClick={() => setConOC(false)}
              style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#94a3b8')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
              <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>◇ Sin Orden de Compra</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Servicios, honorarios, arrendamiento u otros gastos que no afectan inventario.</div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Nueva Orden de Pago</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {conOC ? '📦 Con OC vinculada' : '◇ Sin OC — Servicio / Gasto directo'}
              <button onClick={() => setConOC(null)} style={{ marginLeft: 8, fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>cambiar</button>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* OCs vinculadas */}
          {conOC && (
            <Sec label="Órdenes de Compra Vinculadas">
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select className="select" style={{ flex: 1 }}
                  onChange={e => { if (e.target.value) { addOC(e.target.value); e.target.value = '' } }}>
                  <option value="">— Agregar OC —</option>
                  {ocsDelProv.map(o => (
                    <option key={o.id} value={o.id}>{o.folio} · {fmt(o.total)}</option>
                  ))}
                </select>
              </div>
              {ocsSelected.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px', background: '#f8fafc', borderRadius: 7 }}>
                  Sin OCs seleccionadas. Elige una o más OC autorizadas.
                </div>
              )}
              {ocsSelected.map(o => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 28px', gap: 8, alignItems: 'center', padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>{o.folio}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>OC Total: {fmt(o.total)}</div>
                  </div>
                  <div>
                    <label className="label">Monto a pagar</label>
                    <input className="input" type="number" step="0.01" value={o.monto}
                      onChange={e => setOCMonto(o.id, e.target.value)} style={{ textAlign: 'right' }} />
                  </div>
                  <button className="btn-ghost" style={{ padding: '4px', marginTop: 18 }} onClick={() => removeOC(o.id)}><Trash2 size={12} /></button>
                </div>
              ))}
            </Sec>
          )}

          {/* Datos generales */}
          <Sec label="Datos Generales">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Proveedor {!conOC ? '(opcional)' : '*'}</label>
                <select className="select" value={form.id_proveedor_fk} onChange={e => aplicarProveedor(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Centro de Costo (Almacén)</label>
                <select className="select" value={form.id_almacen_fk} onChange={setF('id_almacen_fk')}>
                  <option value="">— Sin asignar —</option>
                  {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre} {a.tipo !== 'General' ? `(${a.tipo})` : ''}</option>)}
                </select>
              </div>
            </div>

            {/* Tipo de gasto solo en OPs sin OC */}
            {!conOC && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Tipo de Gasto *</label>
                  <select className="select" value={form.tipo_gasto} onChange={setF('tipo_gasto')}>
                    <option value="">— Seleccionar —</option>
                    {TIPOS_GASTO.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Monto *</label>
                  <input className="input" type="number" step="0.01" value={form.monto_manual}
                    onChange={setF('monto_manual')} style={{ textAlign: 'right' }} />
                </div>
              </div>
            )}

            <div>
              <label className="label">Concepto *</label>
              <input className="input" value={form.concepto} onChange={setF('concepto')}
                placeholder={conOC ? `ej. Pago OC ${ocsSelected.map(o=>o.folio).join(', ')}` : 'ej. Servicio de mantenimiento mensual'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Forma de Pago</label>
                <select className="select" value={form.forma_pago} onChange={setF('forma_pago')}>
                  {FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fecha Vencimiento</label>
                <input className="input" type="date" value={form.fecha_vencimiento} onChange={setF('fecha_vencimiento')} />
              </div>
            </div>
          </Sec>

          {/* Datos bancarios */}
          <Sec label="Datos Bancarios del Beneficiario">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <div><label className="label">Banco</label>
                <input className="input" value={form.banco_destino} onChange={setF('banco_destino')} placeholder="ej. BBVA" />
              </div>
              <div><label className="label">CLABE / Cuenta</label>
                <input className="input" value={form.cuenta_clabe} onChange={setF('cuenta_clabe')}
                  style={{ fontFamily: 'monospace' }} placeholder="18 dígitos" />
              </div>
            </div>
          </Sec>

          <div><label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={setF('notas')} style={{ resize: 'vertical' }} />
          </div>

          {/* Resumen monto */}
          <div style={{ padding: '12px 16px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {conOC ? `Total de ${ocsSelected.length} OC(s)` : 'Monto'}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(montoTotal)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Generar Orden de Pago
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Detalle + impresión + marcar pagada / cancelar
// ════════════════════════════════════════════════════════════
function OPDetail({ op, onClose, onCanceled }: { op: any; onClose: () => void; onCanceled: () => void }) {
  const [ocsRel, setOcsRel]       = useState<any[]>([])
  const [marcando, setMarcando]   = useState(false)
  const [refPago, setRefPago]     = useState('')
  const [showPagar, setShowPagar] = useState(false)

  useEffect(() => {
    dbComp.from('ordenes_pago_oc').select('*, ordenes_compra(folio, total)')
      .eq('id_op_fk', op.id)
      .then(({ data }) => setOcsRel(data ?? []))
  }, [op.id])

  const marcarPagada = async () => {
    setMarcando(true)
    await dbComp.from('ordenes_pago').update({
      status:         'Pagada',
      referencia_pago: refPago.trim() || null,
      fecha_pago:      new Date().toISOString().slice(0, 10),
    }).eq('id', op.id)
    // Cerrar OCs relacionadas
    for (const rel of ocsRel) {
      await dbComp.from('ordenes_compra').update({ status: 'Cerrada' }).eq('id', rel.id_oc_fk)
    }
    setMarcando(false)
    onCanceled()
  }

  const cancelar = async () => {
    if (!confirm('¿Cancelar esta orden de pago?')) return
    await dbComp.from('ordenes_pago').update({ status: 'Cancelada' }).eq('id', op.id)
    onCanceled()
  }

  const imprimir = () => {
    const win = window.open('', '_blank')
    win?.document.write(`
      <html><head><title>Orden de Pago ${op.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
        h1 { color: #0D4F80; font-size: 22px; margin: 0 0 4px; }
        .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 8px 12px; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
        .total { background: #eff6ff; font-size: 16px; font-weight: 700; color: #0D4F80; }
        .firmas { display: flex; gap: 60px; margin-top: 60px; }
        .firma { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 180px; font-size: 11px; color: #64748b; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <h1>Orden de Pago</h1>
      <div class="sub">Folio: <strong>${op.folio}</strong> &nbsp;·&nbsp; Fecha: ${fmtFecha(op.fecha_op)}</div>
      <table>
        <tr><th>Beneficiario</th><td>${op._provNombre ?? '—'}</td><th>Banco</th><td>${op.banco_destino ?? '—'}</td></tr>
        <tr><th>CLABE / Cuenta</th><td style="font-family:monospace">${op.cuenta_clabe ?? '—'}</td><th>Forma de Pago</th><td>${op.forma_pago}</td></tr>
        <tr><th>Concepto</th><td colspan="3">${op.concepto ?? '—'}</td></tr>
        <tr><th>Centro de Costo</th><td>${op._almNombre ?? '—'}</td><th>Vencimiento</th><td>${fmtFecha(op.fecha_vencimiento)}</td></tr>
        ${op.tipo_gasto ? `<tr><th>Tipo de Gasto</th><td colspan="3">${op.tipo_gasto}</td></tr>` : ''}
        ${ocsRel.length ? `<tr><th>OC(s) Relacionadas</th><td colspan="3">${ocsRel.map(r => r.ordenes_compra?.folio ?? `#${r.id_oc_fk}`).join(', ')}</td></tr>` : ''}
        <tr><th class="total">TOTAL A PAGAR</th><td colspan="3" class="total">${fmt(op.monto)}</td></tr>
      </table>
      ${op.notas ? `<p style="font-size:12px;color:#64748b;margin-top:8px"><em>Notas: ${op.notas}</em></p>` : ''}
      <div class="firmas">
        <div class="firma">Elaboró</div>
        <div class="firma">Autorizó</div>
        <div class="firma">Recibió / Banco</div>
      </div>
      </body></html>
    `)
    win?.print()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>{op.folio}</span>
              <StatusBadge status={op.status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(op.fecha_op)}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimir}><Printer size={13} /> Imprimir</button>
            {op.status === 'Pendiente' && (
              <>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowPagar(p => !p)}>
                  <CheckCircle size={13} /> Marcar Pagada
                </button>
                <button className="btn-ghost" style={{ color: '#dc2626', fontSize: 12 }} onClick={cancelar}>Cancelar</button>
              </>
            )}
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '18px 24px', overflowY: 'auto', maxHeight: 'calc(88vh - 80px)', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Panel marcar pagada */}
          {showPagar && op.status === 'Pendiente' && (
            <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 10 }}>Confirmar Pago</div>
              <div><label className="label">Referencia / Número de transferencia</label>
                <input className="input" value={refPago} onChange={e => setRefPago(e.target.value)}
                  placeholder="ej. 202503240001" />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn-secondary" onClick={() => setShowPagar(false)}>Cancelar</button>
                <button className="btn-primary" onClick={marcarPagada} disabled={marcando}>
                  {marcando ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />} Confirmar
                </button>
              </div>
            </div>
          )}

          {/* Info principal */}
          <Sec label="Beneficiario">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              <DI label="Proveedor"     value={op._provNombre} />
              <DI label="Banco"         value={op.banco_destino} />
              <DI label="CLABE / Cuenta" value={op.cuenta_clabe} mono />
              <DI label="Forma de Pago" value={op.forma_pago} />
            </div>
          </Sec>

          <Sec label="Detalle del Pago">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              <DI label="Concepto"         value={op.concepto} />
              <DI label="Tipo de Gasto"    value={op.tipo_gasto} />
              <DI label="Centro de Costo"  value={op._almNombre} />
              <DI label="Vencimiento"      value={fmtFecha(op.fecha_vencimiento)} />
              {op.referencia_pago && <DI label="Ref. Pago"  value={op.referencia_pago} mono />}
              {op.fecha_pago      && <DI label="Fecha Pago" value={fmtFecha(op.fecha_pago)} />}
            </div>
          </Sec>

          {/* OCs relacionadas */}
          {ocsRel.length > 0 && (
            <Sec label="Órdenes de Compra Relacionadas">
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Folio OC</th><th style={{ textAlign: 'right' }}>Total OC</th><th style={{ textAlign: 'right' }}>Monto OP</th></tr></thead>
                  <tbody>
                    {ocsRel.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.ordenes_compra?.folio ?? `#${r.id_oc_fk}`}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.ordenes_compra?.total)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sec>
          )}

          {/* Total */}
          <div style={{ padding: '14px 18px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL A PAGAR</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(op.monto)}</span>
          </div>

          {op.notas && <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Notas: {op.notas}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Helpers UI ─────────────────────────────────────────────
const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>
)
const DI = ({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
  </div>
) : null