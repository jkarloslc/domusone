'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// ── Tipos ─────────────────────────────────────────────────────────────────────
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
  /** Verifica acceso de LECTURA a un módulo (sidebar + AuthGuard) */
  can:      (modulo: string) => boolean
  /** Verifica acceso de ESCRITURA a un módulo (botones Nuevo/Editar) */
  canWrite: (modulo: string) => boolean
}

// ── Estructura de permisos ────────────────────────────────────────────────────
type P = { r: boolean; w: boolean }
const F: P = { r: true,  w: true  }   // Full
const R: P = { r: true,  w: false }   // Read-only

// ── Matriz de permisos ────────────────────────────────────────────────────────
const PERMISOS: Record<Rol, Record<string, P> | null> = {
  admin: null,   // null = acceso total

  atencion_residentes: {
    lotes:         F,
    propietarios:  F,
    contratos:     F,
    escrituras:    F,
    incidencias:   F,
    proyectos:     F,
    mantenimiento: F,
    reportes:      R,
  },

  cobranza: {
    lotes:        R,
    propietarios: R,
    cobranza:     F,
    facturas:     F,
    reportes:     F,
  },

  vigilancia: {
    lotes:        R,
    propietarios: R,
    accesos:      F,
    incidencias:  F,
  },

  compras: {
    compras:  F,
    reportes: F,
  },

  almacen: {
    compras:  F,
    reportes: F,
  },

  mantenimiento: {
    lotes:         R,
    propietarios:  R,
    mantenimiento: F,
  },

  fraccionamiento: {
    lotes:         F,
    propietarios:  F,
    contratos:     F,
    escrituras:    F,
    proyectos:     F,
    mantenimiento: F,
    accesos:       F,
    incidencias:   F,
    cobranza:      F,
    facturas:      F,
    compras:       F,
    reportes:      F,
  },
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser: null,
  loading:  true,
  signIn:   async () => null,
  signOut:  async () => {},
  can:      () => false,
  canWrite: () => false,
})

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading,  setLoading]  = useState(true)

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

  const getP = (modulo: string): P | null => {
    if (!authUser) return null
    const mapa = PERMISOS[authUser.rol]
    if (mapa === null) return F        // admin → acceso total
    return mapa[modulo] ?? null
  }

  const can      = (modulo: string): boolean => { const p = getP(modulo); return p !== null && p.r }
  const canWrite = (modulo: string): boolean => { const p = getP(modulo); return p !== null && p.w }

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can, canWrite }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
