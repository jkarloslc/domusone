'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

type Rol =
  | 'superadmin'
  | 'admin'
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

type AuthUser = {
  user:   User
  nombre: string
  rol:    Rol
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
   *  Retorna 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | false
   *  Acepta clave opcional del módulo para filtrar tarjetas del hub */
  canCompras: (key?: string) => 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | false
  /** ¿Puede AUTORIZAR documentos (Req, OC, Transferencias)? */
  canAuth:    (modulo?: string) => boolean
}

// Módulos que admin puede ver/escribir (todo excepto usuarios y configuracion)
const ADMIN_MODULOS = [
  'lotes', 'propietarios', 'contratos', 'escrituras',
  'cobranza', 'facturas', 'accesos', 'incidencias',
  'proyectos', 'mantenimiento', 'comunicados',
  'compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago',
  'proveedores', 'articulos', 'almacenes', 'areas',
  'tesoreria', 'reportes', 'catalogos',
]
// usuarioadmin: igual que admin pero sin mantenimiento
const USUARIOADMIN_MODULOS = ADMIN_MODULOS.filter(m => m !== 'mantenimiento')
// usuariomantto: igual que admin pero sin tesoreria
const USUARIOMANTTO_MODULOS = ADMIN_MODULOS.filter(m => m !== 'tesoreria')

// ── Lectura (visibilidad sidebar) ─────────────────────────────────────────────
const LEER: Record<Rol, string[] | '*'> = {
  superadmin:          '*',
  admin:               ADMIN_MODULOS,
  usuarioadmin:        USUARIOADMIN_MODULOS,
  usuariomantto:       USUARIOMANTTO_MODULOS,
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'proyectos', 'mantenimiento', 'comunicados', 'reportes'],
  cobranza:            ['lotes', 'propietarios', 'cobranza', 'facturas', 'reportes'],
  vigilancia:          ['lotes', 'propietarios', 'accesos', 'incidencias'],
  compras:             ['compras', 'reportes'],
  compras_supervisor:  ['compras', 'reportes'],
  almacen:             ['compras', 'reportes'],
  mantenimiento:       ['lotes', 'propietarios', 'mantenimiento', 'reportes'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'proyectos', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'comunicados', 'reportes'],
  tesoreria:           ['tesoreria', 'reportes'],
  seguridad:           ['lotes', 'propietarios', 'accesos', 'incidencias', 'compras'],
  usuario_solicitante: ['compras', 'requisiciones', 'transferencias'],
}

// ── Escritura (Nuevo / Editar) ─────────────────────────────────────────────────
const ESCRIBIR: Record<Rol, string[] | '*'> = {
  superadmin:          '*',
  admin:               ADMIN_MODULOS,
  usuarioadmin:        USUARIOADMIN_MODULOS,
  usuariomantto:       USUARIOMANTTO_MODULOS,
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'proyectos', 'mantenimiento', 'comunicados'],
  cobranza:            ['cobranza', 'facturas'],
  vigilancia:          ['accesos', 'incidencias'],
  compras:             ['compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago', 'proveedores', 'articulos'],
  compras_supervisor:  ['compras', 'requisiciones', 'cotizaciones', 'ordenes', 'ordenes-pago', 'proveedores', 'articulos'],
  almacen:             ['compras', 'articulos', 'almacenes', 'areas'],
  mantenimiento:       ['mantenimiento'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'proyectos', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'comunicados', 'reportes'],
  tesoreria:           ['tesoreria'],
  seguridad:           ['accesos', 'incidencias', 'requisiciones'],
  usuario_solicitante: ['requisiciones', 'transferencias'],
}

// ── Superadmin y admin pueden eliminar ─────────────────────────────────────────
const ROLES_DELETE: Rol[] = ['superadmin', 'admin']

// ── Roles que pueden autorizar documentos ─────────────────────────────────────
const ROLES_AUTH: Rol[] = ['superadmin', 'admin', 'usuarioadmin', 'usuariomantto', 'compras', 'compras_supervisor', 'fraccionamiento', 'tesoreria']

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser:   null,
  loading:    true,
  signIn:     async () => null,
  signOut:    async () => {},
  can:        () => false,
  canWrite:   () => false,
  canDelete:  () => false,
  canCompras: (_key?: string): 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | false => false,
  canAuth:    () => false,
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
  const canCompras = (key?: string): 'all' | 'compras' | 'almacen' | 'seguridad' | 'solicitante' | false => {
    if (!authUser) return false
    const r = authUser.rol
    // superadmin / admin / fraccionamiento: acceso total
    if (r === 'superadmin' || r === 'admin' || r === 'usuarioadmin' || r === 'usuariomantto' || r === 'fraccionamiento') return 'all'
    if (r === 'compras' || r === 'compras_supervisor') return 'compras'
    if (r === 'almacen') {
      // almacen ve sus módulos + caja chica
      const MODS_ALMACEN = ['recepciones', 'transferencias', 'inventario', 'articulos', 'almacenes', 'caja-chica']
      if (!key) return 'almacen'
      return MODS_ALMACEN.includes(key) ? 'almacen' : false
    }
    if (r === 'seguridad') {
      const MODS_SEGURIDAD = ['requisiciones', 'transferencias', 'caja-chica']
      if (!key) return 'seguridad'
      return MODS_SEGURIDAD.includes(key) ? 'seguridad' : false
    }
    if (r === 'usuario_solicitante') {
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

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can, canWrite, canDelete, canCompras, canAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
