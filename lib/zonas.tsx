'use client'
// Zonas = agrupador de Secciones (ingresos) y Áreas (costos).
// En BD la tabla sigue llamándose cfg.cuadrantes (solo cambió el nombre visible):
//   - Sección ↔ Zona: N:M vía cfg.rel_seccion_cuadrante (una sección puede estar en 2+ zonas)
//     (respaldo: cfg.secciones.id_cuadrante_fk si la tabla puente aún no existe)
//   - Área ↔ Zona:    N:M vía cfg.rel_area_cuadrante (un área puede cubrir varias zonas)
//   - Lote → Zonas:   derivado de su sección
// Jerarquía de filtros: Zona solo aparece bajo un centro que la usa:
//   Costos:   Centro de Costo (usa_zonas) → Zona → Área
//   Ingresos: Centro de Ingreso de cuotas con desglose por secciones → Zona → Sección
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { dbCfg } from '@/lib/supabase'
import { cargarCentrosAgrupados, esCentroCuotas } from '@/lib/centrosIngreso'

export type Zona = { id: number; nombre: string; color: string | null }

type ZonasData = {
  zonas: Zona[]
  secZonas: Map<number, number[]>       // id_seccion → [id_zona]
  areaZonas: Map<number, number[]>      // id_area → [id_zona]
  ccsZona: Set<number>                  // CC que usan Zona
  cisZona: Set<number>                  // CI que usan Zona
}

let cache: Promise<ZonasData> | null = null

function cargar(): Promise<ZonasData> {
  if (!cache) {
    cache = Promise.all([
      dbCfg.from('cuadrantes').select('id, nombre, color').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, id_cuadrante_fk'),
      dbCfg.from('rel_area_cuadrante').select('id_area, id_cuadrante'),
      dbCfg.from('rel_seccion_cuadrante').select('id_seccion, id_cuadrante'),
      // Migración usa_zonas pendiente → respaldo: el CC de Mantto. Fraccionamiento
      dbCfg.from('centros_costo').select('id, usa_zonas').then(async (r: any) => r.error
        ? { data: ((await dbCfg.from('centros_costo').select('id, nombre')).data ?? []).map((c: any) => ({ id: c.id, usa_zonas: /fraccionamiento/i.test(c.nombre) })) }
        : r),
      cargarCentrosAgrupados('tipo_desglose'),
    ]).then(([z, s, r, rs, cc, ci]) => {
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
      const ccsZona = new Set<number>(((cc as any).data ?? []).filter((c: any) => c.usa_zonas).map((c: any) => Number(c.id)))
      const cisZona = new Set<number>(ci.centros.filter((c: any) => esCentroCuotas(c) && c.tipo_desglose === 'secciones').map(c => c.id))
      return { zonas, secZonas, areaZonas, ccsZona, cisZona }
    })
  }
  return cache
}

/** Invalida la caché (llamar tras editar el catálogo de Zonas). */
export function invalidarZonas() { cache = null }

export function useZonas() {
  const [data, setData] = useState<ZonasData>({ zonas: [], secZonas: new Map(), areaZonas: new Map(), ccsZona: new Set(), cisZona: new Set() })
  useEffect(() => { let vivo = true; cargar().then(d => { if (vivo) setData(d) }); return () => { vivo = false } }, [])

  return useMemo(() => {
    const { zonas, secZonas, areaZonas, ccsZona, cisZona } = data
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
    /** El nivel Zona aplica bajo este Centro de Costo */
    const ccUsaZonas = (cc: string | number | null | undefined) => !!cc && ccsZona.has(Number(cc))
    /** El nivel Zona aplica bajo este Centro de Ingreso */
    const ciUsaZonas = (ci: string | number | null | undefined) => !!ci && cisZona.has(Number(ci))
    /** Zona del área si pertenece a exactamente una (para preseleccionar al editar) */
    const zonaUnicaDeArea = (idArea: string | number | null | undefined): number | null => {
      const zs = idArea ? (areaZonas.get(Number(idArea)) ?? []) : []
      return zs.length === 1 ? zs[0] : null
    }
    return { zonas, seccionesDeZona, areasDeZona, seccionEnZona, areaEnZona, zonasDeSeccion, ccUsaZonas, ciUsaZonas, zonaUnicaDeArea }
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

type ZonasCat = ReturnType<typeof useZonas>

/**
 * Captura CC → Zona → Área: select de Zona que solo aparece si el CC usa zonas.
 * Filtra las áreas; no se guarda (el registro sigue siendo CC + Área).
 * `areaIds` = áreas del CC, para ofrecer solo zonas con áreas de ese CC.
 */
export function CampoZonaCaptura({ zonasCat, cc, areaIds, value, onChange, compacto }: {
  zonasCat: ZonasCat
  cc: string | number | null | undefined
  areaIds: number[]
  value: string
  onChange: (v: string) => void
  compacto?: boolean
}) {
  if (!zonasCat.ccUsaZonas(cc)) return null
  const opts = zonasCat.zonas.filter(z => areaIds.some(a => zonasCat.areaEnZona(z.id, a)))
  const sel = (
    <select className="select" value={value} onChange={e => onChange(e.target.value)}
      style={compacto ? { padding: '4px 6px', fontSize: 12 } : undefined}>
      <option value="">{compacto ? '— Zona —' : '— Todas —'}</option>
      {opts.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
    </select>
  )
  return compacto ? sel : <div><label className="label">Zona</label>{sel}</div>
}
