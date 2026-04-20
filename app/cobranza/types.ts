export type Recibo = {
  id: number
  id_lote_fk: number
  folio: string | null
  fecha_recibo: string
  fecha_pago: string | null
  descripcion: string | null
  monto: number
  propietario: string | null
  empresa: string | null
  cuenta_receptora: number | null
  tipo_concepto: string | null
  tipo_cobranza: string | null
  periodicidad: string | null
  activo: boolean
  usuario_crea: string | null
  usuario_cancela: string | null
  fecha_cancela: string | null
  motivo_cancelacion: string | null
  folio_factura: string | null
  folio_fiscal: string | null
  rfc_factura: string | null
  forma_pago_2025: string | null
  fecha_de?: string | null
  fecha_a?: string | null
  created_at: string
  lotes?: { cve_lote: string | null; lote: number | null }
}

export type Cargo = {
  id: number
  id_lote_fk: number
  id_cuota_lote_fk: number | null
  concepto: string
  monto: number
  periodo_mes: string | null
  periodo_anio: number | null
  fecha_cargo: string
  status: string   // Pendiente, Parcial, Pagado, Cancelado
  monto_pagado: number
  saldo: number
  notas: string | null
  created_at: string
  lotes?: { cve_lote: string | null }
  cuotas_lotes?: { monto: number; periodicidad: string | null; cuotas_estandar?: { nombre: string } }
}

export type ReciboDetalle = {
  id?: number
  id_recibo_fk?: number
  id_cargo_fk?: number | null
  id_cuota_lote_fk?: number | null
  concepto: string
  cantidad: number
  precio_unitario: number
  descuento: number
  subtotal: number
  iva: number
  total: number
  periodo_mes: string | null
  periodo_anio: number | null
}

export type ReciboPago = {
  id?: number
  id_recibo_fk?: number
  id_forma_pago_fk?: number | null
  monto: number
  referencia: string | null
  fecha: string | null
  forma_nombre?: string | null
}

export type CuotaLote = {
  id: number
  id_lote_fk: number
  id_cuota_estandar_fk: number | null
  monto: number
  periodicidad: string | null
  activo: boolean
  notas: string | null
  cuotas_estandar?: { nombre: string }
}

export const TIPOS_CONCEPTO  = ['Mantenimiento', 'Membresía', 'Cuota Extraordinaria', 'Penalización', 'Otro']
export const TIPOS_COBRANZA  = ['Cuota Ordinaria', 'Cuota Extraordinaria', 'Mora', 'Contrato', 'Membresía']
export const PERIODICIDADES  = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Única']
export const MESES           = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
export const CUENTAS         = [{ id: 1, nombre: 'Cuenta Principal' }, { id: 2, nombre: 'Cuenta Operativa' }]

export const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

export const STATUS_CARGO_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  'Pendiente': { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'Parcial':   { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'Pagado':    { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Cancelado': { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
}
