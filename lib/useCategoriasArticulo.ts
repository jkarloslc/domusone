import { useState, useEffect } from 'react'
import { dbCfg } from '@/lib/supabase'

// Categorías de artículo — subconjunto de cfg.tipos_gasto marcado con
// es_articulo=true (antes duplicado como array CATEGORIAS_ART hardcodeado
// en app/compras/types.tsx). Mismo catálogo que "Tipo de Gasto" de OP:
// una OC sin tipo_gasto capturado se reatribuye a la categoría del
// artículo comprado (lib/pptoOcCategoria.ts), así que ambos deben venir
// de la misma fuente para que el texto coincida siempre.
export function useCategoriasArticulo(): string[] {
  const [categorias, setCategorias] = useState<string[]>([])
  useEffect(() => {
    dbCfg.from('tipos_gasto').select('nombre').eq('activo', true).eq('es_articulo', true)
      .then(({ data }) => {
        const nombres = (data ?? []).map((r: any) => r.nombre as string)
        nombres.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        setCategorias(nombres)
      })
  }, [])
  return categorias
}
