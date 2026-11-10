'use client'
// Zonas = agrupador de Secciones (ingresos) y Áreas (costos).
// En BD la tabla sigue llamándose cfg.cuadrantes (solo cambió el nombre visible):
//   - Sección ↔ Zona: N:M vía cfg.rel_seccion_cuadrante (una sección puede estar en 2+ zonas)
//     (respaldo: cfg.secciones.id_cuadrante_fk si la tabla puente aún no existe)
//   - Área ↔ Zona:    N:M vía cfg.rel_area_cuadrante (un área puede cubrir varias zonas)
//   - Lote → Zonas:   derivado de su sección
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { dbCfg } from '@/lib/supabase'

export type Zona = { id: number; nombre: string; color: string | null }

type ZonasData = {
  zonas: Zona[]
  secZonas: Map<number, number[]>       // id_seccion → [id_zona]
  areaZonas: Map<number, number[]>      // id_area → [id_zona]
}

let cache: Promise<ZonasData> | null = null

function cargar(): Promise<ZonasData> {
  if (!cache) {
    cache = Promise.all([
      dbCfg.from('cuadrantes').select('id, nombre, color').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, id_cuadrante_fk'),
      dbCfg.from('rel_area_cuadrante').select('id_area, id_cuadrante'),
      dbCfg.from('rel_seccion_cuadrante').select('id_seccion, id_cuadrante'),
    ]).then(([z, s, r, rs]) => {
      if (z.error || s.error || r.error) {
        console.error('zonas:', z.error?.message, s.error?.message, r.error?.message)
        cache = null
      }
      const secZonas = new Map<number, number[]>()
      const add = (sec: number, zona: number) => {
        const l = secZonas.get(sec) ?? []
        if (!l.includes(zona)) secZonas.set(sec, [...l, zona])
      }
      if (!rs.error) for (const x of (rs.data ?? []) as any[]) add(Number(x.id_seccion), Number(x.id_cuadrante))
      else for (const x of (s.data ?? []) as any[]) if (x.id_cuadrante_fk) add(Number(x.id), Number(x.id_cuadrante_fk))
      const areaZonas = new Map<number, number[]>()
      for (const x of (r.data ?? []) as any[]) {
        const a = Number(x.id_area)
        areaZonas.set(a, [...(areaZonas.get(a) ?? []), Number(x.id_cuadrante)])
      }
      // Orden natural ("2 - …" antes que "10 - …")
      const zonas = ((z.data ?? []) as Zona[]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
      return { zonas, secZonas, areaZonas }
    })
  }
  return cache
}

/** Invalida la caché (llamar tras editar el catálogo de Zonas). */
export function invalidarZonas() { cache = null }

export function useZonas() {
  const [data, setData] = useState<ZonasData>({ zonas: [], secZonas: new Map(), areaZonas: new Map() })
  useEffect(() => { let vivo = true; cargar().then(d => { if (vivo) setData(d) }); return () => { vivo = false } }, [])

  return useMemo(() => {
    const { zonas, secZonas, areaZonas } = data
    /** ids de secciones de la zona (null si no hay zona seleccionada) */
    const seccionesDeZona = (zona: string | number | null | undefined): Set<number> | null => {
      if (!zona) return null
      const z = Number(zona)
      return new Set(Array.from(secZonas.entries()).filter(([, zs]) => zs.includes(z)).map(([s]) => s))
    }
    /** ids de áreas de la zona (null si no hay zona seleccionada) */
    const areasDeZona = (zona: string | number | null | undefined): Set<number> | null => {
      if (!zona) return null
      const z = Number(zona)
      return new Set(Array.from(areaZonas.entries()).filter(([, zs]) => zs.includes(z)).map(([a]) => a))
    }
    /** true si no hay zona o la sección pertenece a ella */
    const seccionEnZona = (zona: string | number | null | undefined, idSeccion: number | null | undefined) =>
      !zona || (idSeccion != null && (secZonas.get(Number(idSeccion)) ?? []).includes(Number(zona)))
    /** true si no hay zona o el área pertenece a ella */
    const areaEnZona = (zona: string | number | null | undefined, idArea: number | null | undefined) =>
      !zona || (idArea != null && (areaZonas.get(Number(idArea)) ?? []).includes(Number(zona)))
    /** Zonas de una sección (y de sus lotes) */
    const zonasDeSeccion = (idSeccion: number | null | undefined): Zona[] =>
      idSeccion != null ? zonas.filter(z => (secZonas.get(Number(idSeccion)) ?? []).includes(z.id)) : []
    return { zonas, seccionesDeZona, areasDeZona, seccionEnZona, areaEnZona, zonasDeSeccion }
  }, [data])
}

/** Select de Zona. value '' = todas. */
export function SelectZona({ value, onChange, zonas, style, className = 'select', label = 'Todas las zonas' }: {
  value: string
  onChange: (v: string) => void
  zonas: Zona[]
  style?: CSSProperties
  className?: string
  label?: string
}) {
  return (
    <select className={className} style={{ width: 'auto', minWidth: 160, ...style }} value={value}
      onChange={e => onChange(e.target.value)} title="Zona">
      <option value="">{label}</option>
      {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
    </select>
  )
}
