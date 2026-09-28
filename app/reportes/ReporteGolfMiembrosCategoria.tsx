'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { Search, RefreshCw, Users, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'

type SocioRow = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  activo: boolean
  fecha_alta: string | null
  fecha_vencimiento: string | null
  id_categoria_fk: number | null
  cat_categorias_socios: { nombre: string } | null
}

type Categoria = { id: number; nombre: string }

type Status = 'activo' | 'vencido' | 'inactivo'

const STATUS_LABEL: Record<Status, string> = { activo: 'Activo', vencido: 'Vencido', inactivo: 'Inactivo' }
const STATUS_COLOR: Record<Status, { color: string; bg: string }> = {
  activo:   { color: '#15803d', bg: '#dcfce7' },
  vencido:  { color: '#d97706', bg: '#fef3c7' },
  inactivo: { color: '#64748b', bg: '#f1f5f9' },
}

const statusOf = (s: SocioRow): Status => {
  if (!s.activo) return 'inactivo'
  if (s.fecha_vencimiento && new Date(s.fecha_vencimiento) < new Date()) return 'vencido'
  return 'activo'
}

const nombreCompleto = (s: SocioRow) => [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

const fmtFecha = (f: string | null) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function ReporteGolfMiembrosCategoria() {
  const [socios, setSocios]         = useState<SocioRow[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filtroCat, setFiltroCat]   = useState<number | ''>('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | Status>('todos')
  const [expanded, setExpanded]     = useState<Set<number>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: cats }, { data: soc }] = await Promise.all([
      dbGolf.from('cat_categorias_socios').select('id, nombre').eq('activo', true).order('nombre'),
      dbGolf.from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, activo, fecha_alta, fecha_vencimiento, id_categoria_fk, cat_categorias_socios(nombre)')
        .order('numero_socio', { ascending: true }),
    ])
    setCategorias((cats as Categoria[]) ?? [])
    setSocios((soc as unknown as SocioRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Grupos por categoría (a partir de los datos completos, sin filtrar) — base de los KPIs y la tabla resumen
  const grupos = useMemo(() => {
    const map: Record<string, { id: number | null; nombre: string; socios: SocioRow[] }> = {}
    for (const s of socios) {
      const key = s.id_categoria_fk != null ? String(s.id_categoria_fk) : 'sin-categoria'
      if (!map[key]) {
        map[key] = { id: s.id_categoria_fk, nombre: s.cat_categorias_socios?.nombre ?? 'Sin categoría', socios: [] }
      }
      map[key].socios.push(s)
    }
    return Object.values(map).sort((a, b) => b.socios.length - a.socios.length)
  }, [socios])

  const totales = useMemo(() => {
    let activos = 0, vencidos = 0, inactivos = 0
    for (const s of socios) {
      const st = statusOf(s)
      if (st === 'activo') activos++
      else if (st === 'vencido') vencidos++
      else inactivos++
    }
    return { total: socios.length, activos, vencidos, inactivos, categorias: grupos.length }
  }, [socios, grupos])

  // Grupos visibles según filtros (categoría, status, búsqueda)
  const gruposFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    return grupos
      .filter(g => filtroCat === '' || g.id === filtroCat)
      .map(g => ({
        ...g,
        socios: g.socios.filter(s => {
          if (filtroStatus !== 'todos' && statusOf(s) !== filtroStatus) return false
          if (!q) return true
          const txt = [s.numero_socio, nombreCompleto(s)].filter(Boolean).join(' ').toLowerCase()
          return txt.includes(q)
        }),
      }))
      .filter(g => g.socios.length > 0)
  }, [grupos, filtroCat, filtroStatus, search])

  const totalFiltrado = gruposFiltrados.reduce((acc, g) => acc + g.socios.length, 0)

  const toggle = (id: number | null) => {
    const key = id ?? -1
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const expandirTodo = () => setExpanded(new Set(gruposFiltrados.map(g => g.id ?? -1)))
  const colapsarTodo = () => setExpanded(new Set())

  const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nombre o número de socio…"
            style={{ width: '100%', padding: '8px 12px 8px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value ? Number(e.target.value) : '')}
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {([
            { key: 'todos',    label: 'Todos',    color: '#334155' },
            { key: 'activo',   label: 'Activos',  color: '#15803d' },
            { key: 'vencido',  label: 'Vencidos', color: '#d97706' },
            { key: 'inactivo', label: 'Inactivos', color: '#64748b' },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFiltroStatus(f.key)} style={{
              padding: '8px 14px', fontSize: 12, fontWeight: filtroStatus === f.key ? 600 : 400,
              background: filtroStatus === f.key ? f.color : '#fff',
              color: filtroStatus === f.key ? '#fff' : '#94a3b8',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={expandirTodo} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          <Maximize2 size={13} /> Expandir todo
        </button>
        <button onClick={colapsarTodo} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          <Minimize2 size={13} /> Colapsar todo
        </button>
        <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'Total socios', value: String(totales.total),      color: '#b8952a', bg: '#fefce8' },
          { label: 'Categorías',   value: String(totales.categorias), color: '#2563eb', bg: '#eff6ff' },
          { label: 'Activos',      value: String(totales.activos),    color: '#15803d', bg: '#f0fdf4' },
          { label: 'Vencidos',     value: String(totales.vencidos),   color: '#d97706', bg: '#fffbeb' },
          { label: 'Inactivos',    value: String(totales.inactivos),  color: '#64748b', bg: '#f8fafc' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', background: k.bg, border: `1px solid ${k.color}22`, minWidth: 140 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Users size={14} style={{ color: k.color }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: k.color, lineHeight: 1 }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <PrintBar title="Miembros por Categoría" count={totalFiltrado} />

      <div id="reporte-print-area">
        {/* Header impresión */}
        <div className="print-only" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Miembros por Categoría</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} · {gruposFiltrados.length} categorías · {totalFiltrado} socios
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Cargando…</div>
        ) : gruposFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>Sin socios para los filtros seleccionados</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    {['Categoría', '#Socio', 'Nombre', 'Status', 'Fecha Alta', 'Vencimiento'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gruposFiltrados.map(g => {
                    const key = g.id ?? -1
                    const isOpen = expanded.has(key)
                    const activos   = g.socios.filter(s => statusOf(s) === 'activo').length
                    const vencidos  = g.socios.filter(s => statusOf(s) === 'vencido').length
                    const inactivos = g.socios.filter(s => statusOf(s) === 'inactivo').length
                    return (
                      <React.Fragment key={key}>
                        <tr
                          onClick={() => toggle(g.id)}
                          style={{ borderBottom: '1px solid #f1f5f9', background: '#fdf9ee', cursor: 'pointer' }}>
                          <td colSpan={6} style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {isOpen ? <ChevronDown size={14} style={{ color: '#b8952a' }} /> : <ChevronRight size={14} style={{ color: '#b8952a' }} />}
                              <span style={{ fontWeight: 700, color: '#1e293b' }}>{g.nombre}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fde68a', color: '#92400e' }}>
                                {g.socios.length} socio{g.socios.length !== 1 ? 's' : ''}
                              </span>
                              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                {activos   > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, ...STATUS_COLOR.activo   }}>{activos} activos</span>}
                                {vencidos  > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, ...STATUS_COLOR.vencido  }}>{vencidos} vencidos</span>}
                                {inactivos > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, ...STATUS_COLOR.inactivo }}>{inactivos} inactivos</span>}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isOpen && g.socios.map(s => {
                          const st = statusOf(s)
                          return (
                            <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                              <td style={{ padding: '8px 12px 8px 34px', fontSize: 12, color: '#94a3b8' }}>{g.nombre}</td>
                              <td style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{s.numero_socio ?? '—'}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 500, color: '#1e293b' }}>{nombreCompleto(s)}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, ...STATUS_COLOR[st] }}>
                                  {STATUS_LABEL[st]}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{fmtFecha(s.fecha_alta)}</td>
                              <td style={{ padding: '8px 12px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{fmtFecha(s.fecha_vencimiento)}</td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
