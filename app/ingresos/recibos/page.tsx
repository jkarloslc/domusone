'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Receipt, ChevronLeft, ChevronRight,
  Save, Loader, Calendar, Eye, Ban, Layers, DollarSign, Printer, Pencil
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import ModalShell from '@/components/ui/ModalShell'

// ── Tipos ──────────────────────────────────────────────────────
type Centro = {
  id: number; nombre: string; codigo: string | null
  tipo: string | null; tipo_desglose: string; activo: boolean
}
type Seccion = { id: number; nombre: string; clave_alfa: string | null }
type SeccionRow = { id_seccion_fk: number; nombre_seccion: string; monto: number; notas: string }
type Concepto = { id: number; nombre: string; clave: string | null; orden: number }
type ConceptoRow = { id_concepto_fk: number; nombre_concepto: string; monto: number; notas: string }
type FormaPago = { id: number; nombre: string }
type FormaPagoRow = { id_forma_pago_fk: number; nombre_forma_pago: string; monto: number }
type Recibo = {
  id: number; folio: string | null; fecha: string
  id_centro_ingreso_fk: number | null
  descripcion: string | null
  monto_efectivo: number; monto_transferencia: number
  monto_tarjeta: number; monto_tarjeta_debito: number; monto_tarjeta_credito: number
  monto_cheque: number; monto_deposito: number; monto_total: number
  status: string; origen: string; notas: string | null
  usuario_crea: string | null; usuario_cancela: string | null
  fecha_cancela: string | null; motivo_cancelacion: string | null
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFolioIng = (id: number) =>
  `ING-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`
const toLocalYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtFechaLarga = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
const escapeHtml = (v: string | number | null | undefined) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Confirmado: { bg: '#f0fdf4', color: '#15803d' },
  Borrador:   { bg: '#fffbeb', color: '#d97706' },
  Cancelado:  { bg: '#f8fafc', color: '#94a3b8' },
}
const CENTRO_COLOR: Record<string, string> = {
  golf: '#059669', cuotas: '#2563eb', rentas_espacios: '#7c3aed', caballerizas: '#d97706', otro: '#64748b',
}

const PAGE_SIZE = 25

// ── Modal Nuevo / Ver / Cancelar ───────────────────────────────
function ReciboModal({
  recibo, centros, secciones, onClose, onSaved, authUser, canWrite,
}: {
  recibo: Recibo | null
  centros: Centro[]
  secciones: Seccion[]
  onClose: () => void
  onSaved: () => void
  authUser: any
  canWrite: (modulo: string) => boolean
}) {
  const isView        = !!recibo
  const isSuperAdmin  = authUser?.rol === 'superadmin'
  const [isEditMode, setIsEditMode] = useState(false)
  const today    = toLocalYmd(new Date())

  const [form, setForm] = useState({
    fecha:               recibo?.fecha ?? today,
    id_centro_ingreso_fk: recibo?.id_centro_ingreso_fk ?? (centros[0]?.id ?? null),
    descripcion:         recibo?.descripcion ?? '',
    notas:               recibo?.notas ?? '',
    status:              recibo?.status ?? 'Confirmado',
  })
  const [secRows, setSecRows]             = useState<SeccionRow[]>([])
  const [conceptoRows, setConceptoRows]   = useState<ConceptoRow[]>([])
  const [formaPagoRows, setFormaPagoRows] = useState<FormaPagoRow[]>([])
  const [loadingSecs, setLoadingSecs] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [error, setError]         = useState('')

  const centroSel   = centros.find(c => c.id === Number(form.id_centro_ingreso_fk))
  const esSecciones  = centroSel?.tipo_desglose === 'secciones'
  const esConceptos  = esSecciones || centroSel?.tipo_desglose === 'conceptos'

  // ── Cargar secciones existentes (vista) o init (nuevo) ──────
  // Siempre muestra TODAS las secciones del config; si hay datos guardados,
  // superpone los montos para que en modo edición sean editables todas.
  useEffect(() => {
    if (!esSecciones) { setSecRows([]); return }
    if (recibo) {
      setLoadingSecs(true)
      dbCtrl.from('recibos_ingreso_secciones')
        .select('id_seccion_fk, nombre_seccion, monto, notas')
        .eq('id_recibo_fk', recibo.id)
        .then(({ data }) => {
          const saved = (data ?? []) as SeccionRow[]
          const full  = initSecRowsVal().map(r => {
            const match = saved.find(s => s.id_seccion_fk === r.id_seccion_fk)
            return match ? { ...r, monto: match.monto, notas: match.notas } : r
          })
          setSecRows(full)
          setLoadingSecs(false)
        })
    } else {
      setSecRows(initSecRowsVal())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recibo?.id, esSecciones])

  // ── Cargar conceptos del centro seleccionado ────────────────
  // Siempre muestra TODOS los conceptos del config; superpone montos guardados.
  useEffect(() => {
    if (!esConceptos) { setConceptoRows([]); return }
    const centroId = Number(form.id_centro_ingreso_fk)
    if (!centroId) { setConceptoRows([]); return }

    if (recibo) {
      Promise.all([
        dbCtrl.from('recibos_ingreso_conceptos')
          .select('id_concepto_fk, nombre_concepto, monto, notas')
          .eq('id_recibo_fk', recibo.id),
        dbCfg.from('conceptos_ingreso')
          .select('id, nombre, clave, orden')
          .or(`id_centro_ingreso_fk.eq.${centroId},id_centro_ingreso_fk.is.null`)
          .eq('activo', true)
          .order('orden'),
      ]).then(([{ data: saved }, { data: cfg }]) => {
        const savedRows = (saved ?? []) as ConceptoRow[]
        const full = (cfg ?? []).map((c: Concepto) => {
          const match = savedRows.find(r => r.id_concepto_fk === c.id)
          return match
            ? { ...match }
            : { id_concepto_fk: c.id, nombre_concepto: c.nombre, monto: 0, notas: '' }
        })
        setConceptoRows(full)
      })
    } else {
      loadConceptosFromCfg(centroId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recibo?.id, esConceptos, form.id_centro_ingreso_fk])

  const loadConceptosFromCfg = async (centroId: number) => {
    const { data } = await dbCfg.from('conceptos_ingreso')
      .select('id, nombre, clave, orden')
      .or(`id_centro_ingreso_fk.eq.${centroId},id_centro_ingreso_fk.is.null`)
      .eq('activo', true)
      .order('orden')
    setConceptoRows((data ?? []).map((c: Concepto) => ({
      id_concepto_fk: c.id,
      nombre_concepto: c.nombre,
      monto: 0,
      notas: '',
    })))
  }

  // ── Cargar formas de pago (dinámico desde cfg.formas_pago) ──
  // Siempre muestra TODAS las formas activas del config; superpone montos guardados.
  useEffect(() => {
    if (recibo) {
      Promise.all([
        dbCtrl.from('recibos_ingreso_formas_pago')
          .select('id_forma_pago_fk, nombre_forma_pago, monto')
          .eq('id_recibo_fk', recibo.id),
        dbCfg.from('formas_pago')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre'),
      ]).then(([{ data: saved }, { data: cfg }]) => {
        const savedRows = (saved ?? []) as FormaPagoRow[]
        const full = (cfg ?? []).map((f: FormaPago) => {
          const match = savedRows.find(r => r.id_forma_pago_fk === f.id)
          return match ? { ...match } : { id_forma_pago_fk: f.id, nombre_forma_pago: f.nombre, monto: 0 }
        })
        setFormaPagoRows(full)
      })
    } else {
      loadFormasPagoFromCfg()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recibo?.id])

  const loadFormasPagoFromCfg = async () => {
    const { data } = await dbCfg.from('formas_pago')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
    setFormaPagoRows((data ?? []).map((f: FormaPago) => ({
      id_forma_pago_fk: f.id,
      nombre_forma_pago: f.nombre,
      monto: 0,
    })))
  }

  const initSecRowsVal = () =>
    secciones.map(s => ({ id_seccion_fk: s.id, nombre_seccion: s.nombre, monto: 0, notas: '' }))

  const CENTRO_CUOTAS_ID = 2
  const descripcionCuotas = (fecha: string) =>
    `Cobranza del ${fecha} - Cuotas Mantenimiento y Servicios`

  const set = (k: string, v: any) => setForm(f => {
    const next = { ...f, [k]: v }
    if (!recibo) {
      if (k === 'id_centro_ingreso_fk' && Number(v) === CENTRO_CUOTAS_ID) {
        next.descripcion = descripcionCuotas(next.fecha)
      } else if (k === 'id_centro_ingreso_fk' && Number(v) !== CENTRO_CUOTAS_ID &&
                 Number(f.id_centro_ingreso_fk) === CENTRO_CUOTAS_ID) {
        next.descripcion = ''
      } else if (k === 'fecha' && Number(next.id_centro_ingreso_fk) === CENTRO_CUOTAS_ID) {
        next.descripcion = descripcionCuotas(v)
      }
    }
    return next
  })
  const setSecMonto        = (idx: number, val: number) =>
    setSecRows(rows => rows.map((r, i) => i === idx ? { ...r, monto: val } : r))
  const setConceptoMonto   = (idx: number, val: number) =>
    setConceptoRows(rows => rows.map((r, i) => i === idx ? { ...r, monto: val } : r))
  const setFormaPagoMonto  = (idx: number, val: number) =>
    setFormaPagoRows(rows => rows.map((r, i) => i === idx ? { ...r, monto: val } : r))

  // Total calculado
  const totalFormasPago = formaPagoRows.reduce((a, r) => a + (r.monto || 0), 0)
  const totalSecs       = secRows.reduce((a, r) => a + (r.monto || 0), 0)
  const totalConceptos  = conceptoRows.reduce((a, r) => a + (r.monto || 0), 0)
  const totalFinal      = esSecciones ? (totalSecs + totalConceptos)
                        : centroSel?.tipo_desglose === 'conceptos' ? totalConceptos
                        : totalFormasPago

  const handleSave = async () => {
    if (!form.id_centro_ingreso_fk) { setError('Selecciona un centro de ingreso'); return }
    if (totalFinal === 0)           { setError('El monto total debe ser mayor a $0'); return }

    // Validar que formas de cobro coincidan con el total general (secciones y conceptos)
    if ((esSecciones || centroSel?.tipo_desglose === 'conceptos') && totalFormasPago > 0) {
      const diff = Math.round((totalFinal - totalFormasPago) * 100) / 100
      if (diff !== 0) {
        const tipo = diff > 0 ? 'falta' : 'excede'
        setError(`El total cobrado (${fmt(totalFormasPago)}) no coincide con el total general (${fmt(totalFinal)}). ${tipo === 'falta' ? 'Faltan' : 'Sobran'} ${fmt(Math.abs(diff))} en las formas de cobro.`)
        return
      }
    }

    setSaving(true); setError('')

    const payload = {
      fecha:                form.fecha,
      id_centro_ingreso_fk: Number(form.id_centro_ingreso_fk),
      descripcion:          form.descripcion || null,
      monto_total:          totalFinal,
      status:               form.status,
      notas:                form.notas || null,
      usuario_crea:         authUser?.nombre ?? authUser?.email ?? 'sistema',
    }

    const { data: newRec, error: err } = await dbCtrl.from('recibos_ingreso')
      .insert(payload).select('id').single()

    if (err || !newRec) { setSaving(false); setError(err?.message ?? 'Error al guardar'); return }

    // Folio
    const folio = fmtFolioIng(newRec.id)
    await dbCtrl.from('recibos_ingreso').update({ folio }).eq('id', newRec.id)

    // Secciones
    if (esSecciones && secRows.some(r => r.monto > 0)) {
      const secsPayload = secRows
        .filter(r => r.monto > 0)
        .map(r => ({ id_recibo_fk: newRec.id, id_seccion_fk: r.id_seccion_fk, nombre_seccion: r.nombre_seccion, monto: r.monto, notas: r.notas || null }))
      await dbCtrl.from('recibos_ingreso_secciones').insert(secsPayload)
    }

    // Conceptos (complementario a secciones)
    if (esConceptos && conceptoRows.some(r => r.monto > 0)) {
      const conceptosPayload = conceptoRows
        .filter(r => r.monto > 0)
        .map(r => ({ id_recibo_fk: newRec.id, id_concepto_fk: r.id_concepto_fk, nombre_concepto: r.nombre_concepto, monto: r.monto, notas: r.notas || null }))
      await dbCtrl.from('recibos_ingreso_conceptos').insert(conceptosPayload)
    }

    // Formas de pago
    if (formaPagoRows.some(r => r.monto > 0 && r.id_forma_pago_fk > 0)) {
      const formasPayload = formaPagoRows
        .filter(r => r.monto > 0 && r.id_forma_pago_fk > 0)
        .map(r => ({ id_recibo_fk: newRec.id, id_forma_pago_fk: r.id_forma_pago_fk, nombre_forma_pago: r.nombre_forma_pago, monto: r.monto }))
      await dbCtrl.from('recibos_ingreso_formas_pago').insert(formasPayload)
    }

    setSaving(false)
    onSaved()
  }

  const handleUpdate = async () => {
    if (!recibo) return
    if (totalFinal === 0) { setError('El monto total debe ser mayor a $0'); return }

    // Misma validación de secciones/conceptos vs formas de cobro que handleSave
    if ((esSecciones || centroSel?.tipo_desglose === 'conceptos') && totalFormasPago > 0) {
      const diff = Math.round((totalFinal - totalFormasPago) * 100) / 100
      if (diff !== 0) {
        const tipo = diff > 0 ? 'falta' : 'excede'
        setError(`El total cobrado (${fmt(totalFormasPago)}) no coincide con el total general (${fmt(totalFinal)}). ${tipo === 'falta' ? 'Faltan' : 'Sobran'} ${fmt(Math.abs(diff))} en las formas de cobro.`)
        return
      }
    }

    setSaving(true); setError('')

    // 1. Actualizar cabecera
    const { error: errUpd } = await dbCtrl.from('recibos_ingreso').update({
      fecha:                form.fecha,
      id_centro_ingreso_fk: Number(form.id_centro_ingreso_fk),
      descripcion:          form.descripcion || null,
      monto_total:          totalFinal,
      notas:                form.notas || null,
      // limpiar columnas legacy para que el fallback de display no confunda
      monto_efectivo: 0, monto_transferencia: 0,
      monto_tarjeta: 0, monto_tarjeta_debito: 0, monto_tarjeta_credito: 0,
      monto_cheque: 0, monto_deposito: 0,
    }).eq('id', recibo.id)

    if (errUpd) { setSaving(false); setError(errUpd.message); return }

    // 2. Borrar desglose existente y reinsertar
    await Promise.all([
      dbCtrl.from('recibos_ingreso_secciones').delete().eq('id_recibo_fk', recibo.id),
      dbCtrl.from('recibos_ingreso_conceptos').delete().eq('id_recibo_fk', recibo.id),
      dbCtrl.from('recibos_ingreso_formas_pago').delete().eq('id_recibo_fk', recibo.id),
    ])

    if (esSecciones && secRows.some(r => r.monto > 0)) {
      await dbCtrl.from('recibos_ingreso_secciones').insert(
        secRows.filter(r => r.monto > 0)
          .map(r => ({ id_recibo_fk: recibo.id, id_seccion_fk: r.id_seccion_fk, nombre_seccion: r.nombre_seccion, monto: r.monto, notas: r.notas || null }))
      )
    }
    if (esConceptos && conceptoRows.some(r => r.monto > 0)) {
      await dbCtrl.from('recibos_ingreso_conceptos').insert(
        conceptoRows.filter(r => r.monto > 0)
          .map(r => ({ id_recibo_fk: recibo.id, id_concepto_fk: r.id_concepto_fk, nombre_concepto: r.nombre_concepto, monto: r.monto, notas: r.notas || null }))
      )
    }
    if (formaPagoRows.some(r => r.monto > 0 && r.id_forma_pago_fk > 0)) {
      await dbCtrl.from('recibos_ingreso_formas_pago').insert(
        formaPagoRows
          .filter(r => r.monto > 0 && r.id_forma_pago_fk > 0)
          .map(r => ({ id_recibo_fk: recibo.id, id_forma_pago_fk: r.id_forma_pago_fk, nombre_forma_pago: r.nombre_forma_pago, monto: r.monto }))
      )
    }

    setSaving(false)
    setIsEditMode(false)
    onSaved()
  }

  const handleCancel = async () => {
    if (!cancelMotivo.trim()) { setError('Escribe el motivo de cancelación'); return }
    setCancelling(true); setError('')
    const { error: err } = await dbCtrl.from('recibos_ingreso').update({
      status: 'Cancelado',
      usuario_cancela: authUser?.nombre ?? authUser?.email,
      fecha_cancela: new Date().toISOString(),
      motivo_cancelacion: cancelMotivo.trim(),
    }).eq('id', recibo!.id)
    setCancelling(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const handlePrint = async () => {
    if (!recibo) return
    setPrinting(true)
    setError('')
    try {
      let orgNombre = 'Organización'
      let orgSubtitulo = ''
      let orgLogo = ''
      const { data: cfgRows } = await dbCfg.from('configuracion')
        .select('clave, valor')
        .in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((row: any) => {
        if (row.clave === 'org_nombre') orgNombre = row.valor ?? orgNombre
        if (row.clave === 'org_subtitulo') orgSubtitulo = row.valor ?? ''
        if (row.clave === 'org_logo_url') orgLogo = row.valor ?? ''
      })

      const [secRes, conceptoRes, formaRes] = await Promise.all([
        dbCtrl.from('recibos_ingreso_secciones')
          .select('nombre_seccion, monto')
          .eq('id_recibo_fk', recibo.id)
          .order('nombre_seccion'),
        dbCtrl.from('recibos_ingreso_conceptos')
          .select('nombre_concepto, monto')
          .eq('id_recibo_fk', recibo.id),
        dbCtrl.from('recibos_ingreso_formas_pago')
          .select('nombre_forma_pago, monto')
          .eq('id_recibo_fk', recibo.id),
      ])
      const secs = (secRes.data ?? []) as { nombre_seccion: string; monto: number }[]
      const conceptosPrint = (conceptoRes.data ?? []) as { nombre_concepto: string; monto: number }[]

      const formas = ((formaRes.data ?? []) as { nombre_forma_pago: string; monto: number }[])
        .map(f => ({ nombre: f.nombre_forma_pago, monto: f.monto }))

      const centroNombre = centroSel?.nombre ?? 'Sin centro'
      const desgloseRows = esSecciones
        ? secs.map(s => `<tr><td>${escapeHtml(s.nombre_seccion)}</td><td style="text-align:right">${fmt(s.monto)}</td></tr>`).join('')
        : ''
      const desgloseLabel = esSecciones ? 'Desglose por Sección'
        : centroSel?.tipo_desglose === 'conceptos' ? 'Desglose por Concepto' : ''
      const conceptosRows = conceptosPrint.map(c => `<tr><td>${escapeHtml(c.nombre_concepto)}</td><td style="text-align:right">${fmt(c.monto)}</td></tr>`).join('')
      const totalSecsImp = secs.reduce((a, s) => a + s.monto, 0)
      const totalConceptosImp = conceptosPrint.reduce((a, c) => a + c.monto, 0)
      const formasRows = formas.map(f => `<tr><td>${escapeHtml(f.nombre)}</td><td style="text-align:right">${fmt(f.monto)}</td></tr>`).join('')
      const logoHtml = orgLogo
        ? `<img src="${escapeHtml(orgLogo)}" style="height:52px;max-width:160px;object-fit:contain;" />`
        : '<div style="width:52px;height:52px;border-radius:8px;background:#e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:center;font-weight:700">ORG</div>'

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recibo ${escapeHtml(recibo.folio ?? `#${recibo.id}`)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 34px; font-size: 12px; color: #1e293b; }
        .org-header { display:flex; align-items:center; gap:16px; padding-bottom:14px; border-bottom:2px solid #0D4F80; margin-bottom:18px; }
        .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin:0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 700; color: #0D4F80; margin-bottom: 3px; }
        .meta { font-size: 11px; color: #64748b; }
        .section { margin-bottom: 16px; }
        .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #0D4F80; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; text-align: left; }
        .total { background: #eff6ff; font-weight: 700; color: #0D4F80; }
        .firmas { display: flex; gap: 60px; margin-top: 52px; }
        .firma { border-top: 1px solid #0f172a; width: 190px; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
        @page { margin: 1.2cm; }
      </style></head><body>
        <div class="org-header">
          ${logoHtml}
          <div>
            <div class="org-nombre">${escapeHtml(orgNombre)}</div>
            ${orgSubtitulo ? `<div class="org-sub">${escapeHtml(orgSubtitulo)}</div>` : ''}
          </div>
          <div style="margin-left:auto;text-align:right">
            <div class="doc-title">Recibo de Ingreso</div>
            <div class="meta">Folio: <strong>${escapeHtml(recibo.folio ?? `#${recibo.id}`)}</strong></div>
            <div class="meta">Fecha: ${escapeHtml(fmtFechaLarga(recibo.fecha))}</div>
          </div>
        </div>

        <div class="section">
          <table>
            <tr><th>Centro de Ingreso</th><td>${escapeHtml(centroNombre)}</td><th>Status</th><td>${escapeHtml(recibo.status)}</td></tr>
            <tr><th>Descripción</th><td colspan="3">${escapeHtml(recibo.descripcion ?? '—')}</td></tr>
            <tr><th>Registrado por</th><td>${escapeHtml(recibo.usuario_crea ?? '—')}</td><th>Fecha registro</th><td>${escapeHtml(fmtFechaLarga(recibo.created_at.slice(0, 10)))}</td></tr>
            ${recibo.notas ? `<tr><th>Notas</th><td colspan="3">${escapeHtml(recibo.notas)}</td></tr>` : ''}
          </table>
        </div>

        ${formasRows ? `
        <div class="section">
          <div class="section-title">Formas de Cobro</div>
          <table>
            <thead><tr><th>Forma</th><th style="text-align:right">Monto</th></tr></thead>
            <tbody>${formasRows}</tbody>
            ${!esSecciones ? `<tfoot><tr><th class="total">Total</th><th class="total" style="text-align:right">${fmt(recibo.monto_total ?? 0)}</th></tr></tfoot>` : ''}
          </table>
        </div>` : ''}

        ${desgloseRows ? `
          <div class="section">
            <div class="section-title">${desgloseLabel}</div>
            <table>
              <thead><tr><th>${esSecciones ? 'Sección' : 'Frente'}</th><th style="text-align:right">Monto</th></tr></thead>
              <tbody>${desgloseRows}</tbody>
              ${esSecciones && conceptosRows ? `<tfoot><tr><th>Subtotal secciones</th><th style="text-align:right">${fmt(totalSecsImp)}</th></tr></tfoot>` : ''}
            </table>
          </div>
        ` : ''}

        ${esSecciones && conceptosRows ? `
          <div class="section">
            <div class="section-title">Otros Conceptos de Cobro</div>
            <table>
              <thead><tr><th>Concepto</th><th style="text-align:right">Monto</th></tr></thead>
              <tbody>${conceptosRows}</tbody>
              <tfoot><tr><th>Subtotal conceptos</th><th style="text-align:right">${fmt(totalConceptosImp)}</th></tr></tfoot>
            </table>
          </div>
          <div class="section">
            <table>
              <tfoot><tr><th class="total">TOTAL GENERAL</th><th class="total" style="text-align:right">${fmt(totalSecsImp + totalConceptosImp)}</th></tr></tfoot>
            </table>
          </div>
        ` : ''}

        <div class="firmas">
          <div class="firma">Elaboró</div>
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
      }, 280)
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo imprimir el recibo')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <ModalShell
      modulo="ingresos"
      titulo={isView ? (recibo!.folio ?? `Recibo #${recibo!.id}`) : 'Nuevo Recibo de Ingreso'}
      subtitulo={
        isView
          ? isEditMode
            ? `✏️ Editando · ${fmtFecha(form.fecha)} · ${centroSel?.nombre ?? 'Sin centro'}`
            : `${fmtFecha(form.fecha)} · ${centroSel?.nombre ?? 'Sin centro'}`
          : 'Captura manual de ingresos'
      }
      onClose={onClose}
      maxWidth={600}
      footer={
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Superadmin: botón Editar (solo si no está en modo edición ni cancelación) */}
            {isView && isSuperAdmin && !isEditMode && !showCancel && recibo!.status !== 'Cancelado' && (
              <button onClick={() => setIsEditMode(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'none', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <Pencil size={13} /> Editar recibo
              </button>
            )}
            {/* Cancelar recibo (solo vista normal, no en modo edición) */}
            {isView && !isEditMode && recibo!.status === 'Confirmado' && !showCancel && canWrite('ingresos') && (
              <button onClick={() => setShowCancel(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'none', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <Ban size={13} /> Cancelar recibo
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {isView && !isEditMode && (
              <button className="btn-secondary" onClick={handlePrint} disabled={printing} style={{ fontSize: 12 }}>
                {printing ? <Loader size={14} className="animate-spin" /> : <Printer size={14} />}
                Imprimir
              </button>
            )}
            {isEditMode ? (
              <>
                <button className="btn-secondary" onClick={() => { setIsEditMode(false); setError('') }}>
                  Descartar cambios
                </button>
                <button className="btn-primary" onClick={handleUpdate} disabled={saving}
                  style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                  {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                  Guardar cambios
                </button>
              </>
            ) : (
              <>
                <button className="btn-secondary" onClick={onClose}>
                  {isView ? 'Cerrar' : 'Cancelar'}
                </button>
                {!isView && (
                  <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                    Guardar Recibo
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isView && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: STATUS_STYLE[recibo!.status]?.bg ?? '#f8fafc',
              color: STATUS_STYLE[recibo!.status]?.color ?? '#64748b',
              display: 'inline-block' }}>
              {recibo!.status}
            </span>
          </div>
        )}
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>{error}</div>}

          {/* Fecha + Centro */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Fecha *</label>
              <input className="input" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} disabled={isView && !isEditMode} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Centro de Ingreso *</label>
              <select className="select" value={form.id_centro_ingreso_fk ?? ''} onChange={e => set('id_centro_ingreso_fk', e.target.value)} disabled={isView && !isEditMode}>
                <option value="">Seleccionar…</option>
                {centros.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Descripción / Concepto</label>
            <input className="input" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} disabled={isView && !isEditMode}
              placeholder="ej. Ventas del día — green fees, carros, práctica" />
          </div>

          {/* Montos: desglose por sección, frente, o monto único */}
          {esSecciones ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={13} style={{ color: '#7c3aed' }} /> Monto por sección residencial
              </div>
              {loadingSecs ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Loader size={16} className="animate-spin" /></div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '7px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>SECCIÓN</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>MONTO</span>
                  </div>
                  {secRows.map((row, i) => (
                    <div key={row.id_seccion_fk} style={{
                      display: 'grid', gridTemplateColumns: '1fr 140px', padding: '8px 12px', alignItems: 'center',
                      borderBottom: i < secRows.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: row.monto > 0 ? '#f0fdf4' : '#fff',
                    }}>
                      <span style={{ fontSize: 13, color: '#1e293b', fontWeight: row.monto > 0 ? 600 : 400 }}>{row.nombre_seccion}</span>
                      <div>
                        <input
                          className="input" type="number" min="0" step="0.01"
                          value={row.monto || ''}
                          onChange={e => setSecMonto(i, parseFloat(e.target.value) || 0)}
                          disabled={isView && !isEditMode}
                          style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '5px 8px', fontSize: 13 }}
                        />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '9px 12px', background: '#f0fdf4', borderTop: '2px solid #bbf7d0' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Subtotal secciones</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSecs)}</span>
                  </div>
                </div>
              )}

              {/* Conceptos complementarios */}
              {esConceptos && conceptoRows.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DollarSign size={13} style={{ color: '#7c3aed' }} /> Otros conceptos de cobro
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '7px 12px', background: '#faf5ff', borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>CONCEPTO</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textAlign: 'right' }}>MONTO</span>
                    </div>
                    {conceptoRows.map((row, i) => (
                      <div key={row.id_concepto_fk} style={{
                        display: 'grid', gridTemplateColumns: '1fr 140px', padding: '8px 12px', alignItems: 'center',
                        borderBottom: i < conceptoRows.length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: row.monto > 0 ? '#faf5ff' : '#fff',
                      }}>
                        <span style={{ fontSize: 13, color: '#1e293b', fontWeight: row.monto > 0 ? 600 : 400 }}>{row.nombre_concepto}</span>
                        <div>
                          <input
                            className="input" type="number" min="0" step="0.01"
                            value={row.monto || ''}
                            onChange={e => setConceptoMonto(i, parseFloat(e.target.value) || 0)}
                            disabled={isView && !isEditMode}
                            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '5px 8px', fontSize: 13 }}
                          />
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '9px 12px', background: '#faf5ff', borderTop: '2px solid #e9d5ff' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>Subtotal conceptos</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalConceptos)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Total general secciones + conceptos */}
              {(esConceptos && conceptoRows.length > 0) && (
                <div style={{ marginTop: 10, padding: '11px 14px', background: '#f0fdf4', borderRadius: 8, border: '2px solid #86efac', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>TOTAL GENERAL</span>
                  <span style={{ fontSize: 17, fontWeight: 800, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalFinal)}</span>
                </div>
              )}
              {(!esConceptos || conceptoRows.length === 0) && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSecs)}</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Desglose por concepto — solo para tipo_desglose = 'conceptos' (sin secciones) */}
          {!esSecciones && centroSel?.tipo_desglose === 'conceptos' && conceptoRows.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={13} style={{ color: '#d97706' }} /> Monto por concepto de cobro
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '7px 12px', background: '#fffbeb', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>CONCEPTO</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textAlign: 'right' }}>MONTO</span>
                </div>
                {conceptoRows.map((row, i) => (
                  <div key={row.id_concepto_fk} style={{
                    display: 'grid', gridTemplateColumns: '1fr 140px', padding: '8px 12px', alignItems: 'center',
                    borderBottom: i < conceptoRows.length - 1 ? '1px solid #f1f5f9' : 'none',
                    background: row.monto > 0 ? '#fffbeb' : '#fff',
                  }}>
                    <span style={{ fontSize: 13, color: '#1e293b', fontWeight: row.monto > 0 ? 600 : 400 }}>{row.nombre_concepto}</span>
                    <input
                      className="input" type="number" min="0" step="0.01"
                      value={row.monto || ''}
                      onChange={e => setConceptoMonto(i, parseFloat(e.target.value) || 0)}
                      disabled={isView && !isEditMode}
                      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '5px 8px', fontSize: 13 }}
                    />
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '9px 12px', background: '#fffbeb', borderTop: '2px solid #fde68a' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Total conceptos</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#92400e', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalConceptos)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Formas de pago — dinámicas desde cfg.formas_pago */}
          {formaPagoRows.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarSign size={13} style={{ color: '#059669' }} /> Formas de cobro
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {formaPagoRows.map((row, i) => (
                  <div key={row.id_forma_pago_fk}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>
                      {row.nombre_forma_pago}
                    </label>
                    <input
                      className="input" type="number" min="0" step="0.01"
                      value={row.monto || ''}
                      onChange={e => setFormaPagoMonto(i, parseFloat(e.target.value) || 0)}
                      disabled={isView && !isEditMode}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    />
                  </div>
                ))}
              </div>
              {/* Sumatoria de formas de cobro — siempre visible */}
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>
                  {esSecciones ? 'Total cobrado (formas)' : 'Total'}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalFormasPago)}</span>
              </div>

              {/* Validación: total general vs total cobrado (solo Cuotas Residencial) */}
              {(esSecciones || centroSel?.tipo_desglose === 'conceptos') && totalFormasPago > 0 && (
                (() => {
                  const diff = Math.round((totalFinal - totalFormasPago) * 100) / 100
                  const ok   = diff === 0
                  return (
                    <div style={{
                      marginTop: 8, padding: '10px 14px', borderRadius: 8,
                      background: ok ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${ok ? '#86efac' : '#fca5a5'}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: ok ? '#15803d' : '#dc2626' }}>
                        {ok ? '✓ Total cobrado coincide con el total general' : `⚠ Diferencia: ${fmt(Math.abs(diff))} ${diff > 0 ? '(falta por cobrar)' : '(excede el total)'}`}
                      </span>
                      {!ok && (
                        <span style={{ fontSize: 12, color: '#dc2626', fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fmt(totalFinal)} esperado
                        </span>
                      )}
                    </div>
                  )
                })()
              )}
            </div>
          )}

          {/* Notas */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={e => set('notas', e.target.value)}
              disabled={isView && !isEditMode} style={{ resize: 'vertical', minHeight: 52 }} />
          </div>

          {/* Datos de auditoría (vista) */}
          {isView && (
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
              Registrado por <strong>{recibo!.usuario_crea ?? '—'}</strong> · {fmtFecha(recibo!.created_at?.slice(0, 10))}
              {recibo!.status === 'Cancelado' && recibo!.motivo_cancelacion && (
                <div style={{ marginTop: 4, color: '#dc2626' }}>Cancelación: {recibo!.motivo_cancelacion}</div>
              )}
            </div>
          )}

          {/* Cancelar recibo */}
          {isView && recibo!.status === 'Confirmado' && showCancel && (
            <div style={{ padding: '14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>Motivo de cancelación</div>
              <textarea className="input" rows={2} value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)}
                style={{ resize: 'vertical', borderColor: '#fca5a5' }} placeholder="Escribe el motivo…" />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowCancel(false)}>Volver</button>
                <button onClick={handleCancel} disabled={cancelling}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {cancelling ? <Loader size={13} className="animate-spin" /> : <Ban size={13} />}
                  Confirmar cancelación
                </button>
              </div>
            </div>
          )}
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — Lista de recibos
// ════════════════════════════════════════════════════════════════
export default function RecibosIngresoPage() {
  const router = useRouter()
  const { authUser, canWrite } = useAuth()
  const [rows, setRows]         = useState<Recibo[]>([])
  const [centros, setCentros]   = useState<Centro[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [centrosMap, setCentrosMap] = useState<Record<number, Centro>>({})
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const [filterCentro, setFilterCentro] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFechaIni, setFilterFechaIni] = useState('')
  const [filterFechaFin, setFilterFechaFin] = useState('')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [detalle, setDetalle]   = useState<Recibo | null>(null)

  // Carga catálogos una sola vez
  useEffect(() => {
    Promise.all([
      dbCfg.from('centros_ingreso').select('*').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, nombre, clave_alfa').eq('activo', true).order('nombre'),
    ]).then(([{ data: cs }, { data: ss }]) => {
      const list = (cs ?? []) as Centro[]
      setCentros(list)
      const map: Record<number, Centro> = {}
      list.forEach(c => { map[c.id] = c })
      setCentrosMap(map)
      setSecciones((ss ?? []) as Seccion[])
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('recibos_ingreso')
      .select('*', { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (filterStatus)   q = q.eq('status', filterStatus)
    if (filterCentro)   q = q.eq('id_centro_ingreso_fk', Number(filterCentro))
    if (filterFechaIni) q = q.gte('fecha', filterFechaIni)
    if (filterFechaFin) q = q.lte('fecha', filterFechaFin)
    if (search)         q = q.ilike('folio', `%${search}%`)

    const { data, count } = await q
    setRows((data ?? []) as Recibo[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filterStatus, filterCentro, filterFechaIni, filterFechaFin, search])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages        = Math.ceil(total / PAGE_SIZE)
  const totalConfirmado   = rows.filter(r => r.status === 'Confirmado').reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalBorrador     = rows.filter(r => r.status === 'Borrador').reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalCancelado    = rows.filter(r => r.status === 'Cancelado').reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalPagina       = rows.reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalMes          = totalConfirmado

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <button onClick={() => router.push('/ingresos')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, marginBottom: 6, padding: 0 }}>
            <ChevronLeft size={14} /> Ingresos
          </button>
          <div className="page-eyebrow">
            <Receipt size={16} style={{ color: '#059669' }} />
            <span className="page-eyebrow-label">Captura</span>
          </div>
          <h1 className="page-title-xl">Recibos de Ingreso</h1>
          <p className="page-subtitle">
            {total} recibos · {fmt(totalMes)} en los filtros actuales
          </p>
        </div>
        {canWrite('ingresos') && (
          <div className="page-header-actions">
            <button className="btn-primary" onClick={() => setModal(true)}>
              <Plus size={14} /> Nuevo Recibo
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar folio…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <select className="select" style={{ width: 180 }} value={filterCentro} onChange={e => { setFilterCentro(e.target.value); setPage(0) }}>
          <option value="">Todos los centros</option>
          {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
          <input className="input" type="date" style={{ width: 148 }} value={filterFechaIni}
            onChange={e => { setFilterFechaIni(e.target.value); setPage(0) }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" style={{ width: 148 }} value={filterFechaFin}
            onChange={e => { setFilterFechaFin(e.target.value); setPage(0) }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Sumatoria de la página actual */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12 }}>
            <span style={{ color: '#64748b', fontWeight: 500 }}>Confirmados</span>
            <span style={{ fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalConfirmado)}</span>
          </div>
          {totalBorrador > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: '#64748b', fontWeight: 500 }}>Borradores</span>
              <span style={{ fontWeight: 700, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalBorrador)}</span>
            </div>
          )}
          {totalCancelado > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: '#64748b', fontWeight: 500 }}>Cancelados</span>
              <span style={{ fontWeight: 700, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCancelado)}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, marginLeft: 'auto' }}>
            <span style={{ color: '#0369a1', fontWeight: 600 }}>Total página ({rows.length} recibos)</span>
            <span style={{ fontWeight: 800, color: '#0369a1', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmt(totalPagina)}</span>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Centro de Ingreso</th>
                <th>Descripción</th>
                <th>Origen</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <Receipt size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                  <div style={{ fontSize: 14 }}>Sin recibos de ingreso</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {total === 0 ? 'Crea el primer recibo con el botón "Nuevo Recibo"' : 'Sin resultados con los filtros actuales'}
                  </div>
                </td></tr>
              ) : rows.map(r => {
                const centro = centrosMap[r.id_centro_ingreso_fk ?? 0]
                const color  = CENTRO_COLOR[centro?.tipo ?? 'otro'] ?? '#64748b'
                const sc     = STATUS_STYLE[r.status] ?? { bg: '#f8fafc', color: '#94a3b8' }
                const esCancelado = r.status === 'Cancelado'
                return (
                  <tr key={r.id} style={{ opacity: esCancelado ? 0.55 : 1 }}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>
                        {r.folio ?? `#${r.id}`}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtFecha(r.fecha)}</td>
                    <td>
                      {centro && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {centro.nombre}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.descripcion ?? '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {r.origen === 'cobranza' ? 'Cobranza' : r.origen === 'externo' ? 'Externo' : 'Manual'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: esCancelado ? '#94a3b8' : '#059669' }}>
                      {fmt(r.monto_total ?? 0)}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }}
                        onClick={() => setDetalle(r)} title="Ver detalle">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f0f9ff', borderTop: '2px solid #bae6fd' }}>
                  <td colSpan={5} style={{ padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#0369a1' }}>
                    Total página · {rows.length} recibos
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0369a1', fontVariantNumeric: 'tabular-nums', padding: '9px 12px' }}>
                    {fmt(totalPagina)}
                  </td>
                  <td colSpan={2} style={{ padding: '9px 12px', fontSize: 11, color: '#64748b' }}>
                    <span style={{ color: '#15803d', fontWeight: 600 }}>{fmt(totalConfirmado)}</span>
                    {totalBorrador > 0 && <span style={{ color: '#d97706', fontWeight: 600, marginLeft: 8 }}>{fmt(totalBorrador)}</span>}
                    {totalCancelado > 0 && <span style={{ color: '#94a3b8', marginLeft: 8 }}>{fmt(totalCancelado)}</span>}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Página {page + 1} de {totalPages} · {total} registros
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={13} />
              </button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal nuevo */}
      {modal && (
        <ReciboModal
          recibo={null}
          centros={centros}
          secciones={secciones}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchData() }}
          authUser={authUser}
          canWrite={canWrite}
        />
      )}

      {/* Modal detalle/cancelar */}
      {detalle && (
        <ReciboModal
          recibo={detalle}
          centros={centros}
          secciones={secciones}
          onClose={() => setDetalle(null)}
          onSaved={() => { setDetalle(null); fetchData() }}
          authUser={authUser}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
