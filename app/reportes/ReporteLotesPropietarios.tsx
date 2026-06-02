'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter } from 'lucide-react'
import { PrintBar } from './utils'

const STATUS_COLOR: Record<string, string> = {
  Vendido: '#15803d', Libre: '#1d4ed8', Bloqueado: '#dc2626',
}

export default function ReporteLotesPropietarios() {
  const [rows,         setRows]         = useState<any[]>([])
  const [secciones,    setSecciones]    = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [queryError,   setQueryError]   = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [filterSec,    setFilterSec]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Catálogos
  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
  }, [])

  // Datos principales
  useEffect(() => {
    setLoading(true)
    setQueryError(null)

    dbCtrl.from('propietarios_lotes').select('*').eq('activo', true).order('id')
      .then(async ({ data: rels, error: relsErr }) => {
        if (relsErr) { setQueryError(relsErr.message); setLoading(false); return }
        const relRows = rels ?? []
        if (!relRows.length) { setRows([]); setLoading(false); return }

        const loteIds = Array.from(new Set(relRows.map((r: any) => r.id_lote_fk).filter(Boolean)))
        const propIds = Array.from(new Set(relRows.map((r: any) => r.id_propietario_fk).filter(Boolean)))

        const [
          { data: lotesData,  error: lotesErr },
          { data: propsData,  error: propsErr },
        ] = await Promise.all([
          dbCat.from('lotes').select('*').in('id', loteIds),
          dbCat.from('propietarios')
            .select('id, nombre, apellido_paterno, apellido_materno, rfc, tipo_persona')
            .in('id', propIds),
        ])

        if (lotesErr) { setQueryError(lotesErr.message); setLoading(false); return }
        if (propsErr) { setQueryError(propsErr.message); setLoading(false); return }

        const lotesMap: Record<number, any> = {}
        const propsMap: Record<number, any> = {}
        ;(lotesData ?? []).forEach((l: any) => { lotesMap[l.id] = l })
        ;(propsData ?? []).forEach((p: any) => { propsMap[p.id] = p })

        const combined = relRows
          .map((r: any) => ({
            ...r,
            _lote: lotesMap[r.id_lote_fk]       ?? null,
            _prop: propsMap[r.id_propietario_fk] ?? null,
          }))
          // Ordenar por cve_lote; filas sin lote van al final
          .sort((a: any, b: any) =>
            (a._lote?.cve_lote ?? 'zzz').localeCompare(b._lote?.cve_lote ?? 'zzz', 'es-MX'))

        setRows(combined)
        setLoading(false)
      })
  }, [])

  // Mapa sección id → nombre (construido al render)
  const secMap: Record<number, string> = {}
  secciones.forEach(s => { secMap[s.id] = s.nombre })

  const filtered = rows.filter(r => {
    const lote = r._lote
    const prop = r._prop
    if (filterSec    && lote?.id_seccion_fk !== Number(filterSec)) return false
    if (filterStatus && lote?.status_lote   !== filterStatus)       return false
    if (search) {
      const q      = search.toLowerCase()
      const clave  = (lote?.cve_lote ?? '').toLowerCase()
      const nombre = [prop?.nombre, prop?.apellido_paterno, prop?.apellido_materno]
        .filter(Boolean).join(' ').toLowerCase()
      const rfc    = (prop?.rfc ?? '').toLowerCase()
      if (!clave.includes(q) && !nombre.includes(q) && !rfc.includes(q)) return false
    }
    return true
  })

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 175 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
            <option value="">Todas las secciones</option>
            {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <select className="select" style={{ minWidth: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {['Vendido', 'Libre', 'Bloqueado'].map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="input" style={{ minWidth: 220 }} placeholder="Buscar lote, propietario o RFC…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      {queryError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>
          Error al cargar datos: {queryError}
        </div>
      )}

      <PrintBar title="Lotes_Propietarios" count={filtered.length} reportTitle="Lotes y Propietarios" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Clave Lote</th>
              <th>Sección</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Propietario</th>
              <th>RFC</th>
              <th>Tipo Persona</th>
              <th style={{ textAlign: 'center' }}>Principal</th>
              <th style={{ textAlign: 'right' }}>% Propiedad</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Sin registros
                </td>
              </tr>
            ) : filtered.map((r, i) => {
              const l        = r._lote
              const p        = r._prop
              const stColor  = STATUS_COLOR[l?.status_lote ?? ''] ?? 'var(--text-muted)'
              const secNombre = l?.id_seccion_fk ? (secMap[l.id_seccion_fk] ?? '—') : '—'
              const claveLote = l?.cve_lote
                ? l.cve_lote
                : l?.lote ? `#${l.lote}` : '—'
              const nombre = p
                ? [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') || '—'
                : '—'

              return (
                <tr key={`${r.id_lote_fk ?? i}-${r.id_propietario_fk ?? i}`}>
                  <td style={{ fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap' }}>
                    {claveLote}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {secNombre}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {l?.tipo_lote ?? '—'}
                  </td>
                  <td>
                    {l?.status_lote ? (
                      <span style={{ fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 20,
                        color: stColor, background: stColor + '15', border: `1px solid ${stColor}40` }}>
                        {l.status_lote}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ fontWeight: 500 }}>{nombre}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {p?.rfc ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {p?.tipo_persona ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12,
                    color: r.es_principal ? '#15803d' : 'var(--text-muted)',
                    fontWeight: r.es_principal ? 600 : 400 }}>
                    {r.es_principal ? '✓ Sí' : 'No'}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                    {r.porcentaje ? `${r.porcentaje}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
