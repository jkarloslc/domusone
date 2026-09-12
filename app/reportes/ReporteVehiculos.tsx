'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCfg, dbCtrl } from '@/lib/supabase'
import { Search, RefreshCw } from 'lucide-react'
import { PrintBar } from './utils'

export default function ReporteVehiculos() {
  const [rows, setRows]             = useState<any[]>([])
  const [loteMap, setLoteMap]       = useState<Record<number, any>>({})
  const [vehiculoMap, setVehiculoMap] = useState<Record<number, any>>({})
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState('')
  const [loteId, setLoteId]         = useState<number | null>(null)
  const [loteNombre, setLoteNombre] = useState('Todos los lotes')
  const [loading, setLoading]       = useState(false)

  useEffect(() => { fetchData(null) }, [])

  const fetchData = async (id: number | null) => {
    setLoading(true)
    let q = dbCtrl.from('vehiculos_autorizados_lotes')
      .select('vigencia_desde, vigencia_hasta, activo, id_lote_fk, id_vehiculo_fk')
      .eq('activo', true)
      .order('id')
    if (id) q = q.eq('id_lote_fk', id)
    const { data } = await q
    const rowsData = data ?? []
    setRows(rowsData)

    const loteIds = Array.from(new Set(rowsData.map((r: any) => r.id_lote_fk).filter(Boolean)))
    if (loteIds.length) {
      const { data: lotesData } = await dbCat.from('lotes').select('id, cve_lote').in('id', loteIds)
      const map: Record<number, any> = {}
      for (const l of (lotesData ?? []) as any[]) map[l.id] = l
      setLoteMap(map)
    } else setLoteMap({})

    const vehiculoIds = Array.from(new Set(rowsData.map((r: any) => r.id_vehiculo_fk).filter(Boolean)))
    if (vehiculoIds.length) {
      const { data: vehiculosData } = await dbCat.from('vehiculos')
        .select('id, placas, tag, tipo_vehiculo, modelo, color, num_serie, id_marca_fk')
        .in('id', vehiculoIds)
      const marcaIds = Array.from(new Set((vehiculosData ?? []).map((v: any) => v.id_marca_fk).filter(Boolean)))
      let marcaMap: Record<number, string> = {}
      if (marcaIds.length) {
        const { data: marcasData } = await dbCfg.from('marcas_vehiculos').select('id, nombre').in('id', marcaIds)
        for (const m of (marcasData ?? []) as any[]) marcaMap[m.id] = m.nombre
      }
      const map: Record<number, any> = {}
      for (const v of (vehiculosData ?? []) as any[]) map[v.id] = { ...v, marca: marcaMap[v.id_marca_fk] }
      setVehiculoMap(map)
    } else setVehiculoMap({})

    setLoading(false)
  }

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const selectLote = (l: any) => {
    setLoteId(l.id); setLoteNombre(l.cve_lote ?? `#${l.lote}`)
    setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([])
    fetchData(l.id)
  }

  const clearLote = () => {
    setLoteId(null); setLoteNombre('Todos los lotes')
    setLoteSearch(''); fetchData(null)
  }

  const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '—'

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30, width: 240 }} placeholder="Buscar lote…"
            value={loteSearch} onChange={e => setLoteSearch(e.target.value)} />
          {lotes.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 10, width: '100%', marginTop: 4, padding: '4px 0' }}>
              {lotes.map((l: any) => (
                <button key={l.id} onClick={() => selectLote(l)}
                  style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 14, fontWeight: 600 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  {l.cve_lote ?? `#${l.lote}`}
                </button>
              ))}
            </div>
          )}
        </div>
        {loteId && <button className="btn-secondary" onClick={clearLote} style={{ fontSize: 12 }}>Ver todos</button>}
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)', marginTop: 10 }} />}
      </div>

      {loteId && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: 'var(--blue-pale)', borderRadius: 7, fontSize: 13, color: 'var(--blue-dark)', fontWeight: 500 }}>
          Lote: {loteNombre}
        </div>
      )}

      <PrintBar title={`Vehiculos_${loteNombre.replace(/\s/g, '_')}`} count={rows.length} reportTitle="Vehículos por Lote" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Placas</th>
              <th>TAG</th>
              <th>Tipo</th>
              <th>Marca / Modelo</th>
              <th>Color</th>
              <th>No. Serie</th>
              <th>Vigencia Desde</th>
              <th>Vigencia Hasta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin vehículos autorizados</td></tr>
            ) : rows.map((r, i) => {
              const v = vehiculoMap[r.id_vehiculo_fk]
              return (
              <tr key={i}>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{loteMap[r.id_lote_fk]?.cve_lote ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v?.placas ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {v?.tag
                    ? <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: 4, fontWeight: 600 }}>{v.tag}</span>
                    : '—'
                  }
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v?.tipo_vehiculo ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {[v?.marca, v?.modelo].filter(Boolean).join(' ') || '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v?.color ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{v?.num_serie ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtFecha(r.vigencia_desde)}</td>
                <td style={{ fontSize: 12, color: r.vigencia_hasta ? '#15803d' : 'var(--text-muted)' }}>{fmtFecha(r.vigencia_hasta)}</td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  )
}
