'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

const diasVenc = (fecha: string | null) => {
  if (!fecha) return 0
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

const banda = (dias: number) => {
  if (dias <= 0)  return { label: 'Por vencer',  color: '#15803d' }
  if (dias <= 30) return { label: '1-30 días',   color: '#d97706' }
  if (dias <= 60) return { label: '31-60 días',  color: '#ea580c' }
  if (dias <= 90) return { label: '61-90 días',  color: '#dc2626' }
  return             { label: '+90 días',        color: '#7f1d1d' }
}

export default function ReporteCXP() {
  const [rows, setRows]       = useState<any[]>([])
  const [provMap, setProvMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [filtroProv, setFiltroProv] = useState('')
  const [provs, setProvs] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ops }, { data: ps }] = await Promise.all([
      dbComp.from('ordenes_pago').select('*').neq('status', 'Cancelada').order('fecha_vencimiento'),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
    ])
    setProvs(ps ?? [])
    const pm: Record<number, string> = {}
    ;(ps ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)

    let result = (ops ?? []).filter((r: any) => r.status !== 'Pagada')
    if (filtroProv) result = result.filter((r: any) => r.id_proveedor_fk === Number(filtroProv))

    setRows(result.map((r: any) => ({ ...r, dias: diasVenc(r.fecha_vencimiento) })))
    setLoading(false)
  }, [filtroProv])

  useEffect(() => { fetchData() }, [fetchData])

  const fmt  = (n: number | null) => n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'
  const totalSaldo = rows.reduce((a, r) => a + Number(r.saldo ?? r.monto ?? 0), 0)

  const BANDAS = [
    { label: 'Por vencer',  min: null, max: 0 },
    { label: '1-30 días',   min: 1,    max: 30 },
    { label: '31-60 días',  min: 31,   max: 60 },
    { label: '61-90 días',  min: 61,   max: 90 },
    { label: '+90 días',    min: 91,   max: null },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 220 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="CXP-Antiguedad-Saldos" count={rows.length} reportTitle="Cuentas por Pagar — Antigüedad de Saldos" />

      {/* Resumen por banda */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        {BANDAS.map(b => {
          const filtradas = rows.filter(r => {
            if (b.min === null) return r.dias <= 0
            if (b.max === null) return r.dias >= b.min
            return r.dias >= b.min && r.dias <= b.max
          })
          const tot = filtradas.reduce((a, r) => a + Number(r.saldo ?? r.monto ?? 0), 0)
          const { color } = banda(b.min === null ? -1 : b.min)
          return (
            <div key={b.label} className="card" style={{ padding: '10px 14px', borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{b.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{fmt(tot)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtradas.length} docs</div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Proveedor</th>
              <th>Concepto</th>
              <th>Tipo Gasto</th>
              <th>Fecha OP</th>
              <th>Vencimiento</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
              <th style={{ textAlign: 'right' }}>Pagado</th>
              <th style={{ textAlign: 'right' }}>Saldo</th>
              <th>Antigüedad</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin saldos pendientes</td></tr>
            ) : rows.map((r, i) => {
              const b = banda(r.dias)
              return (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                  <td style={{ fontSize: 12 }}>{r.id_proveedor_fk ? (provMap[r.id_proveedor_fk] ?? '—') : '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.concepto ?? '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.tipo_gasto ?? '—'}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(r.fecha_op)}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: r.dias > 0 ? b.color : 'var(--text-secondary)', fontWeight: r.dias > 0 ? 600 : 400 }}>
                    {fmtF(r.fecha_vencimiento)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmt(r.monto)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: '#15803d' }}>{fmt(r.monto_pagado ?? 0)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: b.color }}>{fmt(r.saldo ?? r.monto)}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      color: b.color, background: b.color + '15', border: `1px solid ${b.color}40` }}>
                      {b.label}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.status}</td>
                </tr>
              )
            })}
            {rows.length > 0 && (
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={8} style={{ color: 'var(--blue)' }}>TOTAL POR PAGAR</td>
                <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 15 }}>{fmt(totalSaldo)}</td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
