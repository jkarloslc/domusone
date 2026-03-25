// ── Tipos compartidos del módulo Compras ─────────────────────

export type Articulo = {
  id: number; clave: string; nombre: string; descripcion: string | null
  unidad: string; categoria: string | null; stock_minimo: number
  stock_maximo: number | null; precio_ref: number | null; activo: boolean
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
  'Borrador':         { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
  'Enviada':          { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Aprobada':         { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Rechazada':        { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'En Proceso':       { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'Cerrada':          { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  'Cancelada':        { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'Abierta':          { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Pendiente Auth':   { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'Autorizada':       { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Enviada al Prov':  { bg: '#f0fdf4', color: '#0891b2', border: '#bae6fd' },
  'Recibida Parcial': { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'Solicitada':       { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Pendiente':        { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'Pagada':           { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Recibida':         { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
}

export const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_COMP[status] ?? STATUS_COMP['Borrador']
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  )
}

export const PRIORIDAD_COLOR: Record<string, string> = {
  'Normal':   '#64748b',
  'Urgente':  '#d97706',
  'Crítica':  '#dc2626',
}

export const UNIDADES = ['PZA', 'KG', 'LT', 'MT', 'M2', 'M3', 'CAJA', 'PAQ', 'ROLLO', 'BULTO', 'TONELADA', 'GALÓN', 'SERVICIO']
export const CATEGORIAS_ART = ['Limpieza', 'Mantenimiento', 'Jardinería', 'Herramientas', 'Papelería', 'Uniformes', 'Equipamiento', 'Alimentos', 'Bebidas', 'Golf', 'Ecuestre', 'Otro']
export const FORMAS_PAGO_COMP = ['Transferencia', 'Cheque', 'Efectivo', 'Tarjeta', 'Crédito 30 días', 'Crédito 60 días', 'Crédito 90 días']
