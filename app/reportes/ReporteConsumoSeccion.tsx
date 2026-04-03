'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter } from 'lucide-react'

export default function ReporteConsumoSeccion() {
  const [rows, setRows]           = useState<any[]>([])
  const [secciones, setSecciones] = useState<any[]>([])
  const [provMap, setProvMap]     = useState<Record<number, string>>({})
  const [loading, setLoading]     = useState(true)
  const [filtroSec, setFiltroSec] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')  // tipo_gasto
  const [filtroDe, setFiltroDe]   = useState('')
  const [filtroA,  setFiltroA]    = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [{ data: secs }, { data: provs }, { data: ops }] = await Promise.all([
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, id_seccion_fk, id_proveedor_fk, concepto, tipo_gasto, monto, saldo, fecha_op, status')
        .not('id_seccion_fk', 'is', null)
        .neq('status', 'Cancelada')
        .order('fecha_op', { ascending: false }),
    ])

    setSecciones(secs ?? [])

    const pm: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)

    const secMap: Record<number, string> = {}
    ;(secs ?? []).forEach((s: any) => { secMap[s.id] = s.nombre })

    // Filtrar
    let opsFiltradas = ops ?? []
    if (filtroSec)  opsFiltradas = opsFiltradas.filter((r: any) => r.id_seccion_fk === Number(filtroSec))
    if (filtroTipo) opsFiltradas = opsFiltradas.filter((r: any) => r.tipo_gasto === filtroTipo)
    if (filtroDe)   opsFiltradas = opsFiltradas.filter((r: any) => r.fecha_op >= filtroDe)
    if (filtroA)    opsFiltradas = opsFiltradas.filter((r: any) => r.fecha_op <= filtroA)

    // Agrupar por sección
    const grouped: Record<number, any> = {}
    for (const op of opsFiltradas) {
      const sid = op.id_seccion_fk
      if (!grouped[sid]) {
        grouped[sid] = {
          id_seccion_fk: sid,
          nombre:        secMap[sid] ?? `Sección #${sid}`,
          total:         0,
          pagado:        0,
          saldo:         0,
          docs:          0,
          ops:           [],
        }
      }
      grouped[sid].total  += Number(op.monto ?? 0)
      grouped[sid].saldo  += Number(op.saldo ?? op.monto ?? 0)
      grouped[sid].pagado += Number(op.monto ?? 0) - Number(op.saldo ?? op.monto ?? 0)
      grouped[sid].docs   += 1
      grouped[sid].ops.push(op)
    }

    const result = Object.values(grouped).sort((a: any, b: any) => b.total - a.total)
    setRows(result)
    setLoading(false)
  }, [filtroSec, filtroTipo, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

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
          <select className="select" style={{ minWidth: 200 }} value={filtroSec} onChange={e => setFiltroSec(e.target.value)}>
            <option value="">Todas las secciones</option>
            {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
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

      <PrintBar title="Consumo-por-Seccion" count={docsTotal} reportTitle="Consumo por Sección" />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Consumo', value: fmt(totalGeneral), color: 'var(--blue)' },
          { label: 'Secciones con consumo', value: String(rows.length), color: '#7c3aed' },
          { label: 'Órdenes de Pago', value: String(docsTotal), color: '#059669' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla agrupada por sección */}
      <div id="reporte-print-area">
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          Sin datos para los filtros seleccionados
        </div>
      ) : rows.map(sec => (
        <div key={sec.id_seccion_fk} className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          {/* Header sección */}
          <div
            onClick={() => toggle(sec.id_seccion_fk)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: '#eff6ff', cursor: 'pointer',
              borderBottom: expanded.has(sec.id_seccion_fk) ? '1px solid #bfdbfe' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)' }}>{sec.nombre}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', background: '#dbeafe',
                padding: '2px 8px', borderRadius: 20 }}>{sec.docs} OP{sec.docs !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(sec.total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Por pagar</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: sec.saldo > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(sec.saldo)}</div>
              </div>
              <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>{expanded.has(sec.id_seccion_fk) ? '▲' : '▼'}</span>
            </div>
          </div>

          {/* Detalle OPs */}
          {expanded.has(sec.id_seccion_fk) && (
            <table>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Proveedor</th>
                  <th>Concepto</th>
                  <th>Tipo Gasto</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sec.ops.map((op: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{op.folio}</td>
                    <td style={{ fontSize: 12 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? '—') : '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{op.tipo_gasto ?? '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtF(op.fecha_op)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(Number(op.monto ?? 0))}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: Number(op.saldo ?? op.monto ?? 0) > 0 ? '#dc2626' : '#15803d', fontWeight: 600 }}>
                      {fmt(Number(op.saldo ?? op.monto ?? 0))}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{op.status}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f0f9ff', fontWeight: 700 }}>
                  <td colSpan={5} style={{ color: 'var(--blue)', fontSize: 12 }}>Subtotal {sec.nombre}</td>
                  <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(sec.total)}</td>
                  <td style={{ textAlign: 'right', color: sec.saldo > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(sec.saldo)}</td>
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
          <div className="card" style={{ padding: '12px 20px', display: 'flex', gap: 32, background: 'var(--blue-pale)', border: '1px solid #bfdbfe' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL GENERAL</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalGeneral)}</div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
