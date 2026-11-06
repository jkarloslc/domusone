import { supabase } from '@/lib/supabase'

/** fetch que adjunta el token de la sesión de Supabase (Authorization: Bearer) para las rutas /api protegidas. */
export async function fetchConAuth(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  return fetch(input, { ...init, headers })
}
