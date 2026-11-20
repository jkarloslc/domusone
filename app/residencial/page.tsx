'use client'
import {
  MapPin, MapPinned, Users, FileText, Receipt, Shield,
  AlertTriangle, Building2, Home, ChevronRight, MessageSquare, ShieldCheck, HardHat, Scale, ClipboardList,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'

const MODULOS = [
  { key: 'lotes',        permKey: 'lotes',        label: 'Lotes',        icon: MapPin,        color: '#1C1D21', desc: 'Padrón de lotes y estatus de venta',          href: '/lotes'        },
  { key: 'propietarios', permKey: 'propietarios', label: 'Propietarios', icon: Users,         color: '#1F7A50', desc: 'Titulares, contactos y familiares',             href: '/propietarios' },
  { key: 'cobranza',     permKey: 'cobranza',     label: 'Cobranza',     icon: FileText,      color: '#A8821A', desc: 'Cargos, estados de cuenta y recibos',           href: '/cobranza'     },
  { key: 'facturas',     permKey: 'facturas',     label: 'Facturas',     icon: Receipt,       color: '#C23B3B', desc: 'CFDI y facturación electrónica',                href: '/facturas'     },
  { key: 'accesos',      permKey: 'accesos',      label: 'Accesos',      icon: Shield,        color: '#32789A', desc: 'Bitácora de accesos y vehículos registrados',   href: '/accesos'      },
  { key: 'incidencias',  permKey: 'incidencias',  label: 'Incidencias',  icon: AlertTriangle, color: '#C23B3B', desc: 'Reportes de incidencias y seguimiento',         href: '/incidencias'  },
  { key: 'vigilancia-extras', permKey: 'vigilancia-extras', label: 'Vigilancia', icon: ShieldCheck, color: '#33363C', desc: 'Extras de vigilancia: captura, autorización y OP', href: '/vigilancia-extras' },
  { key: 'vigilancia-novedades', permKey: 'vigilancia-novedades', label: 'Parte de Novedades', icon: ClipboardList, color: '#4A4D54', desc: 'Parte diario de vigilancia: novedades por lote y ubicación', href: '/vigilancia-novedades' },
  { key: 'contratos',    permKey: 'contratos',    label: 'Contratos',    icon: FileText,      color: '#6B4E79', desc: 'Gestión de contratos de compraventa',           href: '/contratos'    },
  { key: 'escrituras',   permKey: 'escrituras',   label: 'Escrituras',   icon: Building2,     color: '#B5761A', desc: 'Documentos notariales y escrituración',         href: '/escrituras'   },
  { key: 'construcciones', permKey: 'construcciones', label: 'Construcciones', icon: HardHat, color: '#B5761A', desc: 'Expedientes de obra: checklist, avances e incidencias', href: '/construcciones' },
  { key: 'afectaciones', permKey: 'afectaciones', label: 'Servidumbres y Afectaciones', icon: Scale, color: '#32789A', desc: 'Servidumbres, pasos y afectaciones sobre lotes', href: '/afectaciones' },
  { key: 'expediente',   permKey: 'lotes',        label: 'Expedientes',  icon: MapPinned,     color: '#1C1D21', desc: 'Vista unificada por lote: documentos, propietario, cobranza e historial', href: '/lotes/expediente' },
  { key: 'comunicados',  permKey: 'comunicados',  label: 'Comunicados',  icon: MessageSquare, color: '#178A80', desc: 'Avisos y comunicados a residentes',             href: '/comunicados'  },
]

const PESTANAS = [
  { key: 'administracion', label: 'Administración',        modulos: ['lotes', 'propietarios', 'expediente'] },
  { key: 'cobranza',       label: 'Cobranza',              modulos: ['cobranza', 'facturas'] },
  { key: 'vigilancia',     label: 'Vigilancia',            modulos: ['accesos', 'vigilancia-extras', 'vigilancia-novedades'] },
  { key: 'atencion',       label: 'Atención a Residentes', modulos: ['incidencias', 'comunicados'] },
  { key: 'proyectos',      label: 'Proyectos',             modulos: ['construcciones', 'afectaciones'] },
  { key: 'docs',           label: 'Docs.',                 modulos: ['contratos', 'escrituras'] },
] as const

const LS_TAB = 'fracc-hub-tab'

export default function ResidencialPage() {
  const { can } = useAuth()
  const router  = useRouter()
  const [tab, setTab] = useState<string>('administracion')

  useEffect(() => {
    try { const t = localStorage.getItem(LS_TAB); if (t) setTab(t) } catch {}
  }, [])

  const cambiarTab = (k: string) => {
    setTab(k)
    try { localStorage.setItem(LS_TAB, k) } catch {}
  }

  const pestanas = PESTANAS
    .map(p => ({ ...p, items: p.modulos.map(k => MODULOS.find(m => m.key === k)!).filter(m => m && can(m.permKey)) }))
    .filter(p => p.items.length > 0)
  const activa = pestanas.find(p => p.key === tab) ?? pestanas[0]

  if (pestanas.length === 0) {
    return (
      <div style={{ padding: '48px 36px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Sin acceso a módulos del fraccionamiento.
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        variant="xl"
        icon={Home}
        eyebrowLabel="Módulo"
        title="Fraccionamiento"
        subtitle="Gestión de lotes, propietarios y servicios del fraccionamiento"
      />

      {/* Pestañas */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E6E8EB', marginBottom: 16, overflowX: 'auto' }}>
        {pestanas.map(p => {
          const on = p.key === activa.key
          return (
            <button key={p.key} onClick={() => cambiarTab(p.key)}
              style={{
                padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                borderBottom: `2px solid ${on ? '#19D3C5' : 'transparent'}`, marginBottom: -1,
                fontSize: 13, fontWeight: on ? 700 : 500, color: on ? '#1C1D21' : '#62666E',
              }}>
              {p.label}
              <span style={{ marginLeft: 6, fontSize: 11, color: '#9A9EA7', fontVariantNumeric: 'tabular-nums' }}>{p.items.length}</span>
            </button>
          )
        })}
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
        {activa.items.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(m.href)}
              className="card card-hover"
              style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #E6E8EB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="icon-chip" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#C9CCD3', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
