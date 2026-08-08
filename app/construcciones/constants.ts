export type Etapa = { key: string; label: string; orden: number }

// Checklist fijo del expediente de construcción, en orden secuencial.
// 'acta_terminacion' dispara el cambio de status del lote a 'Casa'.
// 'cierre_expediente' cierra el expediente (ctrl.construcciones.status = 'Cerrado').
export const ETAPAS: Etapa[] = [
  { key: 'proyecto_autorizado', label: 'Proyecto Autorizado',       orden: 1 },
  { key: 'deslinde',            label: 'Deslinde',                  orden: 2 },
  { key: 'fianza',              label: 'Fianza de Construcción',    orden: 3 },
  { key: 'licencia',            label: 'Licencia de Construcción',  orden: 4 },
  { key: 'acta_terminacion',    label: 'Acta de Terminación',       orden: 5 },
  { key: 'entrega_fianza',      label: 'Entrega de Fianza',         orden: 6 },
  { key: 'cierre_expediente',   label: 'Cierre de Expediente',      orden: 7 },
]

export const MOTIVOS = ['Construcción Nueva', 'Remodelación', 'Ampliación', 'Otro']

export const STATUS_CONSTRUCCION = ['Abierto', 'Cerrado', 'Cancelado']
export const STATUS_COLOR: Record<string, string> = {
  Abierto: 'badge-libre', Cerrado: 'badge-vendido', Cancelado: 'badge-bloqueado',
}

export const TIPOS_INCIDENCIA_OBRA = [
  'Ruido', 'Horario de Obra', 'Escombro / Basura', 'Daño a Vía Pública',
  'Falta de Seguridad', 'Incumplimiento de Proyecto Autorizado',
  'Uso Indebido de Áreas Comunes', 'Otro',
]
export const STATUS_INCIDENCIA_OBRA = ['Abierta', 'En Proceso', 'Cerrada']
export const STATUS_INCIDENCIA_COLOR: Record<string, string> = {
  Abierta: 'badge-bloqueado', 'En Proceso': 'badge-default', Cerrada: 'badge-vendido',
}

export const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

export const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '—'
