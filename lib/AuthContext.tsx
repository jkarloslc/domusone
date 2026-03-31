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

type AuthUser = {
  user:   User
  nombre: string
  rol:    Rol
}

type AuthCtx = {
  authUser:  AuthUser | null
  loading:   boolean
  signIn:    (email: string, password: string) => Promise<string | null>
  signOut:   () => Promise<void>
  can:       (modulo: string) => boolean
  canWrite:  (modulo: string) => boolean
  canDelete: () => boolean
}

// ── Permisos de lectura (qué aparece en el sidebar) ───────────────────────────
const LEER: Record<Rol, string[] | '*'> = {
  admin:               '*',
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'proyectos', 'mantenimiento', 'reportes'],
  cobranza:            ['lotes', 'propietarios', 'cobranza', 'facturas', 'reportes'],
  vigilancia:          ['lotes', 'propietarios', 'accesos', 'incidencias'],
  compras:             ['compras', 'reportes'],
  almacen:             ['compras', 'reportes'],
  mantenimiento:       ['lotes', 'propietarios', 'mantenimiento'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'proyectos', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'reportes'],
}

// ── Permisos de escritura (botones Nuevo / Editar) ────────────────────────────
const ESCRIBIR: Record<Rol, string[] | '*'> = {
  admin:               '*',
  atencion_residentes: ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'incidencias', 'proyectos', 'mantenimiento'],
  cobranza:            ['cobranza', 'facturas', 'reportes'],
  vigilancia:          ['accesos', 'incidencias'],
  compras:             ['compras', 'reportes'],
  almacen:             ['compras', 'reportes'],
  mantenimiento:       ['mantenimiento'],
  fraccionamiento:     ['lotes', 'propietarios', 'contratos', 'escrituras',
                        'proyectos', 'mantenimiento', 'accesos', 'incidencias',
                        'cobranza', 'facturas', 'compras', 'reportes'],
}

// ── Solo admin puede eliminar ─────────────────────────────────────────────────
const ROLES_DELETE: Rol[] = ['admin']

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser:  null,
  loading:   true,
  signIn:    async () => null,
  signOut:   async () => {},
  can:       () => false,
  canWrite:  () => false,
  canDelete: () => false,
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

  /** ¿Puede VER el módulo? — controla visibilidad en sidebar */
  const can = (modulo: string): boolean => {
    if (!authUser) return false
    const perms = LEER[authUser.rol]
    if (perms === '*') return true
    return (perms as string[]).includes(modulo)
  }

  /** ¿Puede CREAR / EDITAR en el módulo? — controla botones Nuevo/Editar */
  const canWrite = (modulo: string): boolean => {
    if (!authUser) return false
    const perms = ESCRIBIR[authUser.rol]
    if (perms === '*') return true
    return (perms as string[]).includes(modulo)
  }

  /** ¿Puede ELIMINAR? — solo admin */
  const canDelete = (): boolean => {
    if (!authUser) return false
    return ROLES_DELETE.includes(authUser.rol)
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can, canWrite, canDelete }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
