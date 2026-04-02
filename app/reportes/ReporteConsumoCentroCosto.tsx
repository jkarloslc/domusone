'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter } from 'lucide-react'

export default function ReporteConsumoCentroCosto() {
  const [rows, setRows]             = useState<any[]>([])
  const [centrosCosto, setCentros]  = useState<any[]>([])
  const [provMap, setProvMap]       = useState<Record<number, string>>({})
  const [loading, setLoading]       = useState(true)
  const [filtroCC, setFiltroCC]     = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroDe, setFiltroDe]     = useState('')
  const [filtroA,  setFiltroA]      = useState('')
  const [expanded, setExpanded]     = useState<Set<number>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [{ data: ccs }, { data: provs }, { data: ops }] = await Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, id_centro_costo_fk, id_proveedor_fk, concepto, tipo_gasto, monto, saldo, fecha_op, status')
        .not('id_centro_costo_fk', 'is', null)
        .neq('status', 'Cancelada')
        .order('fecha_op', { ascending: false }),
    ])

    setCentros(ccs ?? [])

    const pm: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)

    const ccMap: Record<number, string> = {}
    ;(ccs ?? []).forEach((c: any) => { ccMap[c.id] = c.nombre })

    // Filtrar
    let opsFiltradas = ops ?? []
    if (filtroCC)   opsFiltradas = opsFiltradas.filter((r: any) => r.id_centro_costo_fk === Number(filtroCC))
    if (filtroTipo) opsFiltradas = opsFiltradas.filter((r: any) => r.tipo_gasto === filtroTipo)
    if (filtroDe)   opsFiltradas = opsFiltradas.filter((r: any) => r.fecha_op >= filtroDe)
    if (filtroA)    opsFiltradas = opsFiltradas.filter((r: any) => r.fecha_op <= filtroA)

    // Agrupar por centro de costo
    const grouped: Record<number, any> = {}
    for (const op of opsFiltradas) {
      const cid = op.id_centro_costo_fk
      if (!grouped[cid]) {
        grouped[cid] = {
          id:     cid,
          nombre: ccMap[cid] ?? `Centro #${cid}`,
          total:  0,
          pagado: 0,
          saldo:  0,
          docs:   0,
          ops:    [],
        }
      }
      const monto = Number(op.monto ?? 0)
      const saldo = Number(op.saldo ?? op.monto ?? 0)
      grouped[cid].total  += monto
      grouped[cid].saldo  += saldo
      grouped[cid].pagado += monto - saldo
      grouped[cid].docs   += 1
      grouped[cid].ops.push(op)
    }

    setRows(Object.values(grouped).sort((a: any, b: any) => b.total - a.total))
    setLoading(false)
  }, [filtroCC, filtroTipo, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

  const totalGeneral = rows.reduce((a, r) => a + r.total, 0)
  const docsTotal    = rows.reduce((a, r) => a + r.docs, 0)

  const toggle = (id: number) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const TIPOS_GASTO = [
    'Servicios Profesionales','Mantenimiento','Reparación','Arrendamiento',
    'Seguros','Publicidad','Combustible','Electricidad','Agua',
    'Telefonía / Internet','Honorarios','Asesoría','Capacitación','Otro',
  ]

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ minWidth: 200 }} value={filtroCC} onChange={e => setFiltroCC(e.target.value)}>
          <option value="">Todos los centros de costo</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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

      <PrintBar title="Consumo-por-Centro-de-Costo" count={docsTotal} reportTitle="Consumo por Centro de Costo" />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Consumo',          value: fmt(totalGeneral), color: 'var(--blue)' },
          { label: 'Centros de Costo',        value: String(rows.length), color: '#7c3aed' },
          { label: 'Órdenes de Pago',         value: String(docsTotal),   color: '#059669' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla agrupada */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          Sin datos para los filtros seleccionados
        </div>
      ) : rows.map(cc => (
        <div key={cc.id} className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          {/* Header centro de costo */}
          <div
            onClick={() => toggle(cc.id)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: '#eff6ff', cursor: 'pointer',
              borderBottom: expanded.has(cc.id) ? '1px solid #bfdbfe' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)' }}>{cc.nombre}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', background: '#dbeafe',
                padding: '2px 8px', borderRadius: 20 }}>
                {cc.docs} OP{cc.docs !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cc.total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pagado</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(cc.pagado)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Por pagar</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: cc.saldo > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(cc.saldo)}</div>
              </div>
              <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>{expanded.has(cc.id) ? '▲' : '▼'}</span>
            </div>
          </div>

          {/* Detalle OPs */}
          {expanded.has(cc.id) && (
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
                {cc.ops.map((op: any, i: number) => {
                  const monto  = Number(op.monto ?? 0)
                  const saldo  = Number(op.saldo ?? op.monto ?? 0)
                  const pagado = monto - saldo
                  return (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{op.folio}</td>
                      <td style={{ fontSize: 12 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? '—') : '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{op.tipo_gasto ?? '—'}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtF(op.fecha_op)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(monto)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>{fmt(pagado)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt(saldo)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{op.status}</td>
                    </tr>
                  )
                })}
                <tr style={{ background: '#f0f9ff', fontWeight: 700 }}>
                  <td colSpan={5} style={{ color: 'var(--blue)', fontSize: 12 }}>Subtotal {cc.nombre}</td>
                  <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cc.total)}</td>
                  <td style={{ textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(cc.pagado)}</td>
                  <td style={{ textAlign: 'right', color: cc.saldo > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(cc.saldo)}</td>
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
          <div className="card" style={{ padding: '12px 20px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL GENERAL</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalGeneral)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
