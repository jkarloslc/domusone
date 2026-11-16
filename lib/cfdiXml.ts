// Lectura de un CFDI (3.3 / 4.0) a partir de su XML ya parseado.
// Sirve en el servidor (DOMParser de @xmldom/xmldom) y en el navegador
// (DOMParser nativo): solo usa la API DOM básica y busca por localName para
// no depender de prefijos (cfdi:, tfd:, pago20:…).

type El = { localName?: string | null; nodeName: string; getAttribute(n: string): string | null; childNodes: ArrayLike<any> }

const local = (n: any): string => (n?.localName ?? String(n?.nodeName ?? '').split(':').pop() ?? '')

function hijos(el: El | null | undefined, nombre?: string): El[] {
  if (!el) return []
  const out: El[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i]
    if (c?.nodeType === 1 && (!nombre || local(c) === nombre)) out.push(c)
  }
  return out
}
const hijo = (el: El | null | undefined, nombre: string) => hijos(el, nombre)[0] ?? null

function buscar(el: El | null | undefined, nombre: string): El | null {
  if (!el) return null
  for (const c of hijos(el)) {
    if (local(c) === nombre) return c
    const r = buscar(c, nombre)
    if (r) return r
  }
  return null
}

const attr = (el: El | null | undefined, n: string) => (el?.getAttribute(n) ?? '').trim() || null
const num  = (el: El | null | undefined, n: string) => {
  const v = attr(el, n)
  if (v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const r2 = (n: number) => Math.round(n * 100) / 100

export type CfdiConcepto = {
  claveProdServ: string | null
  noIdentificacion: string | null
  cantidad: number | null
  claveUnidad: string | null
  unidad: string | null
  descripcion: string | null
  valorUnitario: number | null
  importe: number | null
  descuento: number | null
}

export type CfdiDatos = {
  uuid: string
  version: string | null
  serie: string | null
  folio: string | null
  fecha_emision: string | null
  fecha_timbrado: string | null
  tipo_comprobante: string | null
  rfc_emisor: string
  nombre_emisor: string | null
  regimen_emisor: string | null
  rfc_receptor: string
  nombre_receptor: string | null
  regimen_receptor: string | null
  cp_receptor: string | null
  uso_cfdi: string | null
  metodo_pago: string | null
  forma_pago: string | null
  condiciones_pago: string | null
  lugar_expedicion: string | null
  moneda: string | null
  tipo_cambio: number | null
  subtotal: number | null
  descuento: number | null
  iva_trasladado: number | null
  iva_retenido: number | null
  isr_retenido: number | null
  ieps: number | null
  total: number | null
  no_certificado: string | null
  no_certificado_sat: string | null
  sello_cfd: string | null
  sello_sat: string | null
  rfc_prov_certif: string | null
  conceptos: CfdiConcepto[]
}

/** Extrae los datos del CFDI. Lanza error si el documento no es un CFDI timbrado. */
export function extraerCfdi(doc: { documentElement: any }): CfdiDatos {
  const c: El = doc.documentElement
  if (!c || local(c) !== 'Comprobante') throw new Error('El XML no es un CFDI (falta el nodo Comprobante)')

  const emisor   = hijo(c, 'Emisor')
  const receptor = hijo(c, 'Receptor')
  const tfd      = buscar(c, 'TimbreFiscalDigital')
  const uuid     = attr(tfd, 'UUID')
  if (!uuid) throw new Error('El CFDI no tiene Timbre Fiscal Digital (UUID)')

  // Impuestos a nivel comprobante (hijo directo, no los de cada concepto)
  const imp = hijo(c, 'Impuestos')
  let iva = 0, ieps = 0, ivaRet = 0, isrRet = 0
  let hayTras = false, hayRet = false
  for (const t of hijos(hijo(imp, 'Traslados'), 'Traslado')) {
    const importe = num(t, 'Importe') ?? 0
    hayTras = true
    if (attr(t, 'Impuesto') === '002') iva += importe
    if (attr(t, 'Impuesto') === '003') ieps += importe
  }
  for (const r of hijos(hijo(imp, 'Retenciones'), 'Retencion')) {
    const importe = num(r, 'Importe') ?? 0
    hayRet = true
    if (attr(r, 'Impuesto') === '002') ivaRet += importe
    if (attr(r, 'Impuesto') === '001') isrRet += importe
  }

  const conceptos: CfdiConcepto[] = hijos(hijo(c, 'Conceptos'), 'Concepto').map(k => ({
    claveProdServ:    attr(k, 'ClaveProdServ'),
    noIdentificacion: attr(k, 'NoIdentificacion'),
    cantidad:         num(k, 'Cantidad'),
    claveUnidad:      attr(k, 'ClaveUnidad'),
    unidad:           attr(k, 'Unidad'),
    descripcion:      attr(k, 'Descripcion'),
    valorUnitario:    num(k, 'ValorUnitario'),
    importe:          num(k, 'Importe'),
    descuento:        num(k, 'Descuento'),
  }))

  return {
    uuid:              uuid.toUpperCase(),
    version:           attr(c, 'Version') ?? attr(c, 'version'),
    serie:             attr(c, 'Serie'),
    folio:             attr(c, 'Folio'),
    fecha_emision:     attr(c, 'Fecha'),
    fecha_timbrado:    attr(tfd, 'FechaTimbrado'),
    tipo_comprobante:  attr(c, 'TipoDeComprobante'),
    rfc_emisor:        (attr(emisor, 'Rfc') ?? '').toUpperCase(),
    nombre_emisor:     attr(emisor, 'Nombre'),
    regimen_emisor:    attr(emisor, 'RegimenFiscal'),
    rfc_receptor:      (attr(receptor, 'Rfc') ?? '').toUpperCase(),
    nombre_receptor:   attr(receptor, 'Nombre'),
    regimen_receptor:  attr(receptor, 'RegimenFiscalReceptor'),
    cp_receptor:       attr(receptor, 'DomicilioFiscalReceptor'),
    uso_cfdi:          attr(receptor, 'UsoCFDI'),
    metodo_pago:       attr(c, 'MetodoPago'),
    forma_pago:        attr(c, 'FormaPago'),
    condiciones_pago:  attr(c, 'CondicionesDePago'),
    lugar_expedicion:  attr(c, 'LugarExpedicion'),
    moneda:            attr(c, 'Moneda'),
    tipo_cambio:       num(c, 'TipoCambio'),
    subtotal:          num(c, 'SubTotal'),
    descuento:         num(c, 'Descuento'),
    iva_trasladado:    hayTras ? r2(iva) : null,
    iva_retenido:      hayRet ? r2(ivaRet) : null,
    isr_retenido:      hayRet ? r2(isrRet) : null,
    ieps:              hayTras && ieps ? r2(ieps) : null,
    total:             num(c, 'Total'),
    no_certificado:    attr(c, 'NoCertificado'),
    no_certificado_sat: attr(tfd, 'NoCertificadoSAT'),
    sello_cfd:         attr(tfd, 'SelloCFD'),
    sello_sat:         attr(tfd, 'SelloSAT'),
    rfc_prov_certif:   attr(tfd, 'RfcProvCertif'),
    conceptos,
  }
}

export const TIPO_COMPROBANTE: Record<string, string> = {
  I: 'Ingreso', E: 'Egreso', T: 'Traslado', N: 'Nómina', P: 'Pago',
}
