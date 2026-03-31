'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// ÚNICAMENTE se actualizaron los roles y la matriz PERMISOS.
// La firma de can(), AuthCtx, AuthUser y toda la lógica son idénticas
// a la versión anterior. Sin cambios de tipos ni firmas.
// ─────────────────────────────────────────────────────────────────────────────

type Rol =
  | 'admin'
  | 'atencion_residentes'
  | 'cobranza'
  | 'vigilancia'
  | 'compras'
  | 'almacen'
  | 'mantenimiento'
  | 'fraccionamiento'

type AuthUser = {
  user:   User
  nombre: string
  rol:    Rol
}

type AuthCtx = {
  authUser: AuthUser | null
  loading:  boolean
  signIn:   (email: string, password: string) => Promise<string | null>
  signOut:  () => Promise<void>
  can:      (modulo: string) => boolean
}

// ── Permisos por rol ──────────────────────────────────────────────────────────
// '*' = acceso total (solo admin)
// Los módulos listados son los que el rol PUEDE VER en el sidebar.
// Compras/Almacén: ambos acceden a /compras — el submódulo visible
// se filtra internamente desde la página de compras según el rol.
const PERMISOS: Record<Rol, string[] | '*'> = {
  admin: '*',

  atencion_residentes: [
    'lotes', 'propietarios', 'contratos', 'escrituras',
    'incidencias', 'proyectos', 'mantenimiento', 'reportes',
  ],

  cobranza: [
    'lotes', 'propietarios', 'cobranza', 'facturas', 'reportes',
  ],

  vigilancia: [
    'lotes', 'propietarios', 'accesos', 'incidencias',
  ],

  // Compras: Requisiciones, Cotizaciones, OC, OP, CXP, Proveedores
  compras: [
    'compras', 'reportes',
  ],

  // Almacén: Recepciones, Transferencias, Artículos, Almacenes
  almacen: [
    'compras', 'reportes',
  ],

  mantenimiento: [
    'lotes', 'propietarios', 'mantenimiento',
  ],

  fraccionamiento: [
    'lotes', 'propietarios', 'contratos', 'escrituras',
    'proyectos', 'mantenimiento', 'accesos', 'incidencias',
    'cobranza', 'facturas', 'compras', 'reportes',
  ],
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser: null,
  loading:  true,
  signIn:   async () => null,
  signOut:  async () => {},
  can:      () => false,
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
    const perms = PERMISOS[authUser.rol]
    if (perms === '*') return true
    return (perms as string[]).includes(modulo)
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
