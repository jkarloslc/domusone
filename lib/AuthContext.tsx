'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, esLinkRecuperacion } from './supabase'
import type { User } from '@supabase/supabase-js'

type RolBase =
  | 'superadmin'
  | 'admin'
  | 'admin_lector'
  | 'admin_finanzas'
  | 'admin_low_level'
  | 'admin_tesoreria'
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

/**
 * Roles "por lado": mismo poder que su rol base, pero sin ver los módulos del
 * otro lado (Club vs Fraccionamiento). Ver ROLES_LADO.
 */
type RolLado =
  | 'admin_golf'  | 'admin_golf_lector'  | 'admin_golf_finanzas'  | 'admin_golf_tesoreria'  | 'admin_golf_low_level'
  | 'admin_fracc' | 'admin_fracc_lector' | 'admin_fracc_finanzas' | 'admin_fracc_tesoreria' | 'admin_fracc_low_level'

/** Rol tal como está guardado en cfg.usuarios */
type Rol = RolBase | RolLado

type Lado = 'golf' | 'fracc'

/** Rol por lado → rol base cuyos permisos hereda + lado al que se restringe */
const ROLES_LADO: Record<RolLado, { base: RolBase; lado: Lado }> = {
  admin_golf:            { base: 'admin',           lado: 'golf'  },
  admin_golf_lector:     { base: 'admin_lector',    lado: 'golf'  },
  admin_golf_finanzas:   { base: 'admin_finanzas',  lado: 'golf'  },
  admin_golf_tesoreria:  { base: 'admin_tesoreria', lado: 'golf'  },
  admin_golf_low_level:  { base: 'admin_low_level', lado: 'golf'  },
  admin_fracc:           { base: 'admin',           lado: 'fracc' },
  admin_fracc_lector:    { base: 'admin_lector',    lado: 'fracc' },
  admin_fracc_finanzas:  { base: 'admin_finanzas',  lado: 'fracc' },
  admin_fracc_tesoreria: { base: 'admin_tesoreria', lado: 'fracc' },
  admin_fracc_low_level: { base: 'admin_low_level', lado: 'fracc' },
}

// Módulos exclusivos de cada lado. Todo lo demás (compras, tesorería, ingresos,
// presupuestos, reportes, catálogos, hr, capex, mantenimiento…) es compartido.
const MODS_SOLO_FRACC = new Set([
  'lotes', 'propietarios', 'contratos', 'escrituras', 'cobranza', 'facturas',
  'accesos', 'incidencias', 'vigilancia-extras', 'vigilancia-novedades',
  'afectaciones', 'construcciones', 'comunicados',
])
const esModuloClub = (m: string) =>
  m === 'golf' || m.startsWith('golf-') || m.startsWith('hipico') ||
  m === 'hospitality' || m === 'eventos' || m === 'locales' || m === 'polo'

/** ¿El módulo es visible para ese lado? (null = sin restricción) */
function moduloVisibleParaLado(lado: Lado | null, modulo: string): boolean {
  if (lado === 'golf')  return !MODS_SOLO_FRACC.has(modulo)
  if (lado === 'fracc') return !esModuloClub(modulo)
  return true
}

type AuthUser = {
  user:    User
  nombre:  string
  /** Rol EFECTIVO: para roles por lado es su rol base (admin_golf → 'admin'),
   *  así los checks de rol existentes siguen funcionando. */
  rol:     RolBase
  /** Rol tal como está en la BD (admin_golf, admin, …). Úsalo para etiquetas y home. */
  rolReal: Rol
  /** Lado al que está restringido (null = sin restricción) */
  lado:    Lado | null
}

export function getHomeRouteByRole(rol?: Rol): string {
  switch (rol) {
    case 'superadmin':
    case 'admin':
    case 'admin_lector':
    case 'admin_finanzas':
    case 'admin_low_level':
    case 'admin_tesoreria':
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
      return '/residencial/mantenimiento'
    case 'usuariogolf':
    case 'admin_golf':
    case 'admin_golf_lector':
    case 'admin_golf_finanzas':
    case 'admin_golf_tesoreria':
    case 'admin_golf_low_level':
      return '/golf'
    case 'admin_fracc':
    case 'admin_fracc_lector':
    case 'admin_fracc_finanzas':
    case 'admin_fracc_tesoreria':
    case 'admin_fracc_low_level':
      return '/residencial'
    case 'usuariohipico':
      return '/hipico'
    case 'usuariohospitality':
      return '/hipico'
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
  'cobranza', 'facturas', 'accesos', 'incidencias', 'vigilancia-extras', 'vigilancia-novedades',
  'afectaciones', 'construcciones', 'mantenimiento', 'comunicados',
  'compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago',
  'transferencias', 'recepciones',
  'proveedores', 'articulos', 'almacenes', 'areas',
  'tesoreria', 'cxp', 'ingresos', 'presupuestos', 'reportes', 'catalogos',
  'dashboards',
  'golf', 'golf-torneos', 'golf-miembros', 'golf-accesos', 'golf-reservaciones',
  'golf-pases', 'golf-invitados', 'golf-clinicas', 'golf-pos', 'golf-carritos', 'golf-casilleros',
  'golf-cuotas', 'golf-cxc', 'golf-recibos', 'golf-intercambios', 'golf-catalogos',
  'golf-riego', 'golf-mantenimiento-campo', 'golf-tee-practica',
  'golf-administracion', 'golf-mantto-campo', 'golf-estatus-campo',
  // Hípico
  'hipico', 'hipico-arrendatarios', 'hipico-caballerizas', 'hipico-caballos',
  'hipico-contratos', 'hipico-cobranza', 'hipico-servicios', 'hipico-instalaciones',
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
  'hipico-contratos', 'hipico-cobranza', 'hipico-servicios', 'hipico-instalaciones', 'reportes',
  'compras', 'requisiciones', 'transferencias',
]

// Módulos Golf para rol dedicado
// Incluye requisiciones y transferencias de Compras para flujo de solicitudes
// Incluye módulo Hípico completo (acceso agregado 2026-07-28)
const GOLF_MODULOS = [
  'golf', 'golf-torneos', 'golf-miembros', 'golf-accesos', 'golf-reservaciones',
  'golf-pases', 'golf-invitados', 'golf-clinicas', 'golf-pos', 'golf-carritos', 'golf-casilleros',
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
const LEER: Record<RolBase, string[] | '*'> = {
  superadmin:          '*',
  admin:               [...ADMIN_MODULOS, 'hr'],
  admin_lector:        ADMIN_MODULOS,   // igual que admin, solo lectura
  admin_finanzas:      ADMIN_MODULOS,   // igual que admin + 2da autorización de OP
  admin_low_level:     [...ADMIN_MODULOS, 'hr'],  // igual que admin, se le irán quitando permisos puntuales
  admin_tesoreria:     [...ADMIN_MODULOS, 'hr'],  // igual que admin + permisos financieros ampliados (ver puntos hardcoded de rol)
  usuarioadmin:        USUARIOADMIN_MODULOS,
  usuariomantto:       USUARIOMANTTO_MODULOS,
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'vigilancia-novedades', 'afectaciones', 'construcciones', 'mantenimiento', 'comunicados', 'reportes'],
  cobranza:            ['lotes', 'propietarios', 'cobranza', 'facturas', 'ingresos', 'reportes'],
  vigilancia:          ['lotes', 'propietarios', 'accesos', 'incidencias', 'vigilancia-extras', 'vigilancia-novedades'],
  compras:             ['compras', 'cxp', 'reportes', 'equipo-flota'],
  compras_supervisor:  ['compras', 'cxp', 'reportes'],
  almacen:             ['compras', 'reportes'],
  mantenimiento:       ['lotes', 'propietarios', 'mantenimiento', 'reportes', 'dashboards'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'afectaciones', 'construcciones', 'mantenimiento', 'accesos', 'incidencias', 'vigilancia-novedades',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'cxp', 'ingresos',
                        'presupuestos', 'comunicados', 'reportes', 'dashboards'],
  tesoreria:           ['tesoreria', 'cxp', 'ingresos', 'presupuestos', 'reportes', 'dashboards'],
  seguridad:           ['lotes', 'accesos', 'incidencias', 'compras', 'vigilancia-extras', 'vigilancia-novedades'],
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
const ESCRIBIR: Record<RolBase, string[] | '*'> = {
  superadmin:          '*',
  admin:               [...ADMIN_MODULOS, 'hr'],
  admin_lector:        [],              // sin escritura
  admin_finanzas:      ADMIN_MODULOS,   // igual que admin + 2da autorización de OP
  admin_low_level:     [...ADMIN_MODULOS, 'hr'],  // igual que admin, se le irán quitando permisos puntuales
  admin_tesoreria:     [...ADMIN_MODULOS, 'hr'],  // igual que admin + permisos financieros ampliados (ver puntos hardcoded de rol)
  usuarioadmin:        USUARIOADMIN_MODULOS,
  usuariomantto:       USUARIOMANTTO_MODULOS,
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'afectaciones', 'construcciones', 'mantenimiento', 'comunicados'],
  cobranza:            ['cobranza', 'facturas', 'ingresos'],
  vigilancia:          ['accesos', 'incidencias', 'vigilancia-extras', 'vigilancia-novedades'],
  compras:             ['compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago', 'proveedores', 'articulos', 'mantenimiento', 'equipo-flota', 'herramientas'],
  compras_supervisor:  ['compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago', 'proveedores', 'articulos'],
  almacen:             ['compras', 'articulos', 'almacenes', 'areas'],
  mantenimiento:       ['mantenimiento', 'capex'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'afectaciones', 'construcciones', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'ingresos',
                        'presupuestos', 'comunicados', 'reportes'],
  tesoreria:           ['tesoreria', 'ingresos', 'presupuestos'],
  seguridad:           ['accesos', 'incidencias', 'requisiciones', 'transferencias', 'vigilancia-extras', 'vigilancia-novedades'],
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
const REPORTES_PERMITIDOS: Partial<Record<RolBase, string[]>> = {
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
const ROLES_DELETE: RolBase[] = ['superadmin', 'admin', 'admin_finanzas', 'admin_low_level', 'admin_tesoreria', 'admin_organismo']

// ── Roles que pueden autorizar documentos (1ra autorización) ──────────────────
const ROLES_AUTH: RolBase[] = ['superadmin', 'admin', 'admin_finanzas', 'admin_low_level', 'admin_tesoreria', 'usuarioadmin', 'usuariomantto', 'compras_supervisor', 'fraccionamiento', 'tesoreria', 'admin_organismo']

// ── Roles que pueden dar la 2da autorización de Órdenes de Pago (envío a CXP) ─
const ROLES_AUTH_FINANZAS: RolBase[] = ['superadmin', 'admin_finanzas']

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
      const rolReal = data.rol as Rol
      const lado = ROLES_LADO[rolReal as RolLado]
      setAuthUser({
        user,
        nombre:  data.nombre,
        rol:     (lado ? lado.base : rolReal) as RolBase,
        rolReal,
        lado:    lado ? lado.lado : null,
      })
    } else {
      await supabase.auth.signOut()
      setAuthUser(null)
    }
  }

  useEffect(() => {
    // Link de "recuperar contraseña": mandar a la página para definir la nueva
    // (si no, la app lo trata como login normal y lo lleva a su inicio)
    const irACambiarPassword = (): boolean => {
      if (window.location.pathname === '/cambiar-password') return false
      window.location.replace('/cambiar-password')
      return true
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && esLinkRecuperacion && irACambiarPassword()) return
      if (session?.user) loadUsuario(session.user).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && irACambiarPassword()) return
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
    if (!moduloVisibleParaLado(authUser.lado, modulo)) return false
    const perms = LEER[authUser.rol]
    if (perms === '*') return true
    return (perms as string[]).includes(modulo)
  }

  const canWrite = (modulo: string): boolean => {
    if (!authUser) return false
    if (!moduloVisibleParaLado(authUser.lado, modulo)) return false
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
    if (r === 'superadmin' || r === 'admin' || r === 'admin_lector' || r === 'admin_finanzas' || r === 'admin_low_level' || r === 'admin_tesoreria' || r === 'usuarioadmin' || r === 'usuariomantto' || r === 'fraccionamiento' || r === 'admin_organismo') return 'all'
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
