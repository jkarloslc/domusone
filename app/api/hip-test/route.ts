import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Test 1: sin Accept-Profile
  const r1 = await fetch(`${url}/rest/v1/cat_caballerizas?limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  })

  // Test 2: con Accept-Profile: hip
  const r2 = await fetch(`${url}/rest/v1/cat_caballerizas?limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'hip' }
  })

  // Test 3: con Accept-Profile: public
  const r3 = await fetch(`${url}/rest/v1/cat_caballerizas?limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'public' }
  })

  const body1 = await r1.text()
  const body2 = await r2.text()
  const body3 = await r3.text()

  return NextResponse.json({
    test1_noProfile:    { status: r1.status, body: body1.slice(0, 200) },
    test2_acceptHip:    { status: r2.status, body: body2.slice(0, 200) },
    test3_acceptPublic: { status: r3.status, body: body3.slice(0, 200) },
  })
}
