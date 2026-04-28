'use client'
import { useState, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { X, CheckCircle, XCircle, ExternalLink, DollarSign, Printer, FileText, Download } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { folioGen, fmt, nextFolio } from '../types'

type Props = {
  reembolso: any
  canAuth: boolean
  onClose: () => void
  onUpdated: () => void
}

const CAT_COLORS: Record<string, string> = {
  'Producto':    '#2563eb',
  'Servicio':    '#7c3aed',
  'Viáticos':   '#d97706',
  'Combustible': '#dc2626',
  'Otro':        '#475569',
}

export default function ReembolsoDetail({ reembolso: r, canAuth, onClose, onUpdated }: Props) {
  const { authUser } = useAuth()
  const [detalles,  setDetalles]  = useState<any[]>([])
  const [ccMap,     setCCMap]     = useState<Record<number, string>>({})
  const [secMap,    setSecMap]    = useState<Record<number, string>>({})
  const [frtMap,    setFrtMap]    = useState<Record<number, string>>({})
  const [notasAuth, setNotasAuth] = useState('')
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    Promise.all([
      dbComp.from('reembolsos_detalle').select('*').eq('id_reembolso_fk', r.id).eq('activo', true),
      dbCfg.from('centros_costo').select('id, nombre'),
      dbCfg.from('secciones').select('id, nombre'),
      dbCfg.from('frentes').select('id, nombre'),
    ]).then(([det, cc, sec, frt]) => {
      setDetalles(det.data ?? [])
      const toMap = (arr: any[]) => Object.fromEntries((arr ?? []).map((x: any) => [x.id, x.nombre]))
      setCCMap(toMap(cc.data ?? []))
      setSecMap(toMap(sec.data ?? []))
      setFrtMap(toMap(frt.data ?? []))
    })
  }, [r.id])

  const handleAuth = async (aprobado: boolean) => {
    setLoading(true)
    if (aprobado) {
      // 1. Actualizar reembolso
      await dbComp.from('reembolsos').update({
        status:     'Autorizado',
        notas_auth: notasAuth.trim() || null,
      }).eq('id', r.id)

      // 2. Generar OP automática al usuario como beneficiario
      let folio: string
      try { folio = await nextFolio(dbComp, 'OP') } catch (e: any) { alert((e as Error).message); return }

      const { data: opData } = await dbComp.from('ordenes_pago').insert({
        folio,
        concepto:         `Reembolso caja chica ${r.folio ?? '#' + r.id} — ${r.usuario_nombre ?? r.id_usuario_fk}`,
        monto:            r.total,
        fecha_vencimiento: new Date().toISOString().slice(0, 10),
        forma_pago:       'Cheque',
        status:           'Pendiente',      // ya autorizado, va directo a CXP
        tipo_op:          'Reembolso',
        id_reembolso_fk:  r.id,
        // CC/Sección/Frente = null (la trazabilidad está en reembolsos_detalle)
        id_centro_costo_fk: null,
        id_seccion_fk:      null,
        id_frente_fk:       null,
        created_by:       authUser?.nombre ?? null,
      }).select('id').single()

      // 3. Enlazar OP al reembolso
      if (opData) {
        await dbComp.from('reembolsos').update({ id_op_fk: opData.id, status: 'Autorizado' }).eq('id', r.id)
      }

    } else {
      await dbComp.from('reembolsos').update({
        status:     'Rechazado',
        notas_auth: notasAuth.trim() || null,
      }).eq('id', r.id)
    }
    setLoading(false)
    onUpdated()
  }

  const canAuthorize = canAuth && r.status === 'Pendiente Auth'

  const imprimir = async () => {
    // Cargar configuración de organización
    let orgNombre    = 'Organización'
    let orgSubtitulo = ''
    let orgLogo      = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((row: any) => {
        if (row.clave === 'org_nombre')    orgNombre    = row.valor ?? orgNombre
        if (row.clave === 'org_subtitulo') orgSubtitulo = row.valor ?? ''
        if (row.clave === 'org_logo_url')  orgLogo      = row.valor ?? ''
      })
    } catch {}

    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:48px;height:48px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;">🏢</div>`

    const statusLabel: Record<string, string> = {
      'Borrador': 'BORRADOR', 'Pendiente Auth': 'PENDIENTE AUTORIZACIÓN',
      'Autorizado': 'AUTORIZADO', 'Pagado': 'PAGADO', 'Rechazado': 'RECHAZADO',
    }
    const statusColor: Record<string, string> = {
      'Borrador': '#64748b', 'Pendiente Auth': '#d97706',
      'Autorizado': '#059669', 'Pagado': '#2563eb', 'Rechazado': '#dc2626',
    }

    const filasDetalle = detalles.map((d, i) => `
      <tr>
        <td style="text-align:center;color:#64748b">${i + 1}</td>
        <td><strong>${d.concepto}</strong></td>
        <td style="text-align:center">${d.categoria}</td>
        <td style="text-align:center">${d.tipo_comprobante}${d.num_comprobante ? `<br/><span style="font-family:monospace;font-size:10px;color:#64748b">${d.num_comprobante}</span>` : ''}</td>
        <td style="font-size:11px;color:#475569">
          ${d.id_centro_costo_fk ? `<span class="chip">${ccMap[d.id_centro_costo_fk] ?? '—'}</span>` : ''}
          ${d.id_seccion_fk      ? `<span class="chip">${secMap[d.id_seccion_fk] ?? '—'}</span>`      : ''}
          ${d.id_frente_fk       ? `<span class="chip">${frtMap[d.id_frente_fk] ?? '—'}</span>`       : ''}
        </td>
        <td style="text-align:right;font-weight:600">${fmt(d.monto)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="es"><head>
  <meta charset="UTF-8"/>
  <title>Reembolso ${r.folio ?? '#' + r.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 36px 40px; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 20px; }
    .org-nombre { font-size: 17px; font-weight: 700; color: #0D4F80; }
    .org-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .doc-block { margin-left: auto; text-align: right; }
    .doc-title { font-size: 15px; font-weight: 700; color: #0D4F80; }
    .doc-folio { font-size: 12px; color: #64748b; margin-top: 3px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 20px; }
    .meta-item { padding: 10px 14px; border-right: 1px solid #e2e8f0; }
    .meta-item:last-child { border-right: none; }
    .meta-label { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 3px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #1e293b; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
      color: ${statusColor[r.status] ?? '#64748b'}; background: ${(statusColor[r.status] ?? '#64748b') + '18'};
      border: 1px solid ${(statusColor[r.status] ?? '#64748b') + '40'}; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    thead th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
      padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; color: #475569; }
    tbody td { border: 1px solid #e2e8f0; padding: 9px 10px; vertical-align: top; font-size: 12px; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .chip { display: inline-block; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
      border-radius: 10px; padding: 1px 7px; font-size: 10px; margin: 1px 2px 1px 0; }
    .total-row td { border: 1px solid #e2e8f0; padding: 10px 12px; }
    .total-label { background: #eff6ff; font-size: 11px; font-weight: 700; color: #0D4F80; text-transform: uppercase; letter-spacing: .06em; text-align: right; }
    .total-value { background: #eff6ff; font-size: 18px; font-weight: 700; color: #0D4F80; text-align: right; }
    .obs { margin: 14px 0; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #cbd5e1; font-size: 12px; color: #475569; border-radius: 0 4px 4px 0; }
    .notas-auth { margin: 10px 0; padding: 10px 14px; background: #fefce8; border-left: 3px solid #fbbf24; font-size: 12px; color: #78350f; border-radius: 0 4px 4px 0; }
    .firmas { display: flex; gap: 50px; margin-top: 56px; justify-content: center; }
    .firma { text-align: center; width: 160px; }
    .firma-linea { border-top: 1px solid #1e293b; padding-top: 8px; font-size: 10px; color: #64748b; }
    @page { margin: 1.2cm; }
    @media print { body { padding: 0; } }
  </style>
</head><body>

  <!-- Encabezado organización -->
  <div class="header">
    ${logoHtml}
    <div>
      <div class="org-nombre">${orgNombre}</div>
      ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
    </div>
    <div class="doc-block">
      <div class="doc-title">Comprobante de Reembolso</div>
      <div class="doc-title" style="font-size:12px;color:#475569;font-weight:400;">Caja Chica</div>
      <div class="doc-folio">Folio: <strong>${r.folio ?? '#' + r.id}</strong></div>
    </div>
  </div>

  <!-- Metadatos -->
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Solicitante</div>
      <div class="meta-value">${r.usuario_nombre ?? r.id_usuario_fk}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Fecha</div>
      <div class="meta-value">${r.fecha}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Status</div>
      <div class="meta-value"><span class="status-badge">${statusLabel[r.status] ?? r.status}</span></div>
    </div>
  </div>

  ${r.observaciones ? `<div class="obs"><strong>Concepto general:</strong> ${r.observaciones}</div>` : ''}

  <!-- Tabla de detalle -->
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>Concepto</th>
        <th style="width:90px;text-align:center">Categoría</th>
        <th style="width:120px;text-align:center">Comprobante</th>
        <th>CC / Sección / Frente</th>
        <th style="width:90px;text-align:right">Monto</th>
      </tr>
    </thead>
    <tbody>
      ${filasDetalle}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5" class="total-label">Total Reembolso</td>
        <td class="total-value">${fmt(r.total)}</td>
      </tr>
    </tfoot>
  </table>

  ${r.notas_auth ? `<div class="notas-auth"><strong>Notas del autorizador:</strong> ${r.notas_auth}</div>` : ''}
  ${r.id_op_fk   ? `<p style="font-size:11px;color:#059669;margin-top:8px;">✓ Orden de Pago generada: #${r.id_op_fk}</p>` : ''}

  <!-- Firmas -->
  <div class="firmas">
    <div class="firma"><div class="firma-linea">Elaboró</div></div>
    <div class="firma"><div class="firma-linea">Autorizó</div></div>
    <div class="firma"><div class="firma-linea">Recibió / Conforme</div></div>
  </div>

</body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>
              {r.folio ?? `Reembolso #${r.id}`}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${r.status === 'Pagado' ? 'badge-vendido' : r.status === 'Autorizado' ? 'badge-libre' : r.status === 'Pendiente Auth' ? 'badge-bloqueado' : r.status === 'Rechazado' ? 'badge-cancelado' : 'badge-default'}`}>
                {r.status}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.fecha}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.usuario_nombre ?? r.id_usuario_fk}</span>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Observaciones */}
          {r.observaciones && (
            <div style={{ padding: '10px 14px', background: 'var(--surface-700)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              {r.observaciones}
            </div>
          )}

          {/* Detalle de gastos */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              Detalle de gastos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detalles.map((d, i) => (
                <div key={i} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-700)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.concepto}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: (CAT_COLORS[d.categoria] ?? '#475569') + '20', color: CAT_COLORS[d.categoria] ?? '#475569', fontWeight: 600 }}>
                          {d.categoria}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.tipo_comprobante}</span>
                        {d.num_comprobante && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{d.num_comprobante}</span>}
                      </div>
                      {/* CC-Sección-Frente */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {d.id_centro_costo_fk && <span style={{ fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 7px', borderRadius: 10 }}>{ccMap[d.id_centro_costo_fk]}</span>}
                        {d.id_seccion_fk      && <span style={{ fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 7px', borderRadius: 10 }}>{secMap[d.id_seccion_fk]}</span>}
                        {d.id_frente_fk       && <span style={{ fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 7px', borderRadius: 10 }}>{frtMap[d.id_frente_fk]}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold-light)' }}>
                        ${(d.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                      {d.url_comprobante && (
                        <div style={{ marginTop: 8 }}>
                          {/\.(jpg|jpeg|png|gif|webp)$/i.test(d.url_comprobante) ? (
                            <a href={d.url_comprobante} target="_blank" rel="noreferrer">
                              <img
                                src={d.url_comprobante}
                                alt="Comprobante"
                                style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 6, border: '1px solid var(--border)', objectFit: 'contain', display: 'block' }}
                              />
                            </a>
                          ) : (
                            <a href={d.url_comprobante} target="_blank" rel="noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-800)', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                              <FileText size={13} style={{ color: '#dc2626' }} />
                              {decodeURIComponent(d.url_comprobante.split('/').pop() ?? 'Comprobante')}
                              <Download size={11} style={{ color: 'var(--text-muted)', marginLeft: 2 }} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold-light)' }}>
                ${(r.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* OP generada */}
          {r.id_op_fk && (
            <div style={{ padding: '10px 14px', background: '#0f2a1a', border: '1px solid #166534', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={14} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: 13, color: '#4ade80' }}>OP generada: #{r.id_op_fk}</span>
            </div>
          )}

          {/* Notas de auth si ya fue procesado */}
          {r.notas_auth && (
            <div style={{ padding: '10px 14px', background: 'var(--surface-700)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notas del autorizador</div>
              <div style={{ fontSize: 13 }}>{r.notas_auth}</div>
            </div>
          )}

          {/* Sección de autorización */}
          {canAuthorize && (
            <div style={{ padding: '14px', background: '#1a1a2e', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                Autorización
              </div>
              <textarea className="input" rows={2} value={notasAuth} onChange={e => setNotasAuth(e.target.value)}
                placeholder="Comentario opcional (rechazo o aprobación)…"
                style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ color: '#dc2626', borderColor: '#dc2626' }}
                  onClick={() => handleAuth(false)} disabled={loading}>
                  <XCircle size={13} /> Rechazar
                </button>
                <button className="btn-primary" onClick={() => handleAuth(true)} disabled={loading}>
                  <CheckCircle size={13} /> Autorizar y generar OP
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={imprimir} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={13} /> Imprimir
          </button>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
