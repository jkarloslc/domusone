'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { useConfig } from '@/lib/ConfigContext'
import { dbComp, dbCtrl, dbGolf } from '@/lib/supabase'
import {
  Home, Wrench, ShoppingCart, Landmark, DollarSign,
  BarChart3, Flag, Star, Users, Settings, MessageSquare,
  Truck, AlertTriangle, CheckCircle, RefreshCw, ChevronRight,
  LayoutDashboard, FileText, Package, ArrowLeftRight,
} from 'lucide-react'
import Link from 'next/link'
import { fechaLocal } from '@/lib/dateUtils'

type Pendiente = {
  id: string
  texto: string
  href: string
  urgente?: boolean
}

// Saludo según hora local
function getSaludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// Fecha larga en español
function getFechaLarga(): string {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

type Rol =
  | 'superadmin' | 'admin' | 'admin_lector'
  | 'usuarioadmin' | 'usuariomantto'
  | 'atencion_residentes' | 'cobranza' | 'vigilancia'
  | 'compras' | 'compras_supervisor' | 'almacen'
  | 'mantenimiento' | 'fraccionamiento' | 'tesoreria'
  | 'seguridad' | 'usuario_solicitante' | 'ingresos'
  | 'usuariogolf' | 'usuariohipico' | 'usuariohospitality'
  | 'usuario_nomina'

type Acceso = { label: string; href: string; icon: any; color: string; bg: string }

const HorseIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/>
  </svg>
)

const ACCESOS: Record<Rol, Acceso[]> = {
  superadmin: [
    { label: 'Vista Ejecutiva',  href: '/dashboards/ejecutivo', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Hípico',           href: '/hipico',              icon: HorseIcon,       color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Hospitality',      href: '/hospitality',         icon: Star,            color: '#d97706', bg: '#fffbeb' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
    { label: 'Usuarios',         href: '/usuarios',            icon: Users,           color: '#64748b', bg: '#f8fafc' },
  ],
  admin: [
    { label: 'Vista Ejecutiva',  href: '/dashboards/ejecutivo', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Hípico',           href: '/hipico',              icon: HorseIcon,       color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Hospitality',      href: '/hospitality',         icon: Star,            color: '#d97706', bg: '#fffbeb' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  admin_lector: [
    { label: 'Vista Ejecutiva',  href: '/dashboards/ejecutivo', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  usuarioadmin: [
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Hospitality',      href: '/hospitality',         icon: Star,            color: '#d97706', bg: '#fffbeb' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Dashboard Fin.',   href: '/dashboards/financiero', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
  ],
  usuariomantto: [
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Mantenimiento',    href: '/mantenimiento',       icon: Wrench,          color: '#b45309', bg: '#fffbeb' },
    { label: 'Vehículos',        href: '/equipo-flota',        icon: Truck,           color: '#64748b', bg: '#f8fafc' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Dashboard Fin.',   href: '/dashboards/financiero', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
  ],
  atencion_residentes: [
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Mantenimiento',    href: '/mantenimiento',       icon: Wrench,          color: '#b45309', bg: '#fffbeb' },
    { label: 'Comunicados',      href: '/comunicados',         icon: MessageSquare,   color: '#0284c7', bg: '#f0f9ff' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  cobranza: [
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  vigilancia: [
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
  ],
  compras: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  compras_supervisor: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  almacen: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Inventario',       href: '/compras/inventario',  icon: Package,         color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Transferencias',   href: '/compras/transferencias', icon: ArrowLeftRight, color: '#7c3aed', bg: '#f5f3ff' },
  ],
  mantenimiento: [
    { label: 'Mantenimiento',    href: '/mantenimiento',       icon: Wrench,          color: '#b45309', bg: '#fffbeb' },
    { label: 'Vehículos',        href: '/equipo-flota',        icon: Truck,           color: '#64748b', bg: '#f8fafc' },
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
  ],
  fraccionamiento: [
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Dashboard Fin.',   href: '/dashboards/financiero', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  tesoreria: [
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Ingresos',         href: '/ingresos',            icon: DollarSign,      color: '#059669', bg: '#f0fdf4' },
    { label: 'Dashboard Fin.',   href: '/dashboards/financiero', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  seguridad: [
    { label: 'Residencial',      href: '/residencial',         icon: Home,            color: '#0f766e', bg: '#f0fdfa' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
  ],
  usuario_solicitante: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Requisiciones',    href: '/compras/requisiciones', icon: FileText,      color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Transferencias',   href: '/compras/transferencias', icon: ArrowLeftRight, color: '#0f766e', bg: '#f0fdfa' },
  ],
  ingresos: [
    { label: 'Ingresos',         href: '/ingresos',            icon: DollarSign,      color: '#059669', bg: '#f0fdf4' },
    { label: 'Dashboard Fin.',   href: '/dashboards/financiero', icon: LayoutDashboard, color: '#4f46e5', bg: '#ede9fe' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#dc2626', bg: '#fef2f2' },
  ],
  usuariogolf: [
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
  ],
  usuariohipico: [
    { label: 'Hípico',           href: '/hipico',              icon: HorseIcon,       color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
  ],
  usuariohospitality: [
    { label: 'Hospitality',      href: '/hospitality',         icon: Star,            color: '#d97706', bg: '#fffbeb' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#1d4ed8', bg: '#eff6ff' },
  ],
  usuario_nomina: [
    { label: 'Órdenes de Pago',  href: '/compras/ordenes-pago', icon: Landmark,      color: '#0f766e', bg: '#f0fdfa' },
  ],
}

export default function InicioPage() {
  const { authUser } = useAuth()
  const { config } = useConfig()
  const router = useRouter()
  const hoy = fechaLocal()

  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [loadingP,   setLoadingP]   = useState(true)

  const rol     = (authUser?.rol ?? 'vigilancia') as Rol
  const nombre  = authUser?.nombre ?? ''
  const accesos = ACCESOS[rol] ?? []

  useEffect(() => {
    async function cargarPendientes() {
      setLoadingP(true)
      const items: Pendiente[] = []

      try {
        // OPs vencidas — visible para roles con acceso a compras financiero
        const rolesFinanzas: Rol[] = ['superadmin', 'admin', 'admin_lector', 'usuarioadmin', 'usuariomantto', 'fraccionamiento', 'tesoreria', 'compras_supervisor']
        if (rolesFinanzas.includes(rol)) {
          const { count } = await dbComp.from('ordenes_pago')
            .select('id', { count: 'exact', head: true })
            .in('status', ['Pendiente', 'Pendiente Auth', 'Pendiente Auth Finanzas'])
            .lt('fecha_vencimiento', hoy)
          if ((count ?? 0) > 0) {
            items.push({
              id:      'ops-vencidas',
              texto:   `${count} OP${count === 1 ? '' : 's'} vencida${count === 1 ? '' : 's'} sin pagar`,
              href:    '/compras/ordenes-pago',
              urgente: true,
            })
          }
        }

        // Requisiciones pendientes de autorización — para compras/supervisor
        const rolesAuth: Rol[] = ['superadmin', 'admin', 'compras_supervisor']
        if (rolesAuth.includes(rol)) {
          const { count } = await dbComp.from('requisiciones')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'Enviada')
          if ((count ?? 0) > 0) {
            items.push({
              id:    'req-pendientes',
              texto: `${count} requisición${count === 1 ? '' : 'es'} esperando autorización`,
              href:  '/compras/requisiciones',
            })
          }
        }

        // Mis requisiciones activas — solicitante
        if (rol === 'usuario_solicitante') {
          const { count } = await dbComp.from('requisiciones')
            .select('id', { count: 'exact', head: true })
            .in('status', ['Borrador', 'Enviada', 'Aprobada'])
          if ((count ?? 0) > 0) {
            items.push({
              id:    'mis-req',
              texto: `${count} requisición${count === 1 ? '' : 'es'} activa${count === 1 ? '' : 's'}`,
              href:  '/compras/requisiciones',
            })
          }
        }

        // Ingresos del día — para roles de ingresos/tesorería
        const rolesIng: Rol[] = ['ingresos', 'tesoreria', 'superadmin', 'admin']
        if (rolesIng.includes(rol)) {
          const { data } = await dbCtrl.from('recibos_ingreso')
            .select('monto_total')
            .eq('status', 'Confirmado')
            .eq('fecha', hoy)
          const total = (data ?? []).reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0)
          if (total > 0) {
            const fmtK = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`
            items.push({
              id:    'ing-hoy',
              texto: `${fmtK(total)} en ingresos confirmados hoy`,
              href:  '/ingresos/recibos',
            })
          }
        }

        // Accesos de golf del día (socios principales + acompañantes)
        if (rol === 'usuariogolf' || rol === 'superadmin' || rol === 'admin') {
          // 1) IDs de accesos de hoy
          const { data: accesosHoy, count: cntSocios } = await dbGolf.from('ctrl_accesos')
            .select('id', { count: 'exact' })
            .gte('fecha_entrada', `${hoy}T00:00:00`)
            .lte('fecha_entrada', `${hoy}T23:59:59`)

          // 2) Acompañantes vinculados a esos accesos
          let cntAcomp = 0
          const idsHoy = (accesosHoy ?? []).map((a: any) => a.id)
          if (idsHoy.length > 0) {
            const { count: ca } = await dbGolf.from('ctrl_acceso_acomp')
              .select('id', { count: 'exact', head: true })
              .in('id_acceso_fk', idsHoy)
            cntAcomp = ca ?? 0
          }

          const totalAccesos = (cntSocios ?? 0) + cntAcomp
          if (totalAccesos > 0) {
            items.push({
              id:    'golf-accesos',
              texto: `${totalAccesos} acceso${totalAccesos === 1 ? '' : 's'} al campo hoy`,
              href:  '/golf/accesos',
            })
          }
        }
      } catch {
        // silencioso — pendientes son opcionales
      }

      setPendientes(items)
      setLoadingP(false)
    }

    if (authUser) cargarPendientes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, rol, hoy])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out', maxWidth: 900 }}>

      {/* Saludo */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: 4 }}>
          {getFechaLarga()}
        </div>
        <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700,
          color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
          {getSaludo()}{nombre ? `, ${nombre}` : ''}.
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
          {config.org_nombre}
        </p>
      </div>

      {/* Accesos rápidos */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
          Accesos rápidos
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {accesos.map(a => {
            const Icon = a.icon
            return (
              <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', borderRadius: 10,
                  background: a.bg, border: `1px solid ${a.color}20`,
                  cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s' }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.transform = 'translateY(-2px)'
                    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.transform = 'none'
                    el.style.boxShadow = 'none'
                  }}>
                  <Icon size={14} style={{ color: a.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: a.color, whiteSpace: 'nowrap' }}>
                    {a.label}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Pendientes de atención */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
          Pendientes de atención
        </div>

        {loadingP ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
            <RefreshCw size={13} className="animate-spin" /> Consultando...
          </div>
        ) : pendientes.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 18px', background: '#f0fdf4', borderRadius: 10,
            border: '1px solid #bbf7d0' }}>
            <CheckCircle size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#15803d', fontWeight: 500 }}>
              Todo al día — sin pendientes urgentes
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendientes.map(p => (
              <Link key={p.id} href={p.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                  background: p.urgente ? '#fef2f2' : '#f8fafc',
                  border: `1px solid ${p.urgente ? '#fecaca' : '#e2e8f0'}`,
                  transition: 'transform 0.1s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.urgente
                      ? <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                      : <ChevronRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    }
                    <span style={{ fontSize: 13, color: p.urgente ? '#dc2626' : 'var(--text-primary)', fontWeight: p.urgente ? 600 : 400 }}>
                      {p.texto}
                    </span>
                  </div>
                  <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
