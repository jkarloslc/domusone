'use client'
// Representación impresa (PDF) de un CFDI a partir de su XML.
// El SAT solo entrega el XML; este PDF se arma en el navegador con jsPDF,
// con la paleta de marca (carbón/plata) y el QR de verificación del SAT.
import { extraerCfdi, CfdiDatos, TIPO_COMPROBANTE } from '@/lib/cfdiXml'

const CARBON: [number, number, number] = [28, 29, 33]
const GRIS:   [number, number, number] = [98, 102, 110]
const PLATA:  [number, number, number] = [201, 204, 211]
const FONDO:  [number, number, number] = [244, 245, 247]

const money = (n: number | null | undefined) =>
  n == null ? '—' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function leerCfdi(xml: string): CfdiDatos {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('El XML está dañado')
  return extraerCfdi(doc)
}

export function urlVerificacionSat(c: CfdiDatos) {
  const tt = (c.total ?? 0).toFixed(6).padStart(25, '0')
  const fe = (c.sello_cfd ?? '').slice(-8)
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${c.uuid}&re=${encodeURIComponent(c.rfc_emisor)}&rr=${encodeURIComponent(c.rfc_receptor)}&tt=${tt}&fe=${encodeURIComponent(fe)}`
}

export async function descargarPdfCfdi(xml: string) {
  const c = leerCfdi(xml)
  const [{ jsPDF }, QR] = await Promise.all([import('jspdf'), import('qrcode')])
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const PW = 215.9, PH = 279.4, M = 14, W = PW - M * 2
  const col = (k: [number, number, number]) => doc.setTextColor(k[0], k[1], k[2])
  const fill = (k: [number, number, number]) => doc.setFillColor(k[0], k[1], k[2])
  const line = (k: [number, number, number]) => doc.setDrawColor(k[0], k[1], k[2])
  const font = (b: boolean, s: number) => { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(s) }
  let y = M

  // Encabezado: emisor a la izquierda, tipo/folio a la derecha
  font(true, 13); col(CARBON)
  const nomEmi = doc.splitTextToSize(c.nombre_emisor ?? c.rfc_emisor, W - 70)
  doc.text(nomEmi, M, y + 4)
  let yE = y + 4 + nomEmi.length * 5
  font(false, 8.5); col(GRIS)
  doc.text(`RFC ${c.rfc_emisor}${c.regimen_emisor ? `  ·  Régimen ${c.regimen_emisor}` : ''}`, M, yE); yE += 4
  if (c.lugar_expedicion) { doc.text(`Lugar de expedición ${c.lugar_expedicion}`, M, yE); yE += 4 }

  font(true, 10); col(CARBON)
  doc.text(`CFDI de ${TIPO_COMPROBANTE[c.tipo_comprobante ?? ''] ?? c.tipo_comprobante ?? ''}`, PW - M, y + 3, { align: 'right' })
  font(false, 7); col(GRIS); doc.text('SERIE Y FOLIO', PW - M, y + 8, { align: 'right' })
  font(true, 13); col(CARBON); doc.text(`${c.serie ?? ''}${c.serie && c.folio ? '-' : ''}${c.folio ?? '—'}`, PW - M, y + 14, { align: 'right' })
  y = Math.max(yE, y + 18) + 3
  line(PLATA); doc.setLineWidth(0.3); doc.line(M, y, PW - M, y); y += 5

  // Bloque de datos: receptor | comprobante
  const campo = (x: number, yy: number, etiqueta: string, valor: string | null | undefined, ancho: number) => {
    font(false, 6.5); col(GRIS); doc.text(etiqueta.toUpperCase(), x, yy)
    font(false, 8.5); col(CARBON)
    const t = doc.splitTextToSize(valor || '—', ancho)
    doc.text(t, x, yy + 3.8)
    return yy + 3.8 + t.length * 3.6 + 1.6
  }
  const half = W / 2 - 4
  let yl = y, yr = y
  yl = campo(M, yl, 'Receptor', c.nombre_receptor, half)
  yl = campo(M, yl, 'RFC receptor', c.rfc_receptor, half)
  yl = campo(M, yl, 'Uso CFDI · Régimen · C.P.', [c.uso_cfdi, c.regimen_receptor, c.cp_receptor].filter(Boolean).join(' · '), half)
  const xr = M + W / 2 + 4
  yr = campo(xr, yr, 'Folio fiscal (UUID)', c.uuid, half)
  yr = campo(xr, yr, 'Fecha de emisión · Timbrado', `${(c.fecha_emision ?? '').replace('T', ' ')} · ${(c.fecha_timbrado ?? '').replace('T', ' ')}`, half)
  yr = campo(xr, yr, 'Método · Forma de pago', [c.metodo_pago, c.forma_pago].filter(Boolean).join(' · '), half)
  yr = campo(xr, yr, 'Moneda', `${c.moneda ?? ''}${c.tipo_cambio && c.tipo_cambio !== 1 ? ` · T.C. ${c.tipo_cambio}` : ''}${c.version ? ` · CFDI ${c.version}` : ''}`, half)
  y = Math.max(yl, yr) + 2

  // Conceptos
  const cols = [
    { t: 'Cant.',       w: 14, a: 'right' as const },
    { t: 'Unidad',      w: 16, a: 'left'  as const },
    { t: 'Clave',       w: 18, a: 'left'  as const },
    { t: 'Descripción', w: W - 14 - 16 - 18 - 26 - 28, a: 'left' as const },
    { t: 'P. unitario', w: 26, a: 'right' as const },
    { t: 'Importe',     w: 28, a: 'right' as const },
  ]
  const encabezado = () => {
    fill(CARBON); doc.rect(M, y, W, 6.5, 'F')
    font(true, 7.5); doc.setTextColor(255, 255, 255)
    let x = M
    for (const k of cols) {
      doc.text(k.t, k.a === 'right' ? x + k.w - 1.5 : x + 1.5, y + 4.4, { align: k.a })
      x += k.w
    }
    y += 6.5
  }
  encabezado()
  c.conceptos.forEach((k, i) => {
    font(false, 7.5)
    const desc = doc.splitTextToSize(k.descripcion ?? '', cols[3].w - 3)
    const h = Math.max(5.5, desc.length * 3.3 + 2.4)
    if (y + h > PH - 50) { doc.addPage(); y = M; encabezado() }
    if (i % 2 === 1) { fill(FONDO); doc.rect(M, y, W, h, 'F') }
    col(CARBON)
    const vals = [
      k.cantidad?.toLocaleString('es-MX', { maximumFractionDigits: 6 }) ?? '',
      k.claveUnidad ?? k.unidad ?? '',
      k.claveProdServ ?? '',
      desc,
      money(k.valorUnitario),
      money(k.importe),
    ]
    let x = M
    cols.forEach((cc, j) => {
      const v = vals[j]
      doc.text(v as any, cc.a === 'right' ? x + cc.w - 1.5 : x + 1.5, y + 3.8, { align: cc.a })
      x += cc.w
    })
    y += h
  })
  line(PLATA); doc.line(M, y, PW - M, y); y += 4

  // Totales + QR
  if (y + 46 > PH - M) { doc.addPage(); y = M }
  const qrData = await QR.toDataURL(urlVerificacionSat(c), { margin: 0, width: 240, color: { dark: '#1C1D21', light: '#FFFFFF' } })
  doc.addImage(qrData, 'PNG', M, y, 30, 30)
  const filasTot: [string, number | null][] = [
    ['Subtotal', c.subtotal],
    ...(c.descuento ? [['Descuento', -c.descuento] as [string, number]] : []),
    ...(c.iva_trasladado != null ? [['IVA trasladado', c.iva_trasladado] as [string, number]] : []),
    ...(c.ieps ? [['IEPS', c.ieps] as [string, number]] : []),
    ...(c.iva_retenido ? [['IVA retenido', -c.iva_retenido] as [string, number]] : []),
    ...(c.isr_retenido ? [['ISR retenido', -c.isr_retenido] as [string, number]] : []),
  ]
  let yt = y + 3
  for (const [k, v] of filasTot) {
    font(false, 8.5); col(GRIS); doc.text(k, PW - M - 34, yt, { align: 'right' })
    col(CARBON); doc.text(money(v), PW - M, yt, { align: 'right' }); yt += 4.6
  }
  fill(CARBON); doc.rect(PW - M - 72, yt - 2.4, 72, 7.5, 'F')
  font(true, 10); doc.setTextColor(255, 255, 255)
  doc.text('Total', PW - M - 34, yt + 2.6, { align: 'right' })
  doc.text(money(c.total), PW - M - 2, yt + 2.6, { align: 'right' })
  if (c.condiciones_pago) { font(false, 7.5); col(GRIS); doc.text(`Condiciones de pago: ${c.condiciones_pago}`, M + 34, y + 3) }
  y = Math.max(y + 33, yt + 9)

  // Sellos y certificados
  const bloque = (etq: string, txt: string | null) => {
    if (!txt) return
    font(false, 6); const t = doc.splitTextToSize(txt, W)
    if (y + 4 + t.length * 2.4 > PH - 12) { doc.addPage(); y = M }
    font(true, 6.5); col(GRIS); doc.text(etq.toUpperCase(), M, y)
    font(false, 6); col(CARBON); doc.text(t, M, y + 3); y += 3 + t.length * 2.4 + 2.5
  }
  font(false, 7); col(GRIS)
  doc.text(`No. certificado emisor ${c.no_certificado ?? '—'}   ·   No. certificado SAT ${c.no_certificado_sat ?? '—'}   ·   RFC PAC ${c.rfc_prov_certif ?? '—'}`, M, y); y += 5
  bloque('Sello digital del CFDI', c.sello_cfd)
  bloque('Sello del SAT', c.sello_sat)
  bloque('Cadena original del complemento de certificación digital del SAT',
    `||1.1|${c.uuid}|${c.fecha_timbrado ?? ''}|${c.rfc_prov_certif ?? ''}|${c.sello_cfd ?? ''}|${c.no_certificado_sat ?? ''}||`)

  const n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p)
    font(false, 6.5); col(GRIS)
    doc.text('Este documento es una representación impresa de un CFDI', M, PH - 7)
    doc.text(`Página ${p} de ${n}`, PW - M, PH - 7, { align: 'right' })
  }
  doc.save(`${c.rfc_emisor}_${c.serie ?? ''}${c.folio ?? ''}_${c.uuid}.pdf`.replace(/_+/g, '_'))
}

export function descargarXml(xml: string, uuid: string) {
  const blob = new Blob([xml], { type: 'application/xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${uuid}.xml`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
