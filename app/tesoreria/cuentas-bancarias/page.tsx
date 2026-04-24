'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  ArrowLeft, Building2, Plus, Edit2, Trash2, X, Save,
  Loader, RefreshCw, ToggleLeft, ToggleRight, Eye,
  ArrowUpCircle, ArrowDownCircle, TrendingUp, CheckCircle
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import ModalShell from '@/components/ui/ModalShell'

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ══════════════════════════════════════════════════════════════
// Página principal — tabla de cuentas bancarias
// ══════════════════════════════════════════════════════════════
export default function CuentasBancariasPage() {
  const router   = useRouter()
  const { authUser } = useAuth()
  const [cuentas, setCuentas]     = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<any | null | 'new'>(null)
  const [detailCuenta, setDetail] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCfg.from('cuentas_bancarias').select('*').order('banco')
    setCuentas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleActivo = async (row: any) => {
    await dbCfg.from('cuentas_bancarias').update({ activo: !row.activo }).eq('id', row.id)
    fetchData()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta cuenta bancaria?')) return
    await dbCfg.from('cuentas_bancarias').delete().eq('id', id)
    fetchData()
  }

  const activos   = cuentas.filter(c => c.activo).length
  const totalSaldo = cuentas.filter(c => c.activo).reduce((a, c) => a + (c.saldo ?? 0), 0)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/tesoreria')} title="Regresar">
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title">Cuentas Bancarias</h1>
            <p className="page-subtitle">Administración de cuentas y registro de movimientos</p>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={fetchData} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn-primary" onClick={() => setModal('new')}>
            <Plus size={14} /> Nueva Cuenta
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '12px 20px', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrendingUp size={16} style={{ color: '#0f766e' }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSaldo)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saldo total activo</div>
          </div>
        </div>
        <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 13 }}><strong style={{ color: '#15803d' }}>{activos}</strong> cuentas activas</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Banco</th>
              <th>No. de Cuenta</th>
              <th>CLABE</th>
              <th style={{ textAlign: 'right' }}>Saldo</th>
              <th>Descripción</th>
              <th style={{ textAlign: 'center', width: 80 }}>Status</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : cuentas.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Sin cuentas registradas. Haz clic en "Nueva Cuenta" para agregar.
              </td></tr>
            ) : cuentas.map(c => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.45 }}>
                <td style={{ fontWeight: 600, fontSize: 14 }}>{c.banco}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{c.numero_cuenta ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{c.clabe ?? '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: (c.saldo ?? 0) < 0 ? '#dc2626' : '#0f766e', fontSize: 14 }}>
                  {fmt(c.saldo ?? 0)}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.descripcion ?? '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => toggleActivo(c)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', margin: '0 auto' }}>
                    {c.activo
                      ? <ToggleRight size={20} style={{ color: '#15803d' }} />
                      : <ToggleLeft  size={20} style={{ color: '#cbd5e1' }} />}
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px', color: '#0f766e' }}
                      onClick={() => setDetail(c)}>
                      <Eye size={13} />
                    </button>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }}
                      onClick={() => setModal(c)}>
                      <Edit2 size={13} />
                    </button>
                    <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }}
                      onClick={() => handleDelete(c.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      {modal !== null && (
        <CuentaModal
          row={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData() }}
        />
      )}
      {detailCuenta !== null && (
        <CuentaBancariaDetail
          cuenta={detailCuenta}
          onClose={() => { setDetail(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal crear / editar cuenta bancaria
// ══════════════════════════════════════════════════════════════
function CuentaModal({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({
    banco:         row?.banco         ?? '',
    numero_cuenta: row?.numero_cuenta ?? '',
    clabe:         row?.clabe         ?? '',
    saldo:         row?.saldo?.toString() ?? '',
    descripcion:   row?.descripcion   ?? '',
    activo:        row?.activo !== false,
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.banco.trim()) { setError('El nombre del banco es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      banco:         form.banco.trim(),
      numero_cuenta: form.numero_cuenta.trim() || null,
      clabe:         form.clabe.trim() || null,
      saldo:         form.saldo ? Number(form.saldo) : null,
      descripcion:   form.descripcion.trim() || null,
      activo:        form.activo,
    }
    const { error: err } = isNew
      ? await dbCfg.from('cuentas_bancarias').insert(payload)
      : await dbCfg.from('cuentas_bancarias').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="tesoreria" titulo={isNew ? 'Nueva Cuenta Bancaria' : `Editar — ${row.banco}`} onClose={onClose} maxWidth={480}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
        {isNew ? 'Crear Cuenta' : 'Guardar Cambios'}
        </button>
      </>}
    >

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}
          <div>
            <label className="label">Banco *</label>
            <input className="input" value={form.banco} onChange={set('banco')} placeholder="ej. BBVA, Banamex, HSBC…" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">No. de Cuenta</label>
              <input className="input" value={form.numero_cuenta} onChange={set('numero_cuenta')} style={{ fontFamily: 'monospace' }} />
            </div>
            <div>
              <label className="label">CLABE</label>
              <input className="input" value={form.clabe} onChange={set('clabe')} style={{ fontFamily: 'monospace' }} maxLength={18} />
            </div>
          </div>
          <div>
            <label className="label">Saldo Inicial</label>
            <input className="input" type="number" step="0.01" value={form.saldo} onChange={set('saldo')} style={{ textAlign: 'right' }} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} value={form.descripcion} onChange={set('descripcion')} style={{ resize: 'vertical' }} />
          </div>
          {!isNew && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              Cuenta activa
            </label>
          )}
        </div>

    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Detalle de Cuenta Bancaria — historial de movimientos
// ══════════════════════════════════════════════════════════════
function CuentaBancariaDetail({ cuenta, onClose }: { cuenta: any; onClose: () => void }) {
  const { authUser } = useAuth()
  const [movs, setMovs]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtroDe, setFiltroDe]   = useState('')
  const [filtroA, setFiltroA]     = useState('')
  const [saldoActual, setSaldo]   = useState<number>(cuenta.saldo ?? 0)
  const [showAbono, setShowAbono] = useState(false)
  const [savingAbono, setSavingAbono] = useState(false)
  const [errorAbono, setErrorAbono]   = useState('')
  const [formAbono, setFormAbono] = useState({
    fecha:      new Date().toISOString().slice(0, 10),
    monto:      '',
    concepto:   '',
    referencia: '',
  })

  const setFA = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormAbono(f => ({ ...f, [k]: e.target.value }))

  const fetchMovs = useCallback(async () => {
    setLoading(true)
    const { data: cb } = await dbCfg.from('cuentas_bancarias').select('saldo').eq('id', cuenta.id).single()
    if (cb) setSaldo((cb as any).saldo ?? 0)

    let q = dbComp.from('movimientos_bancarios')
      .select('*')
      .eq('id_cuenta_fk', cuenta.id)
      .order('fecha_movimiento', { ascending: false })
      .order('created_at', { ascending: false })
    if (filtroDe) q = q.gte('fecha_movimiento', filtroDe)
    if (filtroA)  q = q.lte('fecha_movimiento', filtroA)
    const { data } = await q
    setMovs(data ?? [])
    setLoading(false)
  }, [cuenta.id, filtroDe, filtroA])

  useEffect(() => { fetchMovs() }, [fetchMovs])

  const handleAbono = async () => {
    if (!formAbono.monto || Number(formAbono.monto) <= 0) {
      setErrorAbono('El monto debe ser mayor a cero'); return
    }
    if (!formAbono.concepto.trim()) {
      setErrorAbono('El concepto es obligatorio'); return
    }
    setSavingAbono(true); setErrorAbono('')

    const montoAbono = Number(formAbono.monto)
    const { data: cuentaRow } = await dbCfg.from('cuentas_bancarias')
      .select('saldo').eq('id', cuenta.id).single()
    const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
    const saldoDespues = saldoAntes + montoAbono

    const { error: err } = await dbComp.from('movimientos_bancarios').insert({
      id_cuenta_fk:     cuenta.id,
      tipo:             'Abono',
      monto:            montoAbono,
      saldo_antes:      saldoAntes,
      saldo_despues:    saldoDespues,
      concepto:         formAbono.concepto.trim(),
      referencia:       formAbono.referencia.trim() || null,
      fecha_movimiento: formAbono.fecha,
      created_by:       authUser?.nombre ?? null,
    })
    if (err) { setErrorAbono(err.message); setSavingAbono(false); return }

    await dbCfg.from('cuentas_bancarias').update({
      saldo:      saldoDespues,
      updated_at: new Date().toISOString(),
    }).eq('id', cuenta.id)

    setSavingAbono(false)
    setShowAbono(false)
    setFormAbono({ fecha: new Date().toISOString().slice(0, 10), monto: '', concepto: '', referencia: '' })
    fetchMovs()
  }

  const totalCargos = movs.filter(m => m.tipo === 'Cargo').reduce((a, m) => a + (m.monto ?? 0), 0)
  const totalAbonos = movs.filter(m => m.tipo === 'Abono').reduce((a, m) => a + (m.monto ?? 0), 0)

  return (
    <ModalShell modulo="tesoreria" titulo="Modal" onClose={onClose} maxWidth={800}
      footer={<>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{movs.length} movimiento{movs.length !== 1 ? 's' : ''}</span>
        <button className="btn-secondary" onClick={onClose}>Cerrar</button>
      </>}
    >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0f766e18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={15} style={{ color: '#0f766e' }} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{cuenta.banco}</h2>
            </div>
            <div style={{ display: 'flex', gap: 16, marginLeft: 42, flexWrap: 'wrap' }}>
              {cuenta.numero_cuenta && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>No. {cuenta.numero_cuenta}</span>
              )}
              {cuenta.clabe && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>CLABE: {cuenta.clabe}</span>
              )}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #f1f5f9' }}>
          {[
            { label: 'Saldo Actual',   value: fmt(saldoActual), color: '#0f766e', icon: TrendingUp },
            { label: 'Cargos período', value: fmt(totalCargos), color: '#dc2626', icon: ArrowDownCircle },
            { label: 'Abonos período', value: fmt(totalAbonos), color: '#15803d', icon: ArrowUpCircle },
          ].map((s, i) => {
            const SIcon = s.icon
            return (
              <div key={s.label} style={{ padding: '14px 20px', textAlign: 'center', borderRight: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
                  <SIcon size={14} style={{ color: s.color }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              </div>
            )
          })}
        </div>

        {/* Filtros + botón Abono */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 24px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Período:</span>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>a</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
          {(filtroDe || filtroA) && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setFiltroDe(''); setFiltroA('') }}>Limpiar</button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ padding: '6px 10px' }} onClick={fetchMovs}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { setShowAbono(s => !s); setErrorAbono('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: showAbono ? '#f0fdf4' : '#15803d', color: showAbono ? '#15803d' : '#fff',
                border: '1px solid #15803d', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
              <ArrowUpCircle size={13} />
              {showAbono ? 'Cancelar' : 'Registrar Abono'}
            </button>
          </div>
        </div>

        {/* Formulario de abono */}
        {showAbono && (
          <div style={{ padding: '16px 24px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowUpCircle size={13} /> Registrar Abono — Los cargos solo se generan desde una Orden de Pago
            </div>
            {errorAbono && (
              <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12, marginBottom: 10 }}>
                {errorAbono}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr 1fr', gap: 10, alignItems: 'end' }}>
              <div>
                <label className="label">Fecha *</label>
                <input className="input" type="date" value={formAbono.fecha} onChange={setFA('fecha')} />
              </div>
              <div>
                <label className="label">Monto *</label>
                <input className="input" type="number" step="0.01" min="0.01" placeholder="0.00"
                  value={formAbono.monto} onChange={setFA('monto')} style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label className="label">Concepto *</label>
                <input className="input" placeholder="ej. Depósito inicial, Transferencia recibida…"
                  value={formAbono.concepto} onChange={setFA('concepto')} />
              </div>
              <div>
                <label className="label">Referencia</label>
                <input className="input" placeholder="No. de transferencia, cheque…"
                  style={{ fontFamily: 'monospace' }} value={formAbono.referencia} onChange={setFA('referencia')} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={handleAbono} disabled={savingAbono}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600,
                  background: '#15803d', color: '#fff', border: 'none', borderRadius: 8,
                  cursor: savingAbono ? 'not-allowed' : 'pointer', opacity: savingAbono ? 0.7 : 1 }}>
                {savingAbono ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                {savingAbono ? 'Guardando…' : 'Confirmar Abono'}
              </button>
            </div>
          </div>
        )}

        {/* Tabla de movimientos */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 350px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
            </div>
          ) : movs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
              Sin movimientos{(filtroDe || filtroA) ? ' en el período seleccionado' : ''}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Referencia</th>
                  <th style={{ textAlign: 'center' }}>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th style={{ textAlign: 'right' }}>Saldo Anterior</th>
                  <th style={{ textAlign: 'right' }}>Saldo Posterior</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {movs.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtD(m.fecha_movimiento)}</td>
                    <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto ?? '—'}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{m.referencia ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                        background: m.tipo === 'Cargo' ? '#fef2f2' : '#f0fdf4',
                        color:      m.tipo === 'Cargo' ? '#dc2626'  : '#15803d',
                        border:     `1px solid ${m.tipo === 'Cargo' ? '#fecaca' : '#bbf7d0'}`,
                      }}>{m.tipo}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: m.tipo === 'Cargo' ? '#dc2626' : '#15803d', fontSize: 13 }}>
                      {m.tipo === 'Cargo' ? '−' : '+'}{fmt(m.monto ?? 0)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {m.saldo_antes != null ? fmt(m.saldo_antes) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {m.saldo_despues != null ? fmt(m.saldo_despues) : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.created_by ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

    </ModalShell>
  )
}
