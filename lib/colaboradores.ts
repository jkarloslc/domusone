export type TipoColaborador = 'Interno' | 'Externo'
export type TipoNomina = 'Semanal' | 'Quincenal'

// Neto mensual a partir del neto por periodo: Quincenal x2, Semanal x52/12
export const netoMensualDesdePeriodo = (periodo: number | null | undefined, tipo: TipoNomina | '' | null | undefined): number | null => {
  if (periodo == null || !tipo) return null
  return Math.round(periodo * (tipo === 'Quincenal' ? 2 : 52 / 12) * 100) / 100
}

export type Colaborador = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  tipo: TipoColaborador
  fecha_ingreso: string | null
  puesto: string | null
  id_puesto_fk: number | null
  sueldo_bruto_mensual: number | null
  sueldo_neto_mensual: number | null
  tipo_nomina: TipoNomina | null
  sueldo_neto_semanal_quincenal: number | null
  sueldo_diario: number | null
  costo_mensual: number | null
  no_empleado: string | null
  es_asignado: boolean
  es_supervisor: boolean
  id_cuadrante_fk: number | null
  id_centro_costo_fk: number | null
  id_area_fk: number | null
  activo: boolean
}

export const nombreCompletoColaborador = (c: Pick<Colaborador, 'nombre' | 'apellido_paterno' | 'apellido_materno'>) =>
  [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ')
