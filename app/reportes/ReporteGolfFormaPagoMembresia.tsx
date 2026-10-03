'use client'
import { useState, useCallback, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { PrintBar } from './utils'

// ── Socios de Golf: pago Anual vs Mensual de la membresía ────────
// Se basa en el registro de pagos (recibos_golf_det, tipo MENSUALIDAD, recibos no cancelados).
// Si UN MISMO recibo agrupa las 12 mensualidades del año → pago ANUAL (anticipado).
// Si un recibo agrupa de 2 a 11 mensualidades Y al menos DOS son de meses posteriores al de
// la fecha de pago → ANTICIPADO PARCIAL. Pagar meses atrasados/corrientes (aunque sean varios
// en un recibo) es pago MENSUAL.
// La clasificación del socio toma su recibo más grande del año.

type Forma = 'ANUAL' | 'PARCIAL' | 'MENSUAL'

type DetRow = {
  id: number
  id_recibo_fk: number
  periodo: string | null
  monto_final: number | null
  recibos_golf: {
    id: number; folio: string; fecha_recibo: string; status: string; id_socio_fk: number
    cat_socios: {
      id: number; numero_socio: string | null; nombre: string | null
      apellido_paterno: string | null; apellido_materno: string | null
      cat_categorias_socios: { nombre: string } | null
    } | null
  } | null
}

type SocioRow = {
  idSocio: number
  numero: string
  nombre: string
  categoria: string
  forma: Forma
  meses: Set<number>        // 1..12 pagados en el año
  monto: number
  recibos: { folio: string; fecha: string; nMeses: number; nAnticipados: number }[]
  fechaAnual: string | null
}

const FORMA_META: Record<Forma, { label: string; color: string; bg: string }> = {
  ANUAL:   { label: 'Anual (12 meses)', color: '#2563eb', bg: '#dbeafe' },
  PARCIAL: { label: 'Anticipado parcial', color: '#d97706', bg: '#fef3c7' },
  MENSUAL: { label: 'Mensual',            color: '#16a34a', bg: '#dcfce7' },
}

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function ReporteGolfFormaPagoMembresia() {
  const anioActual = new Date().getFullYear()
  const [anio, setAnio]           = useState(anioActual)
  const [filtroForma, setFiltroForma] = useState<'' | Forma>('')
  const [filtroCat, setFiltroCat] = useState('')
  const [search, setSearch]       = useState('')

  const [rows, setRows]       = useState<SocioRow[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [error, setError]     = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setBuscado(true); setError('')
    try {
      // Paginado: PostgREST limita a 1000 filas por request
      const dets: DetRow[] = []
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data, error: e1 } = await dbGolf.from('recibos_golf_det')
          .select('id, id_recibo_fk, periodo, monto_final, recibos_golf!inner(id, folio, fecha_recibo, status, id_socio_fk, cat_socios(id, numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre)))')
          .eq('tipo', 'MENSUALIDAD')
          .like('periodo', `${anio}-%`)
          .neq('recibos_golf.status', 'CANCELADO')
          .order('id')
          .range(from, from + PAGE - 1)
        if (e1) throw e1
        const lote = (data ?? []) as unknown as DetRow[]
        dets.push(...lote)
        if (lote.length < PAGE) break
      }

      // Agrupar por socio → recibo
      const socios = new Map<number, SocioRow>()
      const porRecibo = new Map<string, number>() // `${socio}|${recibo}` → n meses
      for (const d of dets) {
        const r = d.recibos_golf
        const s = r?.cat_socios
        if (!r || !s || !d.periodo) continue
        const mes = parseInt(d.periodo.slice(5, 7), 10)
        if (!(mes >= 1 && mes <= 12)) continue
        let row = socios.get(s.id)
        if (!row) {
          row = {
            idSocio: s.id,
            numero: s.numero_socio ?? '',
            nombre: [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' '),
            categoria: s.cat_categorias_socios?.nombre ?? 'Sin categoría',
            forma: 'MENSUAL', meses: new Set(), monto: 0, recibos: [], fechaAnual: null,
          }
          socios.set(s.id, row)
        }
        row.meses.add(mes)
        row.monto += Number(d.monto_final) || 0
        const k = `${s.id}|${r.id}`
        porRecibo.set(k, (porRecibo.get(k) ?? 0) + 1)
        let rec = row.recibos.find(x => x.folio === r.folio)
        if (!rec) { rec = { folio: r.folio, fecha: r.fecha_recibo, nMeses: 0, nAnticipados: 0 }; row.recibos.push(rec) }
        rec.nMeses += 1
        if (d.periodo > r.fecha_recibo.slice(0, 7)) rec.nAnticipados += 1   // cuota de un mes posterior al del pago
      }
      for (const row of Array.from(socios.values())) {
        row.recibos.sort((a, b) => a.fecha.localeCompare(b.fecha))
        const anual = row.recibos.find(x => x.nMeses >= 12)
        if (anual) { row.forma = 'ANUAL'; row.fechaAnual = anual.fecha }
        else if (row.recibos.some(x => x.nAnticipados >= 2)) row.forma = 'PARCIAL'
      }

      setRows(Array.from(socios.values()).sort((a, b) =>
        a.numero.localeCompare(b.numero, 'es', { numeric: true }) || a.nombre.localeCompare(b.nombre)))
    } catch (e: any) {
      setError(e?.message ?? 'Error al consultar')
      setRows([])
    }
    setLoading(false)
  }, [anio])

  const categorias = useMemo(() => Array.from(new Set(rows.map(r => r.categoria))).sort(), [rows])

  // KPIs sobre el universo completo del año (los filtros solo acotan el detalle)
  const anuales  = rows.filter(r => r.forma === 'ANUAL')
  const parciales = rows.filter(r => r.forma === 'PARCIAL')
  const mensuales = rows.filter(r => r.forma === 'MENSUAL')
  const sumMonto = (a: SocioRow[]) => a.reduce((s, r) => s + r.monto, 0)

  const detalle = rows.filter(r =>
    (!filtroForma || r.forma === filtroForma) &&
    (!filtroCat || r.categoria === filtroCat) &&
    (!search || `${r.numero} ${r.nombre}`.toLowerCase().includes(search.toLowerCase())))

  const textoRecibos = (r: SocioRow) =>
    r.forma === 'ANUAL'
      ? r.recibos.filter(x => x.nMeses >= 12).map(x => x.folio).join(', ')
      : r.forma === 'PARCIAL'
        ? r.recibos.filter(x => x.nAnticipados >= 2).map(x => `${x.folio} (${x.nMeses}m, ${x.nAnticipados} adelantados)`).join(', ')
        : `${r.recibos.length} recibo${r.recibos.length === 1 ? '' : 's'}`

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    const tot = (a: SocioRow[]) => Number(sumMonto(a).toFixed(2))
    const resumen = [
      ...(['ANUAL', 'PARCIAL', 'MENSUAL'] as Forma[]).map(f => {
        const g = rows.filter(r => r.forma === f)
        return { 'Forma de pago': FORMA_META[f].label, 'Socios': g.length,
          '% de socios': rows.length ? Number(((g.length / rows.length) * 100).toFixed(1)) : 0, 'Monto': tot(g) }
      }),
      { 'Forma de pago': 'TOTAL', 'Socios': rows.length, '% de socios': rows.length ? 100 : 0, 'Monto': tot(rows) },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')

    const detalleRows = detalle.map(r => {
      const o: Record<string, any> = {
        'No. Socio': r.numero, 'Socio': r.nombre, 'Categoría': r.categoria,
        'Forma de pago': FORMA_META[r.forma].label,
        'Fecha pago anual': r.fechaAnual ?? '',
      }
      MESES_CORTO.forEach((m, i) => { o[m] = r.meses.has(i + 1) ? '✓' : '' })
      o['Meses pagados'] = r.meses.size
      o['Recibos'] = r.recibos.map(x => `${x.folio} (${x.nMeses}m, ${x.fecha})`).join('; ')
      o['Monto'] = Number(r.monto.toFixed(2))
      return o
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleRows), 'Socios')

    const recRows = detalle.flatMap(r => r.recibos.map(x => ({
      'No. Socio': r.numero, 'Socio': r.nombre, 'Forma de pago': FORMA_META[r.forma].label,
      'Folio': x.folio, 'Fecha recibo': x.fecha, 'Mensualidades en el recibo': x.nMeses, 'Meses adelantados': x.nAnticipados,
    })))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recRows), 'Recibos')

    XLSX.writeFile(wb, `Golf-Socios-Anual-Mensual-${anio}_${new Date().toLocaleDateString('en-CA')}.xlsx`)
  }

  const th = (h: string, right = false, center = false): React.CSSProperties => ({
    padding: '9px 8px', textAlign: right ? 'right' : center ? 'center' : 'left',
    fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em',
  })

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Año de la membresía</label>
          <select className="input" value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ fontSize: 12, minWidth: 100 }}>
            {Array.from({ length: 6 }, (_, i) => anioActual + 1 - i).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Forma de pago</label>
          <select className="input" value={filtroForma} onChange={e => setFiltroForma(e.target.value as '' | Forma)} style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todas</option>
            <option value="ANUAL">Anual (12 meses)</option>
            <option value="PARCIAL">Anticipado parcial</option>
            <option value="MENSUAL">Mensual</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Categoría</label>
          <select className="input" value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ fontSize: 12, minWidth: 160 }}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Buscar socio</label>
          <input className="input" placeholder="No. o nombre…" value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 12 }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && <PrintBar title={`Golf-Socios-Anual-Mensual-${anio}`} count={detalle.length} reportTitle={`Socios Golf — Pago Anual vs Mensual ${anio}`} hideCSV
          extra={<button className="btn-ghost" onClick={exportarExcel} style={{ fontSize: 12 }}>Exportar Excel</button>} />}
      </div>

      {error && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!buscado && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Selecciona el año y haz clic en Consultar.<br/>
          <span style={{ fontSize: 12 }}>Anual = un recibo con las 12 mensualidades · Anticipado parcial = un recibo con 2 a 11 meses con mínimo 2 posteriores a la fecha de pago · Mensual = el resto (mes a mes o atrasados)</span>
        </div>
      )}

      {buscado && !loading && (
        <div id="reporte-print-area">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Socios con pagos en el año', value: String(rows.length), color: '#334155', bg: '#f8fafc', sub: fmt$(sumMonto(rows)) },
              { label: 'Pago anual (12 meses en un recibo)',    value: String(anuales.length),   color: '#2563eb', bg: '#eff6ff', sub: `${fmt$(sumMonto(anuales))} · ${rows.length ? ((anuales.length / rows.length) * 100).toFixed(1) : '0'}% de socios` },
              { label: 'Anticipado parcial (mín. 2 meses adelantados)', value: String(parciales.length), color: '#d97706', bg: '#fffbeb', sub: `${fmt$(sumMonto(parciales))} · ${rows.length ? ((parciales.length / rows.length) * 100).toFixed(1) : '0'}% de socios` },
              { label: 'Pago mensual',               value: String(mensuales.length), color: '#16a34a', bg: '#f0fdf4', sub: `${fmt$(sumMonto(mensuales))} · ${rows.length ? ((mensuales.length / rows.length) * 100).toFixed(1) : '0'}% de socios` },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 200px', padding: '12px 16px', background: k.bg }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: k.color, marginTop: 1 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Detalle ({detalle.length} socios)
          </h3>
          {detalle.length === 0
            ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Sin resultados</div>
            : (
              <div className="card" style={{ overflow: 'auto', padding: 0 }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                      <th style={th('No.')}>No.</th>
                      <th style={th('Socio')}>Socio</th>
                      <th style={th('Categoría')}>Categoría</th>
                      <th style={th('Forma')}>Forma de pago</th>
                      {MESES_CORTO.map(m => <th key={m} style={th(m, false, true)}>{m}</th>)}
                      <th style={th('Pagados', false, true)}>Pagados</th>
                      <th style={th('Recibo(s)')}>Recibo(s)</th>
                      <th style={th('Monto', true)}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((r, i) => {
                      const fm = FORMA_META[r.forma]
                      return (
                        <tr key={r.idSocio} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{r.numero || '—'}</td>
                          <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{r.nombre}</td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: 11 }}>{r.categoria}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: fm.bg, color: fm.color, fontWeight: 700 }}>{fm.label}</span>
                            {r.fechaAnual && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>pagó {fmtFecha(r.fechaAnual)}</div>}
                          </td>
                          {MESES_CORTO.map((_, mi) => (
                            <td key={mi} style={{ padding: '8px 2px', textAlign: 'center', color: r.meses.has(mi + 1) ? fm.color : 'var(--text-muted)', fontWeight: 700 }}>
                              {r.meses.has(mi + 1) ? '✓' : '·'}
                            </td>
                          ))}
                          <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>{r.meses.size}/12</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>
                            {textoRecibos(r)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt$(r.monto)}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                      <td colSpan={17} style={{ padding: '9px 8px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                      <td style={{ padding: '9px 8px' }} />
                      <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt$(sumMonto(detalle))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  )
}
