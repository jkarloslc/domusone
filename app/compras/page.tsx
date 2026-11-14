'use client'
import {
  ShoppingCart, Package, Users, Warehouse, ClipboardList,
  FileText, Truck, ArrowLeftRight, ChevronRight,
  Layers, Wallet, Fuel
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import PageHeader from '@/components/layout/PageHeader'

const MODULOS = [
  { key: 'requisiciones', label: 'Requisiciones',     icon: ClipboardList, color: '#1C1D21', desc: 'Solicitudes de compra por área' },
  { key: 'cotizaciones',  label: 'Cotizaciones (RFQ)',icon: FileText,      color: '#6B4E79', desc: 'Solicitudes y comparación de cotizaciones' },
  { key: 'ordenes',       label: 'Órdenes de Compra', icon: ShoppingCart,  color: '#267F56', desc: 'OC y control de compras' },
  { key: 'ordenes-pago',  label: 'Órdenes de Pago',   icon: FileText,      color: '#32789A', desc: 'Pagos con y sin OC — servicios y compras' },
  { key: 'recepciones',   label: 'Recepción',         icon: Truck,         color: '#32789A', desc: 'Entrada de mercancías a almacén' },
  { key: 'transferencias',label: 'Transferencias',    icon: ArrowLeftRight,color: '#B5761A', desc: 'Movimientos entre almacenes' },
  { key: 'inventario',    label: 'Inventario',        icon: Warehouse,     color: '#C23B3B', desc: 'Saldos y kardex por almacén' },
  { key: 'articulos',     label: 'Artículos',              icon: Package,       color: '#4A4D54', desc: 'Catálogo de productos e insumos' },
  { key: 'proveedores',   label: 'Proveedores',             icon: Users,         color: '#7A4B0C', desc: 'Catálogo de proveedores' },
  { key: 'almacenes',     label: 'Almacenes',    icon: Warehouse,     color: '#32789A', desc: 'Almacenes y centros de costo' },
  { key: 'areas',         label: 'Áreas Solicitantes',      icon: Layers,        color: '#6B4E79', desc: 'Áreas para requisiciones' },
  { key: 'caja-chica',   label: 'Caja Chica',              icon: Wallet,        color: '#B5761A', desc: 'Fondos y reembolsos de gastos menores' },
  { key: 'combustible',  label: 'Combustible',             icon: Fuel,          color: '#267F56', desc: 'Kardex de Magna, Premium y Diesel' },
]

export default function ComprasPage() {
  const router = useRouter()
  const { canCompras } = useAuth()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl"
        icon={ShoppingCart}
        eyebrowLabel="Módulo"
        title="Compras e Inventarios"
        subtitle="Gestión P2P — Requisición hasta Inventario Lógico"
      />

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.filter(m => canCompras(m.key)).map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(`/compras/${m.key}`)}
              className="card card-hover"
              style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #E6E8EB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="icon-chip" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#C9CCD3', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>

      {/* Flujo visual */}
      <div className="card" style={{ padding: '20px 24px', marginTop: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Flujo P2P</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'Requisición', color: '#1C1D21' },
            { label: 'Auth. Req.', color: '#267F56' },
            { label: 'RFQ / Cotización', color: '#6B4E79' },
            { label: 'Orden de Compra', color: '#267F56' },
            { label: 'Auth. OC', color: '#267F56' },
            { label: 'Orden de Pago', color: '#32789A' },
            { label: 'Recepción', color: '#B5761A' },
            { label: 'Transferencia', color: '#B5761A' },
            { label: 'Inventario', color: '#C23B3B' },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ padding: '5px 10px', borderRadius: 20, background: step.color, border: `1px solid ${step.color}`, fontSize: 11, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
                {step.label}
              </div>
              {i < arr.length - 1 && <span style={{ color: '#C9CCD3', fontSize: 16 }}>→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
