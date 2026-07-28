'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { ArrowLeft, Plus, Fuel, TrendingUp, TrendingDown, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'

type TipoComb = 'magna' | 'premium' | 'diesel'
type TipoMov  = 'ENTRADA' | 'SALIDA' | 'AJUSTE'

interface Movimiento {
  id:               number
  tipo_combustible: TipoComb
  tipo_mov:         TipoMov
  fecha:            string
  litros:           number
  precio_litro:     number | null
  monto_total:      number | null
  referencia:       string | null
  observaciones:    string | null
  created_at:       string
  created_by:       string | null
}

const COMBUSTIBLES: { key: TipoComb; label: string; color: string; bg: string }[] = [
  { key: 'magna',   label: 'Gasolina Magna',   color: '#16a34a', bg: '#f0fdf4' },
  { key: 'premium', label: 'Gasolina Premium', color: '#d97706', bg: '#fffbeb' },
  { key: 'diesel',  label: 'Diesel',           color: '#2563eb', bg: '#eff6ff' },
]

const MOV_META: Record<TipoMov, { label: string; color: string; bg: string; signo: 1 | -1 }> = {
  ENTRADA: { label: 'Entrada', color: '#15803d', bg: '#dcfce7', signo:  1 },
  SALIDA:  { label: 'Salida',  color: '#dc2626', bg: '#fee2e2', signo: -1 },
  AJUSTE:  { label: 'Ajuste',  color: '#7c3aed', bg: '#ede9fe', signo:  1 },
}

const BLANK = {
  tipo_combustible: 'magna' as TipoComb,
  tipo_mov:         'ENTRADA' as TipoMov,
  fecha:            new Date().toISOString().slice(0, 10),
  litros:           '' as string | number,
  precio_litro:     '' as string | number,
  monto_total:      '' as string | number,
  referencia:       '',
  observaciones:    '',
}

const fmt3 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtFecha = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function CombustiblePage() {
  const router        = useRouter()
  const { authUser }  = useAuth()
  const [tab,       setTab]      = useState<TipoComb>('magna')
  const [movs,      setMovs]     = useState<Movimiento[]>([])
  const [loading,   setLoading]  = useState(true)
  const [saving,    setSaving]   = useState(false)
  const [showForm,  setShowForm] = useState(false)
  const [form,      setForm]     = useState({ ...BLANK })
  const [error,     setError]    = useState<string | null>(null)
  const [filterMov, setFilterMov] = useState<TipoMov | ''>('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await dbComp
      .from('combustible_movimientos')
      .select('*')
      .order('fecha',      { ascending: false })
      .order('created_at', { ascending: false })
    setMovs((data ?? []) as Movimiento[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // saldo acumulado por tipo
  const saldoPorTipo = (tipo: TipoComb) =>
    movs
      .filter(m => m.tipo_combustible === tipo)
      .reduce((acc, m) => acc + MOV_META[m.tipo_mov].signo * m.litros, 0)

  // movimientos con saldo corriente para la tab activa
  const movsConSaldo = (() => {
    const enOrden = [...movs]
      .filter(m => m.tipo_combustible === tab)
      .reverse()                        // más antiguo primero para acumular
    let acum = 0
    const map = new Map<number, number>()
    for (const m of enOrden) {
      acum += MOV_META[m.tipo_mov].signo * m.litros
      map.set(m.id, acum)
    }
    return movs
      .filter(m => m.tipo_combustible === tab)
      .filter(m => !filterMov || m.tipo_mov === filterMov)
      .map(m => ({ ...m, saldo: map.get(m.id) ?? 0 }))
  })()

  const handleSave = async () => {
    setError(null)
    const litros = parseFloat(String(form.litros))
    if (!litros || litros === 0) { setError('Los litros no pueden ser cero.'); return }
    setSaving(true)
    const pl = parseFloat(String(form.precio_litro)) || null
    const { error: err } = await dbComp.from('combustible_movimientos').insert([{
      tipo_combustible: form.tipo_combustible,
      tipo_mov:         form.tipo_mov,
      fecha:            form.fecha,
      litros,
      precio_litro:  pl,
      monto_total:   parseFloat(String(form.monto_total)) || (pl ? parseFloat((pl * Math.abs(litros)).toFixed(2)) : null),
      referencia:    form.referencia    || null,
      observaciones: form.observaciones || null,
      created_by:    authUser?.nombre ?? authUser?.user?.email ?? null,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    setForm({ ...BLANK })
    await load()
  }

  const openForm = (tipo?: TipoComb) => {
    setForm({ ...BLANK, tipo_combustible: tipo ?? tab })
    setError(null)
    setShowForm(true)
  }

  const combActiva = COMBUSTIBLES.find(c => c.key === tab)!

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <ArrowLeft size={15} /> Compras
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Fuel size={20} style={{ color: '#d97706' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Kardex de Combustible</h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Control de resguardo — existencia física en tanque
          </p>
        </div>
        <button className="btn-ghost" onClick={load}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button className="btn-primary" onClick={() => openForm()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Registrar movimiento
        </button>
      </div>

      {/* KPI cards — saldo por tipo */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        {COMBUSTIBLES.map(c => {
          const saldo   = saldoPorTipo(c.key)
          const entradas = movs.filter(m => m.tipo_combustible === c.key && m.tipo_mov === 'ENTRADA').reduce((a, m) => a + m.litros, 0)
          const salidas  = movs.filter(m => m.tipo_combustible === c.key && m.tipo_mov === 'SALIDA').reduce((a, m) => a + m.litros, 0)
          return (
            <button key={c.key} onClick={() => setTab(c.key)} className="card"
              style={{
                padding: '16px 20px', minWidth: 200, flex: '1 1 200px', textAlign: 'left',
                background: tab === c.key ? c.bg : undefined,
                border: tab === c.key ? `2px solid ${c.color}` : undefined,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: c.color, fontFamily: 'var(--font-display)' }}>
                {saldo.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>L</span>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#15803d' }}>↑ {entradas.toLocaleString('es-MX', { maximumFractionDigits: 1 })} L</span>
                <span style={{ fontSize: 11, color: '#dc2626' }}>↓ {salidas.toLocaleString('es-MX',  { maximumFractionDigits: 1 })} L</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px' }}>
          {COMBUSTIBLES.map(c => (
            <button key={c.key} onClick={() => setTab(c.key)}
              style={{
                padding: '12px 18px', fontSize: 13, fontWeight: 600,
                border: 'none', background: 'none', cursor: 'pointer',
                color: tab === c.key ? c.color : 'var(--text-muted)',
                borderBottom: tab === c.key ? `2px solid ${c.color}` : '2px solid transparent',
                marginBottom: -1,
              }}>
              {c.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" onClick={() => openForm(tab)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, margin: '8px 0' }}>
            <Plus size={13} /> Registrar
          </button>
        </div>

        {/* Filtro tipo */}
        <div style={{ display: 'flex', gap: 10, padding: '10px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', alignItems: 'center' }}>
          <SlidersHorizontal size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <select value={filterMov} onChange={e => setFilterMov(e.target.value as any)}
            className="input" style={{ fontSize: 12, padding: '4px 8px', height: 30, width: 180, flexShrink: 0 }}>
            <option value="">Todos los movimientos</option>
            <option value="ENTRADA">Solo Entradas</option>
            <option value="SALIDA">Solo Salidas</option>
            <option value="AJUSTE">Solo Ajustes</option>
          </select>
          {filterMov && (
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px', height: 30, flexShrink: 0 }}
              onClick={() => setFilterMov('')}>
              Limpiar
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {movsConSaldo.length} movimiento{movsConSaldo.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Contenido */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</div>
        ) : movsConSaldo.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Fuel size={36} style={{ color: '#cbd5e1', marginBottom: 12 }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>Sin movimientos</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              Registra la primera entrada de {combActiva.label}
            </div>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => openForm(tab)}>
              <Plus size={14} style={{ marginRight: 4 }} /> Registrar movimiento
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Fecha', 'Tipo', 'Litros', 'Precio / L', 'Monto', 'Referencia', 'Observaciones', 'Saldo (L)'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: h === 'Litros' || h === 'Precio / L' || h === 'Monto' || h === 'Saldo (L)' ? 'right' : 'left',
                      fontWeight: 600, fontSize: 11, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movsConSaldo.map((m, i) => {
                  const meta  = MOV_META[m.tipo_mov]
                  const delta = meta.signo * m.litros
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {fmtFecha(m.fecha)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          {delta > 0
                            ? <TrendingUp   size={13} style={{ color: '#15803d' }} />
                            : <TrendingDown size={13} style={{ color: '#dc2626' }} />}
                          <span style={{ color: delta > 0 ? '#15803d' : '#dc2626' }}>
                            {delta > 0 ? '+' : ''}{fmt3(delta)}
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {fmtMoney(m.precio_litro)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {fmtMoney(m.monto_total)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.referencia ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.observaciones ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: combActiva.color, whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
                        {fmt3((m as any).saldo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <ModalShell modulo="compras" titulo="Registrar movimiento de combustible" icono={Fuel}
          onClose={() => { setShowForm(false); setError(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 460 }}>

            {/* Tipo combustible */}
            <div style={{ display: 'flex', gap: 8 }}>
              {COMBUSTIBLES.map(c => (
                <button key={c.key} type="button"
                  onClick={() => setForm(f => ({ ...f, tipo_combustible: c.key }))}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, border: '2px solid',
                    borderColor:  form.tipo_combustible === c.key ? c.color : '#e2e8f0',
                    background:   form.tipo_combustible === c.key ? c.bg    : 'white',
                    color:        form.tipo_combustible === c.key ? c.color : 'var(--text-muted)',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Tipo movimiento — las Salidas ya no se capturan aquí: se generan solas
                desde la Bitácora de Uso (Vehículos y Maquinaria) al registrar consumo. */}
            <div style={{ display: 'flex', gap: 8 }}>
              {(['ENTRADA', 'AJUSTE'] as TipoMov[]).map(t => {
                const meta = MOV_META[t]
                return (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, tipo_mov: t }))}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 8, border: '2px solid',
                      borderColor: form.tipo_mov === t ? meta.color : '#e2e8f0',
                      background:  form.tipo_mov === t ? meta.bg    : 'white',
                      color:       form.tipo_mov === t ? meta.color : 'var(--text-muted)',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    }}>
                    {meta.label}
                  </button>
                )
              })}
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#2563eb' }}>
              Las salidas se registran automáticamente desde la Bitácora de Uso del módulo de Vehículos y Maquinaria.
            </div>

            {form.tipo_mov === 'AJUSTE' && (
              <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#7c3aed' }}>
                Ajuste: usa litros positivos para aumentar el stock, negativos para reducirlo.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Fecha *</span>
                <input type="date" className="input" value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Litros *</span>
                <input type="number" className="input" step="0.001"
                  value={form.litros}
                  placeholder={form.tipo_mov === 'AJUSTE' ? 'ej. -50 o +100' : 'ej. 500'}
                  onChange={e => setForm(f => ({ ...f, litros: e.target.value }))} />
              </label>

              {form.tipo_mov === 'ENTRADA' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Precio / litro</span>
                  <input type="number" className="input" step="0.0001" min="0"
                    value={form.precio_litro}
                    placeholder="ej. 24.50"
                    onChange={e => {
                      const pl  = e.target.value
                      const lit = parseFloat(String(form.litros))
                      const mt  = pl && lit ? parseFloat((parseFloat(pl) * Math.abs(lit)).toFixed(2)) : ''
                      setForm(f => ({ ...f, precio_litro: pl, monto_total: mt }))
                    }} />
                </label>
              )}

              {form.tipo_mov === 'ENTRADA' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Monto total</span>
                  <input type="number" className="input" step="0.01" min="0"
                    value={form.monto_total}
                    placeholder="ej. 12,250.00"
                    onChange={e => setForm(f => ({ ...f, monto_total: e.target.value }))} />
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: form.tipo_mov !== 'ENTRADA' ? '1 / -1' : undefined }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Referencia / Folio</span>
                <input className="input" value={form.referencia}
                  placeholder="ej. Factura #12345"
                  onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Observaciones</span>
                <textarea className="input" rows={2} value={form.observaciones}
                  placeholder="Notas adicionales..."
                  style={{ resize: 'vertical' }}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
              </label>
            </div>

            {error && (
              <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-ghost" type="button" onClick={() => { setShowForm(false); setError(null) }}>
                Cancelar
              </button>
              <button className="btn-primary" type="button" disabled={saving} onClick={handleSave}>
                {saving ? 'Guardando...' : 'Guardar movimiento'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
