import { NextRequest, NextResponse } from 'next/server'

const FACTURAMA_URL  = 'https://apisandbox.facturama.mx'
const FACTURAMA_USER = 'domusonetest'
const FACTURAMA_PASS = 'domusonetest'

const authHeader = () =>
  'Basic ' + Buffer.from(`${FACTURAMA_USER}:${FACTURAMA_PASS}`).toString('base64')

export async function POST(req: NextRequest) {
  try {
    const { folio_fiscal, rfc_emisor, motivo } = await req.json()

    if (!folio_fiscal) {
      return NextResponse.json({ error: 'folio_fiscal es requerido' }, { status: 400 })
    }

    // Facturama: DELETE /api/cfdis/{tipo}/{id}?motivo={motivo}&folioSustitucion=
    // Primero buscar el Id interno de Facturama por UUID
    const searchRes = await fetch(
      `${FACTURAMA_URL}/api/cfdis/issued?uuid=${folio_fiscal}`,
      { headers: { Authorization: authHeader() } }
    )

    let cfdiId = folio_fiscal  // fallback: usar UUID directamente

    if (searchRes.ok) {
      const searchData = await searchRes.json()
      if (searchData?.Id) cfdiId = searchData.Id
    }

    // Cancelar el CFDI
    const cancelRes = await fetch(
      `${FACTURAMA_URL}/api/cfdis/issued/${cfdiId}?motivo=${motivo}&folioSustitucion=`,
      {
        method:  'DELETE',
        headers: { Authorization: authHeader() },
      }
    )

    if (!cancelRes.ok) {
      const err = await cancelRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.Message ?? `Error HTTP ${cancelRes.status}` },
        { status: 400 }
      )
    }

    const acuse = await cancelRes.text().catch(() => '')

    return NextResponse.json({ acuse: acuse || `CANCELADO-${folio_fiscal}` })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
