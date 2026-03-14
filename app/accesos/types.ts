export type Visitante = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  tipo_visitante: string | null
  parentesco: string | null
  identificacion_tipo: string | null
  identificacion_num: string | null
  notas: string | null
  activo: boolean
  created_at: string
}

export type Vehiculo = {
  id: number
  id_marca_fk: number | null
  tipo_vehiculo: string | null
  modelo: string | null
  color: string | null
  placas: string | null
  num_serie: string | null
  activo: boolean
  marcas?: { nombre: string }
}

export type VisitanteAutorizado = {
  id: number
  id_lote_fk: number
  id_visitante_fk: number
  tipo_pase: string | null
  vigencia_desde: string | null
  vigencia_hasta: string | null
  activo: boolean
  visitantes?: Visitante
  lotes?: { cve_lote: string | null; lote: number | null }
}

export type VehiculoAutorizado = {
  id: number
  id_lote_fk: number
  id_vehiculo_fk: number
  vigencia_desde: string | null
  vigencia_hasta: string | null
  activo: boolean
  vehiculos?: Vehiculo
  lotes?: { cve_lote: string | null }
}

export type Acceso = {
  id: number
  id_visitante_fk: number | null
  id_lote_fk: number | null
  tipo: string | null        // Entrada, Salida
  fecha_hora: string
  turno: string | null
  guardia: string | null
  notas: string | null
  visitantes?: { nombre: string; apellido_paterno: string | null }
  lotes?: { cve_lote: string | null; lote: number | null }
}

export const TIPOS_VISITANTE = ['Familiar', 'Visita', 'Proveedor', 'Empleado', 'Otro']
export const TIPOS_PASE      = ['Permanente', 'Temporal', 'Único']
export const TIPOS_VEHICULO  = ['Automóvil', 'Camioneta', 'Moto', 'Camión', 'Otro']
export const TURNOS          = ['Matutino', 'Vespertino', 'Nocturno']
