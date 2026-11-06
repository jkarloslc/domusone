import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

// Leer config SMTP desde cfg.configuracion
// perfil: 'default' (facturación/general) o 'intercambios' (claves smtp_intercambios_*)
async function getSmtpConfig(perfil: 'default' | 'intercambios' = 'default') {
  const pre = perfil === 'intercambios' ? 'smtp_intercambios_' : 'smtp_'
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const db = supabase.schema('cfg' as any)
  const { data } = await db.from('configuracion')
    .select('clave, valor')
    .in('clave', ['host', 'port', 'secure', 'user', 'pass', 'from_name', 'from_email'].map(k => pre + k))

  const cfg: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { cfg['smtp_' + String(r.clave).slice(pre.length)] = r.valor ?? '' })
  return cfg
}

// Convierte un data URL (data:...;base64,XXX) al contenido base64 puro
function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], base64: match[2] }
}

type Adjunto = {
  filename:    string
  content:     string   // texto plano (XML) o base64 (PDF)
  encoding?:   'base64'
  contentType: string
}

// Exige una sesión válida de Supabase (token en Authorization: Bearer)
async function sesionValida(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data, error } = await supabase.auth.getUser(token)
  return !error && !!data.user
}

export async function POST(req: NextRequest) {
  try {
    if (!(await sesionValida(req))) {
      return NextResponse.json({ error: 'No autorizado: inicia sesión para enviar correos.' }, { status: 401 })
    }
    const body = await req.json()
    const { to, cc, perfil, subject, html, text, adjuntos } = body as {
      cc?:       string | string[]
      perfil?:   'default' | 'intercambios'
      to:        string | string[]
      subject:   string
      html:      string
      text?:     string
      adjuntos?: Adjunto[]
    }

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'Faltan campos requeridos: to, subject, html' }, { status: 400 })
    }

    const cfg = await getSmtpConfig(perfil === 'intercambios' ? 'intercambios' : 'default')

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return NextResponse.json({
        error: 'Servidor SMTP no configurado. Ve a Configuración → Servidor de Correo' + (perfil === 'intercambios' ? ' (campos "Intercambios")' : '') + ' y completa los datos.'
      }, { status: 503 })
    }

    const transporter = nodemailer.createTransport({
      host:   cfg.smtp_host,
      port:   Number(cfg.smtp_port) || 587,
      secure: cfg.smtp_secure === 'true',
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
      tls:  { rejectUnauthorized: false },
    })

    const fromName  = cfg.smtp_from_name  || (perfil === 'intercambios' ? 'Balvanera Golf' : 'DomusOne')
    const fromEmail = cfg.smtp_from_email || cfg.smtp_user

    // Construir adjuntos para nodemailer
    const attachments = (adjuntos ?? []).map((a: Adjunto) => ({
      filename:    a.filename,
      content:     Buffer.from(a.content, a.encoding === 'base64' ? 'base64' : 'utf-8'),
      contentType: a.contentType,
    }))

    const info = await transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to:      Array.isArray(to) ? to.join(', ') : to,
      ...(cc && (Array.isArray(cc) ? cc.length : String(cc).trim()) ? { cc: Array.isArray(cc) ? cc.join(', ') : cc } : {}),
      subject,
      html,
      text:    text ?? html.replace(/<[^>]+>/g, ''),
      attachments,
    })

    const aceptados = (info.accepted ?? []).map(String)
    const rechazados = (info.rejected ?? []).map(String)
    if (aceptados.length === 0) {
      return NextResponse.json({ error: `El servidor rechazó a todos los destinatarios: ${rechazados.join(', ') || 'sin detalle'}` }, { status: 502 })
    }
    return NextResponse.json({
      ok: true, messageId: info.messageId, aceptados, rechazados,
      respuesta: info.response, remitente: fromEmail,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error al enviar el correo' }, { status: 500 })
  }
}
