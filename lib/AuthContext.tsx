'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

type Rol =
  | 'admin'
  | 'atencion_residentes'
  | 'cobranza'
  | 'vigilancia'
  | 'compras'
  | 'almacen'
  | 'mantenimiento'
  | 'fraccionamiento'
  | 'tesoreria'

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
   *  Retorna 'all' (admin/fraccionamiento) | 'compras' | 'almacen' | false */
  canCompras: () => 'all' | 'compras' | 'almacen' | false
  /** ¿Puede AUTORIZAR documentos (Req, OC, Transferencias)? */
  canAuth:    (modulo?: string) => boolean
}

// ── Lectura (visibilidad sidebar) ─────────────────────────────────────────────
const LEER: Record<Rol, string[] | '*'> = {
  admin:               '*',
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'proyectos', 'mantenimiento', 'comunicados', 'reportes'],
  cobranza:            ['lotes', 'propietarios', 'cobranza', 'facturas', 'reportes'],
  vigilancia:          ['lotes', 'propietarios', 'accesos', 'incidencias'],
  compras:             ['compras', 'reportes'],
  almacen:             ['compras', 'reportes'],
  mantenimiento:       ['lotes', 'propietarios', 'mantenimiento', 'reportes'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'proyectos', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'comunicados', 'reportes'],
  tesoreria:           ['tesoreria', 'reportes'],
}

// ── Escritura (Nuevo / Editar) ─────────────────────────────────────────────────
const ESCRIBIR: Record<Rol, string[] | '*'> = {
  admin:               '*',
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'proyectos', 'mantenimiento', 'comunicados'],
  cobranza:            ['cobranza', 'facturas'],
  vigilancia:          ['accesos', 'incidencias'],
  compras:             ['compras', 'reportes'],
  almacen:             ['compras', 'reportes'],
  mantenimiento:       ['mantenimiento'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'proyectos', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'tesoreria', 'comunicados', 'reportes'],
  tesoreria:           ['tesoreria', 'reportes'],
}

// ── Solo admin puede eliminar ──────────────────────────────────────────────────
const ROLES_DELETE: Rol[] = ['admin']

// ── Roles que pueden autorizar documentos ─────────────────────────────────────
const ROLES_AUTH: Rol[] = ['admin', 'compras', 'fraccionamiento', 'tesoreria']

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser:   null,
  loading:    true,
  signIn:     async () => null,
  signOut:    async () => {},
  can:        () => false,
  canWrite:   () => false,
  canDelete:  () => false,
  canCompras: () => false,
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
   *   const vista = canCompras()
   *   {(vista === 'all' || vista === 'compras') && <CardRequisiciones />}
   *   {(vista === 'all' || vista === 'almacen') && <CardRecepciones />}
   */
  const canCompras = (): 'all' | 'compras' | 'almacen' | false => {
    if (!authUser) return false
    const r = authUser.rol
    if (r === 'admin' || r === 'fraccionamiento' || r === 'tesoreria') return 'all'
    if (r === 'compras') return 'compras'
    if (r === 'almacen') return 'almacen'
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
