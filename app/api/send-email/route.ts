import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

// Leer config SMTP desde cfg.configuracion
async function getSmtpConfig() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const db = supabase.schema('cfg' as any)
  const { data } = await db.from('configuracion')
    .select('clave, valor')
    .in('clave', ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from_name', 'smtp_from_email'])

  const cfg: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { cfg[r.clave] = r.valor ?? '' })
  return cfg
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { to, subject, html, text } = body as {
      to: string | string[]
      subject: string
      html: string
      text?: string
    }

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'Faltan campos requeridos: to, subject, html' }, { status: 400 })
    }

    const cfg = await getSmtpConfig()

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return NextResponse.json({
        error: 'Servidor SMTP no configurado. Ve a Configuración → Servidor de Correo y completa los datos.'
      }, { status: 503 })
    }

    const transporter = nodemailer.createTransport({
      host:   cfg.smtp_host,
      port:   Number(cfg.smtp_port) || 587,
      secure: cfg.smtp_secure === 'true',
      auth: {
        user: cfg.smtp_user,
        pass: cfg.smtp_pass,
      },
      tls: { rejectUnauthorized: false },
    })

    const fromName  = cfg.smtp_from_name  || 'DomusOne'
    const fromEmail = cfg.smtp_from_email || cfg.smtp_user

    const info = await transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to:      Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ''),
    })

    return NextResponse.json({ ok: true, messageId: info.messageId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error al enviar el correo' }, { status: 500 })
  }
}
