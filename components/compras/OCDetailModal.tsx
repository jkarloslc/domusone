'use client'
import { useState, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useTiposGasto } from '@/lib/useTiposGasto'
import { fmt, fmtFecha, nextFolio, StatusBadge, FORMAS_PAGO_COMP } from '@/app/compras/types'
import ModalShell from '@/components/ui/ModalShell'
import { Pencil, Printer, CheckCircle, XCircle, Plus, Save, Loader, Tag } from 'lucide-react'

// Compartido con app/compras/ordenes/page.tsx — única fuente. Se movió aquí
// para poder abrirse también desde el modal de consulta de OP (clic en el
// folio de la OC en "Órdenes de Compra Relacionadas").
export function OCDetail({ oc, canAuth, onClose, onAuth, onEdit }: { oc: any; canAuth: boolean; onClose: () => void; onAuth: (id: number, ap: boolean, c: string) => void; onEdit?: () => void }) {
  const { authUser } = useAuth()
  const tiposGasto = useTiposGasto()
  const [det, setDet]       = useState<any[]>([])
  const [op, setOP]         = useState<any | null>(null)
  const [prov, setProv]     = useState<any | null>(null)
  const [almMap, setAlmMap] = useState<Record<number, string>>({})
  const [ccMap,   setCCMap]   = useState<Record<number, string>>({})
  const [areaMap, setAreaMap] = useState<Record<number, string>>({})
  const [frMap,   setFrMap]   = useState<Record<number, string>>({})
  const [comentario, setCom]    = useState('')
  const [creandoOP, setCreandoOP] = useState(false)
  const [savingOP, setSavingOP]   = useState(false)
  const [opForm, setOpForm] = useState({ forma_pago: 'Transferencia', fecha_vencimiento: '', concepto: `OC ${oc.folio}`, tipo_gasto: '', notas: '' })

  // Reclasificar (superadmin) — corrige CC/Área/Frente de un documento ya
  // capturado, sin importar status, sin tocar monto/pagos.
  const [reclasOpen, setReclasOpen]     = useState(false)
  const [ccList, setCcList]             = useState<{ id: number; nombre: string }[]>([])
  const [areaList, setAreaList]         = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [frenteList, setFrenteList]     = useState<{ id: number; nombre: string }[]>([])
  const [relAF, setRelAF]               = useState<{ id_area: number; id_frente: number }[]>([])
  const [reclasCC, setReclasCC]         = useState('')
  const [reclasArea, setReclasArea]     = useState('')
  const [reclasFrente, setReclasFrente] = useState('')
  const [reclasSaving, setReclasSaving] = useState(false)
  const [reclasError, setReclasError]   = useState('')

  useEffect(() => {
    dbComp.from('ordenes_compra_det').select('*').eq('id_oc_fk', oc.id).then(({ data }) => setDet(data ?? []))
    dbComp.from('ordenes_pago').select('*').eq('id_oc_fk', oc.id).maybeSingle().then(({ data }) => setOP(data))
    if (oc.id_proveedor_fk) {
      dbComp.from('proveedores').select('id, nombre, banco, cuenta_clabe').eq('id', oc.id_proveedor_fk).maybeSingle()
        .then(({ data }) => setProv(data))
    }
    Promise.all([
      dbComp.from('almacenes').select('id, nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true),
      dbCfg.from('frentes').select('id, nombre').eq('activo', true),
      dbCfg.from('rel_area_frente').select('id_area, id_frente'),
    ]).then(([alm, cc, ar, fr, raf]) => {
      const mk = (rows: any[]) => Object.fromEntries(rows.map((r: any) => [r.id, r.nombre]))
      setAlmMap(mk(alm.data ?? []))
      setCCMap(mk(cc.data ?? []))
      setAreaMap(mk(ar.data ?? []))
      setFrMap(mk(fr.data ?? []))
      setCcList((cc.data ?? []) as any); setAreaList((ar.data ?? []) as any)
      setFrenteList((fr.data ?? []) as any); setRelAF((raf.data ?? []) as any)
    })
  }, [oc.id, oc.id_proveedor_fk])

  const abrirReclasificar = () => {
    setReclasCC(oc.id_centro_costo_fk?.toString() ?? '')
    setReclasArea(oc.id_area_fk?.toString() ?? '')
    setReclasFrente(oc.id_frente_fk?.toString() ?? '')
    setReclasError('')
    setReclasOpen(true)
  }

  // Update mínimo y explícito: SOLO estos 3 campos + auditoría. Nunca total,
  // status, ni ningún campo relacionado a pagos.
  const handleReclasificar = async () => {
    setReclasSaving(true); setReclasError('')
    const { error: err } = await dbComp.from('ordenes_compra').update({
      id_centro_costo_fk: reclasCC ? Number(reclasCC) : null,
      id_area_fk:          reclasArea ? Number(reclasArea) : null,
      id_frente_fk:         reclasFrente ? Number(reclasFrente) : null,
      reclasificado_por:       authUser?.nombre ?? null,
      fecha_reclasificacion:   new Date().toISOString(),
    }).eq('id', oc.id)
    setReclasSaving(false)
    if (err) { setReclasError(err.message); return }
    setReclasOpen(false)
    onClose()
  }

  const crearOrdenPago = async () => {
    setSavingOP(true)
    let folio: string
    try {
      folio = await nextFolio(dbComp, 'OP')
    } catch (e: any) {
      alert(e.message)
      setSavingOP(false)
      return
    }
    const { data: opIns, error: opErr } = await dbComp.from('ordenes_pago').insert({
      folio, id_oc_fk: oc.id, id_proveedor_fk: oc.id_proveedor_fk,
      id_almacen_fk:      oc.id_almacen_entrega_fk ?? null,
      id_centro_costo_fk: oc.id_centro_costo_fk ?? null,
      id_area_fk:         oc.id_area_fk ?? null,
      id_frente_fk:       oc.id_frente_fk ?? null,
      monto:              oc.total,
      fecha_factura:      oc.fecha_factura ?? null,
      folio_factura:      oc.folio_factura ?? null,
      subtotal:           oc.subtotal ?? null,
      iva:                oc.iva ?? null,
      forma_pago:         opForm.forma_pago,
      fecha_vencimiento:  opForm.fecha_vencimiento || null,
      concepto:           opForm.concepto,
      tipo_gasto:         opForm.tipo_gasto || null,
      notas:              opForm.notas || null,
      banco_destino:      prov?.banco ?? null,
      cuenta_clabe:       prov?.cuenta_clabe ?? null,
      created_by:         authUser?.nombre ?? null,
      status:             'Pendiente Auth',
    }).select('id').single()
    if (!opErr && opIns) {
      // Mantener consistencia con el flujo de "Nueva OP" (ordenes-pago/page.tsx):
      // registrar la relación en ordenes_pago_oc y marcar la OC como enviada al proveedor.
      await dbComp.from('ordenes_pago_oc').insert({ id_op_fk: opIns.id, id_oc_fk: oc.id, monto: oc.total })
      await dbComp.from('ordenes_compra').update({ status: 'Enviada al Prov' }).eq('id', oc.id)
    }
    setSavingOP(false); setCreandoOP(false)
    dbComp.from('ordenes_pago').select('*').eq('id_oc_fk', oc.id).maybeSingle().then(({ data }) => setOP(data))
  }

  const imprimirOP = async () => {
    if (!op) return
    // Fresh fetch para asegurar campos actualizados (autorizado_por, referencia_pago, etc.)
    const { data: freshOP } = await dbComp.from('ordenes_pago').select('*').eq('id', op.id).single()
    const opData = freshOP ? { ...op, ...freshOP } : op

    const centroCostoNombre = opData.id_centro_costo_fk ? (ccMap[opData.id_centro_costo_fk] ?? `#${opData.id_centro_costo_fk}`) : 'Sin asignar'
    const areaNombre  = opData.id_area_fk   ? (areaMap[opData.id_area_fk]  ?? `#${opData.id_area_fk}`)   : '—'
    const frenteNombre = opData.id_frente_fk ? (frMap[opData.id_frente_fk]  ?? `#${opData.id_frente_fk}`) : '—'
    const almNombre   = opData.id_almacen_fk ? (almMap[opData.id_almacen_fk] ?? `#${opData.id_almacen_fk}`) : '—'

    const estadoAut = opData.status === 'Pendiente Auth'
      ? 'Pendiente de autorización'
      : opData.status === 'Pendiente Auth Finanzas'
        ? 'Pendiente de segunda autorización (Finanzas)'
        : opData.status === 'Rechazada'
          ? 'Rechazada'
          : opData.status === 'Sustituida'
            ? 'Sustituida'
            : opData.autorizado_finanzas_por
              ? 'Autorizada'
              : opData.autorizado_por
                ? 'Autorizada (1ra autorización)'
                : 'En proceso'
    const nombreElaboro   = opData.created_by ?? 'Sin registro'
    const nombreAutorizo1 = opData.autorizado_por
      ?? (opData.status === 'Rechazada' ? 'Rechazada' : 'Pendiente de autorización')
    const nombreAutorizo2 = opData.autorizado_finanzas_por
      ?? (opData.status === 'Rechazada' ? 'Rechazada'
        : opData.status === 'Sustituida' ? 'Sustituida'
        : opData.autorizado_por ? 'Pendiente de autorización (Finanzas)' : 'Pendiente')

    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}

    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`

    const html = `<!DOCTYPE html><html><head><title>Orden de Pago ${opData.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 18px; }
        .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 600; color: #0D4F80; margin-bottom: 2px; }
        .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 8px 12px; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
        .total { background: #eff6ff; font-size: 16px; font-weight: 700; color: #0D4F80; }
        .firmas { display: flex; gap: 30px; margin-top: 60px; }
        .firma { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 150px; font-size: 11px; color: #64748b; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">Orden de Pago</div>
          <div class="sub" style="margin:0">Folio: <strong>${opData.folio}</strong> &nbsp;·&nbsp; OC: ${oc.folio}</div>
        </div>
      </div>
      <table>
        <tr><th>Beneficiario</th><td>${oc._provNombre ?? '—'}</td><th>Banco</th><td>${opData.banco_destino ?? prov?.banco ?? '—'}</td></tr>
        <tr><th>CLABE / Cuenta</th><td style="font-family:monospace">${opData.cuenta_clabe ?? prov?.cuenta_clabe ?? '—'}</td><th>Forma de Pago</th><td>${opData.forma_pago}</td></tr>
        <tr><th>Concepto</th><td colspan="3">${opData.concepto ?? '—'}</td></tr>
        <tr><th>Almacén</th><td>${almNombre}</td><th>Vencimiento</th><td>${fmtFecha(opData.fecha_vencimiento)}</td></tr>
        ${opData.tipo_gasto ? `<tr><th>Tipo de Gasto</th><td colspan="3">${opData.tipo_gasto}</td></tr>` : ''}
        <tr><th>Centro de Costo</th><td colspan="3">${centroCostoNombre}</td></tr>
        <tr><th>Área</th><td>${areaNombre}</td><th>Frente</th><td>${frenteNombre}</td></tr>
        <tr><th>OC Relacionada</th><td colspan="3">${oc.folio}</td></tr>
        ${(opData.folio_factura || opData.fecha_factura) ? `<tr><th>Folio Factura</th><td>${opData.folio_factura ?? '—'}</td><th>Fecha Factura</th><td>${fmtFecha(opData.fecha_factura)}</td></tr>` : ''}
        ${(opData.subtotal != null || opData.iva != null) ? `<tr><th>Subtotal</th><td>${fmt(opData.subtotal)}</td><th>IVA</th><td>${fmt(opData.iva)}</td></tr>` : ''}
        <tr><th class="total">TOTAL A PAGAR</th><td colspan="3" class="total">${fmt(opData.monto)}</td></tr>
      </table>
      ${opData.notas ? `<p style="font-size:12px;color:#64748b"><em>Notas: ${opData.notas}</em></p>` : ''}
      <div style="margin-top:18px;border:1px solid #bfdbfe;border-radius:8px;overflow:hidden">
        <div style="background:#eff6ff;padding:8px 14px;font-size:11px;font-weight:700;color:#1e40af;letter-spacing:.06em;text-transform:uppercase">
          Autorización y Control de Pago
        </div>
        <table style="margin:0">
          <tr><th>Estatus</th><td>${estadoAut}</td></tr>
          ${opData.autorizado_por     ? `<tr><th>1ra Autorización</th><td>${opData.autorizado_por}${opData.fecha_autorizacion ? ' · ' + new Date(opData.fecha_autorizacion).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : ''}</td></tr>` : ''}
          ${opData.autorizado_finanzas_por ? `<tr><th>2da Autorización (Finanzas)</th><td>${opData.autorizado_finanzas_por}${opData.fecha_autorizacion_finanzas ? ' · ' + new Date(opData.fecha_autorizacion_finanzas).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : ''}</td></tr>` : ''}
          ${opData.referencia_pago    ? `<tr><th>Ref. de Pago</th><td style="font-family:monospace">${opData.referencia_pago}</td></tr>` : ''}
          ${opData.instrucciones_pago ? `<tr><th>Instrucciones</th><td style="white-space:pre-wrap;color:#92400e;background:#fffbeb">${opData.instrucciones_pago}</td></tr>` : ''}
          ${!opData.autorizado_por && !opData.autorizado_finanzas_por && !opData.referencia_pago && !opData.instrucciones_pago ? `<tr><th>Detalle</th><td>Sin datos adicionales de autorización/pago.</td></tr>` : ''}
        </table>
      </div>
      <div class="firmas">
        <div class="firma">
          <div style="margin-bottom:2px;font-weight:600;color:#1e293b">${nombreElaboro}</div>
          Elaboró
        </div>
        <div class="firma">
          <div style="margin-bottom:2px;font-weight:600;color:#1e293b">${nombreAutorizo1}</div>
          Autorizó
          ${opData.fecha_autorizacion ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${new Date(opData.fecha_autorizacion).toLocaleDateString('es-MX',{dateStyle:'short'})}</div>` : ''}
        </div>
        <div class="firma">
          <div style="margin-bottom:2px;font-weight:600;color:#1e293b">${nombreAutorizo2}</div>
          Autorizó Finanzas
          ${opData.fecha_autorizacion_finanzas ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${new Date(opData.fecha_autorizacion_finanzas).toLocaleDateString('es-MX',{dateStyle:'short'})}</div>` : ''}
        </div>
        <div class="firma">Recibió</div>
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
    <ModalShell modulo="compras" titulo={oc.folio}
      subtitulo={`${oc._provNombre ?? ''} · ${fmtFecha(oc.fecha_oc)}`}
      onClose={onClose} maxWidth={660}
      footer={<>
        <StatusBadge status={oc.status} />
        {onEdit && (
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>
            <Pencil size={13} /> Editar OC
          </button>
        )}
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimirOP}>
          <Printer size={13} /> Imprimir OC
        </button>
      </>}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Sec label="Productos">
            <div className="card" style={{ overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Descripción</th><th style={{ textAlign: 'right' }}>Cant.</th><th>Unidad</th><th style={{ textAlign: 'right' }}>P. Unit.</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Recibido</th></tr></thead>
                <tbody>
                  {det.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 13 }}>{d.descripcion}</td>
                      <td style={{ textAlign: 'right' }}>{d.cantidad}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(d.precio_unitario)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.total)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: d.cant_recibida > 0 ? '#15803d' : 'var(--text-muted)' }}>{d.cant_recibida ?? 0}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}></td><td style={{ fontWeight: 600, textAlign: 'right' }}>Subtotal</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{fmt(oc.subtotal)}</td><td></td></tr>
                  <tr style={{ background: 'var(--blue-pale)' }}><td colSpan={3}></td><td style={{ fontWeight: 700, color: 'var(--blue)', textAlign: 'right' }}>TOTAL</td><td style={{ fontWeight: 700, color: 'var(--blue)', textAlign: 'right', fontSize: 15 }}>{fmt(oc.total)}</td><td></td></tr>
                </tbody>
              </table>
            </div>
          </Sec>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            <DI label="Condiciones de Pago" value={oc.condiciones_pago} />
            <DI label="Entrega Estimada"    value={fmtFecha(oc.fecha_entrega_est)} />
            <DI label="Almacén de Entrega"  value={oc.id_almacen_entrega_fk ? (almMap[oc.id_almacen_entrega_fk] ?? `#${oc.id_almacen_entrega_fk}`) : null} />
            <DI label="Folio Factura"       value={oc.folio_factura} />
            <DI label="Fecha Factura"       value={fmtFecha(oc.fecha_factura)} />
            {oc.id_centro_costo_fk && <DI label="Centro de Costo" value={ccMap[oc.id_centro_costo_fk] ?? `#${oc.id_centro_costo_fk}`} />}
            {oc.id_area_fk         && <DI label="Área"            value={areaMap[oc.id_area_fk]       ?? `#${oc.id_area_fk}`} />}
            {oc.id_frente_fk       && <DI label="Frente"          value={frMap[oc.id_frente_fk]       ?? `#${oc.id_frente_fk}`} />}
            {oc.autorizado_por    && <DI label="Autorizado por" value={`${oc.autorizado_por} — ${fmtFecha(oc.fecha_autorizacion)}`} />}
            {oc.comentario_auth   && <DI label="Comentario"     value={oc.comentario_auth} />}
            {oc.reclasificado_por && <DI label="Reclasificado por" value={`${oc.reclasificado_por} — ${fmtFecha(oc.fecha_reclasificacion)}`} />}
          </div>

          {canAuth && oc.status === 'Pendiente Auth' && (
            <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Autorización de Orden de Compra</div>
              <textarea className="input" rows={2} value={comentario} onChange={e => setCom(e.target.value)}
                placeholder="Comentario (opcional)" style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => onAuth(oc.id, true, comentario)} style={{ flex: 1 }}><CheckCircle size={13} /> Autorizar OC</button>
                <button onClick={() => onAuth(oc.id, false, comentario)}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  <XCircle size={13} /> Rechazar
                </button>
              </div>
            </div>
          )}

          {oc.status === 'Autorizada' && !op && !creandoOP && (
            <div style={{ textAlign: 'center' }}>
              <button className="btn-primary" onClick={() => setCreandoOP(true)}><Plus size={13} /> Generar Orden de Pago</button>
            </div>
          )}

          {creandoOP && (
            <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 10 }}>Nueva Orden de Pago — {fmt(oc.total)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="label">Forma de Pago</label>
                  <select className="select" value={opForm.forma_pago} onChange={e => setOpForm(f => ({ ...f, forma_pago: e.target.value }))}>
                    {FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div><label className="label">Fecha Vencimiento</label>
                  <input className="input" type="date" value={opForm.fecha_vencimiento} onChange={e => setOpForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}><label className="label">Concepto</label>
                <input className="input" value={opForm.concepto} onChange={e => setOpForm(f => ({ ...f, concepto: e.target.value }))} />
              </div>
              <div style={{ marginTop: 10 }}><label className="label">Tipo de Gasto (opcional)</label>
                <select className="select" value={opForm.tipo_gasto} onChange={e => setOpForm(f => ({ ...f, tipo_gasto: e.target.value }))}>
                  <option value="">— Sin clasificar —</option>
                  {tiposGasto.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn-secondary" onClick={() => setCreandoOP(false)}>Cancelar</button>
                <button className="btn-primary" onClick={crearOrdenPago} disabled={savingOP}>
                  {savingOP ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Crear Orden de Pago
                </button>
              </div>
            </div>
          )}

          {op && (
            <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Orden de Pago: {op.folio}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <StatusBadge status={op.status} />
                  <button className="btn-secondary" style={{ fontSize: 11 }} onClick={imprimirOP}><Printer size={12} /> Imprimir</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                <DI label="Monto"         value={fmt(op.monto)} />
                <DI label="Forma de Pago" value={op.forma_pago} />
                <DI label="Vencimiento"   value={fmtFecha(op.fecha_vencimiento)} />
                <DI label="Concepto"      value={op.concepto} />
              </div>
            </div>
          )}

          {/* Reclasificar (solo superadmin) — corrige CC/Área/Frente sin
              importar status, nunca total ni pagos. */}
          {authUser?.rol === 'superadmin' && (
            <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
              {!reclasOpen ? (
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={abrirReclasificar}>
                  <Tag size={13} /> Reclasificar CC/Área/Frente
                </button>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                    Reclasificar — solo corrige clasificación, no toca el total
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><label className="label">Centro de Costo</label>
                      <select className="select" value={reclasCC}
                        onChange={e => { setReclasCC(e.target.value); setReclasArea(''); setReclasFrente('') }}>
                        <option value="">— Sin asignar —</option>
                        {ccList.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Área</label>
                      <select className="select" value={reclasArea}
                        onChange={e => { setReclasArea(e.target.value); setReclasFrente('') }}
                        disabled={!reclasCC}>
                        <option value="">— Sin asignar —</option>
                        {areaList.filter(a => a.id_centro_costo_fk === Number(reclasCC)).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Frente</label>
                      <select className="select" value={reclasFrente} onChange={e => setReclasFrente(e.target.value)} disabled={!reclasArea}>
                        <option value="">— Sin asignar —</option>
                        {frenteList.filter(f => relAF.some(r => r.id_area === Number(reclasArea) && r.id_frente === f.id)).map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  {reclasError && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{reclasError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleReclasificar} disabled={reclasSaving}>
                      {reclasSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar reclasificación
                    </button>
                    <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setReclasOpen(false)}>Cancelar</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
    </ModalShell>
  )
}

const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>
)
const DI = ({ label, value }: { label: string; value?: string | null }) => value ? (
  <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div></div>
) : null
