'use client'
import { useRouter } from 'next/navigation'
import {
  Flag, MapPin, Calendar,
  Car,
  ChevronRight, ArrowRightLeft, Target,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

// ── Módulos del club ──────────────────────────────────────────
const MODULOS = [
  {
    key: 'reservaciones',
    label: 'Reservaciones',
    desc: 'Reservas de canchas, rangos y espacios deportivos',
    icon: Calendar,
    color: '#7c3aed',
    href: '/golf/reservaciones',
    activo: true,
  },
  {
    key: 'accesos',
    label: 'Salidas al Campo',
    desc: 'Registro de entradas, hoyo de inicio y acompañantes',
    icon: MapPin,
    color: '#16a34a',
    href: '/golf/accesos',
    activo: true,
  },
  {
    key: 'tee-practica',
    label: 'Tee de Práctica',
    desc: 'Registro de entradas y emisión de tickets — área concesionada',
    icon: Target,
    color: '#d97706',
    href: '/golf/tee-practica',
    activo: true,
  },
  {
    key: 'intercambios',
    label: 'Intercambios',
    desc: 'Cartas de intercambio para socios y catálogo de clubes convenio',
    icon: ArrowRightLeft,
    color: '#2563eb',
    href: '/golf/intercambios',
    activo: true,
  },
  {
    key: 'salidas-carritos',
    label: 'Entrada / Salida y Bitácora de Carritos',
    desc: 'Salidas a ronda de juego, regresos y bitácora del carrito',
    icon: Car,
    color: '#0d9488',
    href: '/golf/salidas-carritos',
    activo: true,
  },
  {
    key: 'torneos',
    label: 'Torneos de Golf',
    desc: 'Organización de torneos, inscripciones y resultados',
    icon: Flag,
    color: '#ca8a04',
    href: '/golf/torneos',
    activo: true,
  },
]

export default function GolfPage() {
  const router  = useRouter()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        variant="xl"
        icon={Flag}
        eyebrowLabel="Módulo"
        title="Club Golf"
        subtitle="Administración del club — socios, operaciones de campo y servicios deportivos"
      />

      {/* Grid de módulos ─────────────────────────────────── */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
        Módulos
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => m.activo && router.push(m.href)}
              className={m.activo ? 'card card-hover' : 'card'}
              style={{
                padding: '18px 20px',
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #e2e8f0',
                cursor: m.activo ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                opacity: m.activo ? 1 : 0.5,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: m.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={18} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              {m.activo
                ? <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
                : <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0',
                    flexShrink: 0, whiteSpace: 'nowrap' }}>PRÓXIMO</span>
              }
            </button>
          )
        })}
      </div>

    </div>
  )
}
