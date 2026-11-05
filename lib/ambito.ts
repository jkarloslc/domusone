/**
 * Ámbito de los módulos de Mantenimiento que existen en dos versiones con
 * tablas independientes:
 *   - 'campo'  → Golf / Mantto. de Campo: tablas originales (ligadas a OP, Capex…)
 *   - 'mantto' → Mantenimiento del Fraccionamiento: tablas nuevas, sufijo _mantto
 *
 * Los componentes obtienen los nombres de tabla con useTablas() (AmbitoContext).
 * Sin proveedor el ámbito por defecto es 'campo' (comportamiento histórico).
 */
export type Ambito = 'campo' | 'mantto'

const BASE = [
  'equipos', 'herramientas', 'combustible_movimientos',
  'bitacora_equipos', 'bitacora_equipo_evidencias', 'bitacora_equipo_ops', 'bitacora_uso_equipos',
  'vales_combustible', 'cargas_combustible',
  'prestamos_herramientas', 'mantenimiento_herramientas',
  'servicios_catalogo', 'servicios_puntos_conexion', 'servicios_registros',
] as const

export type TablasAmbito = Record<(typeof BASE)[number], string>

const construir = (sufijo: string): TablasAmbito =>
  Object.fromEntries(BASE.map(t => [t, t + sufijo])) as TablasAmbito

// Objetos constantes: identidad estable entre renders
const TABLAS_CAMPO: TablasAmbito  = construir('')
const TABLAS_MANTTO: TablasAmbito = construir('_mantto')

export const tablasAmbito = (ambito: Ambito = 'campo'): TablasAmbito =>
  ambito === 'mantto' ? TABLAS_MANTTO : TABLAS_CAMPO
