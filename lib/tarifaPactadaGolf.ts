// Tarifa pactada por socio (golf.cuotas_socios) — resolución compartida.
//
// Regla: al generar un cargo de Golf el monto sale de `excepción ?? precio de
// lista de la categoría`, igual que Fraccionamiento resuelve ctrl.cuotas_lotes
// sobre cfg.cuotas_estandar_det (ver app/cobranza/CargosTab.tsx).
//
// Existe porque el precio de lista por categoría era el ÚNICO monto posible, y
// cuando el socio pagaba un precio pactado la diferencia se liquidaba con la
// forma de pago «Condonación»: $4.99M de 2026 que nunca fueron dinero.
// Ver supabase/migrations/20260921180000_golf_cuotas_socios_tarifa_pactada.sql
import { dbGolf } from './supabase'

export type TarifaPactada = {
  id: number
  id_socio_fk: number
  id_cuota_config_fk: number
  monto: number
  vigente_desde: string | null
  vigente_hasta: string | null
  motivo_excepcion: string
  activo: boolean
}

/** Columnas mínimas para resolver; usar en los `select` de los consumidores. */
export const COLS_TARIFA = 'id, id_socio_fk, id_cuota_config_fk, monto, vigente_desde, vigente_hasta, motivo_excepcion, activo'

/**
 * ¿Esta tarifa cubre el periodo dado? La vigencia se compara como texto
 * 'YYYY-MM' — el mismo formato de `cxc_golf.periodo`, donde el orden
 * lexicográfico y el cronológico coinciden. Sin periodo (inscripciones
 * capturadas sin mes) solo aplica una tarifa sin límites.
 */
export function cubrePeriodo(t: TarifaPactada, periodo: string | null): boolean {
  if (!t.activo) return false
  if (!periodo) return t.vigente_desde == null && t.vigente_hasta == null
  if (t.vigente_desde != null && periodo < t.vigente_desde) return false
  if (t.vigente_hasta != null && periodo > t.vigente_hasta) return false
  return true
}

/**
 * Tarifa aplicable de un conjunto de filas ya cargadas. Si varias cubren el
 * periodo gana la de `vigente_desde` más reciente (la más específica); una fila
 * sin `vigente_desde` es el default y pierde contra cualquier otra.
 */
export function resolverTarifa(
  tarifas: TarifaPactada[],
  idSocio: number,
  idCuotaConfig: number,
  periodo: string | null,
): TarifaPactada | null {
  const candidatas = tarifas.filter(t =>
    t.id_socio_fk === idSocio &&
    t.id_cuota_config_fk === idCuotaConfig &&
    cubrePeriodo(t, periodo))
  if (candidatas.length === 0) return null
  return candidatas.reduce((mejor, t) =>
    (t.vigente_desde ?? '') > (mejor.vigente_desde ?? '') ? t : mejor)
}

/** Tarifas activas de una cuota (opcionalmente de un solo socio). */
export async function cargarTarifas(
  idCuotaConfig: number,
  idSocio?: number,
): Promise<{ tarifas: TarifaPactada[]; error: string | null }> {
  let q = dbGolf.from('cuotas_socios').select(COLS_TARIFA)
    .eq('id_cuota_config_fk', idCuotaConfig)
    .eq('activo', true)
  if (idSocio != null) q = q.eq('id_socio_fk', idSocio)
  const { data, error } = await q
  // El error se devuelve, no se traga: una tarifa pactada que no se pudo leer
  // haría nacer el cargo al precio de lista, que es exactamente el bug que
  // esta tabla viene a cerrar.
  return { tarifas: (data as TarifaPactada[]) ?? [], error: error?.message ?? null }
}

/** Monto a cargar: tarifa pactada si existe, si no el precio de lista. */
export function montoACargar(
  tarifa: TarifaPactada | null,
  precioLista: number | null,
): { monto: number | null; esPactada: boolean } {
  if (tarifa) return { monto: Number(tarifa.monto), esPactada: true }
  return { monto: precioLista, esPactada: false }
}
