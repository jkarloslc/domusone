'use client'
// Zonas = agrupador de Secciones (ingresos) y Áreas (costos).
// En BD la tabla sigue llamándose cfg.cuadrantes (solo cambió el nombre visible):
//   - Sección → Zona: 1:N vía cfg.secciones.id_cuadrante_fk
//   - Área ↔ Zona:    N:M vía cfg.rel_area_cuadrante (un área puede cubrir varias zonas)
//   - Lote → Zona:    derivado de su sección
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { dbCfg } from '@/lib/supabase'

export type Zona = { id: number; nombre: string; color: string | null }

type ZonasData = {
  zonas: Zona[]
  secZona: Map<number, number>          // id_seccion → id_zona
  areaZonas: Map<number, number[]>      // id_area → [id_zona]
}

let cache: Promise<ZonasData> | null = null

function cargar(): Promise<ZonasData> {
  if (!cache) {
    cache = Promise.all([
      dbCfg.from('cuadrantes').select('id, nombre, color').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, id_cuadrante_fk'),
      dbCfg.from('rel_area_cuadrante').select('id_area, id_cuadrante'),
    ]).then(([z, s, r]) => {
      if (z.error || s.error || r.error) {
        console.error('zonas:', z.error?.message, s.error?.message, r.error?.message)
        cache = null
      }
      const secZona = new Map<number, number>()
      for (const x of (s.data ?? []) as any[]) if (x.id_cuadrante_fk) secZona.set(Number(x.id), Number(x.id_cuadrante_fk))
      const areaZonas = new Map<number, number[]>()
      for (const x of (r.data ?? []) as any[]) {
        const a = Number(x.id_area)
        areaZonas.set(a, [...(areaZonas.get(a) ?? []), Number(x.id_cuadrante)])
      }
      // Orden natural ("2 - …" antes que "10 - …")
      const zonas = ((z.data ?? []) as Zona[]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
      return { zonas, secZona, areaZonas }
    })
  }
  return cache
}

/** Invalida la caché (llamar tras editar el catálogo de Zonas). */
export function invalidarZonas() { cache = null }

export function useZonas() {
  const [data, setData] = useState<ZonasData>({ zonas: [], secZona: new Map(), areaZonas: new Map() })
  useEffect(() => { let vivo = true; cargar().then(d => { if (vivo) setData(d) }); return () => { vivo = false } }, [])

  return useMemo(() => {
    const { zonas, secZona, areaZonas } = data
    /** ids de secciones de la zona (null si no hay zona seleccionada) */
    const seccionesDeZona = (zona: string | number | null | undefined): Set<number> | null => {
      if (!zona) return null
      const z = Number(zona)
      return new Set(Array.from(secZona.entries()).filter(([, zz]) => zz === z).map(([s]) => s))
    }
    /** ids de áreas de la zona (null si no hay zona seleccionada) */
    const areasDeZona = (zona: string | number | null | undefined): Set<number> | null => {
      if (!zona) return null
      const z = Number(zona)
      return new Set(Array.from(areaZonas.entries()).filter(([, zs]) => zs.includes(z)).map(([a]) => a))
    }
    /** true si no hay zona o la sección pertenece a ella */
    const seccionEnZona = (zona: string | number | null | undefined, idSeccion: number | null | undefined) =>
      !zona || (idSeccion != null && secZona.get(Number(idSeccion)) === Number(zona))
    /** true si no hay zona o el área pertenece a ella */
    const areaEnZona = (zona: string | number | null | undefined, idArea: number | null | undefined) =>
      !zona || (idArea != null && (areaZonas.get(Number(idArea)) ?? []).includes(Number(zona)))
    const zonaDeSeccion = (idSeccion: number | null | undefined) =>
      idSeccion != null ? zonas.find(z => z.id === secZona.get(Number(idSeccion))) ?? null : null
    return { zonas, seccionesDeZona, areasDeZona, seccionEnZona, areaEnZona, zonaDeSeccion }
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
