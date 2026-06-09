'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { Award, Search, RefreshCw } from 'lucide-react'

type FedRow = {
  id: number
  clave: string | null
  periodo: number
  comprobante_url: string | null
  notas: string | null
  cat_socios: {
    numero_socio: string | null
    nombre: string
    apellido_paterno: string | null
    apellido_materno: string | null
    email: string | null
    cat_categorias_socios: { nombre: string } | null
  } | null
}

const anioActual = new Date().getFullYear()
const ANIOS = Array.from({ length: 10 }, (_, i) => anioActual - i)

export default function ReporteMiembrosFederados() {
  const [periodo, setPeriodo] = useState<string>(String(anioActual))
  const [search, setSearch]   = useState('')
  const [rows, setRows]       = useState<FedRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbGolf
      .from('ctrl_federacion')
      .select(`
        id, clave, periodo, comprobante_url, notas,
        cat_socios (
          numero_socio, nombre, apellido_paterno, apellido_materno, email,
          cat_categorias_socios ( nombre )
        )
      `)
      .order('periodo', { ascending: false })
      .order('cat_socios(numero_socio)', { ascending: true } as any)

    if (periodo) q = q.eq('periodo', Number(periodo))

    const { data } = await q
    setRows((data as unknown as FedRow[]) ?? [])
    setLoading(false)
  }, [periodo])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = search.trim()
    ? rows.filter(r => {
        const s = r.cat_socios
        const txt = [s?.numero_socio, s?.nombre, s?.apellido_paterno, s?.apellido_materno, r.clave]
          .filter(Boolean).join(' ').toLowerCase()
        return search.trim().toLowerCase().split(/\s+/).every(w => txt.includes(w))
      })
    : rows

  const nombreSocio = (r: FedRow) => {
    const s = r.cat_socios
    if (!s) return '—'
    return [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Período (Año)</label>
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', minWidth: 110 }}>
            <option value="">Todos los años</option>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, maxWidth: 340 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Buscar</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nombre, número de socio, clave…"
              style={{ width: '100%', padding: '8px 12px 8px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <button onClick={fetchData}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 20px', background: '#fffbeb', border: '1px solid #fde68a', minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Award size={14} style={{ color: '#d97706' }} />
            <span style={{ fontSize: 11, color: '#92400e' }}>
              {periodo ? `Federados ${periodo}` : 'Total federados'}
            </span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#d97706', lineHeight: 1 }}>{filtered.length}</div>
        </div>
      </div>

      <PrintBar title={`Miembros Federados${periodo ? ` – ${periodo}` : ''}`} count={filtered.length} />

      {/* Tabla */}
      <div id="reporte-print-area">
        {/* Header impresión */}
        <div className="print-only" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
            Miembros Federados{periodo ? ` — ${periodo}` : ''}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{filtered.length} registros</div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏌️</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>Sin registros para los filtros seleccionados</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    {['#', 'Socio', 'Categoría', 'Período', 'Clave Federación', 'Notas', 'Email'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr key={r.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fffbeb'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 11 }}>{idx + 1}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{nombreSocio(r)}</div>
                        {r.cat_socios?.numero_socio && (
                          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                            #{r.cat_socios.numero_socio}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {r.cat_socios?.cat_categorias_socios?.nombre
                          ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
                              {r.cat_socios.cat_categorias_socios.nombre}
                            </span>
                          : <span style={{ color: '#94a3b8' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#d97706', fontSize: 14 }}>
                        {r.periodo}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#1e293b' }}>
                        {r.clave ?? <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                        {r.notas ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                        {r.cat_socios?.email ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
