'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { dbCfg, dbComp } from '@/lib/supabase'
import type { Concepto, Cuenta, Layout, Regla } from '@/lib/flujoBanco'

export type CentroCosto = { id: number; nombre: string }
export type TipoGasto = { id: number; nombre: string }

export const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#62666E',
  fontWeight: 700, padding: '9px 10px', borderBottom: '1px solid #E6E8EB', background: '#F4F5F7', whiteSpace: 'nowrap',
}
export const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #E6E8EB', fontSize: 12.5, verticalAlign: 'top' }
export const num: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }
export const selChico: React.CSSProperties = { padding: '4px 8px', fontSize: 12, minWidth: 150 }

export function Aviso({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: `3px solid ${color}`, color,
      borderRadius: 8, padding: '10px 14px', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      {children}
    </div>
  )
}

export function Etiqueta({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="badge" style={{ background: color, color: '#fff', border: `1px solid ${color}` }}>{children}</span>
}

export const ORIGEN_LABEL: Record<string, string> = { regla: 'Regla', manual: 'Manual', cuenta: 'Cuenta' }

/** Catálogos que comparten las pestañas de estados de cuenta. */
export function useCatalogosBanco() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [reglas, setReglas] = useState<Regla[]>([])
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [centros, setCentros] = useState<CentroCosto[]>([])
  const [tiposGasto, setTiposGasto] = useState<TipoGasto[]>([])
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  const recargar = useCallback(async () => {
    const [cu, co, re, la, cc, tg] = await Promise.all([
      dbCfg.from('cuentas_bancarias').select('id, banco, numero_cuenta, alias, id_centro_costo_fk, activo').order('id'),
      dbComp.from('flujo_conceptos').select('*').eq('activo', true).order('orden'),
      dbComp.from('flujo_reglas').select('*').order('prioridad').order('id'),
      dbComp.from('flujo_layouts').select('*').order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('tipos_gasto').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    const err = [cu, co, re, la, cc, tg].find(r => r.error)?.error
    setError(err ? err.message : '')
    setCuentas((cu.data ?? []) as Cuenta[])
    setConceptos(((co.data ?? []) as Concepto[]))
    setReglas(((re.data ?? []) as Regla[]).map(r => ({
      ...r, monto_min: r.monto_min == null ? null : Number(r.monto_min), monto_max: r.monto_max == null ? null : Number(r.monto_max),
    })))
    setLayouts((la.data ?? []) as Layout[])
    setCentros((cc.data ?? []) as CentroCosto[])
    setTiposGasto((tg.data ?? []) as TipoGasto[])
    setListo(true)
  }, [])

  useEffect(() => { recargar() }, [recargar])

  return { cuentas, conceptos, reglas, layouts, centros, tiposGasto, error, listo, recargar }
}
export type CatalogosBanco = ReturnType<typeof useCatalogosBanco>

/** Lee en bloques de 1000 (límite de PostgREST). */
export async function leerTodo<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, maximo = 20000): Promise<{ rows: T[]; error: string | null; truncado: boolean }> {
  const rows: T[] = []
  for (let i = 0; i < maximo; i += 1000) {
    const { data, error } = await armar(i, i + 999)
    if (error) return { rows, error: error.message, truncado: false }
    const lote = (data ?? []) as T[]
    rows.push(...lote)
    if (lote.length < 1000) return { rows, error: null, truncado: false }
  }
  return { rows, error: null, truncado: true }
}
