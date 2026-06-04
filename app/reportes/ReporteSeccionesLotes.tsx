'use client'
import { useEffect, useState } from 'react'
import { dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter } from 'lucide-react'
import { PrintBar } from './utils'

const fmt = (n: number | null | undefined) =>
  n != null ? n.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

const fmtFecha = (s: string | null | undefined) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function ReporteSeccionesLotes() {
  const [secciones, setSecciones] = useState<any[]>([])
  const [tipoSec,   setTipoSec]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [filterTipo, setFilterTipo] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    const [{ data: secs, error: e1 }, { data: tipos }] = await Promise.all([
      dbCfg.from('secciones')
        .select('id, nombre, descripcion, id_tipo_seccion_fk, fecha_autorizacion, cantidad_lotes, activo')
        .eq('activo', true)
        .order('nombre'),
      dbCfg.from('tipo_secciones').select('id, nombre').order('nombre'),
    ])
    if (e1) setError(e1.message)
    setSecciones(secs ?? [])
    setTipoSec(tipos ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const tipoMap: Record<number, string> = {}
  tipoSec.forEach(t => { tipoMap[t.id] = t.nombre })

  const filas = secciones.filter(s => !filterTipo || String(s.id_tipo_seccion_fk) === filterTipo)

  const totalLotes = filas.reduce((a, s) => a + (s.cantidad_lotes ?? 0), 0)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 210 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
            <option value="">Todos los tipos de sección</option>
            {tipoSec.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PrintBar title="Secciones_Lotes" count={filas.length} reportTitle="Secciones con Cantidad de Lotes" />

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Secciones',   value: fmt(filas.length), color: 'var(--blue)' },
          { label: 'Total Lotes', value: fmt(totalLotes),   color: '#15803d' },
        ].map(k => (
          <div key={k.label} className="card"
            style={{ padding: '10px 20px', flex: '1 1 140px', maxWidth: 200, borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : filas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin secciones registradas
        </div>
      ) : (
        <div id="reporte-print-area">
          <div className="card" style={{ overflow: 'hidden' }}>
            <table id="reporte-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sección</th>
                  <th>Tipo de Sección</th>
                  <th>Descripción</th>
                  <th>Fecha Autorización</th>
                  <th style={{ textAlign: 'right' }}>Cantidad de Lotes</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, width: 36 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap' }}>{s.nombre}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {s.id_tipo_seccion_fk ? (tipoMap[s.id_tipo_seccion_fk] ?? '—') : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 260 }}>
                      {s.descripcion ?? '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {fmtFecha(s.fecha_autorizacion)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: s.cantidad_lotes > 0 ? 'var(--blue)' : 'var(--text-muted)' }}>
                      {s.cantidad_lotes != null ? fmt(s.cantidad_lotes) : '—'}
                    </td>
                  </tr>
                ))}

                {/* Total */}
                <tr style={{ background: '#1e3a5f', fontWeight: 700 }}>
                  <td colSpan={5} style={{ color: '#fff', paddingLeft: 12 }}>
                    Total — {filas.length} sección{filas.length !== 1 ? 'es' : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#93c5fd' }}>
                    {fmt(totalLotes)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
