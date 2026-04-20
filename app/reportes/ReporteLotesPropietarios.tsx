'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { RefreshCw } from 'lucide-react'
import { PrintBar } from './utils'

export default function ReporteLotesPropietarios() {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    dbCtrl.from('propietarios_lotes').select('*').eq('activo', true).order('id')
      .then(async ({ data }) => {
        const rows = data ?? []
        if (!rows.length) { setRows([]); setLoading(false); return }

        // Fetch lotes y propietarios por separado (cross-schema)
        const loteIds = Array.from(new Set(rows.map((r: any) => r.id_lote_fk).filter(Boolean)))
        const propIds = Array.from(new Set(rows.map((r: any) => r.id_propietario_fk).filter(Boolean)))

        const [{ data: lotesData }, { data: propsData }] = await Promise.all([
          dbCat.from('lotes').select('id, cve_lote, lote, tipo_lote, status_lote, id_seccion_fk').in('id', loteIds),
          dbCat.from('propietarios').select('id, nombre, apellido_paterno, apellido_materno, rfc, tipo_persona').in('id', propIds),
        ])

        const lotesMap: Record<number, any> = {}
        const propsMap: Record<number, any> = {}
        ;(lotesData ?? []).forEach((l: any) => { lotesMap[l.id] = l })
        ;(propsData ?? []).forEach((p: any) => { propsMap[p.id] = p })

        const combined = rows.map((r: any) => ({
          ...r,
          lotes:        lotesMap[r.id_lote_fk] ?? null,
          propietarios: propsMap[r.id_propietario_fk] ?? null,
        }))
        setRows(combined)
        setLoading(false)
      })
  }, [])

  const filtered = rows.filter(r => {
    if (!search) return true
    const lote = (r.lotes?.cve_lote ?? '').toLowerCase()
    const prop = `${r.propietarios?.nombre ?? ''} ${r.propietarios?.apellido_paterno ?? ''}`.toLowerCase()
    return lote.includes(search.toLowerCase()) || prop.includes(search.toLowerCase())
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Buscar lote o propietario…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      <PrintBar title="Lotes_Propietarios" count={filtered.length} reportTitle="Lotes y Propietarios" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Clave Lote</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Propietario</th>
              <th>RFC</th>
              <th>Tipo Persona</th>
              <th>Principal</th>
              <th style={{ textAlign: 'right' }}>% Propiedad</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{r.lotes?.cve_lote ?? `#${r.lotes?.lote}`}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.lotes?.tipo_lote ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{r.lotes?.status_lote ?? '—'}</td>
                <td style={{ fontWeight: 500 }}>
                  {[r.propietarios?.nombre, r.propietarios?.apellido_paterno, r.propietarios?.apellido_materno].filter(Boolean).join(' ') || '—'}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{r.propietarios?.rfc ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.propietarios?.tipo_persona ?? '—'}</td>
                <td style={{ textAlign: 'center', color: r.es_principal ? '#15803d' : 'var(--text-muted)', fontSize: 12 }}>
                  {r.es_principal ? '✓ Sí' : 'No'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                  {r.porcentaje ? `${r.porcentaje}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
