'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbHip } from '@/lib/supabase'
import { PrintBar } from './utils'
import ReporteHipicoArrendatariosMensual, { fetchAll } from './ReporteHipicoArrendatariosMensual'

type Arrendatario = {
  id: number
  nombre: string
  apellido_paterno: string | null
  razon_social: string | null
  tipo_persona: string
}
type Asignacion = {
  id_arrendatario_fk: number
  cat_caballerizas: { clave: string; nombre: string | null } | null
}
type Cuota = { id_arrendatario_fk: number; saldo: number | null; monto_final: number; fecha_vencimiento: string | null }
type Recibo = { id_arrendatario_fk: number; total: number }

type Fila = {
  id: number
  nombre: string
  claves: string[]
  pagado: number
  nVencidas: number
  vencido: number
  maxDias: number
}

const fmtNombre = (a: Arrendatario) => {
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

function ReporteResumen() {
  const hoy = new Date()
  const hoyIso = hoy.toISOString().split('T')[0]
  const inicioAnio = `${hoy.getFullYear()}-01-01`

  const [pagosDesde, setPagosDesde] = useState(inicioAnio)
  const [pagosHasta, setPagosHasta] = useState(hoyIso)
  const [busqueda, setBusqueda] = useState('')
  const [soloVencido, setSoloVencido] = useState(false)
  const [soloConCaballeriza, setSoloConCaballeriza] = useState(false)

  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [arrs, asigs, cuotas, recibos] = await Promise.all([
        fetchAll<Arrendatario>((f, t) => dbHip.from('cat_arrendatarios')
          .select('id, nombre, apellido_paterno, razon_social, tipo_persona')
          .eq('activo', true).order('id').range(f, t)),
        // Caballerizas asignadas vigentes (asignación activa y sin fecha_fin pasada)
        fetchAll<Asignacion & { fecha_fin: string | null }>((f, t) => dbHip.from('ctrl_asignaciones')
          .select('id_arrendatario_fk, fecha_fin, cat_caballerizas(clave, nombre)')
          .eq('activo', true).order('id').range(f, t)),
        // Cuotas vencidas por pagar a hoy
        fetchAll<Cuota>((f, t) => dbHip.from('cxc_hip')
          .select('id_arrendatario_fk, saldo, monto_final, fecha_vencimiento')
          .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
          .lt('fecha_vencimiento', hoyIso).order('id').range(f, t)),
        // Pagos hechos en el período (recibos vigentes)
        fetchAll<Recibo>((f, t) => dbHip.from('recibos_hip')
          .select('id_arrendatario_fk, total')
          .eq('status', 'VIGENTE')
          .gte('fecha_recibo', pagosDesde).lte('fecha_recibo', pagosHasta)
          .order('id').range(f, t)),
      ])

      const mapa = new Map<number, Fila>()
      for (const a of arrs) {
        mapa.set(a.id, { id: a.id, nombre: fmtNombre(a), claves: [], pagado: 0, nVencidas: 0, vencido: 0, maxDias: 0 })
      }
      for (const s of asigs) {
        if (s.fecha_fin && s.fecha_fin < hoyIso) continue
        const f = mapa.get(s.id_arrendatario_fk)
        const cab = s.cat_caballerizas
        if (f && cab) f.claves.push(cab.clave)
      }
      for (const r of recibos) {
        const f = mapa.get(r.id_arrendatario_fk)
        if (f) f.pagado += Number(r.total) || 0
      }
      const hoyMs = new Date(hoyIso + 'T12:00:00').getTime()
      for (const c of cuotas) {
        const f = mapa.get(c.id_arrendatario_fk)
        if (!f) continue
        f.vencido += Number(c.saldo ?? c.monto_final) || 0
        f.nVencidas += 1
        if (c.fecha_vencimiento) {
          const dias = Math.floor((hoyMs - new Date(c.fecha_vencimiento + 'T12:00:00').getTime()) / 86400000)
          if (dias > f.maxDias) f.maxDias = dias
        }
      }
      const lista = Array.from(mapa.values())
      lista.forEach(f => f.claves.sort((x, y) => x.localeCompare(y, 'es', { numeric: true })))
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      setFilas(lista)
      setBuscado(true)
    } catch (e: any) {
      setError(e.message ?? 'Error al consultar')
    }
    setLoading(false)
  }, [pagosDesde, pagosHasta, hoyIso])

  useEffect(() => { fetchData() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return filas.filter(f =>
      (!q || f.nombre.toLowerCase().includes(q) || f.claves.some(c => c.toLowerCase().includes(q))) &&
      (!soloVencido || f.vencido > 0) &&
      (!soloConCaballeriza || f.claves.length > 0))
  }, [filas, busqueda, soloVencido, soloConCaballeriza])

  const totCab = visibles.reduce((s, f) => s + f.claves.length, 0)
  const totPagado = visibles.reduce((s, f) => s + f.pagado, 0)
  const totVencido = visibles.reduce((s, f) => s + f.vencido, 0)
  const totVencidas = visibles.reduce((s, f) => s + f.nVencidas, 0)
  const conVencido = visibles.filter(f => f.vencido > 0).length

  const th: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }
  const thR: React.CSSProperties = { ...th, textAlign: 'right' }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Pagos desde</label>
          <input className="input" type="date" value={pagosDesde} onChange={e => setPagosDesde(e.target.value)}
            style={{ fontSize: 13, height: 36, width: 150 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Pagos hasta</label>
          <input className="input" type="date" value={pagosHasta} onChange={e => setPagosHasta(e.target.value)}
            style={{ fontSize: 13, height: 36, width: 150 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Buscar</label>
          <input className="input" placeholder="Arrendatario o caballeriza" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ fontSize: 13, height: 36, width: 210 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 36, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={soloVencido} onChange={e => setSoloVencido(e.target.checked)} /> Solo con vencido
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 36, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={soloConCaballeriza} onChange={e => setSoloConCaballeriza(e.target.checked)} /> Solo con caballerizas
        </label>
        <button className="btn-primary" onClick={fetchData} disabled={loading}
          style={{ fontSize: 13, height: 36, padding: '0 20px' }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && (
          <div style={{ alignSelf: 'flex-end' }}>
            <PrintBar title="Arrendatarios-Hipico" count={visibles.length} reportTitle="Arrendatarios — Módulo Hípico" />
          </div>
        )}
      </div>

      {error && <div className="card" style={{ padding: 16, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {!buscado && !error && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Consultando…</div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          <div className="print-only" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Arrendatarios — Módulo Hípico</h2>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>
              Pagos del {fmtFecha(pagosDesde)} al {fmtFecha(pagosHasta)} · Vencido al {fmtFecha(hoyIso)}
            </p>
          </div>

          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Arrendatarios',        value: visibles.length.toString(), color: '#2563eb' },
              { label: 'Caballerizas asignadas', value: totCab.toString(),         color: '#92400e' },
              { label: 'Total pagado',          value: fmt$(totPagado),            color: '#16a34a' },
              { label: 'Vencido por pagar',     value: fmt$(totVencido),           color: totVencido > 0 ? '#dc2626' : '#16a34a' },
              { label: 'Con adeudo vencido',    value: `${conVencido} (${totVencidas} cuotas)`, color: '#dc2626' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 150px', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin arrendatarios con los filtros seleccionados</p>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    <th style={th}>Arrendatario</th>
                    <th style={thR}>No. Caballerizas</th>
                    <th style={th}>Caballerizas</th>
                    <th style={thR}>Pagado</th>
                    <th style={thR}>Cuotas vencidas</th>
                    <th style={thR}>Vencido por pagar</th>
                    <th style={thR}>Días máx. vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f, i) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{f.nombre}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>{f.claves.length}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11 }}>{f.claves.join(', ') || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmt$(f.pagado)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: f.nVencidas > 0 ? '#dc2626' : 'var(--text-muted)' }}>{f.nVencidas || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: f.vencido > 0 ? '#dc2626' : '#16a34a' }}>{fmt$(f.vencido)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: f.maxDias > 0 ? '#dc2626' : 'var(--text-muted)' }}>{f.maxDias || '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                    <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>{totCab}</td>
                    <td></td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt$(totPagado)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{totVencidas}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: totVencido > 0 ? '#dc2626' : '#16a34a' }}>{fmt$(totVencido)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReporteHipicoArrendatarios() {
  const [vista, setVista] = useState<'resumen' | 'mensual'>('resumen')
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([['resumen', 'Resumen'], ['mensual', 'Vista mensual']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setVista(id)} className={vista === id ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 13, height: 34, padding: '0 16px' }}>{label}</button>
        ))}
      </div>
      {vista === 'resumen' ? <ReporteResumen /> : <ReporteHipicoArrendatariosMensual />}
    </div>
  )
}
