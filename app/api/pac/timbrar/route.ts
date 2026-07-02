import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Leer credenciales PAC desde cfg.configuracion ─────────────
// IMPORTANTE: usamos la service role key para saltarnos RLS en cfg.configuracion
// (la anon key sin sesión autenticada no puede leer esa tabla)
async function getPacConfig() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const db = supabase.schema('cfg' as any)
  const { data, error } = await db
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['pac_url', 'pac_user', 'pac_pass', 'org_cp_fiscal'])

  if (error) throw new Error(`No se pudo leer cfg.configuracion: ${error.message}`)

  const cfg: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { cfg[r.clave] = r.valor ?? '' })

  return {
    // Normalizamos URL: quitamos trailing slash para evitar URLs dobles como '.mx//3/cfdis'
    url:      (cfg.pac_url || 'https://apisandbox.facturama.mx').replace(/\/$/, ''),
    user:     cfg.pac_user     || 'domusonetest',
    pass:     cfg.pac_pass     || 'domusonetest',
    cp_fiscal: cfg.org_cp_fiscal || '',
  }
}

export async function POST(req: NextRequest) {
  try {
    const datos = await req.json()
    const pac   = await getPacConfig()

    const authHeader = 'Basic ' + Buffer.from(`${pac.user}:${pac.pass}`).toString('base64')

    // ── Construir payload CFDI 4.0 para Facturama ─────────────
    // ExpeditionPlace = LugarExpedicion (C.P. fiscal del emisor) — campo obligatorio SAT
    const cpExpedicion = datos.cp_emisor || pac.cp_fiscal || '76900'

    // ── GlobalInformation — obligatorio cuando RFC = XAXX010101000 ──
    // SAT CFDI 4.0: factura global requiere Periodicidad, Meses y Año
    const esPublicoGeneral = datos.rfc_receptor === 'XAXX010101000'
    const ahora = new Date()
    const globalInfo = esPublicoGeneral ? {
      Periodicity: '04',                                        // 04 = Mensual
      Months:      String(ahora.getMonth() + 1).padStart(2, '0'),  // '01'–'12'
      Year:        ahora.getFullYear(),
    } : undefined

    const payload = {
      ExpeditionPlace: cpExpedicion,
      ...(globalInfo ? { GlobalInformation: globalInfo } : {}),
      Receiver: {
        Rfc:          datos.rfc_receptor,
        Name:         datos.razon_social_receptor,
        CfdiUse:      datos.uso_cfdi,
        FiscalRegime: datos.regimen_fiscal_receptor ?? '616',
        TaxZipCode:   datos.cp_receptor ?? cpExpedicion,
      },
      CfdiType:      'I',   // Ingreso
      PaymentForm:   datos.forma_pago,
      PaymentMethod: datos.metodo_pago,
      Currency:      datos.moneda ?? 'MXN',
      // Serie es opcional en CFDI 4.0; solo se envía si está configurada
      // en Facturama como sucursal (de lo contrario el PAC rechaza la petición)
      ...(datos.serie ? { Serie: datos.serie } : {}),
      Folio:         datos.folio_interno,
      Exportation:   '01',  // No aplica
      Items: datos.conceptos.map((c: any) => {
        const conIva   = c.objeto_imp === '02' && c.tasa_iva > 0
        // Redondear a 6 decimales para cumplir reglas SAT / Facturama
        const r6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000
        const taxTotal = conIva ? r6(c.importe * c.tasa_iva) : 0
        // Total del concepto = Subtotal + IVA  (si no hay IVA, igual al Subtotal)
        const itemTotal = r6(c.importe + taxTotal)

        return {
          ProductCode:          c.clave_prod_serv,
          IdentificationNumber: datos.folio_interno,
          Description:          c.descripcion,
          Unit:                 'E48',
          UnitCode:             'E48',
          UnitPrice:            c.precio_unitario,
          Quantity:             c.cantidad,
          Subtotal:             c.importe,
          TaxObject:            c.objeto_imp ?? '01',
          Total:                itemTotal,
          ...(conIva ? {
            Taxes: [{
              Total:       taxTotal,
              Name:        'IVA',
              Base:        c.importe,
              Rate:        c.tasa_iva,
              IsRetention: false,
            }]
          } : {})
        }
      }),
    }

    // ── Debug: confirmar qué credenciales y URL se están usando ──
    console.log('[PAC/timbrar] url:', pac.url, '| user:', pac.user,
      '| pass_len:', pac.pass.length,
      '| pass_first:', pac.pass[0] ?? '(vacío)',
      '| pass_last:', pac.pass[pac.pass.length - 1] ?? '(vacío)',
      '| cp_fiscal:', pac.cp_fiscal)
    console.log('[PAC/timbrar] payload:', JSON.stringify(payload, null, 2))

    // ── Llamar al PAC ──────────────────────────────────────────
    const res = await fetch(`${pac.url}/3/cfdis`, {
      method:  'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    // Facturama puede responder con HTML (ej. error 500 de servidor) en lugar de JSON.
    // Parseamos con seguridad para evitar que un throw aquí cause un 500 sin detalle.
    let pacResp: any = null
    const rawText = await res.text()
    console.log('[PAC/timbrar] http_status:', res.status, '| raw_response:', rawText.substring(0, 500))
    try { pacResp = JSON.parse(rawText) } catch { pacResp = { _raw: rawText } }

    if (!res.ok) {
      // Extraer mensaje de error de cualquier formato que use Facturama
      let msg: string
      if (pacResp?.ModelState) {
        msg = Object.values(pacResp.ModelState).flat().join('; ')
      } else if (pacResp?.Message) {
        msg = pacResp.Message
      } else if (pacResp?._raw) {
        msg = pacResp._raw
      } else {
        msg = JSON.stringify(pacResp)
      }
      // Siempre incluir el status HTTP para ayudar al diagnóstico
      const fullMsg = `[${res.status}] ${msg || 'Sin detalle del PAC'}`
      console.error('[PAC/timbrar] error:', fullMsg)
      return NextResponse.json({ error: fullMsg, http_status: res.status }, { status: 400 })
    }

    const cfdiId      = pacResp.Id
    // Facturama expone /cfdi/{tipo}/{id} solo con el UUID fiscal (no acepta
    // el Id interno) — probado directo contra su API: /cfdi/-/{tipo}/{id}
    // (con guion) responde "El tipo pdf no es válido" siempre, sin importar
    // el id; /cfdi/{tipo}/{id} sin guion es la ruta correcta y exige UUID.
    const folioFiscal = pacResp.Complement?.TaxStamp?.Uuid ?? cfdiId

    // ── Descargar PDF y XML ────────────────────────────────────
    // Facturama envuelve el contenido en JSON: {ContentEncoding, ContentType, Content}
    // donde Content siempre viene en base64 (tanto para xml como para pdf).
    const extraerContenido = (raw: string): string => {
      try {
        const parsed = JSON.parse(raw)
        return parsed?.Content ?? raw
      } catch { return raw }
    }

    const [xmlRes, pdfRes] = await Promise.all([
      fetch(`${pac.url}/cfdi/xml/${folioFiscal}`, { headers: { Authorization: authHeader } }),
      fetch(`${pac.url}/cfdi/pdf/${folioFiscal}`, { headers: { Authorization: authHeader } }),
    ])

    const xmlB64  = xmlRes.ok ? extraerContenido(await xmlRes.text()) : null
    const xmlText = xmlB64 ? Buffer.from(xmlB64, 'base64').toString('utf-8') : null
    const pdfB64  = pdfRes.ok ? extraerContenido(await pdfRes.text()) : null

    const pdfUrl  = pdfB64 ? `data:application/pdf;base64,${pdfB64}` : null

    return NextResponse.json({
      folio_fiscal:  folioFiscal,
      pac_cfdi_id:   cfdiId,   // ID interno Facturama para re-descargar
      xml_cfdi:      xmlText,
      pdf_url:       pdfUrl,
      pac_respuesta: pacResp,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
