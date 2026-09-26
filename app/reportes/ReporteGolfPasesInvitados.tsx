'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Download, Users, ClipboardList, Ticket, UserCheck } from 'lucide-react'
import * as XLSX from 'xlsx'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Tab = 'resumen' | 'asignaciones' | 'uso' | 'invitados'

type Categoria = { id: number; nombre: string }
type TipoPase  = { id: number; nombre: string }

type Socio = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  id_categoria_fk: number | null
}

type Lote = {
  id: number
  id_socio_fk: number
  id_config_fk: number | null
  cantidad_otorgada: number
  cantidad_usada: number
  cantidad_disponible: number | null
  periodo: string | null
  fecha_inicio: string
  fecha_vencimiento: string
  cat_pases_config: { nombre: string } | null
}

type Movimiento = {
  id: number
  id_pase_fk: number
  id_socio_fk: number
  tipo: string
  cantidad: number
  motivo: string | null
  created_at: string
  created_by: string | null
  id_acceso_fk: number | null
  ctrl_accesos: { fecha_entrada: string } | null
}

type Acomp = { id_pase_mov_fk: number; nombre: string; id_invitado_fk: number | null }

type InvitadoInfo = { nombre: string; id: number | null }

type FilaInvitado = {
  key: string
  nombre: string
  conFicha: boolean
  visitas: number
  anfitriones: string[]
  primera: string
  ultima: string
}

type FilaResumen = {
  socio: Socio
  categoria: string
  asignados: number
  usados: number
  ajustes: number
  vigentes: number
  vencidos: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TZ_MX = 'America/Mexico_City'

const fechaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fmtFecha = (d: string) =>
  new Date(d + (d.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ_MX,
  })

const nombreSocio = (s?: Socio | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'

const socioLabel = (s?: Socio | null) =>
  s ? `${nombreSocio(s)}${s.numero_socio ? ` (#${s.numero_socio})` : ''}` : '—'

// PostgREST corta en 1000 filas por consulta: paginar hasta agotar
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

const TH: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10,
  color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap', textTransform: 'uppercase',
}
const THR: React.CSSProperties = { ...TH, textAlign: 'right' }
const TD: React.CSSProperties  = { padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }
const TDR: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

const ESTADO_COLOR: Record<string, { bg: string; color: string }> = {
  Vigente: { bg: '#f0fdf4', color: '#16a34a' },
  Agotado: { bg: '#f1f5f9', color: '#64748b' },
  Vencido: { bg: '#fef2f2', color: '#dc2626' },
}

function estadoLote(l: Lote, hoy: string): 'Vigente' | 'Agotado' | 'Vencido' {
  const disp = l.cantidad_disponible ?? (l.cantidad_otorgada - l.cantidad_usada)
  if (disp <= 0) return 'Agotado'
  return l.fecha_vencimiento < hoy ? 'Vencido' : 'Vigente'
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function ReporteGolfPasesInvitados() {
  const hoy = fechaLocal()

  const [fechaDesde, setFechaDesde] = useState(`${new Date().getFullYear()}-01-01`)
  const [fechaHasta, setFechaHasta] = useState(hoy)
  const [tab, setTab] = useState<Tab>('resumen')

  // Catálogos
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [tipos, setTipos]           = useState<TipoPase[]>([])
  const [socios, setSocios]         = useState<Socio[]>([])

  // Filtros
  const [filtroCat, setFiltroCat]     = useState<number | ''>('')
  const [filtroTipo, setFiltroTipo]   = useState<number | ''>('')
  const [filtroSocio, setFiltroSocio] = useState<number | ''>('')

  // Datos
  const [lotes, setLotes]         = useState<Lote[]>([])
  const [movs, setMovs]           = useState<Movimiento[]>([])
  const [invitadoPorMov, setInvitadoPorMov] = useState<Record<number, InvitadoInfo>>({})
  const [loading, setLoading]     = useState(false)
  const [buscado, setBuscado]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre').order('nombre')
      .then(({ data }: any) => setCategorias(data ?? []))
    dbGolf.from('cat_pases_config').select('id, nombre').order('nombre')
      .then(({ data }: any) => setTipos(data ?? []))
    fetchAll<Socio>((from, to) =>
      dbGolf.from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, id_categoria_fk')
        .order('id').range(from, to)
    ).then(setSocios).catch(() => {})
  }, [])

  const socioMap = useMemo(() => new Map(socios.map(s => [s.id, s])), [socios])
  const catMap   = useMemo(() => new Map(categorias.map(c => [c.id, c.nombre])), [categorias])
  const loteMap  = useMemo(() => new Map(lotes.map(l => [l.id, l])), [lotes])

  const sociosSelect = useMemo(() => (
    (filtroCat !== '' ? socios.filter(s => s.id_categoria_fk === filtroCat) : socios)
      .slice().sort((a, b) => nombreSocio(a).localeCompare(nombreSocio(b)))
  ), [socios, filtroCat])

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true); setError(null)
    try {
      // Lotes: todos (el saldo vigente es al día de hoy, sin importar cuándo se asignó)
      const lotesData = await fetchAll<Lote>((from, to) =>
        dbGolf.from('ctrl_pases')
          .select('id, id_socio_fk, id_config_fk, cantidad_otorgada, cantidad_usada, cantidad_disponible, periodo, fecha_inicio, fecha_vencimiento, cat_pases_config(nombre)')
          .order('id').range(from, to)
      )
      setLotes(lotesData)

      // Movimientos ocurridos en el período
      const desde = new Date(fechaDesde + 'T00:00:00').toISOString()
      const hasta = new Date(fechaHasta + 'T23:59:59').toISOString()
      const movsData = await fetchAll<Movimiento>((from, to) =>
        dbGolf.from('ctrl_pases_movimientos')
          .select('id, id_pase_fk, id_socio_fk, tipo, cantidad, motivo, created_at, created_by, id_acceso_fk, ctrl_accesos(fecha_entrada)')
          .gte('created_at', desde).lte('created_at', hasta)
          .order('created_at', { ascending: false }).order('id').range(from, to)
      )
      setMovs(movsData)

      // Invitado de cada consumo: se liga por ctrl_acceso_acomp.id_pase_mov_fk
      const idsConsumo = movsData.filter(m => m.tipo === 'CONSUMO').map(m => m.id)
      const acomps: Acomp[] = []
      for (let i = 0; i < idsConsumo.length; i += 200) {
        const { data, error: e } = await dbGolf.from('ctrl_acceso_acomp')
          .select('id_pase_mov_fk, nombre, id_invitado_fk')
          .in('id_pase_mov_fk', idsConsumo.slice(i, i + 200))
        if (e) throw e
        acomps.push(...((data ?? []) as Acomp[]))
      }

      // Nombre oficial desde la ficha del catálogo (cat_invitados) cuando el acompañante está ligado
      const idsFicha = Array.from(new Set(acomps.map(a => a.id_invitado_fk).filter((x): x is number => x != null)))
      const fichas: Record<number, string> = {}
      for (let i = 0; i < idsFicha.length; i += 200) {
        const { data, error: e } = await dbGolf.from('cat_invitados')
          .select('id, nombre, apellido_paterno, apellido_materno')
          .in('id', idsFicha.slice(i, i + 200))
        if (e) throw e
        ;(data ?? []).forEach((f: any) => {
          fichas[f.id] = [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')
        })
      }

      const mapa: Record<number, InvitadoInfo> = {}
      acomps.forEach(a => {
        mapa[a.id_pase_mov_fk] = {
          id: a.id_invitado_fk,
          nombre: (a.id_invitado_fk != null ? fichas[a.id_invitado_fk] : null) ?? a.nombre,
        }
      })
      setInvitadoPorMov(mapa)
    } catch (err: any) {
      setError(err?.message ?? 'Error al consultar')
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta])

  // -------------------------------------------------------------------------
  // Filtrado (cliente) — categoría / socio / tipo de pase
  // -------------------------------------------------------------------------
  const socioPasa = useCallback((idSocio: number) => {
    const s = socioMap.get(idSocio)
    if (filtroSocio !== '' && idSocio !== filtroSocio) return false
    if (filtroCat !== '' && s?.id_categoria_fk !== filtroCat) return false
    return true
  }, [socioMap, filtroCat, filtroSocio])

  const lotePasa = useCallback((l?: Lote) => {
    if (!l) return filtroTipo === ''
    return filtroTipo === '' || l.id_config_fk === filtroTipo
  }, [filtroTipo])

  const movsFiltrados = useMemo(
    () => movs.filter(m => socioPasa(m.id_socio_fk) && lotePasa(loteMap.get(m.id_pase_fk))),
    [movs, socioPasa, lotePasa, loteMap]
  )
  const asignaciones = useMemo(() => movsFiltrados.filter(m => m.tipo === 'ASIGNACION'), [movsFiltrados])
  const consumos     = useMemo(() => movsFiltrados.filter(m => m.tipo === 'CONSUMO'), [movsFiltrados])

  const infoInvitado = (m: Movimiento): InvitadoInfo =>
    invitadoPorMov[m.id] ?? { id: null, nombre: (m.motivo ?? '').replace(/^Invitado:\s*/i, '') }
  const nombreInvitado = (m: Movimiento) => infoInvitado(m).nombre

  // Sin ficha, se agrupa por nombre normalizado (sin acentos, mayúsculas, espacios colapsados)
  const normNombre = (n: string) =>
    n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

  // -------------------------------------------------------------------------
  // Resumen por socio
  // -------------------------------------------------------------------------
  const resumen = useMemo<FilaResumen[]>(() => {
    const filas = new Map<number, FilaResumen>()
    const get = (idSocio: number): FilaResumen | null => {
      const socio = socioMap.get(idSocio)
      if (!socio) return null
      let f = filas.get(idSocio)
      if (!f) {
        f = {
          socio, categoria: catMap.get(socio.id_categoria_fk ?? -1) ?? 'Sin categoría',
          asignados: 0, usados: 0, ajustes: 0, vigentes: 0, vencidos: 0,
        }
        filas.set(idSocio, f)
      }
      return f
    }

    for (const m of movsFiltrados) {
      const f = get(m.id_socio_fk); if (!f) continue
      if (m.tipo === 'ASIGNACION') f.asignados += m.cantidad
      else if (m.tipo === 'CONSUMO') f.usados += Math.abs(m.cantidad)
      else f.ajustes += m.cantidad
    }

    for (const l of lotes) {
      if (!socioPasa(l.id_socio_fk) || !lotePasa(l)) continue
      const disp = l.cantidad_disponible ?? (l.cantidad_otorgada - l.cantidad_usada)
      if (disp <= 0) continue
      if (l.fecha_vencimiento >= hoy) {
        const f = get(l.id_socio_fk); if (f) f.vigentes += disp
      } else if (l.fecha_vencimiento >= fechaDesde && l.fecha_vencimiento <= fechaHasta) {
        // Vencidos sin usar dentro del período consultado
        const f = get(l.id_socio_fk); if (f) f.vencidos += disp
      }
    }

    return Array.from(filas.values()).sort((a, b) =>
      a.categoria.localeCompare(b.categoria) || nombreSocio(a.socio).localeCompare(nombreSocio(b.socio))
    )
  }, [movsFiltrados, lotes, socioMap, catMap, socioPasa, lotePasa, hoy, fechaDesde, fechaHasta])

  const tot = useMemo(() => resumen.reduce((a, f) => ({
    asignados: a.asignados + f.asignados, usados: a.usados + f.usados, ajustes: a.ajustes + f.ajustes,
    vigentes: a.vigentes + f.vigentes, vencidos: a.vencidos + f.vencidos,
  }), { asignados: 0, usados: 0, ajustes: 0, vigentes: 0, vencidos: 0 }), [resumen])

  const porInvitado = useMemo<FilaInvitado[]>(() => {
    const grupos = new Map<string, FilaInvitado & { _anf: Set<string> }>()
    for (const m of consumos) {
      const info = infoInvitado(m)
      const nombre = info.nombre.trim()
      if (!nombre) continue
      const key = info.id != null ? `f${info.id}` : `n${normNombre(nombre)}`
      const fecha = (m.ctrl_accesos?.fecha_entrada ?? m.created_at).slice(0, 10)
      let g = grupos.get(key)
      if (!g) {
        g = { key, nombre, conFicha: info.id != null, visitas: 0, anfitriones: [], primera: fecha, ultima: fecha, _anf: new Set() }
        grupos.set(key, g)
      }
      g.visitas += 1
      if (fecha < g.primera) g.primera = fecha
      if (fecha > g.ultima) g.ultima = fecha
      g._anf.add(socioLabel(socioMap.get(m.id_socio_fk)))
    }
    return Array.from(grupos.values())
      .map(({ _anf, ...g }) => ({ ...g, anfitriones: Array.from(_anf).sort() }))
      .sort((a, b) => b.visitas - a.visitas || a.nombre.localeCompare(b.nombre))
  }, [consumos, invitadoPorMov, socioMap]) // eslint-disable-line react-hooks/exhaustive-deps
  const invitadosDistintos = porInvitado.length
  const pctUso = tot.asignados > 0 ? Math.round((tot.usados / tot.asignados) * 100) : 0

  const filasTab = tab === 'resumen' ? resumen.length : tab === 'asignaciones' ? asignaciones.length : tab === 'uso' ? consumos.length : porInvitado.length

  // -------------------------------------------------------------------------
  // Exportar a Excel
  // -------------------------------------------------------------------------
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()

    const wsRes = XLSX.utils.aoa_to_sheet([
      ['Categoría', 'No. Socio', 'Socio', 'Asignados (período)', 'Usados (período)', 'Ajustes (período)', 'Disponibles vigentes hoy', 'Vencidos sin usar (período)'],
      ...resumen.map(f => [f.categoria, f.socio.numero_socio ?? '', nombreSocio(f.socio), f.asignados, f.usados, f.ajustes, f.vigentes, f.vencidos]),
      ['TOTAL', '', '', tot.asignados, tot.usados, tot.ajustes, tot.vigentes, tot.vencidos],
    ])
    wsRes['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen')

    const wsAsig = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'No. Socio', 'Socio', 'Categoría', 'Tipo de pase', 'Periodo', 'Cantidad', 'Vigencia desde', 'Vigencia hasta', 'Usados del lote', 'Disponibles del lote', 'Estado del lote', 'Registró'],
      ...asignaciones.map(m => {
        const l = loteMap.get(m.id_pase_fk)
        const s = socioMap.get(m.id_socio_fk)
        return [
          fmtFecha(m.created_at), s?.numero_socio ?? '', nombreSocio(s), catMap.get(s?.id_categoria_fk ?? -1) ?? 'Sin categoría',
          l?.cat_pases_config?.nombre ?? '—', l?.periodo ?? '', m.cantidad,
          l ? fmtFecha(l.fecha_inicio) : '', l ? fmtFecha(l.fecha_vencimiento) : '',
          l?.cantidad_usada ?? '', l ? (l.cantidad_disponible ?? l.cantidad_otorgada - l.cantidad_usada) : '',
          l ? estadoLote(l, hoy) : '', m.created_by ?? '',
        ]
      }),
    ])
    wsAsig['!cols'] = [{ wch: 13 }, { wch: 10 }, { wch: 34 }, { wch: 22 }, { wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsAsig, 'Asignaciones')

    const wsUso = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'No. Socio', 'Socio anfitrión', 'Categoría', 'Invitado', 'Tipo de pase', 'Periodo del lote', 'Registró'],
      ...consumos.map(m => {
        const l = loteMap.get(m.id_pase_fk)
        const s = socioMap.get(m.id_socio_fk)
        return [
          fmtFecha(m.ctrl_accesos?.fecha_entrada ?? m.created_at), s?.numero_socio ?? '', nombreSocio(s),
          catMap.get(s?.id_categoria_fk ?? -1) ?? 'Sin categoría', nombreInvitado(m),
          l?.cat_pases_config?.nombre ?? '—', l?.periodo ?? '', m.created_by ?? '',
        ]
      }),
    ])
    wsUso['!cols'] = [{ wch: 13 }, { wch: 10 }, { wch: 34 }, { wch: 22 }, { wch: 34 }, { wch: 26 }, { wch: 14 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsUso, 'Uso')

    const wsInv = XLSX.utils.aoa_to_sheet([
      ['Invitado', 'Con ficha', 'Visitas con pase', 'Socios anfitriones', 'Primera visita', 'Última visita', 'Anfitriones'],
      ...porInvitado.map(g => [g.nombre, g.conFicha ? 'Sí' : 'No', g.visitas, g.anfitriones.length, fmtFecha(g.primera), fmtFecha(g.ultima), g.anfitriones.join('; ')]),
    ])
    wsInv['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 13 }, { wch: 13 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, wsInv, 'Por invitado')

    XLSX.writeFile(wb, `Pases-Invitados_${fechaDesde}_a_${fechaHasta}.xlsx`)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const tabBtn = (id: Tab, label: string, Icon: any, color: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13,
        fontWeight: tab === id ? 700 : 500,
        color: tab === id ? color : 'var(--text-secondary)',
        borderBottom: tab === id ? `2px solid ${color}` : '2px solid transparent',
        marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      <Icon size={14} /> {label}
    </button>
  )

  const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }
  const thead = (cols: [string, boolean?][]) => (
    <thead>
      <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
        {cols.map(([h, right]) => <th key={h} style={right ? THR : TH}>{h}</th>)}
      </tr>
    </thead>
  )

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={lbl}>Fecha desde</label>
          <input className="input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={lbl}>Fecha hasta</label>
          <input className="input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div>
          <label style={lbl}>Categoría de socio</label>
          <select className="input" value={filtroCat} style={{ fontSize: 12, minWidth: 180 }}
            onChange={e => { setFiltroCat(e.target.value ? Number(e.target.value) : ''); setFiltroSocio('') }}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Tipo de pase</label>
          <select className="input" value={filtroTipo} style={{ fontSize: 12, minWidth: 180 }}
            onChange={e => setFiltroTipo(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Socio</label>
          <select className="input" value={filtroSocio} style={{ fontSize: 12, minWidth: 220 }}
            onChange={e => setFiltroSocio(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos</option>
            {sociosSelect.map(s => (
              <option key={s.id} value={s.id}>{s.numero_socio ? `${s.numero_socio} — ` : ''}{nombreSocio(s)}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && !error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-ghost" onClick={exportarExcel} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> Exportar Excel
            </button>
            <PrintBar title="Pases-Invitados" count={filasTab} reportTitle="Asignación y Uso de Pases para Invitados — Club Golf" />
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{ padding: '12px 16px', color: '#dc2626', background: '#fef2f2', marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      {!buscado && !error && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Aplica filtros y haz clic en Consultar
        </div>
      )}

      {buscado && !loading && !error && (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Pases asignados (período)',  value: tot.asignados,       color: '#16a34a' },
              { label: 'Pases usados (período)',     value: tot.usados,          color: '#dc2626' },
              { label: '% de uso vs. asignados',     value: `${pctUso}%`,        color: '#2563eb' },
              { label: 'Disponibles vigentes hoy',   value: tot.vigentes,        color: '#d97706' },
              { label: 'Vencidos sin usar (período)', value: tot.vencidos,       color: '#64748b' },
              { label: 'Invitados distintos',        value: invitadosDistintos,  color: '#7c3aed' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 150px', maxWidth: 240, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
            {tabBtn('resumen', 'Resumen por socio', Users, 'var(--blue)')}
            {tabBtn('asignaciones', `Asignaciones (${asignaciones.length})`, ClipboardList, '#16a34a')}
            {tabBtn('uso', `Uso (${consumos.length})`, Ticket, '#dc2626')}
            {tabBtn('invitados', `Por invitado (${porInvitado.length})`, UserCheck, '#7c3aed')}
          </div>

          <div id="reporte-print-area">
            {/* ---------------- Resumen ---------------- */}
            {tab === 'resumen' && (
              resumen.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  Sin asignaciones ni uso de pases con los filtros seleccionados
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    {thead([['Socio'], ['Categoría'], ['Asignados', true], ['Usados', true], ['% uso', true], ['Ajustes', true], ['Disp. vigentes hoy', true], ['Vencidos sin usar', true]])}
                    <tbody>
                      {resumen.map((f, i) => (
                        <tr key={f.socio.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{socioLabel(f.socio)}</td>
                          <td style={TD}>{f.categoria}</td>
                          <td style={{ ...TDR, color: '#16a34a', fontWeight: 600 }}>{f.asignados || '—'}</td>
                          <td style={{ ...TDR, color: '#dc2626', fontWeight: 600 }}>{f.usados || '—'}</td>
                          <td style={TDR}>{f.asignados > 0 ? `${Math.round((f.usados / f.asignados) * 100)}%` : '—'}</td>
                          <td style={{ ...TDR, color: '#d97706' }}>{f.ajustes ? (f.ajustes > 0 ? `+${f.ajustes}` : f.ajustes) : '—'}</td>
                          <td style={{ ...TDR, fontWeight: 700, color: f.vigentes > 0 ? '#2563eb' : 'var(--text-muted)' }}>{f.vigentes || '—'}</td>
                          <td style={{ ...TDR, color: f.vencidos > 0 ? '#dc2626' : 'var(--text-muted)' }}>{f.vencidos || '—'}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                        <td style={TD} colSpan={2}>TOTAL ({resumen.length} socios)</td>
                        <td style={{ ...TDR, color: '#16a34a' }}>{tot.asignados}</td>
                        <td style={{ ...TDR, color: '#dc2626' }}>{tot.usados}</td>
                        <td style={TDR}>{pctUso}%</td>
                        <td style={TDR}>{tot.ajustes > 0 ? `+${tot.ajustes}` : tot.ajustes}</td>
                        <td style={{ ...TDR, color: '#2563eb' }}>{tot.vigentes}</td>
                        <td style={{ ...TDR, color: '#dc2626' }}>{tot.vencidos}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* ---------------- Asignaciones ---------------- */}
            {tab === 'asignaciones' && (
              asignaciones.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  Sin asignaciones en el período
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    {thead([['Fecha'], ['Socio'], ['Categoría'], ['Tipo de pase'], ['Periodo'], ['Otorgados', true], ['Vigencia'], ['Usados', true], ['Disp.', true], ['Estado'], ['Registró']])}
                    <tbody>
                      {asignaciones.map((m, i) => {
                        const l = loteMap.get(m.id_pase_fk)
                        const s = socioMap.get(m.id_socio_fk)
                        const est = l ? estadoLote(l, hoy) : null
                        return (
                          <tr key={m.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                            <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: 11 }}>{fmtFecha(m.created_at)}</td>
                            <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{socioLabel(s)}</td>
                            <td style={TD}>{catMap.get(s?.id_categoria_fk ?? -1) ?? 'Sin categoría'}</td>
                            <td style={TD}>{l?.cat_pases_config?.nombre ?? '—'}</td>
                            <td style={TD}>{l?.periodo ?? '—'}</td>
                            <td style={{ ...TDR, color: '#16a34a', fontWeight: 600 }}>{m.cantidad}</td>
                            <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: 11 }}>
                              {l ? `${fmtFecha(l.fecha_inicio)} – ${fmtFecha(l.fecha_vencimiento)}` : '—'}
                            </td>
                            <td style={{ ...TDR, color: '#dc2626' }}>{l?.cantidad_usada ?? '—'}</td>
                            <td style={{ ...TDR, fontWeight: 600 }}>{l ? (l.cantidad_disponible ?? l.cantidad_otorgada - l.cantidad_usada) : '—'}</td>
                            <td style={TD}>
                              {est && (
                                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ESTADO_COLOR[est].bg, color: ESTADO_COLOR[est].color }}>{est}</span>
                              )}
                            </td>
                            <td style={{ ...TD, fontSize: 11 }}>{m.created_by ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* ---------------- Agrupado por invitado ---------------- */}
            {tab === 'invitados' && (
              porInvitado.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  Sin uso de pases en el período
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    {thead([['Invitado'], ['Ficha'], ['Visitas con pase', true], ['Socios anfitriones', true], ['Primera visita'], ['Última visita'], ['Anfitriones']])}
                    <tbody>
                      {porInvitado.map((g, i) => (
                        <tr key={g.key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{g.nombre}</td>
                          <td style={TD}>
                            <span title={g.conFicha ? 'Ligado al catálogo de invitados' : 'Sin ficha: agrupado por nombre'}
                              style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                                background: g.conFicha ? '#f0fdf4' : '#fffbeb', color: g.conFicha ? '#16a34a' : '#d97706' }}>
                              {g.conFicha ? 'Sí' : 'Por nombre'}
                            </span>
                          </td>
                          <td style={{ ...TDR, fontWeight: 700, color: '#7c3aed' }}>{g.visitas}</td>
                          <td style={TDR}>{g.anfitriones.length}</td>
                          <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: 11 }}>{fmtFecha(g.primera)}</td>
                          <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: 11 }}>{fmtFecha(g.ultima)}</td>
                          <td style={{ ...TD, fontSize: 11 }}>{g.anfitriones.join(' · ')}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                        <td style={TD} colSpan={2}>TOTAL ({porInvitado.length} invitados)</td>
                        <td style={{ ...TDR, color: '#7c3aed' }}>{porInvitado.reduce((a, g) => a + g.visitas, 0)}</td>
                        <td style={TD} colSpan={4} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* ---------------- Uso por invitado ---------------- */}
            {tab === 'uso' && (
              consumos.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  Sin uso de pases en el período
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    {thead([['Fecha'], ['Socio anfitrión'], ['Categoría'], ['Invitado'], ['Tipo de pase'], ['Periodo lote'], ['Registró']])}
                    <tbody>
                      {consumos.map((m, i) => {
                        const l = loteMap.get(m.id_pase_fk)
                        const s = socioMap.get(m.id_socio_fk)
                        return (
                          <tr key={m.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                            <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: 11 }}>{fmtFecha(m.ctrl_accesos?.fecha_entrada ?? m.created_at)}</td>
                            <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{socioLabel(s)}</td>
                            <td style={TD}>{catMap.get(s?.id_categoria_fk ?? -1) ?? 'Sin categoría'}</td>
                            <td style={{ ...TD, color: 'var(--text-primary)' }}>{nombreInvitado(m) || '—'}</td>
                            <td style={TD}>{l?.cat_pases_config?.nombre ?? '—'}</td>
                            <td style={TD}>{l?.periodo ?? '—'}</td>
                            <td style={{ ...TD, fontSize: 11 }}>{m.created_by ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            Asignados, usados y ajustes se miden por los movimientos ocurridos en el período. «Disponibles vigentes hoy» es el saldo actual
            de lotes no vencidos; «Vencidos sin usar» son pases no consumidos de lotes cuya vigencia terminó dentro del período.
          </p>
        </>
      )}
    </div>
  )
}
