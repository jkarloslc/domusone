'use client'
import { useDebounce } from '@/lib/useDebounce'
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { dbCtrl, dbCfg, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  Camera, Trash2, ExternalLink, CheckCircle, Wrench, ChevronDown, Printer, Filter,
  ClipboardList, Boxes,
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import ColaboradorPicker from '@/components/ui/ColaboradorPicker'

const TIPOS      = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Herrería','Carpintería','Mantto. Lineas Sanitarias','Otro']
const PRIORIDADES = ['Urgente','Alta','Media','Baja']
const STATUSES    = ['Pendiente','En Proceso','En Pausa','Completada','Cancelada']

const PRIORIDAD_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Urgente': { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  'Alta':    { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  'Media':   { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Baja':    { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
}
const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Pendiente':  { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'En Proceso': { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'En Pausa':   { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  'Completada': { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Cancelada':  { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

const TIPO_INSUMO_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  mano_obra:         { color: '#7c3aed', bg: '#ede9fe', label: 'Mano de Obra' },
  material:          { color: '#1d4ed8', bg: '#dbeafe', label: 'Material' },
  equipo:            { color: '#15803d', bg: '#dcfce7', label: 'Equipo' },
  herramienta_menor: { color: '#d97706', bg: '#fef3c7', label: 'Herramienta Menor' },
}

// Explota los insumos (mano de obra, material, equipo, herramienta menor) de
// los conceptos elegidos en una OT: multiplica cada renglón de la matriz de
// PU del concepto (ctrl.mant_conceptos_insumos) por la cantidad capturada en
// la OT, y agrupa por tipo+insumo para no duplicar filas repetidas entre
// conceptos distintos.
async function explotarInsumos(conceptosOT: any[]): Promise<any[]> {
  const ids = Array.from(new Set(conceptosOT.map(c => c.id_concepto_fk).filter(Boolean)))
  if (ids.length === 0) return []
  const { data } = await dbCtrl.from('mant_conceptos_insumos').select('*').in('id_concepto_fk', ids)
  const qtyByConcepto: Record<number, number> = {}
  conceptosOT.forEach(c => {
    if (c.id_concepto_fk) qtyByConcepto[c.id_concepto_fk] = (qtyByConcepto[c.id_concepto_fk] ?? 0) + (Number(c.cantidad) || 0)
  })
  const grouped: Record<string, any> = {}
  ;(data ?? []).forEach((r: any) => {
    const q = qtyByConcepto[r.id_concepto_fk] ?? 0
    if (!q) return
    const key = `${r.tipo}__${r.id_insumo_fk ?? r.descripcion}`
    const cantidad = r.cantidad * q
    const importe  = cantidad * r.costo_unitario
    if (!grouped[key]) grouped[key] = { tipo: r.tipo, descripcion: r.descripcion, unidad: r.unidad, cantidad: 0, importe: 0 }
    grouped[key].cantidad += cantidad
    grouped[key].importe  += importe
  })
  return Object.values(grouped)
}

const Badge = ({ text, map }: { text: string; map: Record<string, any> }) => {
  const s = map[text] ?? { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {text}
    </span>
  )
}

const semanaActual = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

type Modulo = 'mantenimiento' | 'golf' | 'generales'
const MODULO_LABEL: Record<Modulo, string> = {
  mantenimiento: 'Mantenimiento',
  golf:          'Campo de Golf',
  generales:     'Generales',
}

export default function OrdenesTrabajoTab({ empresa = 'Balvanera', modulo }: {
  empresa?: 'Balvanera' | 'Cuadrilla'; modulo: Modulo
}) {
  const { canWrite, canDelete } = useAuth()
  const PAGE_SIZE = 20
  const [rows, setRows]           = useState<any[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [kpis, setKpis]           = useState({ pendientes: 0, enProceso: 0, completadas: 0, urgentes: 0 })
  const [areas, setAreas] = useState<any[]>([])
  const [areaMap, setAreaMap]       = useState<Record<number, string>>({})
  const [cuadrantes,   setCuadrantes]   = useState<any[]>([])
  const [cuadMap,  setCuadMap]    = useState<Record<number, string>>({})
  const [ccMap,  setCcMap]        = useState<Record<number, string>>({})
  const [frMap,  setFrMap]        = useState<Record<number, string>>({})
  const [acMap,  setAcMap]        = useState<Record<number, string>>({})
  const [search, setSearch]       = useState('')
  const debouncedSearch           = useDebounce(search, 300)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterCuad,   setFilterCuad]   = useState('')
  const [filterArea,  setFilterArea]    = useState('')
  const [filterAC,     setFilterAC]     = useState('')
  const [areasComunes, setAreasComunesOT] = useState<any[]>([])
  const [areaToAcs,    setAreaToAcs]      = useState<Record<number, number[]>>({})
  const [centrosCosto, setCentrosCosto]   = useState<any[]>([])
  const [frentes,      setFrentes]        = useState<any[]>([])
  const [areaToFrentes, setAreaToFrentes] = useState<Record<number, number[]>>({})
  const [filterCC,      setFilterCC]      = useState('')
  const [filterFrente,  setFilterFrente]  = useState('')
  // Mantto. Res usa Cuadrante/Área Común; Generales y Golf usan CC/Área/Frente
  const usaCcFrente = modulo === 'generales' || modulo === 'golf'
  const [modal,    setModal]    = useState(false)
  const [editingOT, setEditingOT] = useState<any | null>(null)
  const [detail,   setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Conteos sin filtros de status/tipo para KPIs exactos
    const { data: todos } = await dbCtrl.from('ordenes_trabajo')
      .select('status, prioridad').eq('empresa', empresa).eq('modulo', modulo)
    setKpis({
      pendientes:  (todos ?? []).filter(r => r.status === 'Pendiente').length,
      enProceso:   (todos ?? []).filter(r => r.status === 'En Proceso').length,
      completadas: (todos ?? []).filter(r => r.status === 'Completada').length,
      urgentes:    (todos ?? []).filter(r => r.prioridad === 'Urgente' && r.status !== 'Completada').length,
    })

    let q = dbCtrl.from('ordenes_trabajo').select('*', { count: 'exact' })
      .eq('empresa', empresa).eq('modulo', modulo)
      .order('fecha_inicio', { ascending: false, nullsFirst: false })
    if (debouncedSearch)  q = q.or(`folio.ilike.%${debouncedSearch}%,titulo.ilike.%${debouncedSearch}%,asignado_a.ilike.%${debouncedSearch}%`)
    if (filterStatus)     q = q.eq('status', filterStatus)
    if (filterTipo)       q = q.eq('tipo_trabajo', filterTipo)
    if (usaCcFrente) {
      if (filterCC)       q = q.eq('id_centro_costo_fk', Number(filterCC))
      if (filterArea)     q = q.eq('id_area_fk', Number(filterArea))
      if (filterFrente)   q = q.eq('id_frente_fk', Number(filterFrente))
    } else {
      if (filterCuad)     q = q.eq('id_cuadrante_fk', Number(filterCuad))
      if (filterArea)     q = q.eq('id_area_fk', Number(filterArea))
      if (filterAC)       q = q.eq('id_area_comun_fk', Number(filterAC))
    }
    const from = (page - 1) * PAGE_SIZE
    const { data, count } = await q.range(from, from + PAGE_SIZE - 1)
    setRows(data ?? []); setTotal(count ?? 0)
    setLoading(false)
  }, [empresa, modulo, usaCcFrente, debouncedSearch, filterStatus, filterTipo, filterCuad, filterArea, filterAC, filterCC, filterFrente, page])

  useEffect(() => {
    Promise.all([
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk, id_cuadrante_fk').eq('activo', true).order('nombre'),
      dbCfg.from('cuadrantes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas_comunes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('rel_area_area_comun').select('id_area, id_area_comun'),
      dbCfg.from('rel_area_frente').select('id_area, id_frente'),
    ]).then(([{ data: secs }, { data: cuads }, { data: ccs }, { data: frs }, { data: acs }, { data: rels }, { data: relsFr }]) => {
      setAreas(secs ?? [])
      setCuadrantes(cuads ?? [])
      setAreasComunesOT(acs ?? [])
      setCentrosCosto(ccs ?? [])
      setFrentes(frs ?? [])
      const sm: Record<number, string> = {}; (secs ?? []).forEach((s: any) => { sm[s.id] = s.nombre })
      const cm: Record<number, string> = {}; (ccs ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
      const fm: Record<number, string> = {}; (frs ?? []).forEach((f: any) => { fm[f.id] = f.nombre })
      const cuadm: Record<number, string> = {}; (cuads ?? []).forEach((c: any) => { cuadm[c.id] = c.nombre })
      const acm: Record<number, string> = {}; (acs ?? []).forEach((a: any) => { acm[a.id] = a.nombre })
      const ata: Record<number, number[]> = {};
      (rels ?? []).forEach((r: any) => {
        const aid = Number(r.id_area)
        if (!ata[aid]) ata[aid] = []
        ata[aid].push(Number(r.id_area_comun))
      })
      const atf: Record<number, number[]> = {};
      (relsFr ?? []).forEach((r: any) => {
        const aid = Number(r.id_area)
        if (!atf[aid]) atf[aid] = []
        atf[aid].push(Number(r.id_frente))
      })
      setAreaMap(sm); setCcMap(cm); setFrMap(fm); setCuadMap(cuadm); setAcMap(acm); setAreaToAcs(ata); setAreaToFrentes(atf)
    })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])


  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Pendientes',  value: kpis.pendientes,  color: '#d97706', bg: '#fffbeb' },
          { label: 'En Proceso',  value: kpis.enProceso,   color: '#2563eb', bg: '#eff6ff' },
          { label: 'Completadas', value: kpis.completadas, color: '#15803d', bg: '#f0fdf4' },
          { label: 'Urgentes',    value: kpis.urgentes,    color: '#dc2626', bg: '#fef2f2' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 12px', background: k.bg }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros + Nueva OT */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
        {/* Búsqueda */}
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
          <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="input" style={{ paddingLeft: 24, fontSize: 12, height: 28 }}
            placeholder="Folio, título, asignado…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        {/* Filtros tipo / status */}
        <select className="select" style={{ flex: '1 1 90px', maxWidth: 130, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
          <option value="">Status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 90px', maxWidth: 130, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1) }}>
          <option value="">Tipo</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        {/* Filtros ubicación */}
        {usaCcFrente ? (
          <>
            <select className="select" style={{ flex: '1 1 120px', maxWidth: 200, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterCC} onChange={e => { setFilterCC(e.target.value); setFilterArea(''); setFilterFrente(''); setPage(1) }}>
              <option value="">Centro de Costo</option>
              {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 100px', maxWidth: 170, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterArea} onChange={e => { setFilterArea(e.target.value); setFilterFrente(''); setPage(1) }}>
              <option value="">Área</option>
              {areas
                .filter((s: any) => !filterCC || s.id_centro_costo_fk === Number(filterCC))
                .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 90px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterFrente} onChange={e => { setFilterFrente(e.target.value); setPage(1) }}>
              <option value="">Frente</option>
              {frentes
                .filter(f => !filterArea || (areaToFrentes[Number(filterArea)] ?? []).includes(f.id))
                .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </>
        ) : (
          <>
            <select className="select" style={{ flex: '1 1 120px', maxWidth: 200, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterCuad} onChange={e => { setFilterCuad(e.target.value); setFilterArea(''); setFilterAC(''); setPage(1) }}>
              <option value="">Cuadrante</option>
              {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 100px', maxWidth: 170, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterArea} onChange={e => { setFilterArea(e.target.value); setFilterAC(''); setPage(1) }}>
              <option value="">Área</option>
              {areas
                .filter((s: any) => !filterCuad || s.id_cuadrante_fk === Number(filterCuad))
                .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 90px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterAC} onChange={e => { setFilterAC(e.target.value); setPage(1) }}>
              <option value="">Área Común</option>
              {areasComunes
                .filter(a => !filterArea || (areaToAcs[Number(filterArea)] ?? []).includes(a.id))
                .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </>
        )}
        {(search || filterStatus || filterTipo || filterCuad || filterArea || filterAC || filterCC || filterFrente) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterTipo(''); setFilterCuad(''); setFilterArea(''); setFilterAC(''); setFilterCC(''); setFilterFrente(''); setPage(1) }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28 }} onClick={fetchData}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }} onClick={() => { setEditingOT(null); setModal(true) }}>
            <Plus size={12} /> Nueva OT
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Folio</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Título</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Tipo</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>{usaCcFrente ? 'CC / Área / Frente' : 'Área / Área Común'}</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Asignado</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>F. Límite</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Prioridad</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Status</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                Sin órdenes de trabajo registradas
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: r.status === 'Cancelada' ? 0.5 : 1 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, padding: '8px 10px' }}>{r.folio}</td>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{r.titulo}</div>
                  {r.ubicacion_detalle && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.ubicacion_detalle}</div>}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{r.tipo_trabajo ?? '—'}</td>
                <td style={{ fontSize: 11, padding: '8px 10px' }}>
                  {usaCcFrente ? (
                    <>
                      {r.id_centro_costo_fk ? (ccMap[r.id_centro_costo_fk] ?? '—') : (r.id_area_fk ? (areaMap[r.id_area_fk] ?? '—') : '—')}
                      {r.id_frente_fk && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{frMap[r.id_frente_fk] ?? '—'}</div>
                      )}
                    </>
                  ) : (
                    <>
                      {r.id_area_fk ? (areaMap[r.id_area_fk] ?? '—') : '—'}
                      {r.id_area_comun_fk && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{acMap[r.id_area_comun_fk] ?? '—'}</div>
                      )}
                    </>
                  )}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{r.asignado_a ?? '—'}</td>
                <td style={{ fontSize: 11, padding: '8px 10px',
                  color: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? '#dc2626' : 'var(--text-secondary)',
                  fontWeight: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? 600 : 400 }}>
                  {fmtFecha(r.fecha_limite)}
                </td>
                <td style={{ padding: '8px 10px' }}><Badge text={r.prioridad ?? 'Media'} map={PRIORIDAD_STYLE} /></td>
                <td style={{ padding: '8px 10px' }}><Badge text={r.status} map={STATUS_STYLE} /></td>
                <td style={{ padding: '4px 6px' }}>
                  <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setDetail(r)}>
                    <Eye size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {total > PAGE_SIZE && (
        <PaginationNav page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      )}

      {modal  && <OTModal areas={areas} cuadrantes={cuadrantes} areasComunes={areasComunes} areaToAcs={areaToAcs}
        centrosCosto={centrosCosto} frentes={frentes} areaToFrentes={areaToFrentes} usaCcFrente={usaCcFrente}
        ot={editingOT} empresa={empresa} modulo={modulo}
        onClose={() => { setModal(false); setEditingOT(null) }}
        onSaved={() => { setModal(false); setEditingOT(null); fetchData() }} />}
      {detail && <OTDetail ot={detail} areaMap={areaMap} ccMap={ccMap} frMap={frMap} cuadMap={cuadMap} acMap={acMap}
        onClose={() => { setDetail(null); fetchData() }}
        onEdit={ot => { setDetail(null); setEditingOT(ot); setModal(true) }} />}
    </div>
  )
}

// ── OTModal ────────────────────────────────────────────────────
function OTModal({ areas, cuadrantes, areasComunes, areaToAcs, centrosCosto, frentes, areaToFrentes, usaCcFrente, ot, empresa = 'Balvanera', modulo, onClose, onSaved }: {
  areas: any[]; cuadrantes: any[]; areasComunes: any[]; areaToAcs: Record<number, number[]>
  centrosCosto: any[]; frentes: any[]; areaToFrentes: Record<number, number[]>; usaCcFrente: boolean
  ot?: any; empresa?: 'Balvanera' | 'Cuadrilla'; modulo: Modulo; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [catManoObra, setCatManoObra] = useState<any[]>([])
  const [manoObra, setManoObra]      = useState<any[]>([])
  const [form, setForm] = useState({
    titulo:             ot?.titulo            ?? '',
    tipo_trabajo:       ot?.tipo_trabajo      ?? '',
    prioridad:          ot?.prioridad         ?? 'Media',
    status:             ot?.status            ?? 'Pendiente',
    id_area_fk:         ot?.id_area_fk?.toString()      ?? '',
    id_cuadrante_fk:    ot?.id_cuadrante_fk?.toString()    ?? '',
    id_area_comun_fk:   ot?.id_area_comun_fk?.toString()   ?? '',
    id_centro_costo_fk: ot?.id_centro_costo_fk?.toString() ?? '',
    id_frente_fk:       ot?.id_frente_fk?.toString()       ?? '',
    ubicacion_detalle:  ot?.ubicacion_detalle ?? '',
    descripcion:        ot?.descripcion       ?? '',
    notas:              ot?.notas             ?? '',
    asignado_a:         ot?.asignado_a        ?? '',
    supervisor:         ot?.supervisor        ?? '',
    fecha_inicio:       ot?.fecha_inicio      ?? '',
    fecha_limite:       ot?.fecha_limite      ?? '',
    por_conceptos:      ot?.por_conceptos     ?? false,
  })
  const [recursos, setRecursos] = useState<any[]>(
    ot ? [] : [{ cantidad: '', descripcion: '', tipo: 'Material', costo: '0' }]
  )
  useEffect(() => {
    if (ot?.id) {
      dbCtrl.from('ot_recursos').select('*').eq('id_ot_fk', ot.id).order('id')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setRecursos(data.map((r: any) => ({
              id: r.id, cantidad: r.cantidad ?? '', descripcion: r.descripcion ?? '',
              tipo: r.tipo ?? 'Material', costo: r.costo?.toString() ?? '0',
            })))
          }
        })
      dbCtrl.from('ot_mano_obra').select('*').eq('id_ot_fk', ot.id).order('id')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setManoObra(data.map((r: any) => ({
              id: r.id, id_categoria_fk: r.id_categoria_fk?.toString() ?? '',
              trabajadores: r.trabajadores?.toString() ?? '1', horas: r.horas?.toString() ?? '',
            })))
          }
        })
      dbCtrl.from('ot_conceptos').select('*').eq('id_ot_fk', ot.id).order('orden').order('id')
        .then(({ data }) => { if (data) setConceptosOT(data) })
    }
  }, [ot?.id])

  // ── Costeo "Por Conceptos" ────────────────────────────────────
  const [conceptosOT, setConceptosOT] = useState<any[]>([])
  const [formConcepto, setFormConcepto] = useState({
    search: '', id_concepto_fk: null as number | null,
    codigo: '', descripcion: '', unidad: '', cantidad: '', costo_unitario: '',
  })
  const [conceptoResults, setConceptoResults] = useState<any[]>([])
  const [searchingConcepto, setSearchingConcepto] = useState(false)
  const dSearchConcepto = useDebounce(formConcepto.search, 250)
  const [explosion, setExplosion] = useState<any[]>([])
  const [explosionLoading, setExplosionLoading] = useState(false)

  useEffect(() => {
    if (dSearchConcepto.length < 2) { setConceptoResults([]); return }
    setSearchingConcepto(true)
    dbCtrl.from('mant_conceptos').select('id, codigo, descripcion, unidad, pu_venta').eq('activo', true)
      .or(`codigo.ilike.%${dSearchConcepto}%,descripcion.ilike.%${dSearchConcepto}%`).limit(8)
      .then(({ data }) => { setConceptoResults(data ?? []); setSearchingConcepto(false) })
  }, [dSearchConcepto])

  const selectConcepto = (c: any) => {
    setFormConcepto(f => ({ ...f, id_concepto_fk: c.id, codigo: c.codigo, descripcion: c.descripcion,
      unidad: c.unidad, costo_unitario: String(c.pu_venta ?? 0), search: `${c.codigo} · ${c.descripcion}` }))
    setConceptoResults([])
  }

  const addConcepto = () => {
    if (!formConcepto.id_concepto_fk || !formConcepto.cantidad) return
    setConceptosOT(list => [...list, {
      id_concepto_fk: formConcepto.id_concepto_fk, codigo: formConcepto.codigo, descripcion: formConcepto.descripcion,
      unidad: formConcepto.unidad, cantidad: Number(formConcepto.cantidad), costo_unitario: Number(formConcepto.costo_unitario || 0),
    }])
    setFormConcepto({ search: '', id_concepto_fk: null, codigo: '', descripcion: '', unidad: '', cantidad: '', costo_unitario: '' })
  }

  const removeConcepto = (idx: number) => setConceptosOT(list => list.filter((_, i) => i !== idx))

  const costoConceptosTotal = conceptosOT.reduce((a, c) => a + (Number(c.cantidad) || 0) * (Number(c.costo_unitario) || 0), 0)

  useEffect(() => {
    if (!form.por_conceptos || conceptosOT.length === 0) { setExplosion([]); return }
    setExplosionLoading(true)
    explotarInsumos(conceptosOT).then(rows => { setExplosion(rows); setExplosionLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptosOT, form.por_conceptos])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    dbCfg.from('cat_categorias_mano_obra').select('id, categoria, costo_hora_referencia').eq('activo', true).order('categoria')
      .then(({ data }) => setCatManoObra(data ?? []))
  }, [])
  const setR = (i: number, k: string, v: string) =>
    setRecursos(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const costoTotal = recursos.reduce((a, r) => a + Number(r.costo || 0), 0)

  const handleSave = async () => {
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return }
    setSaving(true); setError('')
    const isNew = !ot
    let otId = ot?.id
    if (isNew) {
      const prefijo = { mantenimiento: 'OTM', golf: 'OTG', generales: 'OTC' }[modulo]
      const { count } = await dbCtrl.from('ordenes_trabajo')
        .select('id', { count: 'exact', head: true }).eq('modulo', modulo)
      const anio  = new Date().getFullYear()
      const folio = `${prefijo}-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`
      const { data: newOT, error: err } = await dbCtrl.from('ordenes_trabajo').insert({
        folio, empresa, modulo, titulo: form.titulo.trim(), tipo_trabajo: form.tipo_trabajo || null,
        prioridad: form.prioridad, status: form.status,
        id_area_fk:         form.id_area_fk      ? Number(form.id_area_fk)      : null,
        id_cuadrante_fk:    form.id_cuadrante_fk   ? Number(form.id_cuadrante_fk)   : null,
        id_area_comun_fk:   form.id_area_comun_fk  ? Number(form.id_area_comun_fk)  : null,
        id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
        id_frente_fk:       form.id_frente_fk       ? Number(form.id_frente_fk)       : null,
        ubicacion_detalle: form.ubicacion_detalle.trim() || null,
        descripcion: form.descripcion.trim() || null, notas: form.notas.trim() || null,
        asignado_a: form.asignado_a.trim() || null, supervisor: form.supervisor.trim() || null,
        fecha_inicio: form.fecha_inicio || null, fecha_limite: form.fecha_limite || null,
        semana_no: form.status === 'Completada' ? semanaActual() : null,
        anio: new Date().getFullYear(), created_by: authUser?.nombre ?? null,
        por_conceptos: form.por_conceptos,
      }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      otId = newOT.id
    } else {
      const { error: err } = await dbCtrl.from('ordenes_trabajo').update({
        titulo: form.titulo.trim(), tipo_trabajo: form.tipo_trabajo || null,
        prioridad: form.prioridad, status: form.status,
        id_area_fk:         form.id_area_fk      ? Number(form.id_area_fk)      : null,
        id_cuadrante_fk:    form.id_cuadrante_fk   ? Number(form.id_cuadrante_fk)   : null,
        id_area_comun_fk:   form.id_area_comun_fk  ? Number(form.id_area_comun_fk)  : null,
        id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
        id_frente_fk:       form.id_frente_fk       ? Number(form.id_frente_fk)       : null,
        ubicacion_detalle: form.ubicacion_detalle.trim() || null,
        descripcion: form.descripcion.trim() || null, notas: form.notas.trim() || null,
        asignado_a: form.asignado_a.trim() || null, supervisor: form.supervisor.trim() || null,
        fecha_inicio: form.fecha_inicio || null, fecha_limite: form.fecha_limite || null,
        semana_no: form.status === 'Completada' ? semanaActual() : null,
        fecha_cierre: form.status === 'Completada' ? new Date().toISOString().slice(0,10) : null,
        updated_at: new Date().toISOString(),
        por_conceptos: form.por_conceptos,
      }).eq('id', ot.id)
      if (err) { setError(err.message); setSaving(false); return }
    }

    // Costeo por Conceptos vs. manual (Mano de Obra + Recursos): al cambiar
    // de modo se limpia el otro para no arrastrar costos duplicados/obsoletos.
    if (otId && form.por_conceptos) {
      await dbCtrl.from('ot_recursos').delete().eq('id_ot_fk', otId)
      await dbCtrl.from('ot_mano_obra').delete().eq('id_ot_fk', otId)
      const idsExistentesConcepto = conceptosOT.filter(c => c.id).map(c => c.id)
      const { data: conceptosActuales } = await dbCtrl.from('ot_conceptos').select('id').eq('id_ot_fk', otId)
      const idsAEliminarConcepto = (conceptosActuales ?? []).filter((r: any) => !idsExistentesConcepto.includes(r.id)).map((r: any) => r.id)
      if (idsAEliminarConcepto.length) await dbCtrl.from('ot_conceptos').delete().in('id', idsAEliminarConcepto)
      for (const c of conceptosOT.filter(c => c.id)) {
        await dbCtrl.from('ot_conceptos').update({
          id_concepto_fk: c.id_concepto_fk, codigo: c.codigo, descripcion: c.descripcion, unidad: c.unidad,
          cantidad: Number(c.cantidad), costo_unitario: Number(c.costo_unitario),
        }).eq('id', c.id)
      }
      const nuevosConceptos = conceptosOT.filter(c => !c.id)
      if (nuevosConceptos.length) {
        await dbCtrl.from('ot_conceptos').insert(nuevosConceptos.map((c, i) => ({
          id_ot_fk: otId, id_concepto_fk: c.id_concepto_fk, codigo: c.codigo, descripcion: c.descripcion,
          unidad: c.unidad, cantidad: Number(c.cantidad), costo_unitario: Number(c.costo_unitario), orden: i,
        })))
      }
      setSaving(false); onSaved()
      return
    }
    if (otId && !form.por_conceptos) {
      await dbCtrl.from('ot_conceptos').delete().eq('id_ot_fk', otId)
    }

    const recursosValidos = recursos.filter(r => r.descripcion.trim())
    if (otId) {
      if (!isNew) {
        const idsExistentes = recursosValidos.filter(r => r.id).map(r => r.id)
        const { data: recActuales } = await dbCtrl.from('ot_recursos').select('id').eq('id_ot_fk', otId)
        const idsAEliminar = (recActuales ?? []).filter((r: any) => !idsExistentes.includes(r.id)).map((r: any) => r.id)
        if (idsAEliminar.length) await dbCtrl.from('ot_recursos').delete().in('id', idsAEliminar)
        for (const r of recursosValidos.filter(r => r.id)) {
          await dbCtrl.from('ot_recursos').update({ cantidad: r.cantidad || null, descripcion: r.descripcion, tipo: r.tipo || null, costo: Number(r.costo || 0) }).eq('id', r.id)
        }
      }
      const nuevos = recursosValidos.filter(r => !r.id)
      if (nuevos.length) {
        await dbCtrl.from('ot_recursos').insert(
          nuevos.map(r => ({ id_ot_fk: otId, cantidad: r.cantidad || null, descripcion: r.descripcion, tipo: r.tipo || null, costo: Number(r.costo || 0) }))
        )
      }
      // Mano de Obra
      const moValidos = manoObra.filter(r => r.id_categoria_fk && r.horas)
      if (!isNew) {
        const idsExMO = moValidos.filter(r => r.id).map(r => r.id)
        const { data: moAct } = await dbCtrl.from('ot_mano_obra').select('id').eq('id_ot_fk', otId)
        const idsDelMO = (moAct ?? []).filter((r: any) => !idsExMO.includes(r.id)).map((r: any) => r.id)
        if (idsDelMO.length) await dbCtrl.from('ot_mano_obra').delete().in('id', idsDelMO)
        for (const r of moValidos.filter(r => r.id)) {
          const cat = catManoObra.find(c => c.id === Number(r.id_categoria_fk))
          const costo = Number(r.trabajadores || 1) * Number(r.horas) * Number(cat?.costo_hora_referencia || 0)
          await dbCtrl.from('ot_mano_obra').update({ id_categoria_fk: Number(r.id_categoria_fk), trabajadores: Number(r.trabajadores || 1), horas: Number(r.horas), costo_total: costo }).eq('id', r.id)
        }
      }
      const nuevosMO = moValidos.filter(r => !r.id)
      if (nuevosMO.length) {
        await dbCtrl.from('ot_mano_obra').insert(nuevosMO.map(r => {
          const cat = catManoObra.find(c => c.id === Number(r.id_categoria_fk))
          const costo = Number(r.trabajadores || 1) * Number(r.horas) * Number(cat?.costo_hora_referencia || 0)
          return { id_ot_fk: otId, id_categoria_fk: Number(r.id_categoria_fk), trabajadores: Number(r.trabajadores || 1), horas: Number(r.horas), costo_total: costo }
        }))
      }
    }
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={ot ? 'Editar OT' : 'Nueva Orden de Trabajo'} onClose={onClose} maxWidth={620}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}
          <div><label className="label" style={{ fontSize: 11 }}>Título *</label>
            <input className="input" style={{ fontSize: 13 }} value={form.titulo} onChange={setF('titulo')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Tipo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo_trabajo} onChange={setF('tipo_trabajo')}>
                <option value="">—</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><label className="label" style={{ fontSize: 11 }}>Prioridad</label>
              <select className="select" style={{ fontSize: 12 }} value={form.prioridad} onChange={setF('prioridad')}>
                {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div><label className="label" style={{ fontSize: 11 }}>Status</label>
              <select className="select" style={{ fontSize: 12 }} value={form.status} onChange={setF('status')}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select></div>
          </div>
          {usaCcFrente ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><label className="label" style={{ fontSize: 11 }}>Centro de Costo</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_centro_costo_fk}
                  onChange={e => setForm(f => ({ ...f, id_centro_costo_fk: e.target.value, id_area_fk: '', id_frente_fk: '' }))}>
                  <option value="">—</option>
                  {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select></div>
              <div><label className="label" style={{ fontSize: 11 }}>Área</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk}
                  onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value, id_frente_fk: '' }))}>
                  <option value="">—</option>
                  {(areas as any[])
                    .filter(s => !form.id_centro_costo_fk || s.id_centro_costo_fk === Number(form.id_centro_costo_fk))
                    .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select></div>
              <div><label className="label" style={{ fontSize: 11 }}>Frente</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_frente_fk}
                  onChange={setF('id_frente_fk')} disabled={!form.id_area_fk}>
                  <option value="">— {form.id_area_fk ? 'Seleccionar' : 'Elige área primero'} —</option>
                  {frentes
                    .filter(f => (areaToFrentes[Number(form.id_area_fk)] ?? []).includes(f.id))
                    .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select></div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><label className="label" style={{ fontSize: 11 }}>Cuadrante</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_cuadrante_fk}
                  onChange={e => setForm(f => ({ ...f, id_cuadrante_fk: e.target.value, id_area_fk: '', id_area_comun_fk: '' }))}>
                  <option value="">—</option>
                  {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select></div>
              <div><label className="label" style={{ fontSize: 11 }}>Área</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk}
                  onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value, id_area_comun_fk: '' }))}>
                  <option value="">—</option>
                  {(areas as any[])
                    .filter(s => !form.id_cuadrante_fk || s.id_cuadrante_fk === Number(form.id_cuadrante_fk))
                    .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select></div>
              <div><label className="label" style={{ fontSize: 11 }}>Área Común</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_area_comun_fk}
                  onChange={setF('id_area_comun_fk')} disabled={!form.id_area_fk}>
                  <option value="">— {form.id_area_fk ? 'Seleccionar' : 'Elige área primero'} —</option>
                  {areasComunes
                    .filter(a => (areaToAcs[Number(form.id_area_fk)] ?? []).includes(a.id))
                    .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select></div>
            </div>
          )}
          <div><label className="label" style={{ fontSize: 11 }}>Ubicación detalle</label>
            <input className="input" style={{ fontSize: 13 }} value={form.ubicacion_detalle} onChange={setF('ubicacion_detalle')} /></div>
          <div><label className="label" style={{ fontSize: 11 }}>Descripción</label>
            <textarea className="input" rows={2} value={form.descripcion} onChange={setF('descripcion')} style={{ fontSize: 13, resize: 'vertical' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Asignado a</label>
              <ColaboradorPicker value={form.asignado_a} filtro="es_asignado" label="Seleccionar — Asignado a"
                onChange={v => setForm(f => ({ ...f, asignado_a: v }))} /></div>
            <div><label className="label" style={{ fontSize: 11 }}>Supervisor</label>
              <ColaboradorPicker value={form.supervisor} filtro="es_supervisor" label="Seleccionar — Supervisor"
                onChange={v => setForm(f => ({ ...f, supervisor: v }))} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>F. Inicio</label><input className="input" style={{ fontSize: 13 }} type="date" value={form.fecha_inicio} onChange={setF('fecha_inicio')} /></div>
            <div><label className="label" style={{ fontSize: 11 }}>F. Límite</label><input className="input" style={{ fontSize: 13 }} type="date" value={form.fecha_limite} onChange={setF('fecha_limite')} /></div>
            <div><label className="label" style={{ fontSize: 11 }}>Semana</label>
              <div className="input" style={{ fontSize: 13, color: 'var(--text-muted)', background: 'var(--bg-subtle, #f8fafc)' }}>
                {form.status === 'Completada' ? semanaActual() : '—'}
              </div>
            </div>
          </div>
          <div><label className="label" style={{ fontSize: 11 }}>Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={setF('notas')} style={{ fontSize: 13, resize: 'vertical' }} /></div>

          {/* Toggle Por Conceptos */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '10px 12px', borderRadius: 8,
            background: form.por_conceptos ? '#ecfdf5' : '#f8fafc',
            border: `1px solid ${form.por_conceptos ? '#6ee7b7' : '#e2e8f0'}` }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: form.por_conceptos ? '#047857' : 'var(--text-secondary)' }}>
                Costeo por Conceptos
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                Arma el costo eligiendo conceptos del catálogo (con su explosión de insumos) en vez de capturar Mano de Obra/Recursos manualmente
              </div>
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, por_conceptos: !f.por_conceptos }))}
              style={{ width: 42, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative',
                background: form.por_conceptos ? '#10b981' : '#cbd5e1', flexShrink: 0, transition: 'background .15s' }}>
              <span style={{ position: 'absolute', top: 2, left: form.por_conceptos ? 20 : 2, width: 20, height: 20,
                borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
            </button>
          </div>

          {form.por_conceptos && (
            <ConceptosPanel
              conceptosOT={conceptosOT} formConcepto={formConcepto} setFormConcepto={setFormConcepto}
              conceptoResults={conceptoResults} searchingConcepto={searchingConcepto}
              selectConcepto={selectConcepto} addConcepto={addConcepto} removeConcepto={removeConcepto}
              costoConceptosTotal={costoConceptosTotal}
              explosion={explosion} explosionLoading={explosionLoading}
            />
          )}

          {/* Mano de Obra */}
          {!form.por_conceptos && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#b45309', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Mano de Obra</div>
            {manoObra.map((r, i) => {
              const cat = catManoObra.find(c => c.id === Number(r.id_categoria_fk))
              const costo = Number(r.trabajadores || 1) * Number(r.horas || 0) * Number(cat?.costo_hora_referencia || 0)
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 70px 24px', gap: 6, marginBottom: 6 }}>
                  <select className="select" style={{ fontSize: 11 }} value={r.id_categoria_fk}
                    onChange={e => setManoObra(m => m.map((x,j) => j===i ? {...x, id_categoria_fk: e.target.value} : x))}>
                    <option value="">— Categoría —</option>
                    {catManoObra.map(c => <option key={c.id} value={c.id}>{c.categoria}</option>)}
                  </select>
                  <input className="input" type="number" min="1" style={{ fontSize: 11, textAlign: 'center' }} value={r.trabajadores} placeholder="Trab."
                    onChange={e => setManoObra(m => m.map((x,j) => j===i ? {...x, trabajadores: e.target.value} : x))} />
                  <input className="input" type="number" step="0.5" min="0" style={{ fontSize: 11, textAlign: 'right' }} value={r.horas} placeholder="Hrs"
                    onChange={e => setManoObra(m => m.map((x,j) => j===i ? {...x, horas: e.target.value} : x))} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {costo > 0 ? `$${costo.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}
                  </div>
                  <button className="btn-ghost" style={{ padding: '3px' }} onClick={() => setManoObra(m => m.filter((_,j) => j!==i))}><X size={10} /></button>
                </div>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn-ghost" style={{ fontSize: 11 }}
                onClick={() => setManoObra(m => [...m, { id_categoria_fk: '', trabajadores: '1', horas: '' }])}>
                <Plus size={10} /> Agregar
              </button>
              {manoObra.length > 0 && (() => {
                const total = manoObra.reduce((acc, r) => {
                  const cat = catManoObra.find(c => c.id === Number(r.id_categoria_fk))
                  return acc + Number(r.trabajadores||1)*Number(r.horas||0)*Number(cat?.costo_hora_referencia||0)
                }, 0)
                return total > 0 ? <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>${total.toLocaleString('es-MX',{minimumFractionDigits:2})}</div> : null
              })()}
            </div>
          </div>
          )}
          {/* Recursos */}
          {!form.por_conceptos && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Recursos</div>
            {recursos.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 80px 24px', gap: 6, marginBottom: 6 }}>
                <input className="input" style={{ fontSize: 11 }} value={r.cantidad} onChange={e => setR(i,'cantidad',e.target.value)} placeholder="Cant." />
                <input className="input" style={{ fontSize: 11 }} value={r.descripcion} onChange={e => setR(i,'descripcion',e.target.value)} placeholder="Descripción…" />
                <select className="select" style={{ fontSize: 11 }} value={r.tipo}
                  onChange={e => setR(i,'tipo',e.target.value)}>
                  <option value="Material">Material</option>
                  <option value="Equipo">Equipo</option>
                </select>
                <input className="input" type="number" step="0.01" value={r.costo} onChange={e => setR(i,'costo',e.target.value)} style={{ textAlign: 'right', fontSize: 11 }} />
                <button className="btn-ghost" style={{ padding: '3px' }} onClick={() => setRecursos(r => r.filter((_,j) => j !== i))}><X size={10} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn-ghost" style={{ fontSize: 11 }}
                onClick={() => setRecursos(r => [...r, { cantidad: '', descripcion: '', tipo: 'Material', costo: '0' }])}>
                <Plus size={10} /> Agregar
              </button>
              {costoTotal > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>
                ${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>}
            </div>
          </div>
          )}
        </div>
    </ModalShell>
  )
}

// ── ConceptosPanel ────────────────────────────────────────────
// Sección "Por Conceptos" del formulario de OT: búsqueda/alta de
// conceptos del catálogo (con cantidad y PU) + explosión de insumos
// (incluye mano de obra) derivada de los conceptos elegidos.
function ConceptosPanel({ conceptosOT, formConcepto, setFormConcepto, conceptoResults, searchingConcepto,
  selectConcepto, addConcepto, removeConcepto, costoConceptosTotal, explosion, explosionLoading }: {
  conceptosOT: any[]
  formConcepto: { search: string; id_concepto_fk: number | null; codigo: string; descripcion: string; unidad: string; cantidad: string; costo_unitario: string }
  setFormConcepto: React.Dispatch<React.SetStateAction<any>>
  conceptoResults: any[]; searchingConcepto: boolean
  selectConcepto: (c: any) => void
  addConcepto: () => void
  removeConcepto: (idx: number) => void
  costoConceptosTotal: number
  explosion: any[]; explosionLoading: boolean
}) {
  const byTipo = (t: string) => explosion.filter(e => e.tipo === t)
  return (
    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Conceptos elegidos */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#0f766e', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <ClipboardList size={11} /> Conceptos
        </div>
        {conceptosOT.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thOT}>Código</th>
                <th style={{ ...thOT, textAlign: 'left' }}>Concepto</th>
                <th style={thOT}>Unidad</th>
                <th style={{ ...thOT, textAlign: 'right' }}>Cantidad</th>
                <th style={{ ...thOT, textAlign: 'right' }}>PU</th>
                <th style={{ ...thOT, textAlign: 'right' }}>Importe</th>
                <th style={{ ...thOT, width: 24 }}></th>
              </tr>
            </thead>
            <tbody>
              {conceptosOT.map((c, i) => (
                <tr key={c.id ?? `n${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={tdOT}>{c.codigo ?? '—'}</td>
                  <td style={tdOT}>{c.descripcion}</td>
                  <td style={{ ...tdOT, textAlign: 'center', color: 'var(--text-muted)' }}>{c.unidad ?? '—'}</td>
                  <td style={{ ...tdOT, textAlign: 'right' }}>{Number(c.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 4 })}</td>
                  <td style={{ ...tdOT, textAlign: 'right' }}>${Number(c.costo_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td style={{ ...tdOT, textAlign: 'right', fontWeight: 600 }}>${(Number(c.cantidad) * Number(c.costo_unitario)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td style={tdOT}><button className="btn-ghost" style={{ padding: 2 }} onClick={() => removeConcepto(i)}><X size={11} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {costoConceptosTotal > 0 && (
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', textAlign: 'right', marginBottom: 8 }}>
            Total: ${costoConceptosTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
        )}
        {/* Buscar y agregar concepto */}
        <div style={{ background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Buscar concepto (código o descripción)</div>
              <input className="input" style={{ fontSize: 11 }} placeholder="Buscar en catálogo de conceptos…"
                value={formConcepto.search}
                onChange={e => setFormConcepto((f: any) => ({ ...f, search: e.target.value, id_concepto_fk: null }))} />
              {conceptoResults.length > 0 && (
                <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                  {conceptoResults.map(c => (
                    <button key={c.id} onClick={() => selectConcepto(c)}
                      style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <span style={{ color: '#0f766e', fontWeight: 600, minWidth: 60 }}>{c.codigo}</span>
                      <span style={{ flex: 1 }}>{c.descripcion}</span>
                      <span style={{ color: 'var(--text-muted)' }}>${Number(c.pu_venta ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}/{c.unidad}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchingConcepto && <Loader size={11} className="animate-spin" style={{ position: 'absolute', right: 8, top: 28 }} />}
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Cantidad</div>
              <input className="input" type="number" step="0.0001" style={{ fontSize: 11, width: 90 }} placeholder="0"
                value={formConcepto.cantidad} onChange={e => setFormConcepto((f: any) => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>PU</div>
              <input className="input" type="number" step="0.01" style={{ fontSize: 11, width: 90 }} placeholder="0.00"
                value={formConcepto.costo_unitario} onChange={e => setFormConcepto((f: any) => ({ ...f, costo_unitario: e.target.value }))} />
            </div>
            <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 11 }} onClick={addConcepto}
              disabled={!formConcepto.id_concepto_fk || !formConcepto.cantidad}>
              <Plus size={11} /> Agregar
            </button>
          </div>
        </div>
      </div>

      {/* Explosión de insumos */}
      {conceptosOT.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Boxes size={11} /> Explosión de Insumos
            {explosionLoading && <Loader size={10} className="animate-spin" />}
          </div>
          {explosion.length === 0 && !explosionLoading ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
              Los conceptos elegidos no tienen insumos capturados en su matriz de PU.
            </div>
          ) : (
            (['mano_obra', 'material', 'equipo', 'herramienta_menor'] as const).map(tipo => {
              const list = byTipo(tipo)
              if (list.length === 0) return null
              const tc = TIPO_INSUMO_STYLE[tipo]
              const subtotal = list.reduce((s, e) => s + e.importe, 0)
              return (
                <div key={tipo} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color }}>{tc.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Subtotal: <strong>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ ...thOT, textAlign: 'left' }}>Insumo</th>
                        <th style={thOT}>Unidad</th>
                        <th style={{ ...thOT, textAlign: 'right' }}>Cantidad</th>
                        <th style={{ ...thOT, textAlign: 'right' }}>Costo Unit.</th>
                        <th style={{ ...thOT, textAlign: 'right' }}>Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={tdOT}>{e.descripcion}</td>
                          <td style={{ ...tdOT, textAlign: 'center', color: 'var(--text-muted)' }}>{e.unidad ?? '—'}</td>
                          <td style={{ ...tdOT, textAlign: 'right' }}>{e.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 4 })}</td>
                          <td style={{ ...tdOT, textAlign: 'right' }}>${(e.cantidad > 0 ? e.importe / e.cantidad : 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                          <td style={{ ...tdOT, textAlign: 'right', fontWeight: 600 }}>${e.importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

const thOT: React.CSSProperties = { padding: '5px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', whiteSpace: 'nowrap', textAlign: 'center' }
const tdOT: React.CSSProperties = { padding: '5px 8px', verticalAlign: 'middle' }

// ── OTDetail ───────────────────────────────────────────────────
function OTDetail({ ot, areaMap, ccMap, frMap, cuadMap, acMap, onClose, onEdit }: {
  ot: any
  areaMap: Record<number, string>
  ccMap: Record<number, string>
  frMap: Record<number, string>
  cuadMap: Record<number, string>
  acMap: Record<number, string>
  onClose: () => void
  onEdit: (ot: any) => void
}) {
  const { authUser } = useAuth()
  const [recursos,    setRecursos]   = useState<any[]>([])
  const [manoObra,    setManoObra]   = useState<any[]>([])
  const [catMO,       setCatMO]      = useState<Record<number, string>>({})
  const [evidencias,  setEvidencias] = useState<any[]>([])
  const [conceptos,   setConceptos]  = useState<any[]>([])
  const [explosion,   setExplosion]  = useState<any[]>([])
  const [loading,     setLoading]    = useState(true)
  const [uploadingAntes,   setUploadingAntes]   = useState(false)
  const [uploadingDespues, setUploadingDespues] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [currentStatus,  setCurrentStatus]  = useState(ot.status)
  const fileRefAntes   = useRef<HTMLInputElement>(null)
  const fileRefDespues = useRef<HTMLInputElement>(null)
  const fotosAntes   = evidencias.filter(e => e.tipo === 'antes')
  const fotosDespues = evidencias.filter(e => e.tipo !== 'antes')

  const fetchDetalle = useCallback(async () => {
    setLoading(true)
    const [{ data: rec }, { data: mo }, { data: ev }, { data: cats }, { data: conc }] = await Promise.all([
      dbCtrl.from('ot_recursos').select('*').eq('id_ot_fk', ot.id).order('id'),
      dbCtrl.from('ot_mano_obra').select('*').eq('id_ot_fk', ot.id).order('id'),
      dbCtrl.from('ot_evidencias').select('*').eq('id_ot_fk', ot.id).order('created_at'),
      dbCfg.from('cat_categorias_mano_obra').select('id, categoria, costo_hora_referencia').eq('activo', true),
      dbCtrl.from('ot_conceptos').select('*').eq('id_ot_fk', ot.id).order('orden').order('id'),
    ])
    setRecursos(rec ?? [])
    setManoObra(mo ?? [])
    const m: Record<number, string> = {}
    ;(cats ?? []).forEach((c: any) => { m[c.id] = c.categoria })
    setCatMO(m)
    setEvidencias(ev ?? [])
    setConceptos(conc ?? [])
    setExplosion(await explotarInsumos(conc ?? []))
    setLoading(false)
  }, [ot.id])

  useEffect(() => { fetchDetalle() }, [fetchDetalle])

  const costoRecursos  = recursos.reduce((a, r) => a + Number(r.costo || 0), 0)
  const costoConceptos = conceptos.reduce((a, c) => a + Number(c.cantidad || 0) * Number(c.costo_unitario || 0), 0)
  const costoTotal     = ot.por_conceptos ? costoConceptos : costoRecursos

  const cambiarStatus = async (nuevoStatus: string) => {
    setUpdatingStatus(true)
    const extra: any = { updated_at: new Date().toISOString() }
    if (nuevoStatus === 'Completada') {
      extra.fecha_cierre = new Date().toISOString().slice(0,10)
      extra.semana_no    = semanaActual()
    }
    const { error: err } = await dbCtrl.from('ordenes_trabajo').update({ status: nuevoStatus, ...extra }).eq('id', ot.id)
    if (err) { alert(`Error: ${err.message}`); setUpdatingStatus(false); return }
    setCurrentStatus(nuevoStatus)
    setUpdatingStatus(false)
  }

  const subirFoto = async (file: File, tipo: 'antes' | 'despues') => {
    const setUploading = tipo === 'antes' ? setUploadingAntes : setUploadingDespues
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `ot-${ot.id}/${tipo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('ot-evidencias').upload(path, file, { upsert: true })
    if (upErr) {
      alert(`Error: ${upErr.message}\nVerifica bucket "ot-evidencias" en Supabase Storage.`)
      setUploading(false); return
    }
    const { data: { publicUrl } } = supabase.storage.from('ot-evidencias').getPublicUrl(path)
    await dbCtrl.from('ot_evidencias').insert({ id_ot_fk: ot.id, url: publicUrl, nombre: file.name, tipo, created_by: authUser?.nombre ?? null })
    setUploading(false); fetchDetalle()
  }

  const eliminarEvidencia = async (id: number, url: string) => {
    if (!confirm('¿Eliminar esta evidencia?')) return
    await dbCtrl.from('ot_evidencias').delete().eq('id', id)
    const path = url.split('/ot-evidencias/')[1]
    if (path) await supabase.storage.from('ot-evidencias').remove([path])
    fetchDetalle()
  }

  const imprimirOT = async () => {
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}

    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;">🔧</div>`

    const seccion = ot.id_area_fk ? areaMap[ot.id_area_fk] ?? '—' : '—'

    const priCol: Record<string, string> = {
      'Urgente': '#dc2626', 'Alta': '#ea580c', 'Media': '#d97706', 'Baja': '#64748b'
    }
    const staCol: Record<string, string> = {
      'Pendiente': '#d97706', 'En Proceso': '#2563eb', 'En Pausa': '#7c3aed',
      'Completada': '#15803d', 'Cancelada': '#94a3b8'
    }

    const moRows = manoObra.map(r => {
      const categoria = catMO[r.id_categoria_fk] ?? '—'
      const costoMO   = Number(r.costo_total || 0)
      return `<tr>
        <td>${categoria}</td>
        <td style="text-align:center">${r.trabajadores ?? 1}</td>
        <td style="text-align:right">${Number(r.horas ?? 0).toFixed(2)}</td>
        <td style="text-align:right">${costoMO > 0 ? '$' + costoMO.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
      </tr>`
    }).join('')
    const costoMOTotal = manoObra.reduce((a, r) => a + Number(r.costo_total || 0), 0)
    const moTotalHtml  = costoMOTotal > 0
      ? `<tr style="background:#fef3c7;font-weight:700">
          <td colspan="3" style="color:#b45309">TOTAL MANO DE OBRA</td>
          <td style="text-align:right;color:#b45309">$${costoMOTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`
      : ''

    const recursoRows = recursos.map(r =>
      `<tr>
        <td>${r.cantidad ?? '—'}</td>
        <td>${r.descripcion ?? ''}</td>
        <td>${r.tipo ?? '—'}</td>
        <td style="text-align:right">${Number(r.costo) > 0 ? '$' + Number(r.costo).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
      </tr>`
    ).join('')
    const costoRecTotal = costoRecursos
    const costoHtml = costoRecTotal > 0
      ? `<tr style="background:#eff6ff;font-weight:700">
          <td colspan="3" style="color:#0D4F80">TOTAL RECURSOS</td>
          <td style="text-align:right;color:#0D4F80">$${costoRecTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`
      : ''

    const TIPO_INSUMO_LABEL: Record<string, string> = {
      mano_obra: 'Mano de Obra', material: 'Material', equipo: 'Equipo', herramienta_menor: 'Herramienta Menor',
    }
    const conceptoRows = conceptos.map(c => `<tr>
        <td>${c.codigo ?? '—'}</td>
        <td>${c.descripcion}</td>
        <td style="text-align:center">${c.unidad ?? '—'}</td>
        <td style="text-align:right">${Number(c.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 4 })}</td>
        <td style="text-align:right">$${Number(c.costo_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right">$${(Number(c.cantidad) * Number(c.costo_unitario)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      </tr>`).join('')
    const costoConceptosHtml = costoConceptos > 0
      ? `<tr style="background:#f0fdfa;font-weight:700">
          <td colspan="5" style="color:#0f766e">TOTAL CONCEPTOS</td>
          <td style="text-align:right;color:#0f766e">$${costoConceptos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`
      : ''

    const explosionRowsHtml = explosion.map(e => `<tr>
        <td>${TIPO_INSUMO_LABEL[e.tipo] ?? e.tipo}</td>
        <td>${e.descripcion}</td>
        <td style="text-align:center">${e.unidad ?? '—'}</td>
        <td style="text-align:right">${e.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 4 })}</td>
        <td style="text-align:right">$${(e.cantidad > 0 ? e.importe / e.cantidad : 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right">$${e.importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      </tr>`).join('')
    const explosionTotal = explosion.reduce((a, e) => a + e.importe, 0)
    const explosionTotalHtml = explosionTotal > 0
      ? `<tr style="background:#f1f5f9;font-weight:700">
          <td colspan="5">TOTAL INSUMOS (COSTO DIRECTO)</td>
          <td style="text-align:right">$${explosionTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`
      : ''

    const costoGranTotal = ot.por_conceptos ? costoConceptos : (costoMOTotal + costoRecTotal)
    const granTotalHtml = costoGranTotal > 0
      ? `<tr style="background:#0D4F80;color:#fff;font-weight:700;font-size:13px;">
          <td colspan="3">COSTO TOTAL DE LA OT</td>
          <td style="text-align:right">$${costoGranTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`
      : ''

    const fotosHtml = (fotos: any[]) => fotos.map(f =>
      `<div class="foto"><img src="${f.url}" /></div>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><title>OT ${ot.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 36px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 20px; }
        .org-nombre { font-size: 17px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 700; color: #0D4F80; margin-bottom: 2px; }
        h2 { font-size: 15px; font-weight: 700; color: #0D4F80; margin: 20px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 30px; margin-bottom: 14px; }
        .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 2px; }
        .val { font-size: 13px; color: #1e293b; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 7px 11px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
        .desc { background: #f8fafc; border-left: 3px solid #0D4F80; padding: 10px 14px; border-radius: 4px; font-size: 13px; line-height: 1.6; margin-bottom: 10px; }
        .notas { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; font-size: 12px; margin-bottom: 10px; }
        .firmas { display: flex; gap: 50px; margin-top: 50px; }
        .firma { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 160px; font-size: 11px; color: #64748b; }
        .fotos-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
        .foto { aspect-ratio: 4/3; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
        .foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
          <div style="font-size:12px;font-weight:600;color:#0D4F80;margin-top:3px;">Orden de Trabajo</div>
        </div>
        <div style="margin-left:auto;text-align:right;font-size:11px;color:#94a3b8;">
          Folio: <strong style="color:#0D4F80;font-size:16px;">${ot.folio}</strong><br/>
          ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <span style="font-size:18px;font-weight:700;">${ot.titulo}</span>
        <span class="badge" style="color:${priCol[ot.prioridad ?? 'Media'] ?? '#64748b'};background:${priCol[ot.prioridad ?? 'Media'] ? priCol[ot.prioridad ?? 'Media'] + '18' : '#f8fafc'};border:1px solid ${priCol[ot.prioridad ?? 'Media'] ?? '#e2e8f0'}44;">${ot.prioridad ?? 'Media'}</span>
        <span class="badge" style="color:${staCol[currentStatus] ?? '#64748b'};background:${staCol[currentStatus] ? staCol[currentStatus] + '18' : '#f8fafc'};border:1px solid ${staCol[currentStatus] ?? '#e2e8f0'}44;">${currentStatus}</span>
      </div>

      <div class="grid">
        <div><div class="lbl">Área</div><div class="val">${seccion}</div></div>
        ${ot.ubicacion_detalle ? `<div><div class="lbl">Ubicación Detalle</div><div class="val">${ot.ubicacion_detalle}</div></div>` : ''}
        ${ot.tipo_trabajo ? `<div><div class="lbl">Tipo de Trabajo</div><div class="val">${ot.tipo_trabajo}</div></div>` : ''}
        ${ot.id_cuadrante_fk ? `<div><div class="lbl">Cuadrante</div><div class="val">${cuadMap[ot.id_cuadrante_fk] ?? '—'}</div></div>` : ''}
        ${ot.id_area_comun_fk ? `<div><div class="lbl">Área Común</div><div class="val">${acMap[ot.id_area_comun_fk] ?? '—'}</div></div>` : ''}
        ${ot.id_centro_costo_fk ? `<div><div class="lbl">Centro de Costo</div><div class="val">${ccMap[ot.id_centro_costo_fk] ?? '—'}</div></div>` : ''}
        ${ot.id_frente_fk ? `<div><div class="lbl">Frente</div><div class="val">${frMap[ot.id_frente_fk] ?? '—'}</div></div>` : ''}
        ${ot.asignado_a ? `<div><div class="lbl">Asignado a</div><div class="val">${ot.asignado_a}</div></div>` : ''}
        ${ot.supervisor ? `<div><div class="lbl">Supervisor</div><div class="val">${ot.supervisor}</div></div>` : ''}
        ${ot.semana_no ? `<div><div class="lbl">Semana</div><div class="val">Semana ${ot.semana_no} — ${ot.anio}</div></div>` : ''}
        ${ot.fecha_inicio ? `<div><div class="lbl">Fecha Inicio</div><div class="val">${fmtFecha(ot.fecha_inicio)}</div></div>` : ''}
        ${ot.fecha_limite ? `<div><div class="lbl">Fecha Límite</div><div class="val">${fmtFecha(ot.fecha_limite)}</div></div>` : ''}
        ${ot.fecha_cierre ? `<div><div class="lbl">Fecha Cierre</div><div class="val">${fmtFecha(ot.fecha_cierre)}</div></div>` : ''}
      </div>

      ${ot.descripcion ? `<h2>Descripción</h2><div class="desc">${ot.descripcion}</div>` : ''}
      ${ot.notas ? `<h2>Notas</h2><div class="notas">${ot.notas}</div>` : ''}

      ${manoObra.length > 0 ? `
      <h2 style="color:#b45309;border-bottom-color:#fde68a;">Mano de Obra</h2>
      <table>
        <thead><tr><th>Categoría</th><th style="text-align:center">Trabajadores</th><th style="text-align:right">Horas</th><th style="text-align:right">Costo</th></tr></thead>
        <tbody>
          ${moRows}
          ${moTotalHtml}
        </tbody>
      </table>` : ''}

      ${recursos.length > 0 ? `
      <h2>Recursos</h2>
      <table>
        <thead><tr><th>Cantidad</th><th>Descripción</th><th>Tipo</th><th style="text-align:right">Costo</th></tr></thead>
        <tbody>
          ${recursoRows}
          ${costoHtml}
        </tbody>
      </table>` : ''}

      ${ot.por_conceptos && conceptos.length > 0 ? `
      <h2 style="color:#0f766e;border-bottom-color:#99f6e4;">Conceptos</h2>
      <table>
        <thead><tr><th>Código</th><th>Concepto</th><th>Unidad</th><th style="text-align:right">Cantidad</th><th style="text-align:right">PU</th><th style="text-align:right">Importe</th></tr></thead>
        <tbody>
          ${conceptoRows}
          ${costoConceptosHtml}
        </tbody>
      </table>` : ''}

      ${ot.por_conceptos && explosion.length > 0 ? `
      <h2>Explosión de Insumos</h2>
      <table>
        <thead><tr><th>Tipo</th><th>Insumo</th><th>Unidad</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Costo Unit.</th><th style="text-align:right">Importe</th></tr></thead>
        <tbody>
          ${explosionRowsHtml}
          ${explosionTotalHtml}
        </tbody>
      </table>` : ''}

      ${costoGranTotal > 0 ? `
      <table style="margin-top:6px;">
        <tbody>${granTotalHtml}</tbody>
      </table>` : ''}

      ${fotosAntes.length > 0 ? `
      <h2>Fotos Antes</h2>
      <div class="fotos-grid">${fotosHtml(fotosAntes)}</div>` : ''}

      ${fotosDespues.length > 0 ? `
      <h2>Fotos Después</h2>
      <div class="fotos-grid">${fotosHtml(fotosDespues)}</div>` : ''}

      <div class="firmas">
        <div class="firma">Elaboró</div>
        <div class="firma">Supervisó</div>
        <div class="firma">Conforme</div>
      </div>
      </body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={ot.folio} onClose={onClose} maxWidth={640}
    >
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 180px)', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cabecera de status y título */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{ot.titulo}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...PRIORIDAD_STYLE[ot.prioridad ?? 'Media'],
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  border: `1px solid ${PRIORIDAD_STYLE[ot.prioridad ?? 'Media']?.border ?? '#e2e8f0'}` }}>
                  {ot.prioridad ?? 'Media'}
                </span>
                <span style={{ ...STATUS_STYLE[currentStatus],
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  border: `1px solid ${STATUS_STYLE[currentStatus]?.border ?? '#e2e8f0'}` }}>
                  {currentStatus}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            {ot.tipo_trabajo && <DI label="Tipo" value={ot.tipo_trabajo} />}
            {ot.asignado_a   && <DI label="Asignado a" value={ot.asignado_a} />}
            {ot.supervisor   && <DI label="Supervisor" value={ot.supervisor} />}
            {ot.semana_no    && <DI label="Semana" value={`Semana ${ot.semana_no} — ${ot.anio}`} />}
            {ot.fecha_inicio && <DI label="Fecha Inicio" value={fmtFecha(ot.fecha_inicio)} />}
            {ot.fecha_limite && <DI label="Fecha Límite" value={fmtFecha(ot.fecha_limite)} />}
            {ot.fecha_cierre && <DI label="Fecha Cierre" value={fmtFecha(ot.fecha_cierre)} />}
            {ot.id_cuadrante_fk  && <DI label="Cuadrante"    value={cuadMap[ot.id_cuadrante_fk]  ?? `#${ot.id_cuadrante_fk}`} />}
            {ot.id_area_fk      && <DI label="Área"          value={areaMap[ot.id_area_fk]      ?? `#${ot.id_area_fk}`} />}
            {ot.id_area_comun_fk && <DI label="Área Común"   value={acMap[ot.id_area_comun_fk]   ?? `#${ot.id_area_comun_fk}`} />}
            {ot.id_centro_costo_fk && <DI label="Centro de Costo" value={ccMap[ot.id_centro_costo_fk] ?? `#${ot.id_centro_costo_fk}`} />}
            {ot.id_frente_fk       && <DI label="Frente"           value={frMap[ot.id_frente_fk]        ?? `#${ot.id_frente_fk}`} />}
          </div>

          {ot.descripcion && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Descripción</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ot.descripcion}</p>
            </div>
          )}

          {ot.notas && (
            <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>Notas</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{ot.notas}</p>
            </div>
          )}

          {!loading && !ot.por_conceptos && recursos.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Recursos</div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Cantidad</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Costo</th></tr></thead>
                  <tbody>
                    {recursos.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12 }}>{r.cantidad ?? '—'}</td>
                        <td style={{ fontSize: 13 }}>{r.descripcion}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>
                          {Number(r.costo) > 0 ? `$${Number(r.costo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                      </tr>
                    ))}
                    {costoRecursos > 0 && (
                      <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                        <td colSpan={2} style={{ color: 'var(--blue)' }}>TOTAL</td>
                        <td style={{ textAlign: 'right', color: 'var(--blue)' }}>${costoRecursos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && ot.por_conceptos && conceptos.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <ClipboardList size={11} /> Conceptos
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Código</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>PU</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
                  <tbody>
                    {conceptos.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontSize: 12 }}>{c.codigo ?? '—'}</td>
                        <td style={{ fontSize: 13 }}>{c.descripcion}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>{Number(c.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 4 })}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>${Number(c.costo_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>${(Number(c.cantidad) * Number(c.costo_unitario)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {costoConceptos > 0 && (
                      <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                        <td colSpan={4} style={{ color: '#0f766e' }}>TOTAL</td>
                        <td style={{ textAlign: 'right', color: '#0f766e' }}>${costoConceptos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {explosion.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Boxes size={11} /> Explosión de Insumos
                  </div>
                  {(['mano_obra', 'material', 'equipo', 'herramienta_menor'] as const).map(tipo => {
                    const list = explosion.filter(e => e.tipo === tipo)
                    if (list.length === 0) return null
                    const tc = TIPO_INSUMO_STYLE[tipo]
                    const subtotal = list.reduce((s, e) => s + e.importe, 0)
                    return (
                      <div key={tipo} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color }}>{tc.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Subtotal: <strong>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></span>
                        </div>
                        <div className="card" style={{ overflow: 'hidden' }}>
                          <table>
                            <thead><tr><th>Insumo</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Costo Unit.</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
                            <tbody>
                              {list.map((e, i) => (
                                <tr key={i}>
                                  <td style={{ fontSize: 12 }}>{e.descripcion}</td>
                                  <td style={{ textAlign: 'right', fontSize: 12 }}>{e.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 4 })}</td>
                                  <td style={{ textAlign: 'right', fontSize: 12 }}>${(e.cantidad > 0 ? e.importe / e.cantidad : 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                  <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>${e.importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Bloque de acciones de status ── */}
          {currentStatus !== 'Cancelada' && currentStatus !== 'Completada' && (
            <div style={{
              padding: '14px 16px',
              background: STATUS_STYLE[currentStatus]?.bg ?? '#f8fafc',
              border: `1.5px solid ${STATUS_STYLE[currentStatus]?.border ?? '#e2e8f0'}`,
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_STYLE[currentStatus]?.color ?? '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {currentStatus}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {currentStatus === 'Pendiente'  && '— Pendiente de ejecución'}
                  {currentStatus === 'En Proceso' && '— Trabajo en curso'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(currentStatus === 'Pendiente' || currentStatus === 'En Proceso') && (
                  <button disabled={updatingStatus} onClick={() => cambiarStatus('Completada')}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #bbf7d0',
                      background: '#f0fdf4', color: '#15803d', fontWeight: 700, cursor: 'pointer',
                      fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {updatingStatus ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={13} />}
                    Marcar Completada
                  </button>
                )}
                <button disabled={updatingStatus} onClick={() => cambiarStatus('Cancelada')}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca',
                    background: '#fef2f2', color: '#dc2626', fontWeight: 600, cursor: 'pointer',
                    fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  Cancelar OT
                </button>
              </div>
            </div>
          )}

          {currentStatus === 'Completada' && (
            <div style={{ padding: '14px 16px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckCircle size={15} style={{ color: '#15803d', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#14532d' }}>OT Completada</span>
                {ot.fecha_cierre && (
                  <span style={{ fontSize: 11, color: '#166534', marginLeft: 'auto' }}>
                    {fmtFecha(ot.fecha_cierre)}
                  </span>
                )}
              </div>
              <button disabled={updatingStatus} onClick={() => cambiarStatus('En Proceso')}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #fde68a',
                  background: '#fffbeb', color: '#92400e', fontWeight: 600, cursor: 'pointer',
                  fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                {updatingStatus ? <Loader size={12} className="animate-spin" /> : null}
                Reabrir OT
              </button>
            </div>
          )}

          {currentStatus === 'Cancelada' && (
            <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <X size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>OT Cancelada</span>
              </div>
              <button disabled={updatingStatus} onClick={() => cambiarStatus('Pendiente')}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #fde68a',
                  background: '#fffbeb', color: '#92400e', fontWeight: 600, cursor: 'pointer',
                  fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                {updatingStatus ? <Loader size={12} className="animate-spin" /> : null}
                Reactivar OT
              </button>
            </div>
          )}

          {/* Fotos Antes */}
          <FotosSection
            titulo="Fotos Antes" fotos={fotosAntes} loading={loading} uploading={uploadingAntes}
            fileRef={fileRefAntes}
            onPick={async files => {
              for (const file of files) await subirFoto(file, 'antes')
            }}
            onDelete={eliminarEvidencia}
          />

          {/* Fotos Después */}
          <FotosSection
            titulo="Fotos Después" fotos={fotosDespues} loading={loading} uploading={uploadingDespues}
            fileRef={fileRefDespues}
            onPick={async files => {
              for (const file of files) await subirFoto(file, 'despues')
            }}
            onDelete={eliminarEvidencia}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '10px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimirOT}>
            <Printer size={12} /> Imprimir OT
          </button>
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => onEdit(ot)}>
            Editar
          </button>
        </div>
    </ModalShell>
  )
}

// ── FotosSection ──────────────────────────────────────────────
function FotosSection({ titulo, fotos, loading, uploading, fileRef, onPick, onDelete }: {
  titulo: string
  fotos: any[]
  loading: boolean
  uploading: boolean
  fileRef: React.RefObject<HTMLInputElement>
  onPick: (files: File[]) => Promise<void>
  onDelete: (id: number, url: string) => void
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {titulo} ({fotos.length})
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={async e => {
              await onPick(Array.from(e.target.files ?? []))
              if (fileRef.current) fileRef.current.value = ''
            }} />
          <button className="btn-secondary" style={{ fontSize: 12 }}
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader size={12} className="animate-spin" /> : <Camera size={12} />}
            {uploading ? 'Subiendo…' : 'Agregar fotos'}
          </button>
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <RefreshCw size={14} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : fotos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13,
          border: '2px dashed #e2e8f0', borderRadius: 10, cursor: 'pointer' }}
          onClick={() => fileRef.current?.click()}>
          <Camera size={20} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.4 }} />
          Sin fotos
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {fotos.map(e => (
            <div key={e.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 8,
              overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              <img src={e.url} alt={e.nombre ?? titulo}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}>
                <a href={e.url} target="_blank" rel="noopener noreferrer"
                  style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ExternalLink size={12} style={{ color: '#fff' }} />
                </a>
                <button onClick={() => onDelete(e.id, e.url)}
                  style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(220,38,38,0.8)',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={12} style={{ color: '#fff' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PaginationNav ─────────────────────────────────────────────
function PaginationNav({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void
}) {
  const lastPage = Math.ceil(total / pageSize)
  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  // Páginas a mostrar (ventana de 5 centrada en la actual)
  const pages: (number | '...')[] = []
  if (lastPage <= 7) {
    for (let i = 1; i <= lastPage; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 4) pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(lastPage - 1, page + 1); i++) pages.push(i)
    if (page < lastPage - 3) pages.push('...')
    pages.push(lastPage)
  }

  const btn = (label: React.ReactNode, target: number, disabled: boolean, active = false) => (
    <button
      key={String(label)}
      onClick={() => !disabled && onChange(target)}
      disabled={disabled}
      style={{
        minWidth: 30, height: 30, padding: '0 8px', borderRadius: 6, border: '1px solid',
        borderColor: active ? 'var(--blue)' : '#e2e8f0',
        background: active ? 'var(--blue)' : disabled ? '#f8fafc' : '#fff',
        color: active ? '#fff' : disabled ? '#94a3b8' : 'var(--text-secondary)',
        fontWeight: active ? 700 : 400, fontSize: 12, cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {from}–{to} de <strong>{total}</strong> registros
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {btn('««', 1,        page === 1)}
        {btn('‹',  page - 1, page === 1)}
        {pages.map((p, i) =>
          p === '...'
            ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: 12 }}>…</span>
            : btn(p, p as number, false, p === page)
        )}
        {btn('›',  page + 1, page === lastPage)}
        {btn('»»', lastPage, page === lastPage)}
      </div>
    </div>
  )
}

const DI = ({ label, value }: { label: string; value?: string | null }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
) : null
