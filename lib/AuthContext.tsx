'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

type Rol = 'admin' | 'cobranza' | 'accesos' | 'seguridad' | 'residente'

type AuthUser = {
  user: User
  nombre: string
  rol: Rol
}

type AuthCtx = {
  authUser:  AuthUser | null
  loading:   boolean
  signIn:    (email: string, password: string) => Promise<string | null>
  signOut:   () => Promise<void>
  can:       (modulo: string) => boolean
}

// Permisos por rol
const PERMISOS: Record<Rol, string[]> = {
  admin:     ['*'],
  cobranza:  ['lotes', 'propietarios', 'cobranza', 'contratos', 'escrituras', 'reportes', 'compras'],
  accesos:   ['accesos', 'lotes'],
  seguridad: ['accesos', 'incidencias'],
  residente: ['lotes'],
}

const AuthContext = createContext<AuthCtx>({
  authUser: null, loading: true,
  signIn: async () => null,
  signOut: async () => {},
  can: () => false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading]   = useState(true)

  const loadUsuario = async (user: User) => {
    const { data } = await supabase.schema('cfg' as any)
      .from('usuarios').select('nombre, rol').eq('id', user.id).single()
    if (data) {
      setAuthUser({ user, nombre: data.nombre, rol: data.rol as Rol })
    } else {
      // Si no tiene registro en cfg.usuarios, acceso denegado
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
    if (error) return error.message
    return null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
  }

  const can = (modulo: string): boolean => {
    if (!authUser) return false
    const perms = PERMISOS[authUser.rol]
    return perms.includes('*') || perms.includes(modulo)
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
