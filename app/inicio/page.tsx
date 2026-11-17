'use client'
import { useState, useEffect, type SVGProps } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { useConfig } from '@/lib/ConfigContext'
import { dbComp, dbCtrl, dbGolf } from '@/lib/supabase'
import {
  Home, Wrench, ShoppingCart, Landmark, DollarSign,
  BarChart3, Flag, Users, Settings, MessageSquare,
  Truck, AlertTriangle, CheckCircle, RefreshCw, ChevronRight,
  LayoutDashboard, FileText, Package, ArrowLeftRight,
} from 'lucide-react'
import Link from 'next/link'
import { fechaLocal } from '@/lib/dateUtils'
import { esRevisorNovedades } from '@/lib/vigilanciaNovedades'

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

const HorseIcon = ({ size = 15, ...props }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/>
  </svg>
)

const ACCESOS: Record<Rol, Acceso[]> = {
  superadmin: [
    { label: 'Dashboard',       href: '/dashboards',           icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#267F56', bg: '#F4F5F7' },
    { label: 'Hípico y Eventos', href: '/hipico',              icon: HorseIcon,       color: '#6B4E79', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#126B63', bg: '#F4F5F7' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
    { label: 'Usuarios',         href: '/usuarios',            icon: Users,           color: '#62666E', bg: '#F8F9FA' },
  ],
  admin: [
    { label: 'Dashboard',       href: '/dashboards',           icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#267F56', bg: '#F4F5F7' },
    { label: 'Hípico y Eventos', href: '/hipico',              icon: HorseIcon,       color: '#6B4E79', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#126B63', bg: '#F4F5F7' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  admin_lector: [
    { label: 'Dashboard',       href: '/dashboards',           icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#267F56', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#126B63', bg: '#F4F5F7' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  usuarioadmin: [
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#267F56', bg: '#F4F5F7' },
    { label: 'Hípico y Eventos', href: '/hipico',              icon: HorseIcon,       color: '#6B4E79', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#126B63', bg: '#F4F5F7' },
    { label: 'Dashboard',       href: '/dashboards',            icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
  ],
  usuariomantto: [
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Dashboard',       href: '/dashboards',            icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
  ],
  atencion_residentes: [
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Mantenimiento',    href: '/residencial/mantenimiento',       icon: Wrench,          color: '#96600F', bg: '#F4F5F7' },
    { label: 'Comunicados',      href: '/comunicados',         icon: MessageSquare,   color: '#32789A', bg: '#F4F5F7' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  cobranza: [
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  vigilancia: [
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
  ],
  compras: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  compras_supervisor: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  almacen: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Inventario',       href: '/compras/inventario',  icon: Package,         color: '#126B63', bg: '#F4F5F7' },
    { label: 'Transferencias',   href: '/compras/transferencias', icon: ArrowLeftRight, color: '#6B4E79', bg: '#F4F5F7' },
  ],
  mantenimiento: [
    { label: 'Mantenimiento',    href: '/residencial/mantenimiento',       icon: Wrench,          color: '#96600F', bg: '#F4F5F7' },
    { label: 'Vehículos',        href: '/equipo-flota',        icon: Truck,           color: '#62666E', bg: '#F8F9FA' },
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
  ],
  fraccionamiento: [
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#126B63', bg: '#F4F5F7' },
    { label: 'Dashboard',       href: '/dashboards',            icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  tesoreria: [
    { label: 'Tesorería',        href: '/tesoreria',           icon: Landmark,        color: '#126B63', bg: '#F4F5F7' },
    { label: 'Ingresos',         href: '/ingresos',            icon: DollarSign,      color: '#267F56', bg: '#F4F5F7' },
    { label: 'Dashboard',       href: '/dashboards',            icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  seguridad: [
    { label: 'Fraccionamiento',      href: '/residencial',         icon: Home,            color: '#126B63', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
  ],
  usuario_solicitante: [
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
    { label: 'Requisiciones',    href: '/compras/requisiciones', icon: FileText,      color: '#6B4E79', bg: '#F4F5F7' },
    { label: 'Transferencias',   href: '/compras/transferencias', icon: ArrowLeftRight, color: '#126B63', bg: '#F4F5F7' },
  ],
  ingresos: [
    { label: 'Ingresos',         href: '/ingresos',            icon: DollarSign,      color: '#267F56', bg: '#F4F5F7' },
    { label: 'Dashboard',       href: '/dashboards',            icon: LayoutDashboard, color: '#1C1D21', bg: '#E6E8EB' },
    { label: 'Reportes',         href: '/reportes',            icon: BarChart3,       color: '#C23B3B', bg: '#F4F5F7' },
  ],
  usuariogolf: [
    { label: 'Golf',             href: '/golf',                icon: Flag,            color: '#267F56', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
  ],
  usuariohipico: [
    { label: 'Hípico y Eventos', href: '/hipico',              icon: HorseIcon,       color: '#6B4E79', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
  ],
  usuariohospitality: [
    { label: 'Hípico y Eventos', href: '/hipico',              icon: HorseIcon,       color: '#6B4E79', bg: '#F4F5F7' },
    { label: 'Compras',          href: '/compras',             icon: ShoppingCart,    color: '#26282D', bg: '#F4F5F7' },
  ],
  usuario_nomina: [
    { label: 'Órdenes de Pago',  href: '/compras/ordenes-pago', icon: Landmark,      color: '#126B63', bg: '#F4F5F7' },
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

        // Partes de novedades de Vigilancia enviados y aún sin revisar — roles revisores
        if (esRevisorNovedades(rol)) {
          const { data: sinVer } = await dbCtrl.from('vig_partes')
            .select('id').eq('status', 'Enviado/Cerrado').is('visto_at', null).limit(500)
          const n = sinVer?.length ?? 0
          if (n > 0) {
            // Urgente si alguno trae novedades Alta/Crítica sin cerrar
            const { count: graves } = await dbCtrl.from('vig_novedades')
              .select('id', { count: 'exact', head: true })
              .in('id_parte_fk', sinVer!.map((p: any) => p.id))
              .in('criticidad', ['Alta', 'Crítica']).neq('status', 'Cerrado')
            items.push({
              id:      'vig-partes-sin-ver',
              texto:   `${n} parte${n === 1 ? '' : 's'} de novedades de Vigilancia sin revisar` + ((graves ?? 0) > 0 ? ` · ${graves} novedad${graves === 1 ? '' : 'es'} Alta/Crítica abierta${graves === 1 ? '' : 's'}` : ''),
              href:    '/vigilancia-novedades?sin_revisar=1',
              urgente: (graves ?? 0) > 0,
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
              href:  '/ingresos',
            })
          }
        }

        // Accesos de golf del día (socios principales + acompañantes)
        if ((rol === 'usuariogolf' || rol === 'superadmin' || rol === 'admin') && authUser?.lado !== 'fracc') {
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
                  background: '#fff', border: '1px solid #E6E8EB',
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
                  <Icon size={14} style={{ color: '#62666E', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
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
            padding: '14px 18px', background: '#F4F5F7', borderRadius: 10,
            border: '1px solid #E6E8EB' }}>
            <CheckCircle size={16} style={{ color: '#267F56', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#1F7A50', fontWeight: 500 }}>
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
                  background: p.urgente ? '#F4F5F7' : '#F8F9FA',
                  border: '1px solid #E6E8EB',
                  transition: 'transform 0.1s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.urgente
                      ? <AlertTriangle size={14} style={{ color: '#C23B3B', flexShrink: 0 }} />
                      : <ChevronRight size={14} style={{ color: '#7A7E87', flexShrink: 0 }} />
                    }
                    <span style={{ fontSize: 13, color: p.urgente ? '#C23B3B' : 'var(--text-primary)', fontWeight: p.urgente ? 600 : 400 }}>
                      {p.texto}
                    </span>
                  </div>
                  <ChevronRight size={13} style={{ color: '#7A7E87', flexShrink: 0 }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
