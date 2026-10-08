'use client'
import { useState, useCallback, useMemo, Fragment } from 'react'
import { dbGolf } from '@/lib/supabase'
import { esFormaCondonacion } from '@/lib/clasificacionCobranza'
import * as XLSX from 'xlsx'
import { PrintBar } from './utils'

// ── Socios de Golf: cuotas pagadas y por pagar + control de Inscripción ──────
// Fuente: golf.cxc_golf (cargos), golf.recibos_golf_pagos (forma de pago del recibo).
// Inscripción (se cobra una vez, sin año): clasifica por qué un socio NO la pagó:
//   SIN_CARGO   → nunca se le generó la cuota de inscripción
//   CANCELADA   → se generó y se canceló (cortesía / reexpresión de condonación)
//   CONDONADA   → se "cobró" con forma de pago Condonación (100%)
//   POR_PAGAR   → cargo pendiente o con pago parcial
//   PAGADA      → cobrada con formas de pago reales

type TipoCuota = 'INSCRIPCION' | 'MENSUALIDAD' | 'PENSION_CARRITO'
type EstInsc = 'PAGADA' | 'POR_PAGAR' | 'CONDONADA' | 'CANCELADA' | 'SIN_CARGO'

type Cxc = {
  id: number; id_socio_fk: number; tipo: TipoCuota; concepto: string | null; periodo: string | null
  monto_final: number | null; saldo: number | null; status: string
  fecha_emision: string | null; fecha_vencimiento: string | null; fecha_pago: string | null
  forma_pago: string | null; id_recibo_fk: number | null
}
type Socio = {
  id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null
  apellido_materno: string | null; activo: boolean; fecha_alta: string | null
  cat_categorias_socios: { nombre: string } | null
}
type Linea = {
  id: number; tipo: TipoCuota; mes: string; periodo: string; monto: number; saldo: number
  pagada: boolean; fechaPago: string | null; vence: string | null; forma: string; folio: string
  anioInsc: string
}
type InscItem = { anio: string; status: string; monto: number; saldo: number; fechaPago: string | null; cond: boolean }
type SocioRow = {
  socio: Socio; nombre: string; categoria: string
  lineas: Linea[]
  inscs: InscItem[]
  inscripcion: EstInsc; inscDetalle: string; enUniverso: boolean
  pagadoMens: number; nPagMens: number; porPagarMens: number; nPorMens: number
  pagadoOtros: number; porPagarOtros: number
}

const TIPO_LABEL: Record<TipoCuota, string> = { INSCRIPCION: 'Inscripción', MENSUALIDAD: 'Mensualidad', PENSION_CARRITO: 'Pensión carrito' }
const INSC_META: Record<EstInsc, { label: string; color: string; bg: string }> = {
  PAGADA:    { label: 'Pagada',            color: '#15803d', bg: '#dcfce7' },
  POR_PAGAR: { label: 'Por pagar',         color: '#d97706', bg: '#fef3c7' },
  CONDONADA: { label: 'Condonada',         color: '#7c3aed', bg: '#ede9fe' },
  CANCELADA: { label: 'Cuota cancelada',   color: '#64748b', bg: '#f1f5f9' },
  SIN_CARGO: { label: 'Sin cargo',         color: '#dc2626', bg: '#fee2e2' },
}
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const mesLabel = (periodo: string | null) => {
  const m = periodo?.match(/^(\d{4})-(\d{2})/)
  return m ? `${MESES[parseInt(m[2], 10) - 1] ?? m[2]} ${m[1]}` : (periodo ?? '—')
}
const nombreSocio = (s: Socio) => [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

async function traerTodo<T>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    const lote = (data ?? []) as T[]
    out.push(...lote)
    if (lote.length < PAGE) break
  }
  return out
}

export default function ReporteGolfSociosCuotas() {
  const anioActual = new Date().getFullYear()
  const [anio, setAnio]         = useState(anioActual)
  const [tipo, setTipo]         = useState<'' | TipoCuota>('')
  const [estadoCuota, setEstadoCuota] = useState<'' | 'PAGADA' | 'POR_PAGAR'>('')
  const [anioInsc, setAnioInsc]   = useState('')
  const [filtroInsc, setFiltroInsc]   = useState<'' | 'NO_PAGADA' | EstInsc>('')
  const [filtroCat, setFiltroCat]     = useState('')
  const [estSocio, setEstSocio]       = useState<'' | 'activo' | 'inactivo'>('activo')
  const [search, setSearch]     = useState('')
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())

  const [rows, setRows]       = useState<SocioRow[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError]     = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true); setError('')
    try {
      const [socios, cxc, pagos] = await Promise.all([
        traerTodo<Socio>((a, b) => dbGolf.from('cat_socios')
          .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, activo, fecha_alta, cat_categorias_socios(nombre)')
          .order('id').range(a, b)),
        traerTodo<Cxc>((a, b) => dbGolf.from('cxc_golf')
          .select('id, id_socio_fk, tipo, concepto, periodo, monto_final, saldo, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, id_recibo_fk')
          .in('tipo', ['INSCRIPCION', 'MENSUALIDAD', 'PENSION_CARRITO'])
          .order('id').range(a, b)),
        traerTodo<{ id_recibo_fk: number; forma_nombre: string; monto: number }>((a, b) => dbGolf.from('recibos_golf_pagos')
          .select('id, id_recibo_fk, forma_nombre, monto').order('id').range(a, b)),
      ])

      // Formas de pago por recibo (y proporción condonada)
      const porRecibo = new Map<number, { formas: string[]; total: number; cond: number }>()
      for (const p of pagos) {
        let r = porRecibo.get(p.id_recibo_fk)
        if (!r) { r = { formas: [], total: 0, cond: 0 }; porRecibo.set(p.id_recibo_fk, r) }
        const m = Number(p.monto) || 0
        r.total += m
        if (esFormaCondonacion(p.forma_nombre)) r.cond += m
        if (p.forma_nombre && !r.formas.includes(p.forma_nombre)) r.formas.push(p.forma_nombre)
      }
      const formaDe = (c: Cxc) => {
        const r = c.id_recibo_fk != null ? porRecibo.get(c.id_recibo_fk) : undefined
        return r?.formas.length ? r.formas.join(' + ') : (c.forma_pago ?? '')
      }
      const condonada = (c: Cxc) => {
        const r = c.id_recibo_fk != null ? porRecibo.get(c.id_recibo_fk) : undefined
        return r ? r.total > 0 && r.cond / r.total >= 0.99 : esFormaCondonacion(c.forma_pago)
      }

      const cxcPorSocio = new Map<number, Cxc[]>()
      for (const c of cxc) {
        if (!cxcPorSocio.has(c.id_socio_fk)) cxcPorSocio.set(c.id_socio_fk, [])
        cxcPorSocio.get(c.id_socio_fk)!.push(c)
      }

      const out: SocioRow[] = socios.map(s => {
        const mis = cxcPorSocio.get(s.id) ?? []
        const row: SocioRow = {
          socio: s, nombre: nombreSocio(s), categoria: s.cat_categorias_socios?.nombre ?? 'Sin categoría',
          lineas: [], inscs: [], inscripcion: 'SIN_CARGO', inscDetalle: 'No se le generó cuota de inscripción', enUniverso: true,
          pagadoMens: 0, nPagMens: 0, porPagarMens: 0, nPorMens: 0, pagadoOtros: 0, porPagarOtros: 0,
        }

        row.inscs = mis.filter(c => c.tipo === 'INSCRIPCION').map(c => ({
          anio: (c.periodo ?? c.fecha_emision ?? '').slice(0, 4), status: c.status,
          monto: Number(c.monto_final) || 0, saldo: c.saldo ?? Number(c.monto_final) ?? 0,
          fechaPago: c.fecha_pago, cond: condonada(c),
        }))

        for (const c of mis) {
          if (c.status === 'CANCELADO') continue
          if (c.tipo !== 'INSCRIPCION' && !(c.periodo ?? '').startsWith(`${anio}-`)) continue
          const pagada = c.status === 'PAGADO'
          const monto = Number(c.monto_final) || 0
          const saldo = pagada ? 0 : (c.saldo ?? monto)
          row.lineas.push({
            id: c.id, tipo: c.tipo, mes: c.tipo === 'INSCRIPCION' ? 'Inscripción' : mesLabel(c.periodo),
            periodo: c.periodo ?? '', monto, saldo, pagada,
            fechaPago: c.fecha_pago, vence: c.fecha_vencimiento,
            forma: condonada(c) && pagada ? 'Condonación' : formaDe(c),
            folio: c.id_recibo_fk ? `REC-${c.id_recibo_fk}` : '',
            anioInsc: (c.periodo ?? c.fecha_emision ?? '').slice(0, 4),
          })
          const cobrado = monto - saldo
          if (c.tipo === 'MENSUALIDAD') {
            row.pagadoMens += cobrado; row.porPagarMens += saldo
            if (pagada) row.nPagMens++; else row.nPorMens++
          } else {
            row.pagadoOtros += cobrado; row.porPagarOtros += saldo
          }
        }
        row.lineas.sort((a, b) => (a.tipo === 'INSCRIPCION' ? -1 : 0) - (b.tipo === 'INSCRIPCION' ? -1 : 0) || a.periodo.localeCompare(b.periodo))
        return row
      })

      setRows(out.sort((a, b) =>
        (a.socio.numero_socio ?? '').localeCompare(b.socio.numero_socio ?? '', 'es', { numeric: true }) || a.nombre.localeCompare(b.nombre)))
    } catch (e: any) {
      setError(e?.message ?? 'Error al consultar'); setRows([])
    }
    setLoading(false)
  }, [anio])

  const categorias = useMemo(() => Array.from(new Set(rows.map(r => r.categoria))).sort(), [rows])

  // Inscripción evaluada para un año (''=histórico). Con año: universo = socios dados de alta ese año
  // o con cargo de inscripción de ese año.
  const clasificar = (r: SocioRow): SocioRow => {
    const insc = r.inscs.filter(c => !anioInsc || c.anio === anioInsc)
    const alta = (r.socio.fecha_alta ?? '').slice(0, 4)
    const enUniverso = !anioInsc || insc.length > 0 || alta === anioInsc
    const vivas = insc.filter(c => c.status !== 'CANCELADO')
    let est: EstInsc = 'SIN_CARGO', det = 'No se le generó cuota de inscripción'
    if (vivas.length) {
      const pend = vivas.filter(c => c.status === 'PENDIENTE' || c.status === 'PAGO_PARCIAL')
      const pag = vivas.filter(c => c.status === 'PAGADO')
      if (pend.length) { est = 'POR_PAGAR'; det = `Saldo ${fmt$(pend.reduce((a, c) => a + c.saldo, 0))}` }
      else if (pag.length && pag.every(c => c.cond)) { est = 'CONDONADA'; det = `Cobrada con forma Condonación (${fmt$(pag.reduce((a, c) => a + c.monto, 0))})` }
      else { est = 'PAGADA'; det = `${fmt$(pag.reduce((a, c) => a + c.monto, 0))} · ${fmtFecha(pag[0]?.fechaPago ?? null)}` }
    } else if (insc.length) { est = 'CANCELADA'; det = 'La cuota se generó y fue cancelada (cortesía / condonación)' }
    return { ...r, inscripcion: est, inscDetalle: det, enUniverso }
  }

  const lineasVisibles = (r: SocioRow) => r.lineas.filter(l =>
    (l.tipo !== 'INSCRIPCION' || !anioInsc || l.anioInsc === anioInsc) &&
    (!tipo || l.tipo === tipo) &&
    (!estadoCuota || (estadoCuota === 'PAGADA' ? l.pagada : !l.pagada)))

  const base = rows.map(clasificar).filter(r =>
    r.enUniverso &&
    (!estSocio || (estSocio === 'activo' ? r.socio.activo : !r.socio.activo)) &&
    (!filtroCat || r.categoria === filtroCat) &&
    (!search || `${r.socio.numero_socio} ${r.nombre}`.toLowerCase().includes(search.toLowerCase())))

  const detalle = base.filter(r =>
    (!filtroInsc || (filtroInsc === 'NO_PAGADA' ? r.inscripcion !== 'PAGADA' : r.inscripcion === filtroInsc)) &&
    ((!tipo && !estadoCuota) || lineasVisibles(r).length > 0 || !!filtroInsc))

  const cuentaInsc = (e: EstInsc) => base.filter(r => r.inscripcion === e).length
  const sum = (f: (r: SocioRow) => number) => detalle.reduce((a, r) => a + f(r), 0)
  const totPagado = sum(r => lineasVisibles(r).reduce((a, l) => a + (l.monto - l.saldo), 0))
  const totPorPagar = sum(r => lineasVisibles(r).reduce((a, l) => a + l.saldo, 0))

  const toggle = (id: number) => setAbiertos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.map(r => ({
      'No. Socio': r.socio.numero_socio ?? '', 'Socio': r.nombre, 'Categoría': r.categoria,
      'Estatus socio': r.socio.activo ? 'Activo' : 'Inactivo', 'Fecha alta': r.socio.fecha_alta ?? '',
      'Inscripción': INSC_META[r.inscripcion].label, 'Detalle inscripción': r.inscDetalle,
      [`Mensualidades pagadas ${anio}`]: r.nPagMens, 'Monto mens. pagado': Number(r.pagadoMens.toFixed(2)),
      [`Mensualidades por pagar ${anio}`]: r.nPorMens, 'Monto mens. por pagar': Number(r.porPagarMens.toFixed(2)),
      'Otros cobrado (insc./pensión)': Number(r.pagadoOtros.toFixed(2)), 'Otros por pagar': Number(r.porPagarOtros.toFixed(2)),
    }))), 'Socios')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.flatMap(r => lineasVisibles(r).map(l => ({
      'No. Socio': r.socio.numero_socio ?? '', 'Socio': r.nombre, 'Categoría': r.categoria,
      'Tipo': TIPO_LABEL[l.tipo], 'Mes / periodo': l.mes, 'Estado': l.pagada ? 'Pagada' : 'Por pagar',
      'Monto': l.monto, 'Saldo': l.saldo, 'Vencimiento': l.vence ?? '', 'Fecha pago': l.fechaPago ?? '',
      'Forma de pago': l.forma, 'Recibo': l.folio,
    })))), 'Cuotas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(base.filter(r => r.inscripcion !== 'PAGADA').map(r => ({
      'No. Socio': r.socio.numero_socio ?? '', 'Socio': r.nombre, 'Categoría': r.categoria,
      'Estatus socio': r.socio.activo ? 'Activo' : 'Inactivo', 'Fecha alta': r.socio.fecha_alta ?? '',
      'Situación inscripción': INSC_META[r.inscripcion].label, 'Detalle': r.inscDetalle,
    }))), 'Sin inscripción pagada')
    XLSX.writeFile(wb, `Golf-Socios-Cuotas-${anio}_${new Date().toLocaleDateString('en-CA')}.xlsx`)
  }

  const th = (right = false): React.CSSProperties => ({
    padding: '9px 8px', textAlign: right ? 'right' : 'left', fontWeight: 600, fontSize: 10,
    color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap',
  })
  const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={lbl}>Año (mensualidades / pensión)</label>
          <select className="input" value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ fontSize: 12, minWidth: 100 }}>
            {Array.from({ length: 6 }, (_, i) => anioActual + 1 - i).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Tipo de cuota</label>
          <select className="input" value={tipo} onChange={e => setTipo(e.target.value as any)} style={{ fontSize: 12, minWidth: 140 }}>
            <option value="">Todas</option>
            {(Object.keys(TIPO_LABEL) as TipoCuota[]).map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Estado de la cuota</label>
          <select className="input" value={estadoCuota} onChange={e => setEstadoCuota(e.target.value as any)} style={{ fontSize: 12, minWidth: 130 }}>
            <option value="">Pagadas y por pagar</option>
            <option value="PAGADA">Solo pagadas</option>
            <option value="POR_PAGAR">Solo por pagar</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Año de inscripción</label>
          <select className="input" value={anioInsc} onChange={e => setAnioInsc(e.target.value)} style={{ fontSize: 12, minWidth: 110 }}>
            <option value="">Todos</option>
            {Array.from({ length: 12 }, (_, i) => String(anioActual + 1 - i)).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Inscripción</label>
          <select className="input" value={filtroInsc} onChange={e => setFiltroInsc(e.target.value as any)} style={{ fontSize: 12, minWidth: 190 }}>
            <option value="">Todos los socios</option>
            <option value="NO_PAGADA">No pagaron inscripción (todas)</option>
            {(Object.keys(INSC_META) as EstInsc[]).map(e => <option key={e} value={e}>{INSC_META[e].label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Categoría</label>
          <select className="input" value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ fontSize: 12, minWidth: 140 }}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Socio</label>
          <select className="input" value={estSocio} onChange={e => setEstSocio(e.target.value as any)} style={{ fontSize: 12, minWidth: 110 }}>
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Buscar</label>
          <input className="input" placeholder="No. o nombre…" value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 12 }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && <PrintBar title={`Golf-Socios-Cuotas-${anio}`} count={detalle.length} reportTitle={`Socios Golf — Cuotas y Inscripción ${anio}`} hideCSV
          extra={<button className="btn-ghost" onClick={exportarExcel} style={{ fontSize: 12 }}>Exportar Excel</button>} />}
      </div>

      {error && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{error}</div>
      )}

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Selecciona los filtros y haz clic en Consultar.<br/>
          <span style={{ fontSize: 12 }}>Cada socio se puede expandir para ver sus cuotas por mes, con forma de pago y recibo.</span>
        </div>
      )}

      {buscado && !loading && !error && (
        <div id="reporte-print-area">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            {(['PAGADA', 'POR_PAGAR', 'CONDONADA', 'CANCELADA', 'SIN_CARGO'] as EstInsc[]).map(e => {
              const m = INSC_META[e]
              return (
                <div key={e} className="card" style={{ flex: '1 1 150px', padding: '10px 14px', background: m.bg, cursor: 'pointer' }}
                  onClick={() => setFiltroInsc(filtroInsc === e ? '' : e)}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Inscripción · {m.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{cuentaInsc(e)}</div>
                </div>
              )
            })}
            <div className="card" style={{ flex: '1 1 170px', padding: '10px 14px', background: '#f0fdf4' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Cuotas pagadas</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d' }}>{fmt$(totPagado)}</div>
            </div>
            <div className="card" style={{ flex: '1 1 170px', padding: '10px 14px', background: '#fffbeb' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Cuotas por pagar</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{fmt$(totPorPagar)}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Los contadores de inscripción respetan categoría/estatus/búsqueda; haz clic en uno para filtrar. Con «Año de inscripción», se consideran los socios dados de alta ese año o con cargo de inscripción de ese año. «Sin cargo» = nunca se generó la cuota;
            «Cuota cancelada» = se generó y se canceló (cortesía o condonación reexpresada); «Condonada» = se cobró con forma de pago Condonación.
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Detalle ({detalle.length} socios)</h3>
          {detalle.length === 0
            ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Sin resultados</div>
            : (
              <div className="card" style={{ overflow: 'auto', padding: 0 }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      <th style={th()}></th>
                      <th style={th()}>No.</th>
                      <th style={th()}>Socio</th>
                      <th style={th()}>Categoría</th>
                      <th style={th()}>Inscripción</th>
                      <th style={th(true)}>Mens. pagadas</th>
                      <th style={th(true)}>Monto pagado</th>
                      <th style={th(true)}>Mens. por pagar</th>
                      <th style={th(true)}>Monto por pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((r, i) => {
                      const im = INSC_META[r.inscripcion]
                      const abierto = abiertos.has(r.socio.id)
                      const ls = lineasVisibles(r)
                      return (
                        <Fragment key={r.socio.id}>
                          <tr onClick={() => toggle(r.socio.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                            <td style={{ padding: '8px', width: 20, color: 'var(--text-muted)' }}>{abierto ? '▾' : '▸'}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{r.socio.numero_socio || '—'}</td>
                            <td style={{ padding: '8px', color: 'var(--text-primary)' }}>
                              {r.nombre}{!r.socio.activo && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>(inactivo)</span>}
                            </td>
                            <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: 11 }}>{r.categoria}</td>
                            <td style={{ padding: '8px' }}>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: im.bg, color: im.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{im.label}</span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{r.nPagMens}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt$(r.pagadoMens)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: r.nPorMens ? '#d97706' : undefined, fontWeight: r.nPorMens ? 600 : 400 }}>{r.nPorMens}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.porPagarMens ? '#d97706' : undefined }}>{fmt$(r.porPagarMens)}</td>
                          </tr>
                          {abierto && (
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <td />
                              <td colSpan={8} style={{ padding: '6px 8px 14px' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                                  Inscripción: <b style={{ color: im.color }}>{im.label}</b> — {r.inscDetalle}
                                  {r.socio.fecha_alta && <> · Alta: {fmtFecha(r.socio.fecha_alta)}</>}
                                </div>
                                {ls.length === 0
                                  ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin cuotas con los filtros actuales.</div>
                                  : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                      <thead>
                                        <tr style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                          <th style={th()}>Tipo</th><th style={th()}>Mes</th><th style={th()}>Estado</th>
                                          <th style={th(true)}>Monto</th><th style={th(true)}>Saldo</th>
                                          <th style={th()}>Vence</th><th style={th()}>Fecha pago</th><th style={th()}>Forma de pago</th><th style={th()}>Recibo</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {ls.map(l => (
                                          <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                                            <td style={{ padding: '5px 8px' }}>{TIPO_LABEL[l.tipo]}</td>
                                            <td style={{ padding: '5px 8px' }}>{l.mes}</td>
                                            <td style={{ padding: '5px 8px', fontWeight: 600, color: l.pagada ? '#15803d' : '#d97706' }}>{l.pagada ? 'Pagada' : 'Por pagar'}</td>
                                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt$(l.monto)}</td>
                                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{l.saldo ? fmt$(l.saldo) : '—'}</td>
                                            <td style={{ padding: '5px 8px' }}>{fmtFecha(l.vence)}</td>
                                            <td style={{ padding: '5px 8px' }}>{fmtFecha(l.fechaPago)}</td>
                                            <td style={{ padding: '5px 8px' }}>{l.forma || '—'}</td>
                                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 10 }}>{l.folio || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  )
}
