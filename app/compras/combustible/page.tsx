'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { ArrowLeft, Plus, Fuel, TrendingUp, TrendingDown, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'

// ─── tipos ───────────────────────────────────────────────────────────────────
type TipoComb  = 'magna' | 'premium' | 'diesel'
type TipoMov   = 'CARGA' | 'CONSUMO' | 'AJUSTE'

interface Movimiento {
  id:               number
  tipo_combustible: TipoComb
  tipo_mov:         TipoMov
  fecha:            string
  litros:           number
  precio_litro:     number | null
  monto_total:      number | null
  proveedor:        string | null
  vehiculo_equipo:  string | null
  area:             string | null
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

const MOV_META: Record<TipoMov, { label: string; color: string; bg: string }> = {
  CARGA:   { label: 'Carga',   color: '#15803d', bg: '#dcfce7' },
  CONSUMO: { label: 'Consumo', color: '#dc2626', bg: '#fee2e2' },
  AJUSTE:  { label: 'Ajuste',  color: '#7c3aed', bg: '#ede9fe' },
}

const BLANK: Omit<Movimiento, 'id' | 'created_at' | 'created_by'> = {
  tipo_combustible: 'magna',
  tipo_mov:         'CARGA',
  fecha:            new Date().toISOString().slice(0, 10),
  litros:           0,
  precio_litro:     null,
  monto_total:      null,
  proveedor:        null,
  vehiculo_equipo:  null,
  area:             null,
  referencia:       null,
  observaciones:    null,
}

const fmt2 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtFecha = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function CombustiblePage() {
  const router  = useRouter()
  const { authUser } = useAuth()

  const [tab,      setTab]      = useState<TipoComb>('magna')
  const [movs,     setMovs]     = useState<Movimiento[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ ...BLANK })
  const [error,    setError]    = useState<string | null>(null)

  // filtros de la tabla
  const [filterMov,   setFilterMov]   = useState<TipoMov | ''>('')
  const [filterFecha, setFilterFecha] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await dbComp
      .from('combustible_movimientos')
      .select('*')
      .order('fecha',      { ascending: false })
      .order('created_at', { ascending: false })
    setMovs((data ?? []) as Movimiento[])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // ── saldo acumulado por tipo ─────────────────────────────────────────────
  const saldoPorTipo = (tipo: TipoComb): number => {
    const filtered = movs.filter(m => m.tipo_combustible === tipo)
    return filtered.reduce((acc, m) => {
      if (m.tipo_mov === 'CARGA')   return acc + m.litros
      if (m.tipo_mov === 'CONSUMO') return acc - m.litros
      return acc + m.litros   // AJUSTE (puede ser negativo desde el form)
    }, 0)
  }

  // ── movs filtrados para la tab activa (con saldo acumulado ascendente) ───
  const movsTab = (() => {
    const base = movs
      .filter(m => m.tipo_combustible === tab)
      .filter(m => !filterMov   || m.tipo_mov === filterMov)
      .filter(m => !filterFecha || m.fecha === filterFecha)

    // Calcular saldo corriente (del más antiguo al más reciente)
    const todos = [...movs].filter(m => m.tipo_combustible === tab).reverse()
    const saldoMap = new Map<number, number>()
    let acum = 0
    for (const m of todos) {
      if (m.tipo_mov === 'CARGA')   acum += m.litros
      else if (m.tipo_mov === 'CONSUMO') acum -= m.litros
      else acum += m.litros
      saldoMap.set(m.id, acum)
    }

    return base.map(m => ({ ...m, saldo: saldoMap.get(m.id) ?? 0 }))
  })()

  // ── guardar movimiento ────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(null)
    if (!form.litros || form.litros === 0) {
      setError('Los litros no pueden ser cero.')
      return
    }
    setSaving(true)
    const payload = {
      tipo_combustible: form.tipo_combustible,
      tipo_mov:         form.tipo_mov,
      fecha:            form.fecha,
      litros:           Number(form.litros),
      precio_litro:     form.precio_litro ? Number(form.precio_litro) : null,
      monto_total:      form.monto_total  ? Number(form.monto_total)  : null,
      proveedor:        form.proveedor    || null,
      vehiculo_equipo:  form.vehiculo_equipo || null,
      area:             form.area         || null,
      referencia:       form.referencia   || null,
      observaciones:    form.observaciones || null,
      created_by:       authUser?.nombre ?? authUser?.user?.email ?? null,
    }
    const { error: err } = await dbComp.from('combustible_movimientos').insert([payload])
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    setForm({ ...BLANK })
    await fetch()
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
            Control de cargas, consumos y ajustes por tipo de combustible
          </p>
        </div>
        <button className="btn-ghost" onClick={fetch} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button className="btn-primary" onClick={() => openForm()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Registrar movimiento
        </button>
      </div>

      {/* KPI cards — saldo por tipo */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        {COMBUSTIBLES.map(c => {
          const saldo = saldoPorTipo(c.key)
          const cargas   = movs.filter(m => m.tipo_combustible === c.key && m.tipo_mov === 'CARGA').reduce((a, m) => a + m.litros, 0)
          const consumos = movs.filter(m => m.tipo_combustible === c.key && m.tipo_mov === 'CONSUMO').reduce((a, m) => a + m.litros, 0)
          return (
            <button key={c.key}
              onClick={() => setTab(c.key)}
              className="card"
              style={{
                padding: '16px 20px', minWidth: 200, flex: '1 1 200px',
                background: tab === c.key ? c.bg : undefined,
                border: tab === c.key ? `2px solid ${c.color}` : undefined,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: c.color, fontFamily: 'var(--font-display)' }}>
                {saldo.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>L</span>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#15803d' }}>
                  +{cargas.toLocaleString('es-MX', { maximumFractionDigits: 1 })} L cargados
                </span>
                <span style={{ fontSize: 11, color: '#dc2626' }}>
                  -{consumos.toLocaleString('es-MX', { maximumFractionDigits: 1 })} L consumidos
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px' }}>
          {COMBUSTIBLES.map(c => (
            <button key={c.key}
              onClick={() => setTab(c.key)}
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
          {/* Acceso rápido: Registrar para este tipo */}
          <button className="btn-ghost"
            onClick={() => openForm(tab)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, margin: '8px 0' }}>
            <Plus size={13} /> Registrar {combActiva.label}
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SlidersHorizontal size={13} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Filtros:</span>
          </div>
          <select value={filterMov} onChange={e => setFilterMov(e.target.value as any)}
            className="input" style={{ fontSize: 12, padding: '4px 8px', height: 30, minWidth: 130 }}>
            <option value="">Todos los tipos</option>
            <option value="CARGA">Carga</option>
            <option value="CONSUMO">Consumo</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
          <input type="date" value={filterFecha} onChange={e => setFilterFecha(e.target.value)}
            className="input" style={{ fontSize: 12, padding: '4px 8px', height: 30 }} />
          {(filterMov || filterFecha) && (
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px', height: 30 }}
              onClick={() => { setFilterMov(''); setFilterFecha('') }}>
              Limpiar
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {movsTab.length} movimiento{movsTab.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tabla kardex */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Cargando...
          </div>
        ) : movsTab.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Fuel size={36} style={{ color: '#cbd5e1', marginBottom: 12 }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>Sin movimientos</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              Registra la primera carga de {combActiva.label}
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
                  {['Fecha', 'Tipo', 'Litros', 'Precio/L', 'Monto', 'Vehículo / Equipo', 'Área', 'Proveedor', 'Referencia', 'Saldo (L)'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movsTab.map((m, i) => {
                  const meta  = MOV_META[m.tipo_mov]
                  const delta = m.tipo_mov === 'CONSUMO' ? -m.litros : m.litros
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {fmtFecha(m.fecha)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'var(--font-display)', textAlign: 'right' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          {delta > 0
                            ? <TrendingUp  size={13} style={{ color: '#15803d' }} />
                            : <TrendingDown size={13} style={{ color: '#dc2626' }} />}
                          <span style={{ color: delta > 0 ? '#15803d' : '#dc2626' }}>
                            {delta > 0 ? '+' : ''}{fmt2(delta)}
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {fmtMoney(m.precio_litro)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {fmtMoney(m.monto_total)}
                      </td>
                      <td style={{ padding: '10px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.vehiculo_equipo ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                        {m.area ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.proveedor ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.referencia ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-display)', color: combActiva.color, whiteSpace: 'nowrap' }}>
                        {fmt2((m as any).saldo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal registro de movimiento */}
      {showForm && (
        <ModalShell modulo="compras" titulo="Registrar movimiento de combustible" icono={Fuel} onClose={() => { setShowForm(false); setError(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 480 }}>

            {/* Tipo combustible */}
            <div style={{ display: 'flex', gap: 8 }}>
              {COMBUSTIBLES.map(c => (
                <button key={c.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo_combustible: c.key }))}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: '2px solid',
                    borderColor: form.tipo_combustible === c.key ? c.color : '#e2e8f0',
                    background: form.tipo_combustible === c.key ? c.bg : 'white',
                    color: form.tipo_combustible === c.key ? c.color : 'var(--text-muted)',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Tipo movimiento */}
            <div style={{ display: 'flex', gap: 8 }}>
              {(['CARGA', 'CONSUMO', 'AJUSTE'] as TipoMov[]).map(t => {
                const meta = MOV_META[t]
                return (
                  <button key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipo_mov: t }))}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, border: '2px solid',
                      borderColor: form.tipo_mov === t ? meta.color : '#e2e8f0',
                      background: form.tipo_mov === t ? meta.bg : 'white',
                      color: form.tipo_mov === t ? meta.color : 'var(--text-muted)',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    }}>
                    {meta.label}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Fecha */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Fecha *</span>
                <input type="date" className="input" value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </label>

              {/* Litros */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  Litros * {form.tipo_mov === 'AJUSTE' ? '(negativo para reducir)' : ''}
                </span>
                <input type="number" className="input" step="0.001"
                  value={form.litros === 0 ? '' : form.litros}
                  placeholder={form.tipo_mov === 'AJUSTE' ? 'ej. -50 o 100' : 'ej. 500'}
                  onChange={e => setForm(f => ({ ...f, litros: parseFloat(e.target.value) || 0 }))} />
              </label>

              {/* Precio / litro */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Precio por litro</span>
                <input type="number" className="input" step="0.01" min="0"
                  value={form.precio_litro ?? ''}
                  placeholder="ej. 24.50"
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    const pl = isNaN(v) ? null : v
                    const litros = Math.abs(form.litros ?? 0)
                    setForm(f => ({ ...f, precio_litro: pl, monto_total: pl && litros ? parseFloat((pl * litros).toFixed(2)) : f.monto_total }))
                  }} />
              </label>

              {/* Monto total */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Monto total</span>
                <input type="number" className="input" step="0.01" min="0"
                  value={form.monto_total ?? ''}
                  placeholder="ej. 12,250.00"
                  onChange={e => setForm(f => ({ ...f, monto_total: parseFloat(e.target.value) || null }))} />
              </label>

              {/* Proveedor — solo en CARGA */}
              {form.tipo_mov === 'CARGA' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Proveedor</span>
                  <input className="input" value={form.proveedor ?? ''}
                    placeholder="ej. PEMEX Balvanera"
                    onChange={e => setForm(f => ({ ...f, proveedor: e.target.value || null }))} />
                </label>
              )}

              {/* Vehículo / Equipo — solo en CONSUMO */}
              {form.tipo_mov === 'CONSUMO' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Vehículo / Equipo</span>
                  <input className="input" value={form.vehiculo_equipo ?? ''}
                    placeholder="ej. F-150 | Tractor Golf"
                    onChange={e => setForm(f => ({ ...f, vehiculo_equipo: e.target.value || null }))} />
                </label>
              )}

              {/* Área — solo en CONSUMO */}
              {form.tipo_mov === 'CONSUMO' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Área</span>
                  <input className="input" value={form.area ?? ''}
                    placeholder="ej. Mantenimiento"
                    onChange={e => setForm(f => ({ ...f, area: e.target.value || null }))} />
                </label>
              )}

              {/* Referencia */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Referencia / Folio</span>
                <input className="input" value={form.referencia ?? ''}
                  placeholder="ej. Factura #12345"
                  onChange={e => setForm(f => ({ ...f, referencia: e.target.value || null }))} />
              </label>

              {/* Observaciones */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Observaciones</span>
                <textarea className="input" rows={2} value={form.observaciones ?? ''}
                  placeholder="Notas adicionales..."
                  style={{ resize: 'vertical' }}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value || null }))} />
              </label>
            </div>

            {error && (
              <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
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
