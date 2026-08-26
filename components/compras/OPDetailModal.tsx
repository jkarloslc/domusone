'use client'
import { useState, useEffect, useRef } from 'react'
import { dbComp, dbCtrl, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useTiposGasto } from '@/lib/useTiposGasto'
import { fmt, fmtFecha, nextFolio, StatusBadge } from '@/app/compras/types'
import { OCDetail } from '@/components/compras/OCDetailModal'
import ModalShell from '@/components/ui/ModalShell'
import {
  Save, Loader, Printer, CheckCircle, Trash2, Edit2, Upload, ExternalLink,
  FileText, AlertTriangle, MessageSquare, Send, RotateCcw, Copy, Unlock, Tag,
} from 'lucide-react'

// Compartido con app/compras/ordenes-pago/page.tsx (OPModal) — única fuente.
export const URGENCIA_COLOR: Record<string, string> = {
  'Crítica': '#dc2626',
  'Alta':    '#d97706',
  'Media':   '#2563eb',
  'Baja':    '#64748b',
}

// Mismos colores que app/equipo-flota/CombustibleTab.tsx (VALE_STATUS_STYLE)
const VALE_STATUS_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  'Solicitado': { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  'Emitido':    { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Parcial':    { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Completado': { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Cancelado':  { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

export function OPDetail({ op, onClose, onCanceled, onEdit, onAuthorized }: {
  op: any; onClose: () => void; onCanceled: () => void; onEdit: () => void; onAuthorized: () => void
}) {
  const { authUser, canWrite, canAuth, canAuthFinanzas } = useAuth()
  const tiposGasto = useTiposGasto()
  const puedePublicarInstruccion = Boolean(
    authUser && (canWrite('ordenes-pago') || authUser.rol === 'tesoreria')
  )
  const puedeSubirFacturaPagada = op.status === 'Pagada' && canWrite('ordenes-pago')
  const [localOp, setLocalOp]   = useState(op)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const pdfDetailRef     = useRef<HTMLInputElement>(null)
  const xmlDetailRef     = useRef<HTMLInputElement>(null)
  const soporteDetailRef = useRef<HTMLInputElement>(null)

  const [ocsRel, setOcsRel]       = useState<any[]>([])
  const [detLinesView, setDetLinesView] = useState<any[]>([])
  const [ccMap,  setCcMap]        = useState<Record<number, string>>({})
  const [areaMap, setAreaMap]     = useState<Record<number, string>>({})
  const [areaCcMap, setAreaCcMap] = useState<Record<number, number>>({})
  const [frMap,  setFrMap]        = useState<Record<number, string>>({})
  const [equiposMap, setEquiposMap] = useState<Record<number, string>>({})
  const [valesComb, setValesComb] = useState<any[]>([])
  const [eventosRel, setEventosRel] = useState<any[]>([])
  const [bitacorasRel, setBitacorasRel] = useState<any[]>([])
  const [vigilanciaRel, setVigilanciaRel] = useState<any[]>([])
  const [reembolsoRel, setReembolsoRel] = useState<any | null>(null)
  const [servicioCat, setServicioCat] = useState<any | null>(null)
  const [servicioRegistros, setServicioRegistros] = useState<any[]>([])
  const [abonos, setAbonos]       = useState<any[]>([])
  const [loadingAbonos, setLoadingAbonos] = useState(true)
  const [authComment, setAuthCom] = useState('')
  const [authLoading, setAuthLd]  = useState(false)
  const [instrMsgs, setInstrMsgs] = useState<any[]>([])
  const [loadingInstr, setLoadingInstr] = useState(true)
  const [instrText, setInstrText] = useState('')
  const [sendingInstr, setSendingInstr] = useState(false)
  const [instrErr, setInstrErr] = useState('')

  // Reclasificar (superadmin) — corrige CC/Área/Frente/Tipo de Gasto de un
  // documento ya capturado, sin importar status, sin tocar monto/pagos.
  const [reclasOpen, setReclasOpen]   = useState(false)
  const [ccList, setCcList]           = useState<{ id: number; nombre: string }[]>([])
  const [areaList, setAreaList]       = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [frenteList, setFrenteList]   = useState<{ id: number; nombre: string }[]>([])
  const [relAF, setRelAF]             = useState<{ id_area: number; id_frente: number }[]>([])
  const [reclasCC, setReclasCC]       = useState('')
  const [reclasArea, setReclasArea]   = useState('')
  const [reclasFrente, setReclasFrente] = useState('')
  const [reclasTipoGasto, setReclasTipoGasto] = useState('')
  const [reclasSaving, setReclasSaving] = useState(false)
  const [reclasError, setReclasError] = useState('')

  // Reabrir / Duplicar (superadmin) — solo para OP Rechazada.
  const [reabrirLoading, setReabrirLoading] = useState(false)
  const [duplicarLoading, setDuplicarLoading] = useState(false)
  const [reabrirDuplicarError, setReabrirDuplicarError] = useState('')
  const [liberandoVales, setLiberandoVales] = useState(false)
  const [folioSustituta, setFolioSustituta] = useState<string | null>(null)
  const [folioOriginal, setFolioOriginal]   = useState<string | null>(null)

  // Consulta de OC relacionada (clic en folio, dentro de "Órdenes de Compra Relacionadas")
  const [ocDetalle, setOcDetalle] = useState<any | null>(null)
  const abrirOC = async (idOc: number) => {
    const { data: ocData } = await dbComp.from('ordenes_compra').select('*').eq('id', idOc).single()
    if (!ocData) return
    let provNombre = ''
    if (ocData.id_proveedor_fk) {
      const { data: provData } = await dbComp.from('proveedores').select('nombre').eq('id', ocData.id_proveedor_fk).maybeSingle()
      provNombre = provData?.nombre ?? ''
    }
    setOcDetalle({ ...ocData, _provNombre: provNombre })
  }

  useEffect(() => {
    if (op.id_op_sustituta_fk) {
      dbComp.from('ordenes_pago').select('folio').eq('id', op.id_op_sustituta_fk).maybeSingle()
        .then(({ data }) => setFolioSustituta(data?.folio ?? null))
    } else setFolioSustituta(null)
    if (op.id_op_original_fk) {
      dbComp.from('ordenes_pago').select('folio').eq('id', op.id_op_original_fk).maybeSingle()
        .then(({ data }) => setFolioOriginal(data?.folio ?? null))
    } else setFolioOriginal(null)
  }, [op.id, op.id_op_sustituta_fk, op.id_op_original_fk])

  const puedeAutorizar         = canAuth()
  const puedeAutorizarFinanzas = canAuthFinanzas()

  useEffect(() => { setLocalOp(op) }, [op])

  const uploadFacturaPagada = async (file: File, campo: 'pdf_factura' | 'xml_factura' | 'soporte_url') => {
    setUploadingDoc(campo)
    const ext = file.name.split('.').pop()
    const path = `op-${op.id}/${campo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('cxp-docs').upload(path, file, { upsert: true })
    if (upErr) {
      alert('Error al subir archivo: ' + upErr.message)
      setUploadingDoc(null)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('cxp-docs').getPublicUrl(path)
    const { error: dbErr } = await dbComp.from('ordenes_pago').update({ [campo]: publicUrl }).eq('id', op.id)
    if (dbErr) {
      alert(dbErr.message)
      setUploadingDoc(null)
      return
    }
    setLocalOp((p: any) => ({ ...p, [campo]: publicUrl }))
    setUploadingDoc(null)
  }

  const clearFacturaPagada = async (campo: 'pdf_factura' | 'xml_factura' | 'soporte_url') => {
    if (!confirm('¿Quitar este archivo de la orden de pago?')) return
    const { error: dbErr } = await dbComp.from('ordenes_pago').update({ [campo]: null }).eq('id', op.id)
    if (dbErr) { alert(dbErr.message); return }
    setLocalOp((p: any) => ({ ...p, [campo]: null }))
  }

  const enviarInstruccion = async () => {
    const t = instrText.trim()
    if (!t || !authUser || !puedePublicarInstruccion) return
    setSendingInstr(true)
    setInstrErr('')
    const { data, error } = await dbComp.from('ordenes_pago_instrucciones').insert({
      id_op_fk: op.id,
      autor_nombre: authUser.nombre,
      autor_rol: authUser.rol,
      cuerpo: t,
    }).select('id, autor_nombre, autor_rol, cuerpo, created_at').single()
    if (error) {
      setInstrErr(error.message)
      setSendingInstr(false)
      return
    }
    if (data) setInstrMsgs(m => [...m, data])
    setInstrText('')
    setSendingInstr(false)
  }

  useEffect(() => {
    setLoadingInstr(true)
    setInstrErr('')
    dbComp.from('ordenes_pago_instrucciones')
      .select('id, autor_nombre, autor_rol, cuerpo, created_at')
      .eq('id_op_fk', op.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) setInstrErr(error.message)
        setInstrMsgs(data ?? [])
        setLoadingInstr(false)
      })
  }, [op.id])

  useEffect(() => {
    dbComp.from('ordenes_pago_oc').select('*, ordenes_compra(folio, total)')
      .eq('id_op_fk', op.id)
      .then(({ data }) => setOcsRel(data ?? []))
    dbComp.from('ordenes_pago_det').select('*').eq('id_op_fk', op.id).order('id')
      .then(({ data }) => setDetLinesView(data ?? []))
    // Cargar catálogos para CC/Área/Frente/Equipos
    import('@/lib/supabase').then(({ dbCfg }) => {
      Promise.all([
        dbCfg.from('centros_costo').select('id, nombre'),
        dbCfg.from('areas').select('id, nombre, id_centro_costo_fk'),
        dbCfg.from('frentes').select('id, nombre'),
        dbCfg.from('equipos').select('id, nombre, placa'),
        dbCfg.from('rel_area_frente').select('id_area, id_frente'),
      ]).then(([{ data: cc }, { data: ar }, { data: fr }, { data: eq }, { data: raf }]) => {
        const cm: Record<number, string> = {}; (cc ?? []).forEach((r: any) => { cm[r.id] = r.nombre })
        const am: Record<number, string> = {}; (ar ?? []).forEach((r: any) => { am[r.id] = r.nombre })
        const acm: Record<number, number> = {}; (ar ?? []).forEach((r: any) => { if (r.id_centro_costo_fk) acm[r.id] = r.id_centro_costo_fk })
        const fm: Record<number, string> = {}; (fr ?? []).forEach((r: any) => { fm[r.id] = r.nombre })
        const em: Record<number, string> = {}; (eq ?? []).forEach((r: any) => { em[r.id] = r.placa ? `${r.nombre} (${r.placa})` : r.nombre })
        setCcMap(cm); setAreaMap(am); setAreaCcMap(acm); setFrMap(fm); setEquiposMap(em)
        setCcList((cc ?? []) as any); setAreaList((ar ?? []) as any); setFrenteList((fr ?? []) as any); setRelAF((raf ?? []) as any)
      })
    })

    setLoadingAbonos(true)
    dbComp.from('cxp_abonos').select('*').eq('id_op_fk', op.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setAbonos(data ?? []); setLoadingAbonos(false) })

    // Vales de combustible pagados con esta OP
    dbCtrl.from('vales_combustible').select('*').eq('id_op_fk', op.id).order('id')
      .then(({ data }) => setValesComb(data ?? []))

    // Eventos (Hospitality / Torneos Golf / Eventos Ecuestres) vinculados a esta OP
    dbCtrl.from('eventos_ops').select('id_evento_fk').eq('id_op_fk', op.id)
      .then(async ({ data }) => {
        const ids = Array.from(new Set((data ?? []).map((r: any) => r.id_evento_fk)))
        if (!ids.length) { setEventosRel([]); return }
        const { data: evs } = await dbCtrl.from('eventos').select('id, folio, nombre, modulo').in('id', ids)
        setEventosRel(evs ?? [])
      })

    // Bitácora de Equipo & Flota (mantenimiento vehicular) vinculada a esta OP
    dbCtrl.from('bitacora_equipo_ops').select('id_bitacora_fk, monto').eq('id_op_fk', op.id)
      .then(async ({ data }) => {
        const rows = data ?? []
        if (!rows.length) { setBitacorasRel([]); return }
        const ids = Array.from(new Set(rows.map((r: any) => r.id_bitacora_fk)))
        const { data: bits } = await dbCtrl.from('bitacora_equipos').select('id, folio, tipo, descripcion, id_equipo_fk').in('id', ids)
        const bm: Record<number, any> = {}; (bits ?? []).forEach((b: any) => { bm[b.id] = b })
        setBitacorasRel(rows.map((r: any) => ({ ...r, bitacora: bm[r.id_bitacora_fk] })))
      })

    // Lote de Vigilancia Extras (Perimetrales) pagado con esta OP
    dbCtrl.from('vigilancia_extras_lotes').select('*').eq('id_op_fk', op.id)
      .then(({ data }) => setVigilanciaRel(data ?? []))

    // Reembolso de Caja Chica que originó esta OP
    dbComp.from('reembolsos').select('id, folio, total, status, usuario_nombre, fecha').eq('id_op_fk', op.id).maybeSingle()
      .then(({ data }) => setReembolsoRel(data ?? null))

    // Servicio de suministro (CFE/Agua) al que está ligada esta OP + consumos registrados desde ella
    if (op.id_servicio_fk) {
      dbCtrl.from('servicios_catalogo').select('id, no_servicio, tipo_servicio, ubicacion').eq('id', op.id_servicio_fk).maybeSingle()
        .then(({ data }) => setServicioCat(data ?? null))
    } else {
      setServicioCat(null)
    }
    dbCtrl.from('servicios_registros').select('*').eq('id_op_fk', op.id)
      .then(({ data }) => setServicioRegistros(data ?? []))
  }, [op.id])

  const cancelar = async () => {
    if (!confirm('¿Cancelar esta orden de pago?')) return
    await dbComp.from('ordenes_pago').update({ status: 'Cancelada' }).eq('id', op.id)
    onCanceled()
  }

  // 1ra autorización: Pendiente Auth → Pendiente Auth Finanzas (o Rechazada)
  const handleAuth = async (aprobado: boolean) => {
    if (!aprobado && !confirm('¿Rechazar esta Orden de Pago? Esta acción no entrará a CXP.')) return
    setAuthLd(true)
    const updatePayload: any = {
      status: aprobado ? 'Pendiente Auth Finanzas' : 'Rechazada',
      notas:  authComment.trim()
        ? `[${aprobado ? 'Autorizado' : 'Rechazado'} por ${authUser?.nombre ?? ''}]: ${authComment.trim()}${op.notas ? '\n' + op.notas : ''}`
        : op.notas ?? null,
    }
    if (aprobado) {
      updatePayload.autorizado_por     = authUser?.nombre ?? null
      updatePayload.fecha_autorizacion = new Date().toISOString()
    }
    await dbComp.from('ordenes_pago').update(updatePayload).eq('id', op.id)
    setAuthLd(false)
    onAuthorized()
  }

  // 2da autorización (Finanzas): Pendiente Auth Finanzas → Pendiente (CXP) (o Rechazada)
  const handleAuthFinanzas = async (aprobado: boolean) => {
    if (!aprobado && !confirm('¿Rechazar esta Orden de Pago? Esta acción no entrará a CXP.')) return
    setAuthLd(true)
    const updatePayload: any = {
      status: aprobado ? 'Pendiente' : 'Rechazada',
      notas:  authComment.trim()
        ? `[${aprobado ? 'Autorizado (Finanzas)' : 'Rechazado (Finanzas)'} por ${authUser?.nombre ?? ''}]: ${authComment.trim()}${op.notas ? '\n' + op.notas : ''}`
        : op.notas ?? null,
    }
    if (aprobado) {
      updatePayload.autorizado_finanzas_por     = authUser?.nombre ?? null
      updatePayload.fecha_autorizacion_finanzas = new Date().toISOString()
    }
    await dbComp.from('ordenes_pago').update(updatePayload).eq('id', op.id)
    setAuthLd(false)
    onAuthorized()
  }

  // Reclasificar (superadmin): abre el panel precargado con los valores
  // actuales, sin importar el status de la OP.
  const abrirReclasificar = () => {
    setReclasCC(op.id_centro_costo_fk?.toString() ?? '')
    setReclasArea(op.id_area_fk?.toString() ?? '')
    setReclasFrente(op.id_frente_fk?.toString() ?? '')
    setReclasTipoGasto(op.tipo_gasto ?? '')
    setReclasError('')
    setReclasOpen(true)
  }

  // Update mínimo y explícito: SOLO estos 4 campos + auditoría. Nunca
  // monto, saldo, status, ni ningún campo de pago.
  const handleReclasificar = async () => {
    setReclasSaving(true); setReclasError('')
    const { error: err } = await dbComp.from('ordenes_pago').update({
      id_centro_costo_fk: reclasCC ? Number(reclasCC) : null,
      id_area_fk:         reclasArea ? Number(reclasArea) : null,
      id_frente_fk:        reclasFrente ? Number(reclasFrente) : null,
      tipo_gasto:          reclasTipoGasto || null,
      reclasificado_por:      authUser?.nombre ?? null,
      fecha_reclasificacion:  new Date().toISOString(),
    }).eq('id', op.id)
    setReclasSaving(false)
    if (err) { setReclasError(err.message); return }
    setReclasOpen(false)
    onAuthorized()
  }

  // Reabrir (superadmin, solo Rechazada): regresa la MISMA OP al punto de
  // autorización donde fue rechazada — a 'Pendiente Auth Finanzas' si ya
  // tenía la 1ra autorización hecha (autorizado_por), o a 'Pendiente Auth'
  // si fue rechazada desde el inicio. No toca monto/saldo ni el historial
  // de quién ya autorizó.
  const handleReabrir = async () => {
    if (!confirm(`¿Reabrir ${op.folio}? Regresará al flujo de autorización para corregirla y volver a someterla.`)) return
    setReabrirLoading(true); setReabrirDuplicarError('')
    const destino = op.autorizado_por ? 'Pendiente Auth Finanzas' : 'Pendiente Auth'
    const { error: err } = await dbComp.from('ordenes_pago').update({
      status: destino,
      reabierta_por:     authUser?.nombre ?? null,
      fecha_reapertura:  new Date().toISOString(),
      notas: `[Reabierta por ${authUser?.nombre ?? ''}]${op.notas ? '\n' + op.notas : ''}`,
    }).eq('id', op.id)
    setReabrirLoading(false)
    if (err) { setReabrirDuplicarError(err.message); return }
    onAuthorized()
  }

  // Duplicar (superadmin, solo Rechazada): crea una OP nueva (folio propio)
  // copiando los datos de clasificación/pago de la rechazada — nunca copia
  // el status ni nada de autorización — y dobla la original a 'Sustituida'.
  const handleDuplicar = async () => {
    if (!confirm(`¿Duplicar ${op.folio}? Se creará una OP nueva y ${op.folio} quedará como Sustituida.`)) return
    setDuplicarLoading(true); setReabrirDuplicarError('')
    let folio: string
    try {
      folio = await nextFolio(dbComp, 'OP')
    } catch (e: any) {
      setReabrirDuplicarError(e.message); setDuplicarLoading(false); return
    }
    const { data: nuevaOp, error: errIns } = await dbComp.from('ordenes_pago').insert({
      folio,
      id_proveedor_fk:     op.id_proveedor_fk,
      id_almacen_fk:       op.id_almacen_fk,
      id_centro_costo_fk:  op.id_centro_costo_fk,
      id_area_fk:          op.id_area_fk,
      id_frente_fk:         op.id_frente_fk,
      id_oc_fk:             op.id_oc_fk,
      forma_pago:           op.forma_pago,
      fecha_vencimiento:    op.fecha_vencimiento,
      concepto:             op.concepto,
      tipo_gasto:           op.tipo_gasto,
      urgencia:             op.urgencia,
      banco_destino:        op.banco_destino,
      cuenta_clabe:         op.cuenta_clabe,
      monto:                op.monto,
      fecha_factura:        op.fecha_factura,
      folio_factura:        op.folio_factura,
      subtotal:             op.subtotal,
      iva:                  op.iva,
      id_servicio_fk:       op.id_servicio_fk,
      pdf_factura:          op.pdf_factura,
      xml_factura:          op.xml_factura,
      soporte_url:          op.soporte_url,
      status:               'Pendiente Auth',
      created_by:           authUser?.nombre ?? null,
      id_op_original_fk:    op.id,
      notas: `Sustituye a ${op.folio} (rechazada).${op.notas ? '\n' + op.notas : ''}`,
    }).select('id').single()
    if (errIns || !nuevaOp) { setReabrirDuplicarError(errIns?.message ?? 'No se pudo crear la OP nueva'); setDuplicarLoading(false); return }

    const { data: ocsRelData } = await dbComp.from('ordenes_pago_oc').select('id_oc_fk, monto').eq('id_op_fk', op.id)
    if (ocsRelData && ocsRelData.length > 0) {
      await dbComp.from('ordenes_pago_oc').insert(
        ocsRelData.map((o: any) => ({ id_op_fk: nuevaOp.id, id_oc_fk: o.id_oc_fk, monto: o.monto }))
      )
    }
    const { data: detData } = await dbComp.from('ordenes_pago_det').select('descripcion, id_area_fk, id_frente_fk, monto').eq('id_op_fk', op.id)
    if (detData && detData.length > 0) {
      await dbComp.from('ordenes_pago_det').insert(
        detData.map((d: any) => ({ ...d, id_op_fk: nuevaOp.id }))
      )
    }

    await dbComp.from('ordenes_pago').update({
      status: 'Sustituida',
      id_op_sustituta_fk: nuevaOp.id,
    }).eq('id', op.id)

    setDuplicarLoading(false)
    onAuthorized()
  }

  // Liberar vales de combustible / lotes de vigilancia extras / bitácoras de
  // servicio (superadmin, solo Rechazada o Sustituida): estos quedan
  // ligados a la OP (id_op_fk directo en vales/vigilancia, fila en la
  // tabla puente bitacora_equipo_ops) incluso después de Reabrir/Duplicar
  // — si la OP ya no va a pagarse (Rechazada sin reabrir, o Sustituida y
  // ya no editable), el vale/lote/bitácora queda huérfano y nunca vuelve a
  // aparecer como disponible para otra OP. Esto lo libera para que se
  // pueda volver a seleccionar.
  const handleLiberarVales = async () => {
    const n = valesComb.length + vigilanciaRel.length + bitacorasRel.length
    if (!confirm(`¿Liberar ${n} registro(s) (vales de combustible / perimetrales / bitácoras de servicio) de ${op.folio}? Quedarán disponibles para usarse en otra OP.`)) return
    setLiberandoVales(true)
    await dbCtrl.from('vales_combustible').update({ id_op_fk: null }).eq('id_op_fk', op.id)
    await dbCtrl.from('vigilancia_extras_lotes').update({ id_op_fk: null }).eq('id_op_fk', op.id)
    await dbCtrl.from('bitacora_equipo_ops').delete().eq('id_op_fk', op.id)
    setLiberandoVales(false)
    onAuthorized()
  }

  const imprimir = async () => {
    // Fresh fetch para asegurar campos actualizados (autorizado_por, referencia_pago, etc.)
    const { data: freshOP } = await dbComp.from('ordenes_pago').select('*').eq('id', op.id).single()
    const opData = freshOP ? { ...op, ...freshOP } : op
    const areaIdCabecera = opData.id_area_fk ?? null
    const areaIdDet = detLinesView.find((l: any) => !!l.id_area_fk)?.id_area_fk ?? null
    const areaForCC = areaIdCabecera ?? areaIdDet
    const centroCostoId = opData.id_centro_costo_fk ?? (areaForCC ? areaCcMap[areaForCC] : null)
    const centroCostoNombre = centroCostoId ? (ccMap[centroCostoId] ?? `#${centroCostoId}`) : 'Sin asignar'
    const areaNombre = opData.id_area_fk ? (areaMap[opData.id_area_fk] ?? `#${opData.id_area_fk}`) : '—'
    const frenteNombre = opData.id_frente_fk ? (frMap[opData.id_frente_fk] ?? `#${opData.id_frente_fk}`) : '—'
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
    const nombreElaboro = opData.created_by ?? opData.usuario_crea ?? 'Sin registro'
    const nombreAutorizo1 = opData.autorizado_por
      ?? (opData.status === 'Rechazada' ? 'Rechazada' : 'Pendiente de autorización')
    const nombreAutorizo2 = opData.autorizado_finanzas_por
      ?? (opData.status === 'Rechazada' ? 'Rechazada'
        : opData.status === 'Sustituida' ? 'Sustituida'
        : opData.autorizado_por ? 'Pendiente de autorización (Finanzas)' : 'Pendiente')
    // Cargar config de organización
    let orgNombre = 'Organización'
    let orgSubtitulo = ''
    let orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')     orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo')  orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')   orgLogo      = r.valor ?? ''
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
          <div class="sub" style="margin:0">Folio: <strong>${opData.folio}</strong> &nbsp;·&nbsp; Fecha: ${fmtFecha(opData.fecha_op)}</div>
        </div>
      </div>
      <table>
        <tr><th>Beneficiario</th><td>${opData._provNombre ?? '—'}</td><th>Banco</th><td>${opData.banco_destino ?? '—'}</td></tr>
        <tr><th>CLABE / Cuenta</th><td style="font-family:monospace">${opData.cuenta_clabe ?? '—'}</td><th>Forma de Pago</th><td>${opData.forma_pago}</td></tr>
        <tr><th>Concepto</th><td colspan="3">${opData.concepto ?? '—'}</td></tr>
        <tr><th>Almacén</th><td>${opData._almNombre ?? '—'}</td><th>Vencimiento</th><td>${fmtFecha(opData.fecha_vencimiento)}</td></tr>
        ${opData.tipo_gasto ? `<tr><th>Tipo de Gasto</th><td colspan="3">${opData.tipo_gasto}</td></tr>` : ''}
        ${opData.urgencia ? `<tr><th>Urgencia</th><td colspan="3" style="font-weight:700">${opData.urgencia}</td></tr>` : ''}
        <tr><th>Centro de Costo</th><td colspan="3">${centroCostoNombre}</td></tr>
        ${detLinesView.length === 0 ? `<tr><th>Área</th><td>${areaNombre}</td><th>Frente</th><td>${frenteNombre}</td></tr>` : ''}
        ${ocsRel.length ? `<tr><th>OC(s) Relacionadas</th><td colspan="3">${ocsRel.map(r => r.ordenes_compra?.folio ?? `#${r.id_oc_fk}`).join(', ')}</td></tr>` : ''}
        ${(opData.folio_factura || opData.fecha_factura) ? `<tr><th>Folio Factura</th><td>${opData.folio_factura ?? '—'}</td><th>Fecha Factura</th><td>${fmtFecha(opData.fecha_factura)}</td></tr>` : ''}
        ${(opData.subtotal != null || opData.iva != null) ? `<tr><th>Subtotal</th><td>${fmt(opData.subtotal)}</td><th>IVA</th><td>${fmt(opData.iva)}</td></tr>` : ''}
        <tr><th class="total">TOTAL A PAGAR</th><td colspan="3" class="total">${fmt(opData.monto)}</td></tr>
      </table>
      ${detLinesView.length > 0 ? `
      <h3 style="font-size:13px;font-weight:700;color:#0D4F80;margin:18px 0 8px">Distribución por Área</h3>
      <table>
        <thead><tr><th>Descripción</th><th>Área</th><th>Frente</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>
          ${detLinesView.map((l: any) => `<tr>
            <td>${l.descripcion ?? '—'}</td>
            <td>${l.id_area_fk   ? (areaMap[l.id_area_fk]  ?? `#${l.id_area_fk}`)  : '—'}</td>
            <td>${l.id_frente_fk ? (frMap[l.id_frente_fk]  ?? `#${l.id_frente_fk}`) : '—'}</td>
            <td style="text-align:right;font-weight:600">${fmt(l.monto)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><th colspan="3">Total distribución</th><th style="text-align:right">${fmt(detLinesView.reduce((a: number, l: any) => a + (l.monto ?? 0), 0))}</th></tr></tfoot>
      </table>` : ''}
      ${valesComb.length > 0 ? `
      <h3 style="font-size:13px;font-weight:700;color:#0D4F80;margin:18px 0 8px">Vales de Combustible Asociados</h3>
      <table>
        <thead><tr><th>Folio</th><th>Suministro</th><th>Equipo / Área</th><th style="text-align:right">Litros Aut.</th><th style="text-align:right">Litros Cons.</th><th style="text-align:right">Monto Aut.</th><th>Status</th></tr></thead>
        <tbody>
          ${valesComb.map((v: any) => `<tr>
            <td style="font-family:monospace">${v.folio ?? `#${v.id}`}</td>
            <td>${v.tipo_suministro ?? '—'}</td>
            <td>${v.id_equipo_fk ? (equiposMap[v.id_equipo_fk] ?? `#${v.id_equipo_fk}`) : (v.id_area_fk ? (areaMap[v.id_area_fk] ?? `#${v.id_area_fk}`) : '—')}</td>
            <td style="text-align:right">${v.litros_autorizados ?? '—'}</td>
            <td style="text-align:right">${v.litros_consumidos ?? 0}</td>
            <td style="text-align:right;font-weight:600">${fmt(v.monto_autorizado)}</td>
            <td>${v.status}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : ''}
      ${eventosRel.length > 0 ? `<p style="font-size:12px;margin:10px 0 0"><strong>Evento(s) relacionado(s):</strong> ${eventosRel.map((e: any) => `${e.folio} — ${e.nombre}`).join(', ')}</p>` : ''}
      ${bitacorasRel.length > 0 ? `<p style="font-size:12px;margin:6px 0 0"><strong>Bitácora Equipo &amp; Flota:</strong> ${bitacorasRel.map((r: any) => r.bitacora?.folio ?? `#${r.id_bitacora_fk}`).join(', ')}</p>` : ''}
      ${vigilanciaRel.length > 0 ? `<p style="font-size:12px;margin:6px 0 0"><strong>Lote(s) Vigilancia Extras:</strong> ${vigilanciaRel.map((r: any) => r.folio ?? `#${r.id}`).join(', ')}</p>` : ''}
      ${reembolsoRel ? `<p style="font-size:12px;margin:6px 0 0"><strong>Reembolso Caja Chica de origen:</strong> ${reembolsoRel.folio ?? `#${reembolsoRel.id}`}</p>` : ''}
      ${servicioCat ? `<p style="font-size:12px;margin:6px 0 0"><strong>Servicio de Suministro:</strong> ${servicioCat.no_servicio} — ${servicioCat.tipo_servicio}${servicioCat.ubicacion ? ` · ${servicioCat.ubicacion}` : ''}</p>` : ''}
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
    <>
    <ModalShell
      modulo="compras"
      titulo={op.folio}
      subtitulo={`${op._provNombre ?? 'Sin proveedor'} · ${fmtFecha(op.fecha_op)}`}
      onClose={onClose}
      maxWidth={580}
      footer={
        <>
          <div>
            {op.status === 'Pendiente' && (
              <button onClick={cancelar} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 7,
                background: 'none', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancelar OP
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimir}>
              <Printer size={13} /> Imprimir
            </button>
            {['Pendiente Auth', 'Pendiente Auth Finanzas', 'Pendiente', 'Rechazada'].includes(op.status) && (
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>
                <Edit2 size={13} /> Editar
              </button>
            )}
          </div>
        </>
      }
    >
        {/* Status badge inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <StatusBadge status={op.status} />
        </div>

        {/* Cuerpo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Sec label="Beneficiario">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              <DI label="Proveedor"      value={op._provNombre} />
              <DI label="Banco"          value={op.banco_destino} />
              <DI label="CLABE / Cuenta" value={op.cuenta_clabe} mono />
              <DI label="Forma de Pago"  value={op.forma_pago} />
            </div>
          </Sec>

          <Sec label="Detalle del Pago">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              <DI label="Concepto"        value={op.concepto} />
              <DI label="Tipo de Gasto"   value={op.tipo_gasto} />
              <DI label="Almacén"         value={op._almNombre} />
              <DI label="Vencimiento"     value={fmtFecha(op.fecha_vencimiento)} />
              <DI label="Folio Factura"   value={op.folio_factura} mono />
              <DI label="Fecha Factura"   value={fmtFecha(op.fecha_factura)} />
              {op.subtotal != null && <DI label="Subtotal" value={fmt(op.subtotal)} />}
              {op.iva      != null && <DI label="IVA"      value={fmt(op.iva)} />}
              {op.urgencia && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Urgencia</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: URGENCIA_COLOR[op.urgencia] ?? 'var(--text-primary)' }}>{op.urgencia}</div>
                </div>
              )}
              {op.id_centro_costo_fk && <DI label="Centro de Costo" value={ccMap[op.id_centro_costo_fk] ?? `#${op.id_centro_costo_fk}`} />}
              {op.id_area_fk && detLinesView.length === 0 && <DI label="Área"   value={areaMap[op.id_area_fk] ?? `#${op.id_area_fk}`} />}
              {op.id_frente_fk && detLinesView.length === 0 && <DI label="Frente" value={frMap[op.id_frente_fk] ?? `#${op.id_frente_fk}`} />}
              {op.referencia_pago && <DI label="Ref. Pago"  value={op.referencia_pago} mono />}
              {op.fecha_pago      && <DI label="Fecha Pago" value={fmtFecha(op.fecha_pago)} />}
              {op.reclasificado_por && <DI label="Reclasificado por" value={`${op.reclasificado_por} — ${fmtFecha(op.fecha_reclasificacion)}`} />}
              {op.reabierta_por && <DI label="Reabierta por" value={`${op.reabierta_por} — ${fmtFecha(op.fecha_reapertura)}`} />}
            </div>
            {detLinesView.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                  Distribución por Área ({detLinesView.length} línea{detLinesView.length > 1 ? 's' : ''})
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th>Área</th>
                        <th>Frente</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detLinesView.map((l: any) => (
                        <tr key={l.id}>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.descripcion ?? '—'}</td>
                          <td style={{ fontSize: 12 }}>{l.id_area_fk   ? (areaMap[l.id_area_fk] ?? `#${l.id_area_fk}`)   : '—'}</td>
                          <td style={{ fontSize: 12 }}>{l.id_frente_fk ? (frMap[l.id_frente_fk]  ?? `#${l.id_frente_fk}`) : '—'}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(l.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                        <td colSpan={3} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 12px' }}>Total distribución</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', padding: '6px 12px' }}>
                          {fmt(detLinesView.reduce((a: number, l: any) => a + (l.monto ?? 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </Sec>

          <Sec label="Instrucciones y respuestas (CXP)">
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Conversación asociada a esta orden de pago (p. ej. pago anticipado, aclaraciones). Queda registrada por usuario y fecha.
            </p>
            {instrErr && (
              <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>
                {instrErr}
              </div>
            )}
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {loadingInstr ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}><Loader size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} /> Cargando…</div>
              ) : instrMsgs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  {puedePublicarInstruccion ? 'Aún no hay mensajes. Escribe una instrucción o respuesta.' : 'Sin mensajes registrados.'}
                </div>
              ) : (
                instrMsgs.map(m => {
                  const esTeso = m.autor_rol === 'tesoreria'
                  return (
                    <div key={m.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        borderLeft: `3px solid ${esTeso ? '#0891b2' : '#2563eb'}`,
                        background: esTeso ? '#f0fdfa' : '#f8fafc',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{m.autor_nombre ?? '—'}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {m.created_at
                            ? new Date(m.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
                            : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, textTransform: 'capitalize' }}>{m.autor_rol ?? ''}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{m.cuerpo}</div>
                    </div>
                  )
                })
              )}
            </div>
            {puedePublicarInstruccion ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Escribe una instrucción o respuesta…"
                  value={instrText}
                  onChange={e => setInstrText(e.target.value)}
                  style={{ resize: 'vertical', fontSize: 13 }}
                  disabled={sendingInstr}
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  disabled={sendingInstr || !instrText.trim()}
                  onClick={enviarInstruccion}
                >
                  {sendingInstr ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
                  Enviar
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={14} /> Solo lectura: tu rol no puede agregar mensajes en este hilo.
              </div>
            )}
          </Sec>

          {/* Documentos: solo OP Pagada + permiso → carga PDF/XML; Pendiente u otros → solo lectura si ya hay archivos */}
          {puedeSubirFacturaPagada ? (
            <Sec label="Documentos de la Operación">
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Orden pagada: adjunta el PDF y el XML (CFDI) de la factura. Puedes reemplazar o quitar archivos cuando lo necesites.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">PDF Factura</label>
                  <input ref={pdfDetailRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'pdf_factura'); e.target.value = '' }} />
                  {localOp.pdf_factura ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <a href={localOp.pdf_factura} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                        <ExternalLink size={11} /> Ver PDF
                      </a>
                      <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                        onClick={() => clearFacturaPagada('pdf_factura')} disabled={!!uploadingDoc}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                      onClick={() => pdfDetailRef.current?.click()} disabled={uploadingDoc === 'pdf_factura'}>
                      {uploadingDoc === 'pdf_factura' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                      {uploadingDoc === 'pdf_factura' ? 'Subiendo…' : 'Adjuntar PDF'}
                    </button>
                  )}
                </div>
                <div>
                  <label className="label">XML Factura (CFDI)</label>
                  <input ref={xmlDetailRef} type="file" accept=".xml,text/xml,application/xml" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'xml_factura'); e.target.value = '' }} />
                  {localOp.xml_factura ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <a href={localOp.xml_factura} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                        <ExternalLink size={11} /> Ver XML
                      </a>
                      <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                        onClick={() => clearFacturaPagada('xml_factura')} disabled={!!uploadingDoc}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                      onClick={() => xmlDetailRef.current?.click()} disabled={uploadingDoc === 'xml_factura'}>
                      {uploadingDoc === 'xml_factura' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                      {uploadingDoc === 'xml_factura' ? 'Subiendo…' : 'Adjuntar XML'}
                    </button>
                  )}
                </div>
              </div>
              {/* Soporte — disponible en cualquier estado */}
              <div>
                <label className="label">Soporte (cotización, contrato, correo, etc.)</label>
                <input ref={soporteDetailRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'soporte_url'); e.target.value = '' }} />
                {localOp.soporte_url ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <a href={localOp.soporte_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                      <ExternalLink size={11} /> Ver Soporte
                    </a>
                    <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                      onClick={() => clearFacturaPagada('soporte_url')} disabled={!!uploadingDoc}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                    onClick={() => soporteDetailRef.current?.click()} disabled={uploadingDoc === 'soporte_url'}>
                    {uploadingDoc === 'soporte_url' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                    {uploadingDoc === 'soporte_url' ? 'Subiendo…' : 'Adjuntar Soporte'}
                  </button>
                )}
              </div>
            </Sec>
          ) : (op.pdf_factura || op.xml_factura || localOp.soporte_url || canWrite('ordenes-pago')) ? (
            <Sec label="Documentos de la Operación">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {op.pdf_factura && (
                  <a href={op.pdf_factura} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                      background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, textDecoration: 'none' }}>
                    <FileText size={13} /> PDF Factura
                  </a>
                )}
                {op.xml_factura && (
                  <a href={op.xml_factura} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                      background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 7, textDecoration: 'none' }}>
                    <FileText size={13} /> XML Factura
                  </a>
                )}
              </div>
              {/* Soporte — siempre editable si tiene permiso de escritura */}
              <div>
                <label className="label">Soporte (cotización, contrato, correo, etc.)</label>
                <input ref={soporteDetailRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'soporte_url'); e.target.value = '' }} />
                {localOp.soporte_url ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <a href={localOp.soporte_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                      <ExternalLink size={11} /> Ver Soporte
                    </a>
                    {canWrite('ordenes-pago') && (
                      <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                        onClick={() => clearFacturaPagada('soporte_url')} disabled={!!uploadingDoc}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ) : canWrite('ordenes-pago') ? (
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                    onClick={() => soporteDetailRef.current?.click()} disabled={uploadingDoc === 'soporte_url'}>
                    {uploadingDoc === 'soporte_url' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                    {uploadingDoc === 'soporte_url' ? 'Subiendo…' : 'Adjuntar Soporte'}
                  </button>
                ) : (
                  <div style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    Sin soporte registrado.
                  </div>
                )}
              </div>
            </Sec>
          ) : null}

          {ocsRel.length > 0 && (
            <Sec label="Órdenes de Compra Relacionadas">
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Folio OC</th><th style={{ textAlign: 'right' }}>Total OC</th><th style={{ textAlign: 'right' }}>Monto OP</th></tr></thead>
                  <tbody>
                    {ocsRel.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>
                          <button type="button" onClick={() => abrirOC(r.id_oc_fk)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, textDecoration: 'underline' }}>
                            {r.ordenes_compra?.folio ?? `#${r.id_oc_fk}`}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.ordenes_compra?.total)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sec>
          )}

          {valesComb.length > 0 && (
            <Sec label="Vales de Combustible Asociados">
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th><th>Suministro</th><th>Equipo / Área</th>
                      <th style={{ textAlign: 'right' }}>Litros Aut.</th>
                      <th style={{ textAlign: 'right' }}>Litros Cons.</th>
                      <th style={{ textAlign: 'right' }}>Monto Aut.</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valesComb.map((v: any) => {
                      const s = VALE_STATUS_COLOR[v.status] ?? VALE_STATUS_COLOR['Solicitado']
                      return (
                        <tr key={v.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{v.folio ?? `#${v.id}`}</td>
                          <td style={{ fontSize: 12 }}>{v.tipo_suministro ?? '—'}</td>
                          <td style={{ fontSize: 12 }}>{v.id_equipo_fk ? (equiposMap[v.id_equipo_fk] ?? `#${v.id_equipo_fk}`) : (v.id_area_fk ? (areaMap[v.id_area_fk] ?? `#${v.id_area_fk}`) : '—')}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{v.litros_autorizados ?? '—'}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{v.litros_consumidos ?? 0}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(v.monto_autorizado)}</td>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                              color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
                              {v.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Sec>
          )}

          {eventosRel.length > 0 && (
            <Sec label="Eventos Relacionados">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {eventosRel.map((e: any) => (
                  <div key={e.id} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{e.folio}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{e.nombre}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{e.modulo}</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {bitacorasRel.length > 0 && (
            <Sec label="Bitácora de Equipo & Flota Relacionada">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bitacorasRel.map((r: any, i: number) => (
                  <div key={i} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.bitacora?.folio ?? `#${r.id_bitacora_fk}`}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        {r.bitacora?.tipo ?? '—'} · {r.bitacora?.id_equipo_fk ? (equiposMap[r.bitacora.id_equipo_fk] ?? `#${r.bitacora.id_equipo_fk}`) : '—'}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(r.monto)}</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {vigilanciaRel.length > 0 && (
            <Sec label="Vigilancia Extras (Perimetrales) Relacionada">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {vigilanciaRel.map((r: any) => (
                  <div key={r.id} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio ?? `#${r.id}`}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{fmtFecha(r.fecha_desde)} – {fmtFecha(r.fecha_hasta)}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(r.total)}</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {reembolsoRel && (
            <Sec label="Reembolso de Caja Chica de Origen">
              <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{reembolsoRel.folio ?? `#${reembolsoRel.id}`}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{reembolsoRel.usuario_nombre ?? '—'} · {fmtFecha(reembolsoRel.fecha)}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(reembolsoRel.total)}</span>
              </div>
            </Sec>
          )}

          {(servicioCat || servicioRegistros.length > 0) && (
            <Sec label="Servicio de Suministro (CFE / Agua) Relacionado">
              {servicioCat && (
                <div style={{ marginBottom: servicioRegistros.length > 0 ? 8 : 0, fontSize: 13 }}>
                  <strong>{servicioCat.no_servicio}</strong> — {servicioCat.tipo_servicio}{servicioCat.ubicacion ? ` · ${servicioCat.ubicacion}` : ''}
                </div>
              )}
              {servicioRegistros.length > 0 && (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table>
                    <thead><tr><th>Periodo</th><th style={{ textAlign: 'right' }}>Consumo</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
                    <tbody>
                      {servicioRegistros.map((r: any) => (
                        <tr key={r.id}>
                          <td style={{ fontSize: 12 }}>{fmtFecha(r.fecha_periodo)}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{r.consumo_periodo ?? '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto_periodo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Sec>
          )}

          {abonos.length > 0 && (
            <Sec label="Pagos Asociados">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {loadingAbonos ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>Cargando pagos...</div>
                ) : abonos.map(a => (
                  <div key={a.id} style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>
                        {fmt(a.monto)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {fmtFecha(a.fecha_abono)} · {a.forma_pago}
                        {a.referencia && <span style={{ marginLeft: 6, fontFamily: 'monospace' }}>Ref: {a.referencia}</span>}
                      </div>
                      {a.notas && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>{a.notas}</div>}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {a.comprobante && (
                        <a href={a.comprobante} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', background: '#eff6ff', color: 'var(--blue)', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none' }}>
                          <CheckCircle size={11} /> Comprobante de Pago
                        </a>
                      )}
                      {a.complemento_pago && (
                        <a href={a.complemento_pago} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', background: '#fdf4ff', color: '#7c3aed', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none' }}>
                          <FileText size={11} /> Complemento SAT
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          <div style={{ padding: '14px 18px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL A PAGAR</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(op.monto)}</span>
          </div>

          {op.notas && <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Notas: {op.notas}</p>}

          {/* ── Bloque de Autorización ── solo cuando status = Pendiente Auth ── */}
          {op.status === 'Pendiente Auth' && (
            <div style={{ padding: '16px 18px', background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                  Pendiente de Autorización
                </span>
                <span style={{ fontSize: 11, color: '#a16207', marginLeft: 'auto' }}>
                  {(op.id_oc_fk != null || ocsRel.length > 0) ? 'Con OC vinculada — requiere aprobación' : 'Gasto directo sin OC — requiere aprobación'}
                </span>
              </div>
              {puedeAutorizar ? (
                <>
                  <textarea
                    className="input" rows={2}
                    placeholder="Comentario u observación (opcional)…"
                    value={authComment} onChange={e => setAuthCom(e.target.value)}
                    style={{ marginBottom: 10, resize: 'vertical', fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAuth(true)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #bbf7d0',
                        background: '#f0fdf4', color: '#15803d', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {authLoading ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                      Autorizar — Operaciones
                    </button>
                    <button
                      onClick={() => handleAuth(false)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #fecaca',
                        background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Trash2 size={14} /> Rechazar
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#a16207', margin: 0 }}>
                  En espera de aprobación por Administración, Administrador (Organismo), Supervisor de Compras, Tesorería o Fraccionamiento.
                </p>
              )}
            </div>
          )}

          {/* ── Bloque de 2da Autorización (Finanzas) ── solo cuando status = Pendiente Auth Finanzas ── */}
          {op.status === 'Pendiente Auth Finanzas' && (
            <div style={{ padding: '16px 18px', background: '#f5f3ff', border: '2px solid #ddd6fe', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={15} style={{ color: '#7c3aed', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>
                  Segunda Autorización (Finanzas)
                </span>
                <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 'auto' }}>
                  Ya autorizada{op.autorizado_por ? ` por ${op.autorizado_por}` : ''} — falta envío a CXP
                </span>
              </div>
              {puedeAutorizarFinanzas ? (
                <>
                  <textarea
                    className="input" rows={2}
                    placeholder="Comentario u observación (opcional)…"
                    value={authComment} onChange={e => setAuthCom(e.target.value)}
                    style={{ marginBottom: 10, resize: 'vertical', fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAuthFinanzas(true)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #bbf7d0',
                        background: '#f0fdf4', color: '#15803d', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {authLoading ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                      Autorizar — enviar a CXP
                    </button>
                    <button
                      onClick={() => handleAuthFinanzas(false)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #fecaca',
                        background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Trash2 size={14} /> Rechazar
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#5b21b6', margin: 0 }}>
                  En espera de la segunda autorización por Administrador de Finanzas.
                </p>
              )}
            </div>
          )}

          {/* Confirmación de rechazo */}
          {op.status === 'Rechazada' && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              Esta Orden de Pago fue rechazada y no ingresará a Cuentas por Pagar.
            </div>
          )}

          {/* Confirmación de sustitución */}
          {op.status === 'Sustituida' && (
            <div style={{ padding: '12px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8,
              fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              Esta Orden de Pago fue sustituida{folioSustituta ? ` por ${folioSustituta}` : ''} y no ingresará a Cuentas por Pagar.
            </div>
          )}
          {op.id_op_original_fk && folioOriginal && (
            <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
              fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              Esta Orden de Pago sustituye a {folioOriginal} (rechazada).
            </div>
          )}

          {/* Reabrir / Duplicar (solo superadmin, solo Rechazada) */}
          {authUser?.rol === 'superadmin' && op.status === 'Rechazada' && (
            <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                Esta OP fue rechazada — puedes reabrirla para corregirla, o duplicarla con folio nuevo
              </div>
              {reabrirDuplicarError && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{reabrirDuplicarError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleReabrir} disabled={reabrirLoading || duplicarLoading}>
                  {reabrirLoading ? <Loader size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reabrir esta OP
                </button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={handleDuplicar} disabled={reabrirLoading || duplicarLoading}>
                  {duplicarLoading ? <Loader size={13} className="animate-spin" /> : <Copy size={13} />} Duplicar con folio nuevo
                </button>
              </div>
            </div>
          )}

          {/* Liberar vales de combustible / perimetrales / bitácoras de
              servicio (solo superadmin, Rechazada o Sustituida) — Duplicar
              NO mueve estos vínculos a la OP nueva, así que quedan
              huérfanos ligados a esta OP; en Sustituida ya no se puede ni
              editar para desligarlos a mano. */}
          {authUser?.rol === 'superadmin' && (op.status === 'Rechazada' || op.status === 'Sustituida') && (valesComb.length > 0 || vigilanciaRel.length > 0 || bitacorasRel.length > 0) && (
            <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                Esta OP tiene {[
                  valesComb.length > 0 ? `${valesComb.length} vale(s) de combustible` : null,
                  vigilanciaRel.length > 0 ? `${vigilanciaRel.length} lote(s) de perimetrales` : null,
                  bitacorasRel.length > 0 ? `${bitacorasRel.length} bitácora(s) de servicio` : null,
                ].filter(Boolean).join(', ')} ligados — libéralos para volver a usarlos en otra OP
              </div>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={handleLiberarVales} disabled={liberandoVales}>
                {liberandoVales ? <Loader size={13} className="animate-spin" /> : <Unlock size={13} />} Liberar vales / perimetrales / bitácoras
              </button>
            </div>
          )}

          {/* Reclasificar (solo superadmin) — corrige CC/Área/Frente/Tipo de
              Gasto sin importar status, nunca monto/saldo/pagos. */}
          {authUser?.rol === 'superadmin' && (
            <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
              {!reclasOpen ? (
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={abrirReclasificar}>
                  <Tag size={13} /> Reclasificar CC/Área/Frente/Tipo de Gasto
                </button>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                    Reclasificar — solo corrige clasificación, no toca monto ni pagos
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
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
                    <div><label className="label">Tipo de Gasto</label>
                      <select className="select" value={reclasTipoGasto} onChange={e => setReclasTipoGasto(e.target.value)}>
                        <option value="">— Sin asignar —</option>
                        {tiposGasto.map(t => <option key={t} value={t}>{t}</option>)}
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
              {op.reclasificado_por && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: reclasOpen ? 12 : 8, marginBottom: 0 }}>
                  Última reclasificación: {op.reclasificado_por} — {new Date(op.fecha_reclasificacion).toLocaleString('es-MX')}
                </p>
              )}
            </div>
          )}
        </div>
    </ModalShell>
    {ocDetalle && (
      <OCDetail oc={ocDetalle} canAuth={false} onAuth={() => {}} onClose={() => setOcDetalle(null)} />
    )}
    </>
  )
}

// ── Helpers UI ─────────────────────────────────────────────
export const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>
)
export const DI = ({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
  </div>
) : null
