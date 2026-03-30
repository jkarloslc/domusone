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

type Accion = 'read' | 'write'

type Permiso = { read: boolean; write: boolean }

type AuthUser = {
  user: User
  nombre: string
  rol: Rol
}

type AuthCtx = {
  authUser: AuthUser | null
  loading:  boolean
  signIn:   (email: string, password: string) => Promise<string | null>
  signOut:  () => Promise<void>
  /** Verifica si el rol tiene acceso a un módulo. accion='read' por defecto. */
  can:      (modulo: string, accion?: Accion) => boolean
}

// ── Helpers de permiso ────────────────────────────────────────────────────────
const F: Permiso = { read: true, write: true  }   // Full — lectura + escritura
const R: Permiso = { read: true, write: false }    // Read only — solo lectura

// ── Matriz de permisos ────────────────────────────────────────────────────────
// admin usa '*' (acceso total)
// Cada módulo tiene { read, write } independiente
//
// Módulos disponibles:
//   Residencial : lotes, propietarios, cobranza, facturas, accesos,
//                 incidencias, contratos, escrituras, proyectos
//   Operaciones : mantenimiento
//   Compras     : compras  ← sección completa
//                 (internamente el módulo /compras filtra por rol:
//                  compras  → Requisiciones, Cotizaciones, OC, OP, CXP, Proveedores
//                  almacen  → Recepciones, Transferencias, Artículos, Almacenes)
//   Sistema     : reportes, catalogos, configuracion  ← solo admin vía '*'

const PERMISOS: Record<Rol, Record<string, Permiso> | '*'> = {

  // ── Admin ─── acceso total, no se toca ────────────────────────────────────
  admin: '*',

  // ── Atención a Residentes ─────────────────────────────────────────────────
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

  // ── Cobranza ──────────────────────────────────────────────────────────────
  cobranza: {
    lotes:        R,
    propietarios: R,
    cobranza:     F,
    facturas:     F,
    reportes:     F,
  },

  // ── Vigilancia ────────────────────────────────────────────────────────────
  vigilancia: {
    lotes:        R,
    propietarios: R,
    accesos:      F,
    incidencias:  F,
  },

  // ── Compras ── Requisiciones + Cotizaciones + OC + OP + CXP + Proveedores ─
  compras: {
    compras:  F,
    reportes: F,
  },

  // ── Almacén ── Recepciones + Transferencias + Artículos + Almacenes ────────
  almacen: {
    compras:  F,
    reportes: F,
  },

  // ── Mantenimiento ─────────────────────────────────────────────────────────
  mantenimiento: {
    lotes:         R,
    propietarios:  R,
    mantenimiento: F,
  },

  // ── Fraccionamiento ── acceso amplio a todo ────────────────────────────────
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
      // Sin registro en cfg.usuarios → acceso denegado
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

  /**
   * can('lotes')           → ¿puede ver el módulo? (lectura)
   * can('lotes', 'write')  → ¿puede crear/editar en el módulo?
   *
   * Uso en JSX:
   *   can('lotes')          → para mostrar/ocultar en el sidebar
   *   can('lotes', 'write') → para mostrar/ocultar botón "Nuevo"
   */
  const can = (modulo: string, accion: Accion = 'read'): boolean => {
    if (!authUser) return false
    const perms = PERMISOS[authUser.rol]
    if (perms === '*') return true          // admin — acceso total
    const p = perms[modulo]
    if (!p) return false
    return accion === 'write' ? p.write : p.read
  }

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
  }

  return (
    <AuthContext.Provider value={{ authUser, loading, signIn, signOut, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
