'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { Receipt, Printer, RefreshCw, FileText, XCircle } from 'lucide-react'

type DetRecibo = {
  id: number
  concepto: string
  tipo: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
}

type Recibo = {
  id: number
  folio: string
  fecha_recibo: string
  subtotal: number
  descuento: number
  total: number
  forma_pago_nombre: string | null
  referencia_pago: string | null
  observaciones: string | null
  usuario_cobra: string | null
  status: string
  recibos_golf_det: DetRecibo[]
}

const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fechaFmt = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

const TIPOS_LABEL: Record<string, string> = {
  INSCRIPCION: 'Inscripción', MENSUALIDAD: 'Mensualidad', PENSION_CARRITO: 'Pensión Carrito',
}

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  VIGENTE:   { bg: '#dcfce7', color: '#15803d', label: 'Vigente' },
  CANCELADO: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelado' },
}

type Props = {
  socioId: number
  nombreSocio: string
}

export default function TabRecibosSocio({ socioId, nombreSocio }: Props) {
  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro]   = useState<'VIGENTE' | 'CANCELADO' | 'TODOS'>('VIGENTE')
  const [detalle, setDetalle] = useState<Recibo | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await dbGolf.from('recibos_golf')
      .select(`
        id, folio, fecha_recibo, subtotal, descuento, total,
        forma_pago_nombre, referencia_pago, observaciones, usuario_cobra, status,
        recibos_golf_det(id, concepto, tipo, periodo, monto_original, descuento, monto_final)
      `)
      .eq('id_socio_fk', socioId)
      .order('fecha_recibo', { ascending: false })
    setRecibos((data as unknown as Recibo[]) ?? [])
    setLoading(false)
  }, [socioId])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = filtro === 'TODOS' ? recibos : recibos.filter(r => r.status === filtro)
  const totalVigente = recibos.filter(r => r.status === 'VIGENTE').reduce((a, r) => a + r.total, 0)
  const countVigente = recibos.filter(r => r.status === 'VIGENTE').length

  const handlePrint = async (r: Recibo) => {
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { data: cfgRows } = await dbCfg.from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((row: any) => {
        if (row.clave === 'org_nombre')    orgNombre    = row.valor ?? orgNombre
        if (row.clave === 'org_subtitulo') orgSubtitulo = row.valor ?? ''
        if (row.clave === 'org_logo_url')  orgLogo      = row.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
    const win = window.open('', '_blank', 'width=750,height=900')
    if (!win) return
    const rows = r.recibos_golf_det.map(d => `
      <tr>
        <td>${d.concepto}</td>
        <td>${TIPOS_LABEL[d.tipo] ?? d.tipo}</td>
        <td>${d.periodo ?? '—'}</td>
        <td class="right">${fmt$(d.monto_original)}</td>
        <td class="right">${d.descuento > 0 ? fmt$(d.descuento) : '—'}</td>
        <td class="right" style="font-weight:600">${fmt$(d.monto_final)}</td>
      </tr>`).join('')
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Recibo ${r.folio}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:32px}
        .org-header{display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #0D4F80;margin-bottom:18px}
        .org-nombre{font-size:18px;font-weight:700;color:#0D4F80;margin:0 0 2px}
        .org-sub{font-size:11px;color:#64748b}
        .doc-title{font-size:14px;font-weight:600;color:#0D4F80;margin-bottom:2px}
        .section{margin-bottom:18px}
        .section-title{font-size:10px;font-weight:700;color:#0D4F80;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #bfdbfe;padding-bottom:4px}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
        .info-item label{font-size:10px;color:#64748b;display:block;margin-bottom:1px}
        .info-item span{font-size:12px;font-weight:500}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{padding:7px 10px;background:#f1f5f9;color:#0D4F80;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em;border:1px solid #e2e8f0}
        td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}
        tr:last-child td{border-bottom:none}
        .right{text-align:right}
        .totales{margin-left:auto;width:260px}
        .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
        .totales-row.total{font-weight:700;font-size:15px;border-top:2px solid #0D4F80;padding-top:8px;margin-top:4px;color:#0D4F80}
        .pago-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px}
        .pago-label{font-size:10px;color:#0D4F80;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
        .pago-val{font-size:14px;font-weight:700;color:#0D4F80}
        .firma-area{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
        .firma-line{border-top:1px solid #1e293b;padding-top:4px;font-size:10px;color:#64748b;text-align:center}
        .footer{margin-top:32px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px}
        .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600}
        .badge-cancel{background:#fee2e2;color:#dc2626}
        @page{margin:1.2cm}
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">Recibo de Cobro</div>
          <div style="font-size:11px;color:#64748b">Folio: <strong>${r.folio}</strong></div>
          <div style="font-size:11px;color:#64748b">${fechaFmt(r.fecha_recibo)}</div>
          ${r.status === 'CANCELADO' ? '<span class="badge badge-cancel" style="margin-top:4px">CANCELADO</span>' : ''}
        </div>
      </div>
      <div class="section">
        <div class="section-title">Datos del Socio</div>
        <div class="info-grid">
          <div class="info-item"><label>Nombre</label><span>${nombreSocio}</span></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Detalle de Cuotas</div>
        <table>
          <thead><tr><th>Concepto</th><th>Tipo</th><th>Período</th><th class="right">Monto</th><th class="right">Desc.</th><th class="right">Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totales">
          <div class="totales-row"><span>Subtotal</span><span>${fmt$(r.subtotal)}</span></div>
          ${r.descuento > 0 ? `<div class="totales-row"><span>Descuento adicional</span><span style="color:#dc2626">– ${fmt$(r.descuento)}</span></div>` : ''}
          <div class="totales-row total"><span>TOTAL</span><span>${fmt$(r.total)}</span></div>
        </div>
      </div>
      <div class="pago-box">
        <div><div class="pago-label">Forma de pago</div><div class="pago-val">${r.forma_pago_nombre ?? '—'}</div></div>
        ${r.referencia_pago ? `<div style="margin-left:32px"><div class="pago-label">Referencia</div><div class="pago-val" style="font-size:12px">${r.referencia_pago}</div></div>` : ''}
        <div style="margin-left:auto;text-align:right"><div class="pago-label">Emitido por</div><div style="font-size:12px;font-weight:600;color:#15803d">${r.usuario_cobra ?? '—'}</div></div>
      </div>
      ${r.observaciones ? `<div style="font-size:11px;color:#64748b;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:16px"><strong>Observaciones:</strong> ${r.observaciones}</div>` : ''}
      <div class="firma-area">
        <div class="firma-line">Firma del Socio</div>
        <div class="firma-line">Cajero / Recibí</div>
      </div>
      <div class="footer">
        Este recibo es comprobante de pago de cuotas del club. Para facturación, presentar este folio en administración.<br/>
        ${orgNombre} · ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* KPI mini */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#15803d', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Recibos vigentes</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>{fmt$(totalVigente)}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{countVigente} recibo{countVigente !== 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['VIGENTE', 'CANCELADO', 'TODOS'] as const).map(f => {
              const counts = f === 'TODOS' ? recibos.length : recibos.filter(r => r.status === f).length
              const active = filtro === f
              return (
                <button key={f} onClick={() => setFiltro(f)}
                  style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: active ? '#0891b2' : '#e2e8f0', background: active ? '#ecfeff' : '#fff', color: active ? '#0e7490' : '#64748b' }}>
                  {f === 'VIGENTE' ? 'Vigentes' : f === 'CANCELADO' ? 'Cancelados' : 'Todos'} ({counts})
                </button>
              )
            })}
          </div>
          <button onClick={cargar} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer' }}>
            <RefreshCw size={11} /> Actualizar
          </button>
        </div>

        {/* Lista de recibos */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
            <Receipt size={28} style={{ color: '#cbd5e1', margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Sin recibos registrados</div>
          </div>
        ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            {filtrados.map((r, i) => {
              const cancelado = r.status === 'CANCELADO'
              const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR['VIGENTE']
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  borderBottom: i < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none',
                  opacity: cancelado ? 0.65 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button onClick={() => setDetalle(r)}
                      style={{ fontSize: 13, fontWeight: 700, color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                      {r.folio}
                    </button>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{fechaFmt(r.fecha_recibo)}</span>
                      <span style={{ padding: '1px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                        {r.recibos_golf_det.length} cuota{r.recibos_golf_det.length !== 1 ? 's' : ''}
                      </span>
                      {r.forma_pago_nombre && <span>{r.forma_pago_nombre}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      {sc.label}
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: cancelado ? '#94a3b8' : '#059669', minWidth: 80, textAlign: 'right' }}>
                      {fmt$(r.total)}
                    </div>
                    <button onClick={() => handlePrint(r)} title="Imprimir"
                      style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}>
                      <Printer size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal detalle — z-index mayor al modal padre (1000) */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color="#0891b2" />
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{detalle.folio}</span>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_COLOR[detalle.status]?.bg, color: STATUS_COLOR[detalle.status]?.color }}>
                    {STATUS_COLOR[detalle.status]?.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{fechaFmt(detalle.fecha_recibo)}</div>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><XCircle size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cuotas cobradas</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {detalle.recibos_golf_det.map((d, i) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < detalle.recibos_golf_det.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{d.concepto}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{TIPOS_LABEL[d.tipo] ?? d.tipo}{d.periodo ? ` · ${d.periodo}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {d.descuento > 0 && <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(d.monto_original)}</div>}
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{fmt$(d.monto_final)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <div style={{ width: 220 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', padding: '3px 0' }}><span>Subtotal</span><span>{fmt$(detalle.subtotal)}</span></div>
                  {detalle.descuento > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#dc2626', padding: '3px 0' }}><span>Descuento</span><span>– {fmt$(detalle.descuento)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#059669', borderTop: '2px solid #e2e8f0', paddingTop: 6, marginTop: 4 }}><span>Total</span><span>{fmt$(detalle.total)}</span></div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 10, color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Forma de pago</div><div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{detalle.forma_pago_nombre ?? '—'}</div></div>
                {detalle.referencia_pago && <div><div style={{ fontSize: 10, color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Referencia</div><div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{detalle.referencia_pago}</div></div>}
              </div>
              {detalle.observaciones && (
                <div style={{ padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                  <strong>Observaciones:</strong> {detalle.observaciones}
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDetalle(null)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Cerrar
              </button>
              <button onClick={() => handlePrint(detalle)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#1e3a5f', color: '#fff', cursor: 'pointer' }}>
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
