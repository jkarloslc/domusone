'use client'
import { useEffect, useState } from 'react'
import { dbCat } from '@/lib/supabase'
import { RefreshCw } from 'lucide-react'
import { PrintBar } from './utils'

export default function ReportePropietarios() {
  const [propietarios, setPropietarios] = useState<any[]>([])
  const [telefonos, setTelefonos]       = useState<Record<number, string>>({})
  const [correos, setCorreos]           = useState<Record<number, string>>({})
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterTipo, setFilterTipo]     = useState('')

  useEffect(() => {
    setLoading(true)
    dbCat.from('propietarios').select('*').order('apellido_paterno').then(({ data }) => {
      setPropietarios(data ?? [])
      // Cargar teléfonos y correos en batch
      const ids = (data ?? []).map((p: any) => p.id)
      if (ids.length) {
        dbCat.from('propietarios_telefonos').select('id_propietario_fk, numero').eq('activo', true)
          .in('id_propietario_fk', ids)
          .then(({ data: tels }) => {
            const map: Record<number, string> = {}
            ;(tels ?? []).forEach((t: any) => { if (!map[t.id_propietario_fk]) map[t.id_propietario_fk] = t.numero })
            setTelefonos(map)
          })
        dbCat.from('propietarios_correos').select('id_propietario_fk, correo').eq('activo', true)
          .in('id_propietario_fk', ids)
          .then(({ data: mails }) => {
            const map: Record<number, string> = {}
            ;(mails ?? []).forEach((m: any) => { if (!map[m.id_propietario_fk]) map[m.id_propietario_fk] = m.correo })
            setCorreos(map)
          })
      }
      setLoading(false)
    })
  }, [])

  const filtered = propietarios.filter(p => {
    const nombre = `${p.nombre ?? ''} ${p.apellido_paterno ?? ''} ${p.apellido_materno ?? ''}`.toLowerCase()
    const matchSearch = !search || nombre.includes(search.toLowerCase()) || (p.rfc ?? '').toLowerCase().includes(search.toLowerCase())
    const matchTipo   = !filterTipo || p.tipo_persona === filterTipo
    return matchSearch && matchTipo
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Buscar nombre, RFC…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select" style={{ width: 160 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Física y Moral</option>
          <option value="Física">Física</option>
          <option value="Moral">Moral</option>
        </select>
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      <PrintBar title="Directorio_Propietarios" count={filtered.length} reportTitle="Directorio de Propietarios" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Nombre Completo</th>
              <th>Tipo</th>
              <th>RFC</th>
              <th>Estado Civil</th>
              <th>Domicilio</th>
              <th>Teléfono</th>
              <th>Correo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>
                  {[p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')}
                  {p.razon_social && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.razon_social}</div>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.tipo_persona ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.rfc ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.estado_civil ?? '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 160 }}>
                  {[p.calle, p.colonia, p.ciudad, p.estado].filter(Boolean).join(', ') || '—'}
                </td>
                <td style={{ fontSize: 12 }}>{telefonos[p.id] ?? '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--blue)' }}>{correos[p.id] ?? '—'}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: p.activo ? '#15803d' : '#dc2626' }}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
