import { useState, useEffect } from 'react'
import { dbCfg } from '@/lib/supabase'

// Catálogo cfg.tipos_gasto — única fuente de los valores de "Tipo de
// Gasto" de OP/Presupuestos (antes duplicado como array hardcodeado en
// 8 archivos). Las columnas tipo_gasto de ordenes_pago/ppto_partidas/
// rol_tipos_op siguen siendo TEXT: esto solo alimenta los selects.
export function useTiposGasto(): string[] {
  const [tipos, setTipos] = useState<string[]>([])
  useEffect(() => {
    dbCfg.from('tipos_gasto').select('nombre').eq('activo', true).order('orden')
      .then(({ data }) => setTipos((data ?? []).map((r: any) => r.nombre)))
  }, [])
  return tipos
}
