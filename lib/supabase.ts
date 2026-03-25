import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const base = createClient(supabaseUrl, supabaseKey)

export const supabase = base

// Clientes por schema — sintaxis correcta en supabase-js v2
export const dbCat  = base.schema('cat' as any)   // catálogos maestros
export const dbCtrl = base.schema('ctrl' as any)  // transaccional
export const dbCfg  = base.schema('cfg' as any)   // configuración

// ── Tipos derivados del schema DomusOne ──────────────────────

export type Seccion = {
  id: number
  nombre: string
  clave_alfa: string | null
  activo: boolean
}

export type Lote = {
  id: number
  cve_lote: string | null
  lote: number | null
  id_seccion_fk: number | null
  tipo_lote: string | null
  superficie: number | null
  sup_construccion: number | null
  status_lote: string | null
  status_juridico: string | null
  status_cobranza: string | null
  clasificacion_cobranza: string | null
  paga_cuotas: string | null
  valor_operacion: number | null
  precio_de_lista: number | null
  forma_venta: string | null
  incluye_membresia: string | null
  tipo_membresia: string | null
  vendedor: string | null
  medio_captacion: string | null
  clave_catastral: string | null
  valor_catastral: number | null
  persona_contacto: string | null
  telefono_persona_contacto: string | null
  correo_persona_contacto: string | null
  rfc_para_factura: string | null
  razon_social_para_factura: string | null
  observaciones: string | null
  notas: string | null
  urbanizacion_disponible: string | null
  created_at: string
  updated_at: string
  // join
  secciones?: Seccion
}

export type LoteFormData = Omit<Lote, 'id' | 'created_at' | 'updated_at' | 'secciones'>

export type Propietario = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  nombre_completo?: string
  tipo_persona: string | null
  rfc: string | null
  activo: boolean
  created_at: string
}

export type PropietarioLote = {
  id: number
  id_propietario_fk: number
  id_lote_fk: number
  es_principal: boolean
  porcentaje: number | null
  activo: boolean
  propietarios?: Propietario
}

export const dbComp = base.schema('comp' as any)  // compras e inventarios
