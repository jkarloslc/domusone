'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

type Rol =
  | 'superadmin'
  | 'admin'
  | 'admin_lector'
  | 'admin_finanzas'
  | 'usuarioadmin'
  | 'usuariomantto'
  | 'atencion_residentes'
  | 'cobranza'
  | 'vigilancia'
  | 'compras'
  | 'compras_supervisor'
  | 'almacen'
  | 'mantenimiento'
  | 'fraccionamiento'
  | 'tesoreria'
  | 'seguridad'
  | 'usuario_solicitante'
  | 'ingresos'
  | 'usuariogolf'
  | 'usuariohipico'
  | 'usuariohospitality'
  | 'usuario_nomina'
  | 'usuario_organismo'
  | 'admin_organismo'
  | 'caja_organismo'
  | 'aux_organismo'

type AuthUser = {
  user:   User
  nombre: string
  rol:    Rol
}

export function getHomeRouteByRole(rol?: Rol): string {
  switch (rol) {
    case 'superadmin':
    case 'admin':
    case 'admin_lector':
    case 'admin_finanzas':
    case 'usuarioadmin':
    case 'usuariomantto':
    case 'fraccionamiento':
    case 'atencion_residentes':
    case 'cobranza':
    case 'vigilancia':
    case 'mantenimiento':
    case 'seguridad':
    case 'usuario_organismo':
      return '/residencial'
    case 'compras':
    case 'compras_supervisor':
    case 'almacen':
    case 'usuario_solicitante':
    case 'admin_organismo':
      return '/compras'
    case 'usuario_nomina':
      return '/inicio'
    case 'tesoreria':
      return '/tesoreria'
    case 'ingresos':
      return '/ingresos'
    case 'caja_organismo':
      return '/ingresos'
    case 'aux_organismo':
      return '/mantenimiento'
    case 'usuariogolf':
      return '/golf'
    case 'usuariohipico':
      return '/hipico'
    case 'usuariohospitality':
      return '/hospitality'
    default:
      return '/residencial'
  }
}

type AuthCtx = {
  authUser:   AuthUser | null
  loading:    boolean
  signIn:     (email: string, password: string) => Promise<string | null>
  signOut:    () => Promise<void>
  /** ¿Puede VER el módulo? — sidebar */
  can:        (modulo: string) => boolean
  /** ¿Puede CREAR / EDITAR? — botones Nuevo/Editar */
  canWrite:   (modulo: string) => boolean
  /** ¿Puede ELIMINAR? — solo admin */
  canDelete:  () => boolean
  /** ¿Puede ver secciones de Compras?
   *  Retorna 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | 'nomina' | false
   *  Acepta clave opcional del módulo para filtrar tarjetas del hub */
  canCompras: (key?: string) => 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | 'nomina' | false
  /** ¿Puede AUTORIZAR documentos (Req, OC, Transferencias)? */
  canAuth:    (modulo?: string) => boolean
  /** ¿Puede dar la SEGUNDA autorización de Órdenes de Pago (envío a CXP)? */
  canAuthFinanzas: () => boolean
  /** ¿Puede ver un reporte específico?
   *  Si el rol tiene lista en REPORTES_PERMITIDOS solo ve los IDs listados.
   *  Si no tiene lista (mayoría de roles), cae al permiso de grupo (can(modulo)). */
  canReporte: (id: string) => boolean
}

// Módulos que admin puede ver/escribir (todo excepto usuarios y configuracion)
const ADMIN_MODULOS = [
  'lotes', 'propietarios', 'contratos', 'escrituras',
  'cobranza', 'facturas', 'accesos', 'incidencias', 'vigilancia-extras',
  'afectaciones', 'construcciones', 'mantenimiento', 'comunicados',
  'compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago',
  'transferencias', 'recepciones',
  'proveedores', 'articulos', 'almacenes', 'areas',
  'tesoreria', 'cxp', 'ingresos', 'presupuestos', 'reportes', 'catalogos',
  'dashboards',
  'golf', 'golf-torneos', 'golf-miembros', 'golf-accesos', 'golf-reservaciones',
  'golf-pases', 'golf-clinicas', 'golf-pos', 'golf-carritos', 'golf-casilleros',
  'golf-cuotas', 'golf-cxc', 'golf-recibos', 'golf-intercambios', 'golf-catalogos',
  'golf-riego', 'golf-mantenimiento-campo', 'golf-tee-practica',
  'golf-administracion', 'golf-mantto-campo', 'golf-estatus-campo',
  // Hípico
  'hipico', 'hipico-arrendatarios', 'hipico-caballerizas', 'hipico-caballos',
  'hipico-contratos', 'hipico-cobranza', 'hipico-servicios',
  // Hospitality
  'hospitality',
  // Renta de Locales Comerciales y Propiedades
  'locales',
  // Vehículos y Maquinaria
  'equipo-flota',
  // Equipo y Herramienta
  'herramientas',
  // Proyectos CAPEX
  'capex',
]

// Módulos Hípico para rol dedicado
const HIPICO_MODULOS = [
  'hipico', 'hipico-arrendatarios', 'hipico-caballerizas', 'hipico-caballos',
  'hipico-contratos', 'hipico-cobranza', 'hipico-servicios', 'reportes',
  'compras', 'requisiciones', 'transferencias',
]

// Módulos Golf para rol dedicado
// Incluye requisiciones y transferencias de Compras para flujo de solicitudes
// Incluye módulo Hípico completo (acceso agregado 2026-07-28)
const GOLF_MODULOS = [
  'golf', 'golf-torneos', 'golf-miembros', 'golf-accesos', 'golf-reservaciones',
  'golf-pases', 'golf-clinicas', 'golf-pos', 'golf-carritos', 'golf-casilleros',
  'golf-cuotas', 'golf-cxc', 'golf-recibos', 'golf-intercambios', 'golf-catalogos',
  'golf-riego', 'golf-mantenimiento-campo', 'golf-tee-practica',
  'golf-administracion', 'golf-mantto-campo', 'golf-estatus-campo',
  'reportes', 'compras', 'requisiciones', 'transferencias', 'locales',
  ...HIPICO_MODULOS,
]

// Módulos Hospitality para rol dedicado
// Incluye módulo Hípico completo (mismo alcance que usuariohipico)
const HOSPITALITY_MODULOS = [
  'hospitality', 'reportes',
  'compras', 'requisiciones', 'transferencias',
  'golf', 'golf-torneos',
  ...HIPICO_MODULOS,
]
// usuarioadmin: igual que admin pero sin mantenimiento
const USUARIOADMIN_MODULOS = ADMIN_MODULOS.filter(m => m !== 'mantenimiento')
// usuariomantto: igual que admin pero sin tesoreria ni golf
const USUARIOMANTTO_MODULOS = ADMIN_MODULOS.filter(m => m !== 'tesoreria' && m !== 'cxp' && m !== 'golf' && !m.startsWith('golf-'))

// Módulo Compras completo (todas las sub-secciones del hub)
const COMPRAS_MODULOS = [
  'compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago',
  'transferencias', 'recepciones', 'proveedores', 'articulos', 'almacenes', 'areas',
]
// admin_organismo: acceso total (leer/escribir/eliminar) a Compras, Mantenimiento,
// Tesorería, Ingresos, Presupuestos y Catálogos — sin Residencial ni Golf/Hípico/Hospitality
const ADMIN_ORGANISMO_MODULOS = [
  ...COMPRAS_MODULOS, 'mantenimiento', 'equipo-flota', 'herramientas', 'capex',
  'tesoreria', 'cxp', 'ingresos', 'presupuestos', 'catalogos',
]

// ── Lectura (visibilidad sidebar) ─────────────────────────────────────────────
const LEER: Record<Rol, string[] | '*'> = {
  superadmin:          '*',
  admin:               ADMIN_MODULOS,
  admin_lector:        ADMIN_MODULOS,   // igual que admin, solo lectura
  admin_finanzas:      ADMIN_MODULOS,   // igual que admin + 2da autorización de OP
  usuarioadmin:        USUARIOADMIN_MODULOS,
  usuariomantto:       USUARIOMANTTO_MODULOS,
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'afectaciones', 'construcciones', 'mantenimiento', 'comunicados', 'reportes'],
  cobranza:            ['lotes', 'propietarios', 'cobranza', 'facturas', 'ingresos', 'reportes'],
  vigilancia:          ['lotes', 'propietarios', 'accesos', 'incidencias', 'vigilancia-extras'],
  compras:             ['compras', 'cxp', 'reportes', 'equipo-flota'],
  compras_supervisor:  ['compras', 'cxp', 'reportes'],
  almacen:             ['compras', 'reportes'],
  mantenimiento:       ['lotes', 'propietarios', 'mantenimiento', 'reportes', 'dashboards'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'afectaciones', 'construcciones', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'cxp', 'ingresos',
                        'presupuestos', 'comunicados', 'reportes', 'dashboards'],
  tesoreria:           ['tesoreria', 'cxp', 'ingresos', 'presupuestos', 'reportes', 'dashboards'],
  seguridad:           ['lotes', 'accesos', 'incidencias', 'compras', 'vigilancia-extras'],
  usuario_solicitante: ['compras', 'requisiciones', 'transferencias'],
  ingresos:            ['ingresos', 'reportes', 'dashboards'],
  usuariogolf:         GOLF_MODULOS,
  usuariohipico:       HIPICO_MODULOS,
  usuariohospitality:  HOSPITALITY_MODULOS,
  usuario_nomina:      ['compras', 'ordenes-pago'],
  usuario_organismo:   ['lotes', 'propietarios', 'reportes'],
  admin_organismo:     ADMIN_ORGANISMO_MODULOS,
  caja_organismo:      ['ingresos', 'compras', 'requisiciones', 'transferencias'],
  aux_organismo:       ['mantenimiento', 'compras', 'requisiciones', 'transferencias'],
}

// ── Escritura (Nuevo / Editar) ─────────────────────────────────────────────────
const ESCRIBIR: Record<Rol, string[] | '*'> = {
  superadmin:          '*',
  admin:               ADMIN_MODULOS,
  admin_lector:        [],              // sin escritura
  admin_finanzas:      ADMIN_MODULOS,   // igual que admin + 2da autorización de OP
  usuarioadmin:        USUARIOADMIN_MODULOS,
  usuariomantto:       USUARIOMANTTO_MODULOS,
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'afectaciones', 'construcciones', 'mantenimiento', 'comunicados'],
  cobranza:            ['cobranza', 'facturas', 'ingresos'],
  vigilancia:          ['accesos', 'incidencias', 'vigilancia-extras'],
  compras:             ['compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago', 'proveedores', 'articulos', 'mantenimiento'],
  compras_supervisor:  ['compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago', 'proveedores', 'articulos'],
  almacen:             ['compras', 'articulos', 'almacenes', 'areas'],
  mantenimiento:       ['mantenimiento', 'capex'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'afectaciones', 'construcciones', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'ingresos',
                        'presupuestos', 'comunicados', 'reportes'],
  tesoreria:           ['tesoreria', 'ingresos', 'presupuestos'],
  seguridad:           ['accesos', 'incidencias', 'requisiciones', 'transferencias', 'vigilancia-extras'],
  usuario_solicitante: ['requisiciones', 'transferencias'],
  ingresos:            ['ingresos'],
  usuariogolf:         GOLF_MODULOS,
  usuariohipico:       HIPICO_MODULOS,
  usuariohospitality:  HOSPITALITY_MODULOS,
  usuario_nomina:      ['ordenes-pago'],
  usuario_organismo:   [],
  admin_organismo:     ADMIN_ORGANISMO_MODULOS,
  caja_organismo:      ['ingresos', 'requisiciones', 'transferencias'],
  aux_organismo:       ['mantenimiento', 'requisiciones', 'transferencias'],
}

// ── Reportes permitidos por rol (solo para roles con acceso restringido) ────────
// Si el rol NO aparece aquí puede ver todos los reportes de los grupos que can() permite.
// Si aparece, solo puede ver los IDs listados.
const REPORTES_PERMITIDOS: Partial<Record<Rol, string[]>> = {
  usuario_organismo: [
    'secciones-lotes',
    'lotes',
    'lotes-seccion-clasif',
    'lotes-resumen-clasif',
    'propietarios-desglose',
    'lotes-por-status',
  ],
}

// ── Superadmin y admin pueden eliminar ─────────────────────────────────────────
const ROLES_DELETE: Rol[] = ['superadmin', 'admin', 'admin_finanzas', 'admin_organismo']

// ── Roles que pueden autorizar documentos (1ra autorización) ──────────────────
const ROLES_AUTH: Rol[] = ['superadmin', 'admin', 'admin_finanzas', 'usuarioadmin', 'usuariomantto', 'compras_supervisor', 'fraccionamiento', 'tesoreria', 'admin_organismo']

// ── Roles que pueden dar la 2da autorización de Órdenes de Pago (envío a CXP) ─
const ROLES_AUTH_FINANZAS: Rol[] = ['superadmin', 'admin_finanzas']

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser:   null,
  loading:    true,
  signIn:     async () => null,
  signOut:    async () => {},
  can:        () => false,
  canWrite:   () => false,
  canDelete:  () => false,
  canCompras: (_key?: string): 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | 'nomina' | false => false,
  canAuth:    () => false,
  canAuthFinanzas: () => false,
  canReporte: () => false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading]   = useState(true)

  const loadUsuario = async (user: User) => {
    const { data } = await supabase
      .schema('cfg' as any)
      .from('usuarios')
      .select('nombre, rol')
      .eq('id', user.id)
      .single()

    if (data) {
      setAuthUser({ user, nombre: data.nombre, rol: data.rol as Rol })
    } else {
      await supabase.auth.signOut()
      setAuthUser(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUsuario(session.user).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadUsuario(session.user)
      else setAuthUser(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
  }

  const can = (modulo: string): boolean => {
    if (!authUser) return false
    const perms = LEER[authUser.rol]
    if (perms === '*') return true
    return (perms as string[]).includes(modulo)
  }

  const canWrite = (modulo: string): boolean => {
    if (!authUser) return false
    const perms = ESCRIBIR[authUser.rol]
    if (perms === '*') return true
    return (perms as string[]).includes(modulo)
  }

  const canDelete = (): boolean => {
    if (!authUser) return false
    return ROLES_DELETE.includes(authUser.rol)
  }

  /**
   * Retorna qué sección del hub de Compras puede ver el usuario:
   *   'all'     → admin / fraccionamiento — ve todo
   *   'compras' → rol compras — Req, Cot, OC, OP, CXP, Proveedores
   *   'almacen' → rol almacen — Recepciones, Transferencias, Artículos, Almacenes
   *   false     → sin acceso a compras
   *
   * Uso en /compras/page.tsx:
   *   {MODULOS.filter(m => canCompras(m.key)).map(...)}
   */
  const canCompras = (key?: string): 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | 'nomina' | false => {
    if (!authUser) return false
    const r = authUser.rol
    // usuariomantto no tiene acceso a Tesorería, por lo que tampoco ve CXP
    if (r === 'usuariomantto' && key === 'cxp') return false
    // superadmin / admin / fraccionamiento: acceso total
    if (r === 'superadmin' || r === 'admin' || r === 'admin_lector' || r === 'admin_finanzas' || r === 'usuarioadmin' || r === 'usuariomantto' || r === 'fraccionamiento' || r === 'admin_organismo') return 'all'
    if (r === 'compras' || r === 'compras_supervisor') return 'compras'
    if (r === 'almacen') {
      // almacen ve sus módulos + caja chica
      const MODS_ALMACEN = ['recepciones', 'transferencias', 'inventario', 'articulos', 'almacenes', 'areas', 'caja-chica', 'combustible']
      if (!key) return 'almacen'
      return MODS_ALMACEN.includes(key) ? 'almacen' : false
    }
    if (r === 'seguridad') {
      const MODS_SEGURIDAD = ['requisiciones', 'transferencias', 'caja-chica']
      if (!key) return 'seguridad'
      return MODS_SEGURIDAD.includes(key) ? 'seguridad' : false
    }
    if (r === 'usuario_nomina') {
      if (!key) return 'nomina'
      return key === 'ordenes-pago' ? 'nomina' : false
    }
    if (r === 'usuario_solicitante' || r === 'usuariogolf' || r === 'usuariohipico' || r === 'usuariohospitality' || r === 'caja_organismo' || r === 'aux_organismo') {
      // Solo ve Requisiciones y Transferencias — sin autorización, sin catálogos
      const MODS_SOLICITANTE = ['requisiciones', 'transferencias']
      if (!key) return 'solicitante'
      return MODS_SOLICITANTE.includes(key) ? 'solicitante' : false
    }
    // Cualquier rol autenticado puede ver caja-chica (para registrar reembolsos propios)
    const MODS_GENERAL = ['caja-chica']
    if (key && MODS_GENERAL.includes(key)) return 'compras'
    return false
  }

  /**
   * ¿Puede autorizar documentos? (Requisiciones, OC, Transferencias)
   * El parámetro `modulo` se reserva para futuras restricciones por módulo.
   * Actualmente verifica solo si el rol está en ROLES_AUTH.
   */
  const canAuth = (modulo?: string): boolean => {
    if (!authUser) return false
    return ROLES_AUTH.includes(authUser.rol)
  }

  /**
   * ¿Puede dar la segunda autorización de una Orden de Pago (envío a CXP)?
   * Solo superadmin y admin_finanzas, y únicamente aplica a OP que ya
   * pasaron la primera autorización (status 'Pendiente Auth Finanzas').
   */
  const canAuthFinanzas = (): boolean => {
    if (!authUser) return false
    return ROLES_AUTH_FINANZAS.includes(authUser.rol)
  }

  /**
   * ¿Puede ver el reporte con ese ID?
   * Si el rol tiene lista en REPORTES_PERMITIDOS solo ve los IDs de esa lista.
   * Si no tiene lista, puede ver cualquier reporte cuyo grupo can() permita.
   */
  const canReporte = (id: string): boolean => {
    if (!authUser) return false
    const permitidos = REPORTES_PERMITIDOS[authUser.rol]
    if (!permitidos) return true
    return permitidos.includes(id)
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can, canWrite, canDelete, canCompras, canAuth, canAuthFinanzas, canReporte }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
