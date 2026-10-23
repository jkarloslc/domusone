export type Tipo = { id: number; nombre: string; clase: 'Rutina' | 'Acceso' | 'Incidencia'; genera_incidencia: boolean }
export type Ubicacion = { id: number; nombre: string; tipo: string | null }

export type Novedad = {
  id: number
  id_parte_fk: number
  turno: string | null
  hora: string | null
  id_tipo_fk: number | null
  titulo: string
  descripcion: string | null
  accion_tomada: string | null
  resultado: string | null
  status: string
  criticidad: string
  hora_salida: string | null
  desc_salida: string | null
  id_lote_fk: number | null
  id_incidencia_fk: number | null
  captured_by: string | null
  vig_partes?: { fecha: string } | null
}

export type Parte = {
  id: number
  fecha: string
  responsable: string | null
  supervisor: string | null
  destinatarios: string | null
  status: 'Borrador' | 'Enviado/Cerrado'
  resumen: string | null
  n_vehiculos_adv: number | null
  n_empl_adv: number | null
  n_empl_bitacora: number | null
  enviado_at: string | null
  visto_por: string | null
  visto_at: string | null
}

export const TURNOS = ['Diurno', 'Mixto', 'Nocturno']
export const RESULTADOS = ['Atendido', 'Sin Novedad', 'Pendiente', 'Escalado']
export const STATUS_NOV = ['Abierto', 'En curso', 'Cerrado']
export const CRITICIDADES = ['Baja', 'Media', 'Alta', 'Crítica']

export const CRIT_COLOR: Record<string, { bg: string; color: string }> = {
  'Baja':    { bg: '#f1f5f9', color: '#64748b' },
  'Media':   { bg: '#fffbeb', color: '#d97706' },
  'Alta':    { bg: '#fff7ed', color: '#ea580c' },
  'Crítica': { bg: '#fef2f2', color: '#dc2626' },
}
export const STATUS_NOV_COLOR: Record<string, { bg: string; color: string }> = {
  'Abierto':  { bg: '#fef2f2', color: '#dc2626' },
  'En curso': { bg: '#eff6ff', color: '#2563eb' },
  'Cerrado':  { bg: '#f0fdf4', color: '#15803d' },
}

export const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtHora = (h: string | null | undefined) => (h ? h.slice(0, 5) : '—')
export const horaActual = () => new Date().toTimeString().slice(0, 5)
export const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const Pill = ({ txt, c }: { txt: string; c: { bg: string; color: string } }) => (
  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{txt}</span>
)

// Rutinas frecuentes: un toque crea la novedad ya cerrada y "Sin Novedad"
export const PLANTILLAS = [
  { titulo: 'Apertura de Golf',            tipo: 'Apertura / Cierre', ubic: 'Campo de Golf' },
  { titulo: 'Cierre de Golf',              tipo: 'Apertura / Cierre', ubic: 'Campo de Golf' },
  { titulo: 'Apertura de Camino Viejo',    tipo: 'Apertura / Cierre', ubic: 'Camino Viejo' },
  { titulo: 'Apertura de Oficinas',        tipo: 'Apertura / Cierre', ubic: 'Oficinas' },
  { titulo: 'Cierre de Oficinas',          tipo: 'Apertura / Cierre', ubic: 'Oficinas' },
  { titulo: 'Apertura de Estacionamiento', tipo: 'Apertura / Cierre', ubic: 'Estacionamiento' },
  { titulo: 'Recorrido general',           tipo: 'Recorrido',         ubic: 'General' },
]
