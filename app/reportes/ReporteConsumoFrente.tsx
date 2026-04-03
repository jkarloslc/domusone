'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter } from 'lucide-react'

export default function ReporteConsumoFrente() {
  const [rows, setRows]           = useState<any[]>([])
  const [secciones, setSecciones] = useState<any[]>([])
  const [frentes, setFrentes]     = useState<any[]>([])
  const [provMap, setProvMap]     = useState<Record<number, string>>({})
  const [loading, setLoading]     = useState(true)
  const [filtroSec, setFiltroSec]   = useState('')
  const [filtroFre, setFiltroFre]   = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroDe, setFiltroDe]     = useState('')
  const [filtroA,  setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [{ data: secs }, { data: fres }, { data: provs }, { data: ops }] = await Promise.all([
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre, id_seccion_fk').eq('activo', true).order('nombre'),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, id_frente_fk, id_seccion_fk, id_proveedor_fk, concepto, tipo_gasto, monto, saldo, fecha_op, status')
        .not('id_frente_fk', 'is', null)
        .neq('status', 'Cancelada')
        .order('fecha_op', { ascending: false }),
    ])

    setSecciones(secs ?? [])
    setFrentes(fres ?? [])

    const pm: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)

    const freMap: Record<number, any> = {}
    ;(fres ?? []).forEach((f: any) => { freMap[f.id] = f })
    const secMap: Record<number, string> = {}
    ;(secs ?? []).forEach((s: any) => { secMap[s.id] = s.nombre })

    // Filtrar
    let opsFiltradas = ops ?? []
    if (filtroSec)  opsFiltradas = opsFiltradas.filter((r: any) => {
      const fre = freMap[r.id_frente_fk]
      return fre?.id_seccion_fk === Number(filtroSec)
    })
    if (filtroFre)  opsFiltradas = opsFiltradas.filter((r: any) => r.id_frente_fk === Number(filtroFre))
    if (filtroTipo) opsFiltradas = opsFiltradas.filter((r: any) => r.tipo_gasto === filtroTipo)
    if (filtroDe)   opsFiltradas = opsFiltradas.filter((r: any) => r.fecha_op >= filtroDe)
    if (filtroA)    opsFiltradas = opsFiltradas.filter((r: any) => r.fecha_op <= filtroA)

    // Agrupar por frente
    const grouped: Record<number, any> = {}
    for (const op of opsFiltradas) {
      const fid = op.id_frente_fk
      const fre = freMap[fid]
      if (!grouped[fid]) {
        grouped[fid] = {
          id_frente_fk:  fid,
          nombre:        fre?.nombre ?? `Frente #${fid}`,
          seccion:       secMap[fre?.id_seccion_fk] ?? '—',
          total:         0,
          pagado:        0,
          saldo:         0,
          docs:          0,
          ops:           [],
        }
      }
      const monto = Number(op.monto ?? 0)
      const saldo = Number(op.saldo ?? op.monto ?? 0)
      grouped[fid].total  += monto
      grouped[fid].saldo  += saldo
      grouped[fid].pagado += monto - saldo
      grouped[fid].docs   += 1
      grouped[fid].ops.push(op)
    }

    const result = Object.values(grouped).sort((a: any, b: any) => b.total - a.total)
    setRows(result)
    setLoading(false)
  }, [filtroSec, filtroFre, filtroTipo, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  // Frentes filtrados según sección elegida
  const frentesFiltrados = filtroSec
    ? frentes.filter(f => f.id_seccion_fk === Number(filtroSec))
    : frentes

  const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'
  const totalGeneral = rows.reduce((a, r) => a + r.total, 0)
  const docsTotal    = rows.reduce((a, r) => a + r.docs, 0)

  const TIPOS_GASTO = [
    'Servicios Profesionales','Mantenimiento','Reparación','Arrendamiento',
    'Seguros','Publicidad','Combustible','Electricidad','Agua',
    'Telefonía / Internet','Honorarios','Asesoría','Capacitación','Otro',
  ]

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 180 }} value={filtroSec}
            onChange={e => { setFiltroSec(e.target.value); setFiltroFre('') }}>
            <option value="">Todas las secciones</option>
            {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <select className="select" style={{ minWidth: 180 }} value={filtroFre}
          onChange={e => setFiltroFre(e.target.value)}
          disabled={frentesFiltrados.length === 0}>
          <option value="">Todos los frentes</option>
          {frentesFiltrados.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 180 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos de gasto</option>
          {TIPOS_GASTO.map(t => <option key={t}>{t}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PrintBar title="Consumo-por-Frente" count={docsTotal} reportTitle="Consumo por Frente" />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Consumo', value: fmt(totalGeneral), color: 'var(--blue)' },
          { label: 'Frentes con consumo', value: String(rows.length), color: '#7c3aed' },
          { label: 'Órdenes de Pago', value: String(docsTotal), color: '#059669' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla agrupada por frente */}
      <div id="reporte-print-area">
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          Sin datos para los filtros seleccionados
        </div>
      ) : rows.map(fre => (
        <div key={fre.id_frente_fk} className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          {/* Header frente */}
          <div
            onClick={() => toggle(fre.id_frente_fk)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: '#f5f3ff', cursor: 'pointer',
              borderBottom: expanded.has(fre.id_frente_fk) ? '1px solid #ddd6fe' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#7c3aed' }}>{fre.nombre}</span>
              <span style={{ fontSize: 11, color: '#7c3aed', background: '#ede9fe',
                padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>{fre.seccion}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', background: '#f1f5f9',
                padding: '2px 8px', borderRadius: 20 }}>{fre.docs} OP{fre.docs !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>{fmt(fre.total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pagado</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(fre.pagado)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Por pagar</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: fre.saldo > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(fre.saldo)}</div>
              </div>
              <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>{expanded.has(fre.id_frente_fk) ? '▲' : '▼'}</span>
            </div>
          </div>

          {/* Detalle OPs */}
          {expanded.has(fre.id_frente_fk) && (
            <table>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Proveedor</th>
                  <th>Concepto</th>
                  <th>Tipo Gasto</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th style={{ textAlign: 'right' }}>Pagado</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {fre.ops.map((op: any, i: number) => {
                  const monto  = Number(op.monto ?? 0)
                  const saldo  = Number(op.saldo ?? op.monto ?? 0)
                  const pagado = monto - saldo
                  return (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>{op.folio}</td>
                      <td style={{ fontSize: 12 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? '—') : '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{op.tipo_gasto ?? '—'}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtF(op.fecha_op)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(monto)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>{fmt(pagado)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt(saldo)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{op.status}</td>
                    </tr>
                  )
                })}
                <tr style={{ background: '#f5f3ff', fontWeight: 700 }}>
                  <td colSpan={5} style={{ color: '#7c3aed', fontSize: 12 }}>Subtotal {fre.nombre}</td>
                  <td style={{ textAlign: 'right', color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>{fmt(fre.total)}</td>
                  <td style={{ textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(fre.pagado)}</td>
                  <td style={{ textAlign: 'right', color: fre.saldo > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(fre.saldo)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Total general */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <div className="card" style={{ padding: '12px 20px', display: 'flex', gap: 32, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL GENERAL</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalGeneral)}</div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
