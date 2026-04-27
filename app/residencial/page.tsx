'use client'
import {
  MapPin, MapPinned, Users, FileText, Receipt, Shield,
  AlertTriangle, Building2, Wrench, Home, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

const MODULOS = [
  { key: 'lotes',        permKey: 'lotes',        label: 'Lotes',        icon: MapPin,        color: '#3F4A75', desc: 'Padrón de lotes y estatus de venta',          href: '/lotes'        },
  { key: 'propietarios', permKey: 'propietarios', label: 'Propietarios', icon: Users,         color: '#15803d', desc: 'Titulares, contactos y familiares',             href: '/propietarios' },
  { key: 'cobranza',     permKey: 'cobranza',     label: 'Cobranza',     icon: FileText,      color: '#C4A048', desc: 'Cargos, estados de cuenta y recibos',           href: '/cobranza'     },
  { key: 'facturas',     permKey: 'facturas',     label: 'Facturas',     icon: Receipt,       color: '#dc2626', desc: 'CFDI y facturación electrónica',                href: '/facturas'     },
  { key: 'accesos',      permKey: 'accesos',      label: 'Accesos',      icon: Shield,        color: '#0891b2', desc: 'Bitácora de accesos y vehículos registrados',   href: '/accesos'      },
  { key: 'incidencias',  permKey: 'incidencias',  label: 'Incidencias',  icon: AlertTriangle, color: '#dc2626', desc: 'Reportes de incidencias y seguimiento',         href: '/incidencias'  },
  { key: 'contratos',    permKey: 'contratos',    label: 'Contratos',    icon: FileText,      color: '#7c3aed', desc: 'Gestión de contratos de compraventa',           href: '/contratos'    },
  { key: 'escrituras',   permKey: 'escrituras',   label: 'Escrituras',   icon: Building2,     color: '#d97706', desc: 'Documentos notariales y escrituración',         href: '/escrituras'   },
  { key: 'proyectos',    permKey: 'proyectos',    label: 'Proyectos',    icon: Wrench,        color: '#059669', desc: 'Avance de obras y proyectos de desarrollo',     href: '/proyectos'    },
]

export default function ResidencialPage() {
  const { can } = useAuth()
  const router  = useRouter()

  const visibles = MODULOS.filter(m => can(m.permKey))

  if (visibles.length === 0) {
    return (
      <div style={{ padding: '48px 36px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Sin acceso a módulos residenciales.
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Home size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Residencial</h1>
          <p className="page-subtitle">Gestión de lotes, propietarios y servicios del fraccionamiento</p>
        </div>
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
        {visibles.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(m.href)}
              className="card card-hover"
              style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>

      {/* Expediente — acceso rápido separado */}
      {can('lotes') && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Acceso Rápido
          </div>
          <button
            onClick={() => router.push('/lotes/expediente')}
            className="card card-hover"
            style={{ width: '100%', padding: '16px 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MapPinned size={18} style={{ color: '#3F4A75' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Expedientes</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#eef0f8', color: '#3F4A75', border: '1px solid #dde0f2' }}>
                  Vista unificada por lote
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Documentos, propietario, cobranza e historial de un lote en una sola vista
              </div>
            </div>
            <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
          </button>
        </>
      )}
    </div>
  )
}
