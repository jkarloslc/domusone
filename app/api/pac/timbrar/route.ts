import { NextRequest, NextResponse } from 'next/server'

// ── Credenciales Facturama Sandbox ────────────────────────────
// Para producción: cambiar URL a https://api.facturama.mx
const FACTURAMA_URL  = 'https://apisandbox.facturama.mx'
const FACTURAMA_USER = 'domusonetest'    // ← usuario sandbox Facturama
const FACTURAMA_PASS = 'domusonetest'    // ← contraseña sandbox Facturama
// ─────────────────────────────────────────────────────────────

const authHeader = () =>
  'Basic ' + Buffer.from(`${FACTURAMA_USER}:${FACTURAMA_PASS}`).toString('base64')

export async function POST(req: NextRequest) {
  try {
    const datos = await req.json()

    // ── Construir payload CFDI 4.0 para Facturama ─────────────
    const payload = {
      Receiver: {
        Rfc:             datos.rfc_receptor,
        Name:            datos.razon_social_receptor,
        CfdiUse:         datos.uso_cfdi,
        FiscalRegime:    datos.regimen_fiscal_receptor ?? '616',
        TaxZipCode:      datos.cp_receptor ?? '76000',
      },
      CfdiType:    'I',        // Ingreso
      PaymentForm: datos.forma_pago,
      PaymentMethod: datos.metodo_pago,
      Currency:    datos.moneda ?? 'MXN',
      Serie:       datos.serie,
      Folio:       datos.folio_interno,
      Exportation: '01',       // No aplica
      Items: datos.conceptos.map((c: any) => ({
        ProductCode:    c.clave_prod_serv,
        IdentificationNumber: datos.folio_interno,
        Description:    c.descripcion,
        Unit:           'E48',
        UnitCode:       'E48',
        UnitPrice:      c.precio_unitario,
        Quantity:       c.cantidad,
        Subtotal:       c.importe,
        TaxObject:      c.objeto_imp ?? '01',
        Total:          c.importe,
        // Solo agregar impuestos si objeto_imp === '02'
        ...(c.objeto_imp === '02' && c.tasa_iva > 0 ? {
          Taxes: [{
            Total:   c.importe * c.tasa_iva,
            Name:    'IVA',
            Base:    c.importe,
            Rate:    c.tasa_iva,
            IsRetention: false,
          }]
        } : {})
      })),
    }

    // ── Llamar a Facturama ─────────────────────────────────────
    const res = await fetch(`${FACTURAMA_URL}/3/cfdis`, {
      method:  'POST',
      headers: {
        'Authorization':  authHeader(),
        'Content-Type':   'application/json',
      },
      body: JSON.stringify(payload),
    })

    const facturaamaResp = await res.json()

    if (!res.ok) {
      const msg = facturaamaResp?.ModelState
        ? Object.values(facturaamaResp.ModelState).flat().join('; ')
        : facturaamaResp?.Message ?? JSON.stringify(facturaamaResp)
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const cfdiId = facturaamaResp.Id

    // ── Descargar PDF y XML ────────────────────────────────────
    const [xmlRes, pdfRes] = await Promise.all([
      fetch(`${FACTURAMA_URL}/cfdi/-/xml/${cfdiId}`, { headers: { Authorization: authHeader() } }),
      fetch(`${FACTURAMA_URL}/cfdi/-/pdf/${cfdiId}`, { headers: { Authorization: authHeader() } }),
    ])

    const xmlText = xmlRes.ok ? await xmlRes.text() : null
    const pdfB64  = pdfRes.ok ? await pdfRes.text() : null    // Facturama devuelve base64

    // Convertir PDF base64 a data URL para almacenar o mostrar
    const pdfUrl  = pdfB64 ? `data:application/pdf;base64,${pdfB64}` : null

    return NextResponse.json({
      folio_fiscal:  facturaamaResp.Complement?.TaxStamp?.Uuid ?? facturaamaResp.Id,
      xml_cfdi:      xmlText,
      pdf_url:       pdfUrl,
      pac_respuesta: facturaamaResp,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
