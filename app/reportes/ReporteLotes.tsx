'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCfg } from '@/lib/supabase'
import { RefreshCw } from 'lucide-react'
import { PrintBar } from './utils'

export default function ReporteLotes() {
  const [lotes, setLotes]       = useState<any[]>([])
  const [secciones, setSecciones] = useState<any[]>([])
  const [seccionMap, setSeccionMap] = useState<Record<number, string>>({})
  const [clasifMap, setClasifMap] = useState<Record<number, string>>({})
  const [filterSec, setFilterSec] = useState('')
  const [filterMz, setFilterMz]   = useState('')
  const [manzanas, setManzanas]   = useState<string[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setSecciones(data ?? [])
        const map: Record<number, string> = {}
        ;(data ?? []).forEach((s: any) => { map[s.id] = s.nombre })
        setSeccionMap(map)
      })
  }, [])

  useEffect(() => {
    dbCfg.from('clasificacion').select('id, nombre').then(({ data }) => {
      const map: Record<number, string> = {}
      ;(data ?? []).forEach((c: any) => { map[c.id] = c.nombre })
      setClasifMap(map)
    })
  }, [])

  useEffect(() => {
    setFilterMz('')
    let q = dbCat.from('lotes').select('manzana').not('manzana', 'is', null)
    if (filterSec) q = q.eq('id_seccion_fk', Number(filterSec))
    q.then(({ data }) => {
      const set = new Set<string>((data ?? []).map((r: any) => String(r.manzana)).filter(Boolean))
      setManzanas([...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })))
    })
  }, [filterSec])

  useEffect(() => {
    setLoading(true)
    let q = dbCat.from('lotes').select('*').order('cve_lote')
    if (filterSec) q = q.eq('id_seccion_fk', Number(filterSec))
    if (filterMz) q = q.eq('manzana', filterMz)
    q.then(({ data }) => { setLotes(data ?? []); setLoading(false) })
  }, [filterSec, filterMz])

  const STATUS_COLOR: Record<string, string> = {
    'Vendido': '#15803d', 'Libre': '#1d4ed8', 'Bloqueado': '#dc2626',
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <select className="select" style={{ width: 220 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 180 }} value={filterMz} onChange={e => setFilterMz(e.target.value)}>
          <option value="">Todas las manzanas</option>
          {manzanas.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      <PrintBar title="Lotes_por_Seccion" count={lotes.length} reportTitle="Lotes por Sección" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Clave Lote</th>
              <th>Sección</th>
              <th>Manzana</th>
              <th>Número</th>
              <th>Calle</th>
              <th style={{ textAlign: 'right' }}>Superficie m²</th>
              <th>Status</th>
              <th>Clasificación</th>
            </tr>
          </thead>
          <tbody>
            {lotes.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : lotes.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{l.cve_lote ?? `#${l.lote}`}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.id_seccion_fk ? (seccionMap[l.id_seccion_fk] ?? '—') : '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.manzana ?? '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.numero ?? '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.calle ?? '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.superficie ? l.superficie.toLocaleString('es-MX') : '—'}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[l.status_lote ?? ''] ?? 'var(--text-muted)' }}>
                    {l.status_lote ?? '—'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.id_clasificacion_fk ? (clasifMap[l.id_clasificacion_fk] ?? '—') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
