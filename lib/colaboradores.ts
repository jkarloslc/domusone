export type Colaborador = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  fecha_ingreso: string | null
  puesto: string | null
  sueldo_bruto_mensual: number | null
  sueldo_neto_mensual: number | null
  es_asignado: boolean
  es_supervisor: boolean
  id_cuadrante_fk: number | null
  id_seccion_fk: number | null
  id_centro_costo_fk: number | null
  id_area_fk: number | null
  activo: boolean
}

export const nombreCompletoColaborador = (c: Pick<Colaborador, 'nombre' | 'apellido_paterno' | 'apellido_materno'>) =>
  [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ')
