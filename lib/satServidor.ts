// Solo servidor (rutas /api/sat/*). No importar desde componentes 'use client'.
import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import {
  Fiel, FielRequestBuilder, HttpsWebClient, Service, ServiceEndpoints,
} from '@nodecfdi/sat-ws-descarga-masiva'

// ── Supabase con service_role ────────────────────────────────────────
export function admin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } })
}

// ── Sesión + rol ─────────────────────────────────────────────────────
// Quién puede presentar y descargar solicitudes (rol de cfg.usuarios, ya con variantes por lado)
const ROLES_DESCARGA = new Set([
  'superadmin', 'admin', 'admin_finanzas', 'admin_tesoreria', 'tesoreria',
  'admin_golf', 'admin_golf_finanzas', 'admin_golf_tesoreria',
  'admin_fracc', 'admin_fracc_finanzas', 'admin_fracc_tesoreria',
])

export class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg) }
}

export async function usuarioSat(req: NextRequest, nivel: 'descarga' | 'efirma') {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new HttpError(401, 'Inicia sesión para continuar.')
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Sesión no válida.')
  const { data: u } = await admin().schema('cfg' as any).from('usuarios').select('rol').eq('id', data.user.id).single()
  const rol = (u as any)?.rol as string | undefined
  const ok = nivel === 'efirma' ? rol === 'superadmin' : !!rol && ROLES_DESCARGA.has(rol)
  if (!ok) throw new HttpError(403, nivel === 'efirma'
    ? 'Solo el Super Administrador puede administrar la e.firma.'
    : 'Tu rol no puede descargar CFDI del SAT.')
  return { id: data.user.id, rol: rol! }
}

// ── Cifrado AES-256-GCM de la llave privada y la contraseña ──────────
function llave(): Buffer {
  const s = process.env.SAT_EFIRMA_SECRET
  if (!s || s.length < 32) throw new HttpError(503,
    'Falta la variable SAT_EFIRMA_SECRET (mínimo 32 caracteres) en Vercel. Sin ella no se guarda ni se usa la e.firma.')
  return createHash('sha256').update(s).digest()
}
export function cifrar(datos: Buffer): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', llave(), iv)
  const ct = Buffer.concat([c.update(datos), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}
export function descifrar(b64: string): Buffer {
  const raw = Buffer.from(b64, 'base64')
  const d = createDecipheriv('aes-256-gcm', llave(), raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()])
}

// ── e.firma activa → servicio del SAT ────────────────────────────────
export async function efirmaActiva(db: SupabaseClient) {
  const { data, error } = await db.schema('ctrl' as any).from('sat_efirma')
    .select('*').eq('activo', true).order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const e = (data ?? [])[0]
  if (!e) throw new HttpError(409, 'No hay e.firma cargada. Pide al Super Administrador que la registre en la pestaña e.firma.')
  return e as { id: number; rfc: string; cer_b64: string; key_enc: string; pass_enc: string; vigencia_fin: string | null }
}

export function crearFiel(cer: Buffer, key: Buffer, pass: string): Fiel {
  return Fiel.create(cer.toString('binary'), key.toString('binary'), pass)
}

export async function servicioSat(db: SupabaseClient) {
  const e = await efirmaActiva(db)
  const fiel = crearFiel(Buffer.from(e.cer_b64, 'base64'), descifrar(e.key_enc), descifrar(e.pass_enc).toString('utf8'))
  if (!fiel.isValid()) throw new HttpError(409, 'La e.firma registrada ya no es vigente. Carga la nueva.')
  const service = new Service(new FielRequestBuilder(fiel), new HttpsWebClient(), undefined, ServiceEndpoints.cfdi())
  return { service, rfc: e.rfc }
}

export function respuestaError(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500
  const msg = e instanceof Error ? e.message : String(e)
  return { status, body: { error: msg } }
}
