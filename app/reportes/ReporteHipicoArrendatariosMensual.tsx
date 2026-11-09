'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbHip } from '@/lib/supabase'
import { PrintBar } from './utils'

// Supabase limita a 1000 filas por consulta: se pagina hasta agotar resultados.
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

type Arrendatario = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type Asignacion = { id_arrendatario_fk: number; fecha_fin: string | null; cat_caballerizas: { clave: string } | null }
type Cuota = { id_arrendatario_fk: number; monto_final: number; saldo: number | null; status: string; fecha_vencimiento: string | null }
type Recibo = { id_arrendatario_fk: number; total: number; fecha_recibo: string }

type Metrica = 'pagado' | 'vencido' | 'cargo'
type Fila = { id: number; nombre: string; nCab: number; meses: Record<Metrica, number[]> }

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const METRICAS: { id: Metrica; label: string; color: string }[] = [
  { id: 'pagado',  label: 'Pagado',            color: '#16a34a' },
  { id: 'vencido', label: 'Vencido por pagar', color: '#dc2626' },
  { id: 'cargo',   label: 'Cargos del mes',    color: '#2563eb' },
]
const fmtNombre = (a: Arrendatario) =>
  a.tipo_persona === 'Moral' && a.razon_social ? a.razon_social : [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
const fmt$ = (v: number) => v === 0 ? '—' : '$' + v.toLocaleString('es-MX', { maximumFractionDigits: 0 })
const nuevo = (): Record<Metrica, number[]> => ({ pagado: Array(12).fill(0), vencido: Array(12).fill(0), cargo: Array(12).fill(0) })

export default function ReporteHipicoArrendatariosMensual() {
  const hoyIso = new Date().toISOString().split('T')[0]
  const anioActual = new Date().getFullYear()

  const [anio, setAnio] = useState(anioActual)
  const [metrica, setMetrica] = useState<Metrica>('pagado')
  const [busqueda, setBusqueda] = useState('')
  const [soloConDatos, setSoloConDatos] = useState(true)
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const desde = `${anio}-01-01`, hasta = `${anio}-12-31`
      const [arrs, asigs, cuotas, recibos] = await Promise.all([
        fetchAll<Arrendatario>((f, t) => dbHip.from('cat_arrendatarios')
          .select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('id').range(f, t)),
        fetchAll<Asignacion>((f, t) => dbHip.from('ctrl_asignaciones')
          .select('id_arrendatario_fk, fecha_fin, cat_caballerizas(clave)').eq('activo', true).order('id').range(f, t)),
        fetchAll<Cuota>((f, t) => dbHip.from('cxc_hip')
          .select('id_arrendatario_fk, monto_final, saldo, status, fecha_vencimiento')
          .neq('status', 'CANCELADO').gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta).order('id').range(f, t)),
        fetchAll<Recibo>((f, t) => dbHip.from('recibos_hip')
          .select('id_arrendatario_fk, total, fecha_recibo')
          .eq('status', 'VIGENTE').gte('fecha_recibo', desde).lte('fecha_recibo', hasta).order('id').range(f, t)),
      ])
      const mapa = new Map<number, Fila>()
      for (const a of arrs) mapa.set(a.id, { id: a.id, nombre: fmtNombre(a), nCab: 0, meses: nuevo() })
      for (const s of asigs) {
        if (s.fecha_fin && s.fecha_fin < hoyIso) continue
        const f = mapa.get(s.id_arrendatario_fk)
        if (f && s.cat_caballerizas) f.nCab += 1
      }
      for (const r of recibos) {
        const f = mapa.get(r.id_arrendatario_fk)
        if (f) f.meses.pagado[Number(r.fecha_recibo.slice(5, 7)) - 1] += Number(r.total) || 0
      }
      for (const c of cuotas) {
        const f = mapa.get(c.id_arrendatario_fk)
        if (!f || !c.fecha_vencimiento) continue
        const m = Number(c.fecha_vencimiento.slice(5, 7)) - 1
        f.meses.cargo[m] += Number(c.monto_final) || 0
        if ((c.status === 'PENDIENTE' || c.status === 'PAGO_PARCIAL') && c.fecha_vencimiento < hoyIso)
          f.meses.vencido[m] += Number(c.saldo ?? c.monto_final) || 0
      }
      setFilas(Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      setBuscado(true)
    } catch (e: any) {
      setError(e.message ?? 'Error al consultar')
    }
    setLoading(false)
  }, [anio, hoyIso])

  useEffect(() => { fetchData() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [anio])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return filas.filter(f =>
      (!q || f.nombre.toLowerCase().includes(q)) &&
      (!soloConDatos || f.meses[metrica].some(v => v !== 0)))
  }, [filas, busqueda, soloConDatos, metrica])

  const totMes = Array.from({ length: 12 }, (_, m) => visibles.reduce((s, f) => s + f.meses[metrica][m], 0))
  const totGral = totMes.reduce((s, v) => s + v, 0)
  const color = METRICAS.find(m => m.id === metrica)!.color
  const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'right', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
  const stickyBg = 'var(--surface-800, #fff)'
  const anios = Array.from({ length: 6 }, (_, i) => anioActual + 1 - i)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Año</label>
          <select className="input" value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ fontSize: 13, height: 36, width: 100 }}>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Mostrar</label>
          <select className="input" value={metrica} onChange={e => setMetrica(e.target.value as Metrica)} style={{ fontSize: 13, height: 36, width: 180 }}>
            {METRICAS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Buscar</label>
          <input className="input" placeholder="Arrendatario" value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ fontSize: 13, height: 36, width: 200 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 36, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={soloConDatos} onChange={e => setSoloConDatos(e.target.checked)} /> Ocultar sin movimiento
        </label>
        {buscado && !loading && (
          <div style={{ alignSelf: 'flex-end' }}>
            <PrintBar title={`Arrendatarios-Hipico-Mensual-${anio}`} count={visibles.length} reportTitle={`Arrendatarios Hípico — Vista mensual ${anio}`} />
          </div>
        )}
      </div>

      {error && <div className="card" style={{ padding: 16, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {(!buscado || loading) && !error && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Consultando…</div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          <div className="print-only" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Arrendatarios Hípico — Vista mensual {anio}</h2>
            <p style={{ fontSize: 12, margin: '4px 0 0' }}>{METRICAS.find(m => m.id === metrica)!.label} · Al {hoyIso}</p>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Pagado: por fecha de recibo. Cargos y vencido: por mes de vencimiento de la cuota (vencido = saldo de cuotas pendientes con vencimiento anterior a hoy).
          </p>
          {visibles.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin información para los filtros seleccionados</p>
          ) : (
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface-700)', zIndex: 1 }}>Arrendatario</th>
                    <th style={th}>Cab.</th>
                    {MESES.map(m => <th key={m} style={th}>{m}</th>)}
                    <th style={th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f, i) => {
                    const tot = f.meses[metrica].reduce((s, v) => s + v, 0)
                    return (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: stickyBg }}>{f.nombre}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>{f.nCab}</td>
                        {f.meses[metrica].map((v, m) => (
                          <td key={m} style={{ padding: '8px 10px', textAlign: 'right', color: v ? color : 'var(--text-muted)', fontWeight: v ? 600 : 400 }}>{fmt$(v)}</td>
                        ))}
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color }}>{fmt$(tot)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                    <td style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', position: 'sticky', left: 0, background: 'var(--surface-700)' }}>TOTAL</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>{visibles.reduce((s, f) => s + f.nCab, 0)}</td>
                    {totMes.map((v, m) => <td key={m} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color }}>{fmt$(v)}</td>)}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color }}>{fmt$(totGral)}</td>
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
