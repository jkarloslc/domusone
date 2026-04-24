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
  id_seccion_alfa: string | null
  id_clasificacion_fk: number | null
  id_tipo_lote_fk: number | null
  calle: string | null
  numero: string | null
  manzana: string | null
  superficie: number | null
  sup_construccion: number | null
  status_lote: string | null
  status_juridico: string | null
  status_cobranza: string | null
  status_habitada_rentada: string | null
  status_lote_proyectos: string | null
  status_escriturable: string | null
  clasificacion_cobranza: string | null
  paga_cuotas: string | null
  clave_catastral: string | null
  valor_catastral: number | null
  Diferenciador: string | null
  observaciones: string | null
  notas: string | null
  imagen_lote: string | null
  ultima_mod: string | null
  usuario_ult_mod: string | null
  created_at: string
  updated_at: string
  // joins
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
export const dbGolf = base.schema('golf' as any)  // módulo golf

export const dbHip  = base.schema('hip'  as any)  // módulo hípico
