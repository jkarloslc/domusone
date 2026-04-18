'use client'
import { useState } from 'react'
import {
  MapPin, Users, FileText, Receipt, Shield,
  AlertTriangle, Building2, Wrench, Home,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

// ── Importar páginas/componentes existentes ─────────────────
import LotesPage        from '@/app/lotes/page'
import PropietariosPage from '@/app/propietarios/page'
import CobranzaPage     from '@/app/cobranza/page'
import FacturasPage     from '@/app/facturas/page'
import AccesosPage      from '@/app/accesos/page'
import IncidenciasPage  from '@/app/incidencias/page'
import ContratosPage    from '@/app/contratos/page'
import EscriturasPage   from '@/app/escrituras/page'
import ProyectosPage    from '@/app/proyectos/page'

// ── Definición de tabs — cada key coincide con el módulo en LEER ─
type TabKey =
  | 'lotes'
  | 'propietarios'
  | 'cobranza'
  | 'facturas'
  | 'accesos'
  | 'incidencias'
  | 'contratos'
  | 'escrituras'
  | 'proyectos'

const ALL_TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'lotes',        label: 'Lotes',        icon: <MapPin        size={14} /> },
  { key: 'propietarios', label: 'Propietarios', icon: <Users         size={14} /> },
  { key: 'cobranza',     label: 'Cobranza',     icon: <FileText      size={14} /> },
  { key: 'facturas',     label: 'Facturas',     icon: <Receipt       size={14} /> },
  { key: 'accesos',      label: 'Accesos',      icon: <Shield        size={14} /> },
  { key: 'incidencias',  label: 'Incidencias',  icon: <AlertTriangle size={14} /> },
  { key: 'contratos',    label: 'Contratos',    icon: <FileText      size={14} /> },
  { key: 'escrituras',   label: 'Escrituras',   icon: <Building2     size={14} /> },
  { key: 'proyectos',    label: 'Proyectos',    icon: <Wrench        size={14} /> },
]

export default function ResidencialPage() {
  const { can } = useAuth()

  // Filtrar tabs según permisos del rol actual
  const TABS = ALL_TABS.filter(t => can(t.key))

  const [tab, setTab] = useState<TabKey | null>(null)

  // Tab activo: el seleccionado, o el primero disponible si aún no hay selección
  const activeTab: TabKey | null = tab && TABS.some(t => t.key === tab)
    ? tab
    : TABS[0]?.key ?? null

  if (TABS.length === 0) {
    return (
      <div style={{ padding: '48px 36px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Sin acceso a módulos residenciales.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        padding: '20px 32px 0',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Home size={15} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Módulo
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400,
          color: 'var(--gold-light)', marginBottom: 14, letterSpacing: '-0.01em',
        }}>
          Residencial
        </h1>

        {/* ── Tabs (solo los que el rol puede ver) ──────────── */}
        <div style={{
          display: 'flex', gap: 0, overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', fontSize: 13, whiteSpace: 'nowrap',
                fontWeight: activeTab === t.key ? 600 : 400,
                color: activeTab === t.key ? 'var(--gold-light)' : 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido del tab activo ───────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'lotes'        && <LotesPage embedded />}
        {activeTab === 'propietarios' && <PropietariosPage />}
        {activeTab === 'cobranza'     && <CobranzaPage embedded />}
        {activeTab === 'facturas'     && <FacturasPage />}
        {activeTab === 'accesos'      && <AccesosPage embedded />}
        {activeTab === 'incidencias'  && <IncidenciasPage />}
        {activeTab === 'contratos'    && <ContratosPage />}
        {activeTab === 'escrituras'   && <EscriturasPage />}
        {activeTab === 'proyectos'    && <ProyectosPage embedded />}
      </div>
    </div>
  )
}
