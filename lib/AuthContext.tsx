'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

type Rol =
  | 'superadmin'
  | 'admin'
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
   *  Retorna 'all' | 'compras' | 'almacen' | 'seguridad' | false
   *  Acepta clave opcional del módulo para filtrar tarjetas del hub */
  canCompras: (key?: string) => 'all' | 'compras' | 'almacen' | 'seguridad' | false
  /** ¿Puede AUTORIZAR documentos (Req, OC, Transferencias)? */
  canAuth:    (modulo?: string) => boolean
}

// Módulos que admin puede ver/escribir (todo excepto usuarios y configuracion)
const ADMIN_MODULOS = [
  'lotes', 'propietarios', 'contratos', 'escrituras',
  'cobranza', 'facturas', 'accesos', 'incidencias',
  'proyectos', 'mantenimiento', 'comunicados',
  'compras', 'tesoreria', 'reportes', 'catalogos',
]

// ── Lectura (visibilidad sidebar) ─────────────────────────────────────────────
const LEER: Record<Rol, string[] | '*'> = {
  superadmin:          '*',
  admin:               ADMIN_MODULOS,
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
}

// ── Escritura (Nuevo / Editar) ─────────────────────────────────────────────────
const ESCRIBIR: Record<Rol, string[] | '*'> = {
  superadmin:          '*',
  admin:               ADMIN_MODULOS,
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
}

// ── Solo superadmin puede eliminar ────────────────────────────────────────────
const ROLES_DELETE: Rol[] = ['superadmin']

// ── Roles que pueden autorizar documentos ─────────────────────────────────────
const ROLES_AUTH: Rol[] = ['superadmin', 'admin', 'compras', 'compras_supervisor', 'fraccionamiento', 'tesoreria']

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser:   null,
  loading:    true,
  signIn:     async () => null,
  signOut:    async () => {},
  can:        () => false,
  canWrite:   () => false,
  canDelete:  () => false,
  canCompras: (_key?: string) => false,
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
  const canCompras = (key?: string): 'all' | 'compras' | 'almacen' | 'seguridad' | false => {
    if (!authUser) return false
    const r = authUser.rol
    // superadmin / admin / fraccionamiento: acceso total
    if (r === 'superadmin' || r === 'admin' || r === 'fraccionamiento') return 'all'
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
    // Cualquier rol autenticado puede ver caja-chica (para registrar reembolsos propios)
    const MODS_GENERAL = ['caja-chica']
    if (key && MODS_GENERAL.includes(key)) return 'compras'
    return false
  }

  /** ¿Puede autorizar documentos? (Requisiciones, OC, Transferencias) */
  const canAuth = (_modulo?: string): boolean => {
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
