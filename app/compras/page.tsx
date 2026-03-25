'use client'
import { useState, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import {
  ShoppingCart, Package, Users, Warehouse, ClipboardList,
  FileText, Truck, ArrowLeftRight, BarChart3, ChevronRight,
  AlertTriangle, CheckCircle, Clock
} from 'lucide-react'
import { useRouter } from 'next/navigation'

type StatCard = { label: string; value: number | string; color: string; bg: string }

const MODULOS = [
  { key: 'requisiciones', label: 'Requisiciones',     icon: ClipboardList, color: '#2563eb', desc: 'Solicitudes de compra por área' },
  { key: 'cotizaciones',  label: 'Cotizaciones (RFQ)',icon: FileText,      color: '#7c3aed', desc: 'Solicitudes y comparación de cotizaciones' },
  { key: 'ordenes',       label: 'Órdenes de Compra', icon: ShoppingCart,  color: '#059669', desc: 'OC y control de compras' },
  { key: 'ordenes-pago',  label: 'Órdenes de Pago',   icon: FileText,      color: '#0891b2', desc: 'Pagos con y sin OC — servicios y compras' },
  { key: 'recepciones',   label: 'Recepción',         icon: Truck,         color: '#0891b2', desc: 'Entrada de mercancías a almacén' },
  { key: 'transferencias',label: 'Transferencias',    icon: ArrowLeftRight,color: '#d97706', desc: 'Movimientos entre almacenes' },
  { key: 'inventario',    label: 'Inventario',        icon: Warehouse,     color: '#dc2626', desc: 'Saldos y kardex por almacén' },
  { key: 'articulos',     label: 'Artículos',         icon: Package,       color: '#475569', desc: 'Catálogo de productos e insumos' },
  { key: 'proveedores',   label: 'Proveedores',       icon: Users,         color: '#92400e', desc: 'Catálogo de proveedores' },
]

export default function ComprasPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    reqPendientes: 0, ocAbiertas: 0, transAuth: 0, artsBajoMin: 0
  })

  useEffect(() => {
    Promise.all([
      dbComp.from('requisiciones').select('id', { count: 'exact', head: true }).in('status', ['Enviada', 'Aprobada']),
      dbComp.from('ordenes_compra').select('id', { count: 'exact', head: true }).in('status', ['Autorizada', 'Recibida Parcial']),
      dbComp.from('transferencias').select('id', { count: 'exact', head: true }).eq('status', 'Autorizada'),
    ]).then(([req, oc, trans]) => {
      setStats({
        reqPendientes: req.count ?? 0,
        ocAbiertas:    oc.count ?? 0,
        transAuth:     trans.count ?? 0,
        artsBajoMin:   0,
      })
    })
  }, [])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ShoppingCart size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Compras e Inventarios</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Gestión P2P — Requisición hasta Inventario Lógico</p>
      </div>

      {/* Stats rápidas */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'Requisiciones activas', value: stats.reqPendientes, color: '#2563eb', bg: '#eff6ff', icon: ClipboardList },
          { label: 'OC abiertas',           value: stats.ocAbiertas,    color: '#059669', bg: '#f0fdf4', icon: ShoppingCart },
          { label: 'Transferencias auth.',  value: stats.transAuth,     color: '#d97706', bg: '#fffbeb', icon: ArrowLeftRight },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="card" style={{ padding: '14px 18px', minWidth: 160, background: s.bg, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(`/compras/${m.key}`)}
              className="card card-hover"
              style={{ padding: '18px 20px', textAlign: 'left', background: 'none', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>

      {/* Flujo visual */}
      <div className="card" style={{ padding: '20px 24px', marginTop: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Flujo P2P</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'Requisición', color: '#2563eb' },
            { label: 'Auth. Req.', color: '#059669' },
            { label: 'RFQ / Cotización', color: '#7c3aed' },
            { label: 'Orden de Compra', color: '#059669' },
            { label: 'Auth. OC', color: '#059669' },
            { label: 'Orden de Pago', color: '#0891b2' },
            { label: 'Recepción', color: '#d97706' },
            { label: 'Transferencia', color: '#d97706' },
            { label: 'Inventario', color: '#dc2626' },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ padding: '5px 10px', borderRadius: 20, background: step.color + '12', border: `1px solid ${step.color}30`, fontSize: 11, fontWeight: 600, color: step.color, whiteSpace: 'nowrap' }}>
                {step.label}
              </div>
              {i < arr.length - 1 && <span style={{ color: '#cbd5e1', fontSize: 16 }}>→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
