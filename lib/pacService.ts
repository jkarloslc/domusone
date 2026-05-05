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
}

export type ResultadoTimbrado = {
  ok:           boolean
  folio_fiscal?: string      // UUID del SAT
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
      xml_cfdi:      result.xml_cfdi,
      pdf_url:       result.pdf_url,
      pac_respuesta: result.pac_respuesta,
    }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function cancelarCFDI(
  folio_fiscal: string,
  rfc_emisor: string,
  motivo: string = '02'
): Promise<ResultadoCancelacion> {
  if (!PAC_CONFIGURADO) {
    return { ok: true, acuse: `CANCELACION-SIMULADA-${folio_fiscal}` }
  }

  try {
    const response = await fetch('/api/pac/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folio_fiscal, rfc_emisor, motivo }),
    })
    const result = await response.json()
    if (!response.ok) return { ok: false, error: result.error ?? 'Error al cancelar' }
    return { ok: true, acuse: result.acuse }
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
  { clave: '603', desc: 'Personas Morales con Fines no Lucrativos' },
  { clave: '612', desc: 'Personas Físicas con Actividades Empresariales' },
  { clave: '626', desc: 'Simplificado de Confianza (RESICO)' },
  { clave: '621', desc: 'Incorporación Fiscal' },
]
