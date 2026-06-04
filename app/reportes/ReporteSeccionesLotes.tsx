'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter } from 'lucide-react'
import { PrintBar } from './utils'

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 0 })
const fmtPeso = (n: number) =>
  n > 0 ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'
const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) + '%' : '—'

interface SeccionRow {
  id: number
  nombre: string
  tipo: string
  total: number
  vendidos: number
  libres: number
  bloqueados: number
  otros: number
  superficie: number
  valor: number
}

export default function ReporteSeccionesLotes() {
  const [secciones,    setSecciones]    = useState<any[]>([])
  const [tipoSec,      setTipoSec]      = useState<any[]>([])
  const [lotes,        setLotes]        = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [queryError,   setQueryError]   = useState<string | null>(null)

  const [filterTipo,   setFilterTipo]   = useState('')

  // Catálogos
  useEffect(() => {
    dbCfg.from('secciones')
      .select('id, nombre, id_tipo_seccion_fk')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
    dbCfg.from('tipo_secciones')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => setTipoSec(data ?? []))
  }, [])

  const fetchLotes = useCallback(async () => {
    setLoading(true)
    setQueryError(null)
    const { data, error } = await dbCat
      .from('lotes')
      .select('id, id_seccion_fk, status_lote, superficie, valor_catastral')
    if (error) setQueryError(error.message)
    setLotes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLotes() }, [fetchLotes])

  // Lookup maps
  const tipoMap: Record<number, string> = {}
  tipoSec.forEach(t => { tipoMap[t.id] = t.nombre })

  // Aggregar lotes por sección
  const lotesPorSec: Record<number, { total: number; vendidos: number; libres: number; bloqueados: number; otros: number; superficie: number; valor: number }> = {}
  lotes.forEach(l => {
    const sid = l.id_seccion_fk ?? 0
    if (!lotesPorSec[sid]) lotesPorSec[sid] = { total: 0, vendidos: 0, libres: 0, bloqueados: 0, otros: 0, superficie: 0, valor: 0 }
    const r = lotesPorSec[sid]
    r.total++
    if (l.status_lote === 'Vendido')        r.vendidos++
    else if (l.status_lote === 'Libre')     r.libres++
    else if (l.status_lote === 'Bloqueado') r.bloqueados++
    else                                    r.otros++
    r.superficie += l.superficie ?? 0
    r.valor      += l.valor_catastral ? Number(l.valor_catastral) : 0
  })

  // Construir filas filtradas
  const seccionesConLotes: SeccionRow[] = secciones
    .filter(s => !filterTipo || String(s.id_tipo_seccion_fk) === filterTipo)
    .map(s => ({
      id:          s.id,
      nombre:      s.nombre,
      tipo:        s.id_tipo_seccion_fk ? (tipoMap[s.id_tipo_seccion_fk] ?? '—') : '—',
      ...(lotesPorSec[s.id] ?? { total: 0, vendidos: 0, libres: 0, bloqueados: 0, otros: 0, superficie: 0, valor: 0 }),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  // Secciones sin asignar (lotes con id_seccion_fk = null o no existente)
  const lotesHuerfanos = lotesPorSec[0] ?? { total: 0, vendidos: 0, libres: 0, bloqueados: 0, otros: 0, superficie: 0, valor: 0 }

  // KPIs globales (sobre todas las secciones, ignorando filtro de tipo para dar contexto)
  const totalSecciones = seccionesConLotes.length
  const gt = seccionesConLotes.reduce(
    (a, r) => ({
      total:      a.total      + r.total,
      vendidos:   a.vendidos   + r.vendidos,
      libres:     a.libres     + r.libres,
      bloqueados: a.bloqueados + r.bloqueados,
      superficie: a.superficie + r.superficie,
      valor:      a.valor      + r.valor,
    }),
    { total: 0, vendidos: 0, libres: 0, bloqueados: 0, superficie: 0, valor: 0 }
  )

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 200 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
            <option value="">Todos los tipos de sección</option>
            {tipoSec.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <button className="btn-ghost" onClick={fetchLotes}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PrintBar title="Secciones_con_Lotes" count={gt.total} reportTitle="Secciones con Cantidad de Lotes" />

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Secciones',     value: fmt(totalSecciones), color: 'var(--blue)' },
          { label: 'Total Lotes',   value: fmt(gt.total),       color: 'var(--text-primary)' },
          { label: 'Vendidos',      value: fmt(gt.vendidos),    color: '#15803d' },
          { label: 'Libres',        value: fmt(gt.libres),      color: '#1d4ed8' },
          { label: 'Bloqueados',    value: fmt(gt.bloqueados),  color: '#dc2626' },
          { label: 'Superficie m²', value: fmt(gt.superficie),  color: '#7c3aed' },
          { label: 'Valor Catastral', value: fmtPeso(gt.valor),  color: '#0f766e' },
        ].map(k => (
          <div key={k.label} className="card"
            style={{ padding: '10px 16px', flex: '1 1 120px', maxWidth: 185, borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {queryError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>
          Error: {queryError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : seccionesConLotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin secciones para los filtros seleccionados
        </div>
      ) : (
        <div id="reporte-print-area">
          <div className="card" style={{ overflow: 'hidden' }}>
            <table id="reporte-table">
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Total Lotes</th>
                  <th style={{ textAlign: 'right' }}>Vendidos</th>
                  <th style={{ textAlign: 'right' }}>% Vta.</th>
                  <th style={{ textAlign: 'right' }}>Libres</th>
                  <th style={{ textAlign: 'right' }}>Bloqueados</th>
                  <th style={{ textAlign: 'right' }}>Otros</th>
                  <th style={{ textAlign: 'right' }}>Superficie m²</th>
                  <th style={{ textAlign: 'right' }}>Valor Catastral</th>
                </tr>
              </thead>
              <tbody>
                {seccionesConLotes.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap' }}>{r.nombre}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.tipo}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.total}</td>
                    <td style={{ textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                      {r.vendidos > 0 ? r.vendidos : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                      {r.total > 0 ? pct(r.vendidos, r.total) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>
                      {r.libres > 0 ? r.libres : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                      {r.bloqueados > 0 ? r.bloqueados : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {r.otros > 0 ? r.otros : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {r.superficie > 0 ? fmt(r.superficie) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#0f766e' }}>
                      {fmtPeso(r.valor)}
                    </td>
                  </tr>
                ))}

                {/* Fila de lotes sin sección asignada, si existen */}
                {lotesHuerfanos.total > 0 && (
                  <tr style={{ background: '#fafafa', fontStyle: 'italic' }}>
                    <td style={{ color: 'var(--text-muted)', paddingLeft: 12 }} colSpan={2}>Sin sección asignada</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{lotesHuerfanos.total}</td>
                    <td style={{ textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{lotesHuerfanos.vendidos > 0 ? lotesHuerfanos.vendidos : '—'}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: '#15803d' }}>{pct(lotesHuerfanos.vendidos, lotesHuerfanos.total)}</td>
                    <td style={{ textAlign: 'right', color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>{lotesHuerfanos.libres > 0 ? lotesHuerfanos.libres : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{lotesHuerfanos.bloqueados > 0 ? lotesHuerfanos.bloqueados : '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>{lotesHuerfanos.otros > 0 ? lotesHuerfanos.otros : '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{lotesHuerfanos.superficie > 0 ? fmt(lotesHuerfanos.superficie) : '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#0f766e' }}>{fmtPeso(lotesHuerfanos.valor)}</td>
                  </tr>
                )}

                {/* Total general */}
                <tr style={{ background: '#1e3a5f', fontWeight: 700 }}>
                  <td colSpan={2} style={{ color: '#fff', paddingLeft: 12 }}>
                    Total general — {totalSecciones} sección{totalSecciones !== 1 ? 'es' : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{gt.total}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#86efac' }}>{gt.vendidos > 0 ? gt.vendidos : '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: '#86efac' }}>{pct(gt.vendidos, gt.total)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#93c5fd' }}>{gt.libres > 0 ? gt.libres : '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#fca5a5' }}>{gt.bloqueados > 0 ? gt.bloqueados : '—'}</td>
                  <td />
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{fmt(gt.superficie)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6ee7b7' }}>{fmtPeso(gt.valor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
