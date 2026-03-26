'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// ── Roles disponibles ────────────────────────────────────────
export type Rol =
  | 'admin'
  | 'atencion'           // Atención a Residentes
  | 'cobranza'           // Cobranza
  | 'vigilancia'         // Vigilancia / Accesos
  | 'compras'            // Compras
  | 'almacenista'        // Almacenista
  | 'compras_supervisor' // Compras Supervisor

export const ROL_LABELS: Record<Rol, string> = {
  admin:             'Administrador',
  atencion:          'Atención a Residentes',
  cobranza:          'Cobranza',
  vigilancia:        'Vigilancia',
  compras:           'Compras',
  almacenista:       'Almacenista',
  compras_supervisor:'Compras Supervisor',
}

type AuthUser = { user: User; nombre: string; rol: Rol }

type AuthCtx = {
  authUser:   AuthUser | null
  loading:    boolean
  signIn:     (email: string, password: string) => Promise<string | null>
  signOut:    () => Promise<void>
  can:        (modulo: string) => boolean
  canWrite:   (modulo: string) => boolean
  canDelete:  () => boolean
  canCompras: (submodulo: string) => boolean
  canAuth:    (submodulo: string) => boolean
}

// ── Módulos visibles por rol ─────────────────────────────────
const PERMISOS: Record<Rol, string[]> = {
  admin:             ['*'],
  atencion:          ['lotes', 'propietarios', 'contratos', 'escrituras',
                      'servicios', 'incidencias', 'reportes'],
  cobranza:          ['lotes', 'propietarios', 'cobranza', 'facturas', 'reportes'],
  vigilancia:        ['lotes', 'propietarios', 'accesos', 'incidencias'],
  compras:           ['compras'],
  almacenista:       ['compras'],
  compras_supervisor:['compras'],
}

// ── Módulos de solo lectura ──────────────────────────────────
const SOLO_CONSULTA: Record<Rol, string[]> = {
  admin:             [],
  atencion:          [],
  cobranza:          ['lotes', 'propietarios'],
  vigilancia:        ['lotes', 'propietarios'],
  compras:           [],
  almacenista:       ['inventario'],
  compras_supervisor:[],
}

// ── Submódulos de compras visibles ───────────────────────────
const COMPRAS_MODULOS: Record<Rol, string[]> = {
  admin:             ['*'],
  atencion:          [],
  cobranza:          [],
  vigilancia:        [],
  compras:           ['requisiciones', 'cotizaciones', 'ordenes',
                      'ordenes-pago', 'articulos', 'proveedores', 'cxp'],
  almacenista:       ['requisiciones', 'transferencias', 'inventario', 'articulos'],
  compras_supervisor:['requisiciones', 'cotizaciones', 'ordenes',
                      'ordenes-pago', 'articulos', 'proveedores', 'cxp'],
}

// ── Submódulos con autorización ──────────────────────────────
const PUEDE_AUTORIZAR: Record<Rol, string[]> = {
  admin:             ['*'],
  atencion:          [],
  cobranza:          [],
  vigilancia:        [],
  compras:           [],
  almacenista:       [],
  compras_supervisor:['cotizaciones', 'ordenes', 'requisiciones'],
}

// ────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthCtx>({
  authUser: null, loading: true,
  signIn: async () => null,
  signOut: async () => {},
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
    const { data } = await supabase.schema('cfg' as any)
      .from('usuarios').select('nombre, rol').eq('id', user.id).single()
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

  const canWrite = (modulo: string): boolean => {
    if (!authUser) return false
    if (authUser.rol === 'admin') return true
    if (SOLO_CONSULTA[authUser.rol].includes(modulo)) return false
    return can(modulo) || canCompras(modulo)
  }

  const canDelete = (): boolean => authUser?.rol === 'admin'

  const canCompras = (submodulo: string): boolean => {
    if (!authUser) return false
    const mods = COMPRAS_MODULOS[authUser.rol]
    return mods.includes('*') || mods.includes(submodulo)
  }

  const canAuth = (submodulo: string): boolean => {
    if (!authUser) return false
    const auth = PUEDE_AUTORIZAR[authUser.rol]
    return auth.includes('*') || auth.includes(submodulo)
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can, canWrite, canDelete, canCompras, canAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
