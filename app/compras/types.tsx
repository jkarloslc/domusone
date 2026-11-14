// ── Tipos compartidos del módulo Compras ─────────────────────

export type Articulo = {
  id: number; clave: string; nombre: string; descripcion: string | null
  unidad: string; categoria: string | null; id_tipo_gasto_fk: number | null; stock_minimo: number
  stock_maximo: number | null; precio_ref: number | null; activo: boolean
  precio_ultima_compra?: number | null; fecha_ultima_compra?: string | null; id_oc_ultima_fk?: number | null
}

export type Proveedor = {
  id: number; clave: string; nombre: string; razon_social: string | null
  rfc: string | null; contacto: string | null; telefono: string | null
  correo: string | null; condiciones_pago: string | null
  banco: string | null; cuenta_clabe: string | null; activo: boolean
}

export type Almacen = {
  id: number; clave: string; nombre: string; tipo: string
  area: string | null; responsable: string | null; activo: boolean
}

export type Requisicion = {
  id: number; folio: string; area_solicitante: string; solicitante: string
  fecha_solicitud: string; fecha_requerida: string | null
  prioridad: string; status: string; justificacion: string | null
  autorizado_por: string | null; comentario_auth: string | null
  created_at: string
}

export type OC = {
  id: number; folio: string; id_proveedor_fk: number
  fecha_oc: string; fecha_entrega_est: string | null
  total: number; status: string; created_at: string
}

// ── Helpers ───────────────────────────────────────────────────
export const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'

export const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00')
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const folioGen = (prefijo: string, num: number) =>
  `${prefijo}-${new Date().getFullYear()}-${String(num).padStart(4, '0')}`

// Status colors
export const STATUS_COMP: Record<string, { bg: string; color: string; border: string }> = {
  'Borrador':         { bg: '#F8F9FA', color: '#62666E', border: '#E6E8EB' },
  'Enviada':          { bg: '#F4F5F7', color: '#1C1D21', border: '#C9CCD3' },
  'Aprobada':         { bg: '#F4F5F7', color: '#1F7A50', border: '#E6E8EB' },
  'Rechazada':        { bg: '#F4F5F7', color: '#C23B3B', border: '#E6E8EB' },
  'Sustituida':       { bg: '#F4F5F7', color: '#62666E', border: '#C9CCD3' },
  'En Proceso':       { bg: '#F4F5F7', color: '#B5761A', border: '#E6E8EB' },
  'Cerrada':          { bg: '#F4F5F7', color: '#4A4D54', border: '#C9CCD3' },
  'Cancelada':        { bg: '#F4F5F7', color: '#C23B3B', border: '#E6E8EB' },
  'Abierta':          { bg: '#F4F5F7', color: '#1C1D21', border: '#C9CCD3' },
  'Pendiente Auth':   { bg: '#F4F5F7', color: '#B5761A', border: '#E6E8EB' },
  'Pendiente Auth Finanzas': { bg: '#F4F5F7', color: '#6B4E79', border: '#E6E8EB' },
  'Autorizada':       { bg: '#F4F5F7', color: '#1F7A50', border: '#E6E8EB' },
  'Enviada al Prov':  { bg: '#F4F5F7', color: '#32789A', border: '#E6E8EB' },
  'Recibida Parcial': { bg: '#F4F5F7', color: '#B5761A', border: '#E6E8EB' },
  'Solicitada':       { bg: '#F4F5F7', color: '#1C1D21', border: '#C9CCD3' },
  'Pendiente':        { bg: '#F4F5F7', color: '#B5761A', border: '#E6E8EB' },
  'Pagada':           { bg: '#F4F5F7', color: '#1F7A50', border: '#E6E8EB' },
  'Abonada':          { bg: '#F4F5F7', color: '#1C1D21', border: '#C9CCD3' },
  'Recibida':         { bg: '#F4F5F7', color: '#1F7A50', border: '#E6E8EB' },
}

export const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_COMP[status] ?? STATUS_COMP['Borrador']
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: s.color, color: '#fff', border: `1px solid ${s.color}` }}>
      {status}
    </span>
  )
}

export const PRIORIDAD_COLOR: Record<string, string> = {
  'Normal':   '#62666E',
  'Urgente':  '#B5761A',
  'Crítica':  '#C23B3B',
}

export const UNIDADES = ['PZA', 'KG', 'LT', 'MT', 'M2', 'M3', 'CAJA', 'PAQ', 'ROLLO', 'BULTO', 'TONELADA', 'GALÓN', 'SERVICIO']
// Categorías de artículo: ver lib/tiposGasto.ts (cfg.tipos_gasto
// con es_articulo=true) — ya no es un array hardcodeado aquí.
export const FORMAS_PAGO_COMP = ['Transferencia', 'Cheque', 'Efectivo', 'Tarjeta', 'Crédito 30 días', 'Crédito 60 días', 'Crédito 90 días']
export const CONDICIONES_PAGO_PROV = ['Contado', 'Crédito 30 días', 'Crédito 60 días', 'Crédito 90 días']

/**
 * Genera el siguiente folio atómico usando la función RPC en Supabase.
 * Lanza un error claro si el RPC falla (función no existe, sin permisos, etc.)
 * En lugar de insertar null silenciosamente y romper el NOT NULL constraint.
 *
 * Uso: const folio = await nextFolio(dbComp, 'OP')
 */
export async function nextFolio(db: any, prefijo: string): Promise<string> {
  const { data, error } = await db.rpc('fn_next_folio', { prefijo })
  if (error) {
    throw new Error(
      `Error al generar folio ${prefijo}: ${error.message}\n` +
      `Verifica que el SQL de secuencias (sql/PENDIENTE_EJECUTAR.sql sección 3) fue ejecutado en Supabase.`
    )
  }
  if (!data) {
    throw new Error(
      `fn_next_folio devolvió null para prefijo "${prefijo}". ` +
      `Ejecuta el SQL de secuencias en Supabase SQL Editor (sql/PENDIENTE_EJECUTAR.sql sección 3).`
    )
  }
  return data as string
}
