// ================================================================
// DOMUSONE — Servicio PAC (Proveedor Autorizado de Certificación)
// ================================================================
// Este archivo es la capa de abstracción del PAC.
// Cuando se contrate el proveedor PAC, solo se modifica este archivo.
// El resto del módulo de facturación NO cambia.
//
// Proveedores PAC comunes en México:
//   - Facturama  → api.facturama.mx
//   - SW SAPien  → services.sw.com.mx
//   - Diverza    → api.diverza.com
//   - Edicom     → edicom.com
// ================================================================

export type DatosFactura = {
  // Emisor (tu empresa — viene de cfg.configuracion)
  rfc_emisor:           string
  razon_social_emisor:  string
  regimen_fiscal:       string   // ej. '626' (RESICO), '601' (General Ley)
  cp_emisor?:           string   // C.P. fiscal del emisor (LugarExpedicion SAT)

  // Receptor (propietario / cliente)
  rfc_receptor:         string
  razon_social_receptor: string
  uso_cfdi:             string   // ej. 'G03' Gastos en general, 'CP01' Pagos
  regimen_fiscal_receptor?: string
  cp_receptor?:         string

  // Comprobante
  serie:         string
  folio_interno: string
  metodo_pago:   string   // 'PUE' Pago en una sola exhibición, 'PPD' Parcial
  forma_pago:    string   // '03' Transferencia, '01' Efectivo, '04' Tarjeta
  moneda:        string   // 'MXN'
  tipo_cambio:   number

  // Conceptos
  conceptos: ConceptoFactura[]
}

export type ConceptoFactura = {
  cantidad:          number
  unidad:            string    // 'E48' Unidad de servicio
  clave_prod_serv:   string    // SAT: '80101601' Servicios de administración
  descripcion:       string
  precio_unitario:   number
  importe:           number
  objeto_imp:        string    // '02' Sí objeto de impuesto
  tasa_iva:          number    // 0.16
  // Monto de IVA ya calculado por el llamador como (total - importe), reconciliado
  // con el total original del ticket/recibo. Si se omite, el PAC lo calcula como
  // importe*tasa_iva — lo cual, por doble redondeo, puede dejar la factura 1-2
  // centavos por debajo del total real cuando el precio es "IVA incluido".
  importe_iva?:      number
}

export type ResultadoTimbrado = {
  ok:           boolean
  folio_fiscal?: string      // UUID del SAT
  pac_cfdi_id?: string       // ID interno del PAC (Facturama) para re-descargar
  xml_cfdi?:    string       // XML timbrado completo
  pdf_url?:     string       // URL del PDF generado
  pac_respuesta?: any        // Respuesta raw del PAC
  error?:       string       // Mensaje de error si ok=false
}

export type ResultadoCancelacion = {
  ok:     boolean
  acuse?: string
  error?: string
}

// ================================================================
// IMPLEMENTACIÓN DEL PAC
// ================================================================
// Cuando tengas el proveedor PAC, reemplaza las funciones de abajo
// con las llamadas reales a su API.
//
// Ejemplo para Facturama:
//   const res = await fetch('https://apisandbox.facturama.mx/cfdi', {
//     method: 'POST',
//     headers: { 'Authorization': 'Basic ' + btoa(user+':'+pass), 'Content-Type': 'application/json' },
//     body: JSON.stringify(payload)
//   })
// ================================================================

const PAC_CONFIGURADO = true  // ← Facturama Sandbox activo

export async function timbrarCFDI(datos: DatosFactura): Promise<ResultadoTimbrado> {
  if (!PAC_CONFIGURADO) {
    return {
      ok:           true,
      folio_fiscal: `SIMULADO-${Date.now()}`,
      xml_cfdi:     `<CFDI simulado>${JSON.stringify(datos)}</CFDI>`,
      pdf_url:      null as any,
      pac_respuesta: { modo: 'simulacion', fecha: new Date().toISOString() },
    }
  }

  try {
    const response = await fetch('/api/pac/timbrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
    const result = await response.json()
    if (!response.ok) return { ok: false, error: result.error ?? 'Error del PAC' }
    return {
      ok:            true,
      folio_fiscal:  result.folio_fiscal,
      pac_cfdi_id:   result.pac_cfdi_id,
      xml_cfdi:      result.xml_cfdi,
      pdf_url:       result.pdf_url,
      pac_respuesta: result.pac_respuesta,
    }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// pac_cfdi_id: ID interno de Facturama (NO el folio_fiscal/UUID del SAT) —
// la API de cancelación de Facturama (DELETE /cfdi/{id}) recibe su propio Id,
// no el UUID fiscal (a diferencia de /cfdi/{tipo}/{id} para descargar, que sí
// usa el UUID). Ver app/api/pac/cancelar/route.ts.
export async function cancelarCFDI(
  pac_cfdi_id: string,
  motivo: string = '02'
): Promise<ResultadoCancelacion> {
  if (!PAC_CONFIGURADO) {
    return { ok: true, acuse: `CANCELACION-SIMULADA-${pac_cfdi_id}` }
  }

  try {
    const response = await fetch('/api/pac/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pac_cfdi_id, motivo }),
    })
    const result = await response.json()
    if (!response.ok) return { ok: false, error: result.error ?? 'Error al cancelar' }
    return { ok: true, acuse: result.acuse }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// Da de alta una Serie nueva en la sucursal (Matriz) de Facturama. Facturama
// exige que toda Serie usada al timbrar exista ya registrada ahí — se llama
// automáticamente cuando timbrarCFDI falla con "Serie debe existir en la
// sucursal", para dar de alta la serie y reintentar una sola vez.
export async function registrarSerieFactura(
  serie: string,
  folio_inicial?: number
): Promise<{ ok: boolean; error?: string }> {
  if (!PAC_CONFIGURADO) return { ok: true }

  try {
    const response = await fetch('/api/pac/registrar-serie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serie, folio_inicial }),
    })
    const result = await response.json()
    if (!response.ok) return { ok: false, error: result.error ?? 'Error al registrar la serie' }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// Catálogos SAT más usados
export const USOS_CFDI = [
  { clave: 'G01', desc: 'Adquisición de mercancias' },
  { clave: 'G03', desc: 'Gastos en general' },
  { clave: 'CP01', desc: 'Pagos' },
  { clave: 'D10', desc: 'Pagos por servicios educativos' },
  { clave: 'S01', desc: 'Sin efectos fiscales' },
]

export const FORMAS_PAGO_SAT = [
  { clave: '01', desc: 'Efectivo' },
  { clave: '02', desc: 'Cheque nominativo' },
  { clave: '03', desc: 'Transferencia electrónica' },
  { clave: '04', desc: 'Tarjeta de crédito' },
  { clave: '28', desc: 'Tarjeta de débito' },
  { clave: '99', desc: 'Por definir' },
]

export const METODOS_PAGO = [
  { clave: 'PUE', desc: 'Pago en una sola exhibición' },
  { clave: 'PPD', desc: 'Pago en parcialidades o diferido' },
]

export const REGIMENES_FISCALES = [
  { clave: '601', desc: 'General de Ley Personas Morales' },
  { clave: '603', desc: 'Personas Morales sin Fines de Lucro' },
  { clave: '605', desc: 'Sueldos y Salarios e Ingresos Asimilados' },
  { clave: '612', desc: 'Personas Físicas con Actividades Empresariales' },
  { clave: '616', desc: 'Sin obligaciones fiscales' },
  { clave: '621', desc: 'Incorporación Fiscal' },
  { clave: '625', desc: 'Régimen de las Actividades Empresariales con Ingresos a través de Plataformas' },
  { clave: '626', desc: 'Simplificado de Confianza (RESICO)' },
]

// Lista curada de claves de producto/servicio del catálogo SAT (c_ClaveProdServ),
// relevante al giro de domusone: club/golf, hospitality/F&B, pro-shop, y
// administración de inmuebles (rentas Locales, cuotas de mantenimiento
// Residencial). El catálogo oficial completo tiene ~52,000 claves — impráctico
// para un combo — así que se cura un subconjunto verificado y se deja también
// captura manual de cualquier otra clave de 8 dígitos no listada aquí.
export const CLAVE_PROD_SERV_COMUNES = [
  // Club deportivo / golf
  { clave: '94121500', desc: 'Clubes deportivos (membresía)' },
  { clave: '94121512', desc: 'Clubes deportivos profesionales o semiprofesionales' },
  { clave: '90141500', desc: 'Eventos profesionales deportivos (torneos)' },
  { clave: '49211600', desc: 'Equipo de golf' },
  { clave: '49211602', desc: 'Bolas de golf' },
  { clave: '49221500', desc: 'Accesorios para deporte' },
  // Hospitality / alimentos y bebidas
  { clave: '90101500', desc: 'Establecimientos para comer y beber' },
  { clave: '90101501', desc: 'Restaurantes' },
  { clave: '90101600', desc: 'Servicios de banquetes y catering' },
  { clave: '91101502', desc: 'Spas' },
  { clave: '91101503', desc: 'Servicios de masajes' },
  { clave: '78181703', desc: 'Servicio de estacionamiento / parqueadero de vehículos' },
  // Pro-shop / mercancía
  { clave: '53102900', desc: 'Prendas de deporte' },
  { clave: '53102902', desc: 'Ropa atlética para hombre' },
  { clave: '53103000', desc: 'Camisetas' },
  // Administración de inmuebles / rentas (Locales, Residencial)
  { clave: '80101500', desc: 'Servicios de consultoría de negocios y administración corporativa' },
  { clave: '80131500', desc: 'Alquiler y arrendamiento de propiedades o edificaciones' },
  { clave: '80131800', desc: 'Servicios de administración inmobiliaria' },
  { clave: '80131801', desc: 'Administración de propiedades (cuotas de mantenimiento)' },
  // Construcción / supervisión de obra
  { clave: '72101500', desc: 'Servicios de apoyo para la construcción (supervisión de obra)' },
  { clave: '81101500', desc: 'Ingeniería civil' },
  { clave: '81101513', desc: 'Gestión de construcción de edificios' },
  // Comodín oficial del SAT
  { clave: '01010101', desc: 'No existe en el catálogo' },
] as const

// RFC genérico de público en general
export const RFC_PUBLICO_GENERAL = 'XAXX010101000'
export const DATOS_PUBLICO_GENERAL = {
  razon_social: 'PUBLICO EN GENERAL',
  regimen_fiscal: '616',
  uso_cfdi: 'S01',
  cp: '00000',
} as const
