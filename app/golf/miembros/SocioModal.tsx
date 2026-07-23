'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase, dbGolf, dbCtrl } from '@/lib/supabase'
import TabCobranzaSocio from './TabCobranzaSocio'
import TabRecibosSocio from './TabRecibosSocio'
import { X, Save, Loader, Plus, Trash2, Users, Upload, FileText, Image, CheckCircle, ExternalLink, FileCheck, Award, Receipt, Edit2 } from 'lucide-react'

export type Socio = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  id_categoria_fk: number | null
  email: string | null
  telefono: string | null
  fecha_nacimiento: string | null
  fecha_alta: string | null
  fecha_vencimiento: string | null
  rfc: string | null
  curp: string | null
  numero_tarjeta: string | null
  nacionalidad: string | null
  activo: boolean
  derecho_intercambios?: boolean
  observaciones: string | null
  identificacion_url: string | null
  created_at: string
  // Datos fiscales SAT
  razon_social_fiscal: string | null
  cp_fiscal: string | null
  regimen_fiscal: string | null
  uso_cfdi: string | null
  email_fiscal: string | null
  // joins
  cat_categorias_socios?: { nombre: string } | null
}

type Categoria = { id: number; nombre: string; descripcion: string | null }

type Familiar = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  parentesco: string | null
  fecha_nacimiento: string | null
  nacionalidad: string | null
  activo: boolean
}

type Contrato = {
  id: number
  id_socio_fk: number
  anio: number
  fecha_inicio: string | null
  fecha_fin: string | null
  monto: number | null
  vigente: boolean
  archivo_url: string | null
  notas: string | null
  created_at: string
}

const PARENTESCOS = ['Esposo','Esposa', 'Hijo', 'Hija', 'Padre', 'Madre', 'Hermano', 'Hermana', 'Sobrino', 'Usuario']

type FamiliarForm = {
  nombre: string
  apellido_paterno: string
  apellido_materno: string
  parentesco: string
  fecha_nacimiento: string
  nacionalidad: string
}

const FAMILIAR_VACIO: FamiliarForm = {
  nombre: '', apellido_paterno: '', apellido_materno: '', parentesco: '', fecha_nacimiento: '', nacionalidad: '',
}

type ContratoForm = {
  anio: string
  fecha_inicio: string
  fecha_fin: string
  monto: string
  notas: string
}

const CONTRATO_VACIO: ContratoForm = {
  anio: String(new Date().getFullYear()),
  fecha_inicio: '',
  fecha_fin: '',
  monto: '',
  notas: '',
}

type Federacion = {
  id: number
  id_socio_fk: number
  clave: string | null
  periodo: number
  comprobante_url: string | null
  notas: string | null
  created_at: string
}

type DatoFiscal = {
  id: number
  id_socio_fk: number
  alias: string | null
  rfc: string
  razon_social_fiscal: string
  cp_fiscal: string | null
  regimen_fiscal: string | null
  uso_cfdi: string | null
  email_fiscal: string | null
  es_principal: boolean
  created_at: string
}

type DatoFiscalForm = {
  alias: string
  rfc: string
  razon_social_fiscal: string
  cp_fiscal: string
  regimen_fiscal: string
  uso_cfdi: string
  email_fiscal: string
}

const DATO_FISCAL_VACIO: DatoFiscalForm = {
  alias: '', rfc: '', razon_social_fiscal: '', cp_fiscal: '', regimen_fiscal: '626', uso_cfdi: 'G03', email_fiscal: '',
}

type FederacionForm = {
  clave: string
  periodo: string
  notas: string
}

const FEDERACION_VACIA: FederacionForm = {
  clave: '',
  periodo: String(new Date().getFullYear()),
  notas: '',
}

type Props = {
  socio: Socio | null
  onClose: () => void
  onSaved: () => void
}

const TABS = ['Datos Personales', 'Membresía', 'Familiares', 'Identificación', 'Contratos', 'Notas', 'Datos Fiscales', 'Federación', 'Facturas', 'Cobranza', 'Recibos']

const REGIMENES_FISCALES_SAT = [
  { clave: '601', desc: 'General de Ley Personas Morales' },
  { clave: '603', desc: 'Personas Morales sin Fines de Lucro' },
  { clave: '605', desc: 'Sueldos y Salarios e Ingresos Asimilados' },
  { clave: '612', desc: 'Personas Físicas con Actividades Empresariales' },
  { clave: '616', desc: 'Sin obligaciones fiscales' },
  { clave: '621', desc: 'Incorporación Fiscal' },
  { clave: '625', desc: 'Actividades Empresariales con Ingresos a través de Plataformas' },
  { clave: '626', desc: 'Simplificado de Confianza (RESICO)' },
]
const USOS_CFDI_SAT = [
  { clave: 'G01', desc: 'Adquisición de mercancias' },
  { clave: 'G03', desc: 'Gastos en general' },
  { clave: 'CP01', desc: 'Pagos' },
  { clave: 'D10', desc: 'Pagos por servicios educativos' },
  { clave: 'S01', desc: 'Sin efectos fiscales' },
]

export default function SocioModal({ socio, onClose, onSaved }: Props) {
  const isNew = !socio
  const [tab, setTab]       = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])

  // ── Familiares ──
  const [familiares, setFamiliares]     = useState<Familiar[]>([])
  const [loadingFam, setLoadingFam]     = useState(false)
  const [showFormFam, setShowFormFam]   = useState(false)
  const [savingFam, setSavingFam]       = useState(false)
  const [errorFam, setErrorFam]         = useState('')
  const [nuevoFam, setNuevoFam]         = useState<FamiliarForm>(FAMILIAR_VACIO)
  const [eliminando, setEliminando]     = useState<number | null>(null)

  // ── Identificación ──
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const [idUrl, setIdUrl]               = useState<string | null>(socio?.identificacion_url ?? null)
  const [uploadingId, setUploadingId]   = useState(false)
  const [uploadError, setUploadError]   = useState('')
  const [idSignedUrl, setIdSignedUrl]   = useState<string | null>(null)

  // ── Contratos ──
  const [contratos, setContratos]       = useState<Contrato[]>([])
  const [loadingCon, setLoadingCon]     = useState(false)
  const [showFormCon, setShowFormCon]   = useState(false)
  const [savingCon, setSavingCon]       = useState(false)
  const [errorCon, setErrorCon]         = useState('')
  const [nuevoCon, setNuevoCon]         = useState<ContratoForm>(CONTRATO_VACIO)
  const [marcandoVigente, setMarcandoVigente] = useState<number | null>(null)
  const [eliminandoCon, setEliminandoCon]     = useState<number | null>(null)
  const fileConRef = useRef<HTMLInputElement>(null)
  const [uploadingCon, setUploadingCon] = useState(false)
  const [archivoConUrl, setArchivoConUrl] = useState('')

  // ── Federación ──
  const [federaciones, setFederaciones]         = useState<Federacion[]>([])
  const [loadingFed, setLoadingFed]             = useState(false)
  const [showFormFed, setShowFormFed]           = useState(false)
  const [savingFed, setSavingFed]               = useState(false)
  const [errorFed, setErrorFed]                 = useState('')
  const [nuevoFed, setNuevoFed]                 = useState<FederacionForm>(FEDERACION_VACIA)
  const [eliminandoFed, setEliminandoFed]       = useState<number | null>(null)
  const fileFedRef = useRef<HTMLInputElement>(null)
  const [uploadingFed, setUploadingFed]         = useState(false)
  const [comprobanteFedUrl, setComprobanteFedUrl] = useState('')

  // ── Datos Fiscales ──
  const [fiscales, setFiscales]                 = useState<DatoFiscal[]>([])
  const [loadingFiscal, setLoadingFiscal]       = useState(false)
  const [showFormFiscal, setShowFormFiscal]     = useState(false)
  const [savingFiscal, setSavingFiscal]         = useState(false)
  const [errorFiscal, setErrorFiscal]           = useState('')
  const [nuevoFiscal, setNuevoFiscal]           = useState<DatoFiscalForm>(DATO_FISCAL_VACIO)
  const [eliminandoFiscal, setEliminandoFiscal] = useState<number | null>(null)
  const [marcandoPrincipal, setMarcandoPrincipal] = useState<number | null>(null)
  const [editandoFiscalId, setEditandoFiscalId] = useState<number | null>(null)

  // ── Facturas del socio ──
  const [facturasSocio, setFacturasSocio]   = useState<any[]>([])
  const [loadingFact, setLoadingFact]       = useState(false)

  const [form, setForm] = useState({
    numero_socio:      socio?.numero_socio      ?? '',
    nombre:            socio?.nombre            ?? '',
    apellido_paterno:  socio?.apellido_paterno  ?? '',
    apellido_materno:  socio?.apellido_materno  ?? '',
    id_categoria_fk:   socio?.id_categoria_fk   ?? '' as number | '',
    email:             socio?.email             ?? '',
    telefono:          socio?.telefono          ?? '',
    fecha_nacimiento:  socio?.fecha_nacimiento  ?? '',
    fecha_alta:        socio?.fecha_alta        ?? (new Date().toISOString().split('T')[0]),
    fecha_vencimiento: socio?.fecha_vencimiento ?? '',
    rfc:               socio?.rfc               ?? '',
    curp:              socio?.curp              ?? '',
    numero_tarjeta:    socio?.numero_tarjeta    ?? '',
    nacionalidad:      socio?.nacionalidad      ?? 'Mexicana',
    activo:                 socio?.activo                ?? true,
    derecho_intercambios:   socio?.derecho_intercambios  ?? false,
    observaciones:          socio?.observaciones         ?? '',
  })

  const set    = (k: keyof typeof form, v: any)     => setForm(f => ({ ...f, [k]: v }))
  const setFam = (k: keyof FamiliarForm, v: string)  => setNuevoFam(f => ({ ...f, [k]: v }))
  const setCon = (k: keyof ContratoForm, v: string)  => setNuevoCon(f => ({ ...f, [k]: v }))
  const setFed = (k: keyof FederacionForm, v: string) => setNuevoFed(f => ({ ...f, [k]: v }))
  const setFiscal = (k: keyof DatoFiscalForm, v: string) => setNuevoFiscal(f => ({ ...f, [k]: v }))

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre, descripcion').eq('activo', true).order('nombre')
      .then(({ data }) => setCategorias(data ?? []))
  }, [])

  // ── Carga firmada de identificación ──
  useEffect(() => {
    if (tab === 3 && idUrl) {
      supabase.storage.from('golf-docs').createSignedUrl(idUrl, 3600)
        .then(({ data }) => setIdSignedUrl(data?.signedUrl ?? null))
    }
  }, [tab, idUrl])

  // ── Familiares ──
  const fetchFamiliares = async () => {
    if (!socio) return
    setLoadingFam(true)
    const { data } = await dbGolf
      .from('cat_familiares')
      .select('id, nombre, apellido_paterno, apellido_materno, parentesco, fecha_nacimiento, nacionalidad, activo')
      .eq('id_socio_fk', socio.id)
      .order('nombre')
    setFamiliares((data as Familiar[]) ?? [])
    setLoadingFam(false)
  }

  useEffect(() => {
    if (tab === 2 && !isNew) fetchFamiliares()
  }, [tab])

  // ── Contratos ──
  const fetchContratos = async () => {
    if (!socio) return
    setLoadingCon(true)
    const { data } = await dbGolf
      .from('ctrl_contratos_membresia')
      .select('id, id_socio_fk, anio, fecha_inicio, fecha_fin, monto, vigente, archivo_url, notas, created_at')
      .eq('id_socio_fk', socio.id)
      .order('anio', { ascending: false })
    setContratos((data as Contrato[]) ?? [])
    setLoadingCon(false)
  }

  useEffect(() => {
    if (tab === 4 && !isNew) fetchContratos()
  }, [tab])

  // ── Federación ──
  const fetchFederaciones = async () => {
    if (!socio) return
    setLoadingFed(true)
    const { data } = await dbGolf
      .from('ctrl_federacion')
      .select('id, id_socio_fk, clave, periodo, comprobante_url, notas, created_at')
      .eq('id_socio_fk', socio.id)
      .order('periodo', { ascending: false })
    setFederaciones((data as Federacion[]) ?? [])
    setLoadingFed(false)
  }

  useEffect(() => {
    if (tab === 7 && !isNew) fetchFederaciones()
  }, [tab])

  // ── Datos Fiscales ──
  const fetchFiscales = async () => {
    if (!socio) return
    setLoadingFiscal(true)
    const { data } = await dbGolf
      .from('cat_socios_datos_fiscales')
      .select('id, id_socio_fk, alias, rfc, razon_social_fiscal, cp_fiscal, regimen_fiscal, uso_cfdi, email_fiscal, es_principal, created_at')
      .eq('id_socio_fk', socio.id)
      .order('es_principal', { ascending: false })
      .order('created_at')
    setFiscales((data as DatoFiscal[]) ?? [])
    setLoadingFiscal(false)
  }

  useEffect(() => {
    if (tab === 6 && !isNew) fetchFiscales()
  }, [tab])

  // ── Facturas del socio ──
  const fetchFacturasSocio = async () => {
    if (!socio) return
    setLoadingFact(true)
    // Obtener los RFCs registrados para este socio
    const { data: fiscData } = await dbGolf
      .from('cat_socios_datos_fiscales')
      .select('rfc')
      .eq('id_socio_fk', socio.id)
    const rfcs = (fiscData ?? []).map((f: any) => f.rfc as string)
    if (rfcs.length === 0) { setFacturasSocio([]); setLoadingFact(false); return }
    const { data } = await dbCtrl
      .from('facturas')
      .select('id, folio_interno, folio_fiscal, rfc_receptor, razon_social_receptor, total, status, created_at, pdf_url')
      .in('rfc_receptor', rfcs)
      .order('created_at', { ascending: false })
    setFacturasSocio(data ?? [])
    setLoadingFact(false)
  }

  useEffect(() => {
    if (tab === 8 && !isNew) fetchFacturasSocio()
  }, [tab])

  // ── handleSave (datos generales) ──
  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }

    // Al dar de baja a un socio (activo → inactivo), sus cuotas pendientes dejan
    // de contar en la fórmula de cobranza. Las PENDIENTE (sin pago ligado) se eliminan;
    // las PAGO_PARCIAL ya tienen un recibo ligado (FK) y no se pueden borrar, se cancelan.
    const seDesactiva = !isNew && socio!.activo && !form.activo
    if (seDesactiva) {
      const { data: pendientes } = await dbGolf
        .from('cxc_golf')
        .select('id, status, saldo, monto_final')
        .eq('id_socio_fk', socio!.id)
        .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      const cuotasPend = (pendientes as { id: number; status: string; saldo: number | null; monto_final: number }[]) ?? []
      if (cuotasPend.length > 0) {
        const montoTotal = cuotasPend.reduce((a, c) => a + (c.saldo ?? c.monto_final ?? 0), 0)
        const ok = confirm(
          `Este socio tiene ${cuotasPend.length} cuota${cuotasPend.length !== 1 ? 's' : ''} pendiente${cuotasPend.length !== 1 ? 's' : ''} por $${montoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.\n\n` +
          `Al dar de baja al socio se cancelarán para que dejen de afectar la cobranza pendiente. Esta acción no se puede deshacer.\n\n¿Continuar con la baja?`
        )
        if (!ok) return

        const idsPendientes = cuotasPend.filter(c => c.status === 'PENDIENTE').map(c => c.id)
        const idsParciales   = cuotasPend.filter(c => c.status === 'PAGO_PARCIAL').map(c => c.id)

        if (idsPendientes.length > 0) {
          await dbGolf.from('cxc_golf').delete().in('id', idsPendientes)
        }
        if (idsParciales.length > 0) {
          await dbGolf.from('cxc_golf').update({ status: 'CANCELADO', saldo: 0 }).in('id', idsParciales)
        }
      }
    }

    setSaving(true); setError('')
    const payload = {
      numero_socio:       form.numero_socio      || null,
      nombre:             form.nombre.trim(),
      apellido_paterno:   form.apellido_paterno  || null,
      apellido_materno:   form.apellido_materno  || null,
      id_categoria_fk:    form.id_categoria_fk   || null,
      email:              form.email             || null,
      telefono:           form.telefono          || null,
      fecha_nacimiento:   form.fecha_nacimiento  || null,
      fecha_alta:         form.fecha_alta        || null,
      fecha_vencimiento:  form.fecha_vencimiento || null,
      rfc:                form.rfc               || null,
      curp:               form.curp              || null,
      numero_tarjeta:      form.numero_tarjeta        || null,
      nacionalidad:        form.nacionalidad          || null,
      activo:               form.activo,
      derecho_intercambios: (form as any).derecho_intercambios ?? false,
      observaciones:        form.observaciones         || null,
      identificacion_url:  idUrl,
    }
    const { error: err } = isNew
      ? await dbGolf.from('cat_socios').insert(payload)
      : await dbGolf.from('cat_socios').update(payload).eq('id', socio!.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  // ── Familiares CRUD ──
  const handleGuardarFamiliar = async () => {
    if (!nuevoFam.nombre.trim()) { setErrorFam('El nombre es obligatorio'); return }
    setSavingFam(true); setErrorFam('')
    const { error: err } = await dbGolf.from('cat_familiares').insert({
      id_socio_fk:      socio!.id,
      nombre:           nuevoFam.nombre.trim(),
      apellido_paterno: nuevoFam.apellido_paterno || null,
      apellido_materno: nuevoFam.apellido_materno || null,
      parentesco:       nuevoFam.parentesco       || null,
      fecha_nacimiento: nuevoFam.fecha_nacimiento || null,
      nacionalidad:     nuevoFam.nacionalidad      || null,
    })
    if (err) { setErrorFam(err.message); setSavingFam(false); return }
    setNuevoFam(FAMILIAR_VACIO); setShowFormFam(false); setSavingFam(false)
    fetchFamiliares()
  }

  const handleEliminarFamiliar = async (id: number) => {
    if (!confirm('¿Eliminar este familiar?')) return
    setEliminando(id)
    await dbGolf.from('cat_familiares').delete().eq('id', id)
    setEliminando(null)
    fetchFamiliares()
  }

  // ── Identificación upload ──
  const handleUploadId = async (file: File) => {
    if (!socio) return
    setUploadingId(true); setUploadError('')
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `identificaciones/socio_${socio.id}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('golf-docs').upload(path, file, { upsert: true })
    if (upErr) { setUploadError(upErr.message); setUploadingId(false); return }
    // Guardar path en BD
    await dbGolf.from('cat_socios').update({ identificacion_url: path }).eq('id', socio.id)
    setIdUrl(path)
    const { data: signed } = await supabase.storage.from('golf-docs').createSignedUrl(path, 3600)
    setIdSignedUrl(signed?.signedUrl ?? null)
    setUploadingId(false)
  }

  const handleRemoveId = async () => {
    if (!socio || !idUrl) return
    if (!confirm('¿Eliminar la identificación guardada?')) return
    await supabase.storage.from('golf-docs').remove([idUrl])
    await dbGolf.from('cat_socios').update({ identificacion_url: null }).eq('id', socio.id)
    setIdUrl(null); setIdSignedUrl(null)
  }

  // ── Contratos CRUD ──
  const handleUploadContrato = async (file: File) => {
    if (!socio) return
    setUploadingCon(true)
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `contratos/socio_${socio.id}_${nuevoCon.anio}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('golf-docs').upload(path, file, { upsert: true })
    if (!upErr) setArchivoConUrl(path)
    setUploadingCon(false)
  }

  const handleGuardarContrato = async () => {
    if (!nuevoCon.anio) { setErrorCon('El año es obligatorio'); return }
    setSavingCon(true); setErrorCon('')
    const { error: err } = await dbGolf.from('ctrl_contratos_membresia').insert({
      id_socio_fk:  socio!.id,
      anio:         Number(nuevoCon.anio),
      fecha_inicio: nuevoCon.fecha_inicio || null,
      fecha_fin:    nuevoCon.fecha_fin    || null,
      monto:        nuevoCon.monto        ? Number(nuevoCon.monto) : null,
      vigente:      false,
      archivo_url:  archivoConUrl         || null,
      notas:        nuevoCon.notas        || null,
    })
    if (err) { setErrorCon(err.message); setSavingCon(false); return }
    setNuevoCon(CONTRATO_VACIO); setArchivoConUrl(''); setShowFormCon(false); setSavingCon(false)
    fetchContratos()
  }

  const handleMarcarVigente = async (id: number) => {
    if (!socio) return
    setMarcandoVigente(id)
    // Quitar vigente de todos los contratos del socio, luego marcar el seleccionado
    await dbGolf.from('ctrl_contratos_membresia').update({ vigente: false }).eq('id_socio_fk', socio.id)
    await dbGolf.from('ctrl_contratos_membresia').update({ vigente: true }).eq('id', id)
    setMarcandoVigente(null)
    fetchContratos()
  }

  // ── Federación CRUD ──
  const handleUploadComprobanteFed = async (file: File) => {
    if (!socio) return
    setUploadingFed(true)
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `federacion/socio_${socio.id}_${nuevoFed.periodo}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('golf-docs').upload(path, file, { upsert: true })
    if (!upErr) setComprobanteFedUrl(path)
    setUploadingFed(false)
  }

  const handleGuardarFederacion = async () => {
    if (!nuevoFed.periodo) { setErrorFed('El período (año) es obligatorio'); return }
    setSavingFed(true); setErrorFed('')
    const { error: err } = await dbGolf.from('ctrl_federacion').upsert({
      id_socio_fk:     socio!.id,
      periodo:         Number(nuevoFed.periodo),
      clave:           nuevoFed.clave   || null,
      comprobante_url: comprobanteFedUrl || null,
      notas:           nuevoFed.notas   || null,
    }, { onConflict: 'id_socio_fk,periodo' })
    if (err) { setErrorFed(err.message); setSavingFed(false); return }
    setNuevoFed(FEDERACION_VACIA); setComprobanteFedUrl(''); setShowFormFed(false); setSavingFed(false)
    fetchFederaciones()
  }

  const handleEliminarFederacion = async (id: number) => {
    if (!confirm('¿Eliminar este registro de federación?')) return
    setEliminandoFed(id)
    await dbGolf.from('ctrl_federacion').delete().eq('id', id)
    setEliminandoFed(null)
    fetchFederaciones()
  }

  const handleEliminarContrato = async (id: number) => {
    if (!confirm('¿Eliminar este contrato?')) return
    setEliminandoCon(id)
    await dbGolf.from('ctrl_contratos_membresia').delete().eq('id', id)
    setEliminandoCon(null)
    fetchContratos()
  }

  // ── Datos Fiscales CRUD ──
  const handleEditarFiscal = (f: DatoFiscal) => {
    setEditandoFiscalId(f.id)
    setNuevoFiscal({
      alias:               f.alias ?? '',
      rfc:                 f.rfc,
      razon_social_fiscal: f.razon_social_fiscal,
      cp_fiscal:           f.cp_fiscal ?? '',
      regimen_fiscal:      f.regimen_fiscal ?? '626',
      uso_cfdi:            f.uso_cfdi ?? 'G03',
      email_fiscal:        f.email_fiscal ?? '',
    })
    setErrorFiscal('')
    setShowFormFiscal(true)
  }

  const handleGuardarFiscal = async () => {
    if (!nuevoFiscal.rfc.trim()) { setErrorFiscal('El RFC es obligatorio'); return }
    if (!nuevoFiscal.razon_social_fiscal.trim()) { setErrorFiscal('La razón social es obligatoria'); return }
    setSavingFiscal(true); setErrorFiscal('')
    const datos = {
      alias:               nuevoFiscal.alias.trim()               || null,
      rfc:                 nuevoFiscal.rfc.toUpperCase().trim(),
      razon_social_fiscal: nuevoFiscal.razon_social_fiscal.trim(),
      cp_fiscal:           nuevoFiscal.cp_fiscal               || null,
      regimen_fiscal:      nuevoFiscal.regimen_fiscal          || null,
      uso_cfdi:            nuevoFiscal.uso_cfdi                || null,
      email_fiscal:        nuevoFiscal.email_fiscal            || null,
    }
    const { error: err } = editandoFiscalId
      ? await dbGolf.from('cat_socios_datos_fiscales').update(datos).eq('id', editandoFiscalId)
      : await dbGolf.from('cat_socios_datos_fiscales').insert({
          ...datos,
          id_socio_fk:  socio!.id,
          es_principal: fiscales.length === 0,
        })
    if (err) { setErrorFiscal(err.message); setSavingFiscal(false); return }
    setNuevoFiscal(DATO_FISCAL_VACIO); setShowFormFiscal(false); setSavingFiscal(false); setEditandoFiscalId(null)
    fetchFiscales()
  }

  const handleMarcarPrincipal = async (id: number) => {
    if (!socio) return
    setMarcandoPrincipal(id)
    await dbGolf.from('cat_socios_datos_fiscales').update({ es_principal: false }).eq('id_socio_fk', socio.id)
    await dbGolf.from('cat_socios_datos_fiscales').update({ es_principal: true }).eq('id', id)
    setMarcandoPrincipal(null)
    fetchFiscales()
  }

  const handleEliminarFiscal = async (id: number) => {
    if (!confirm('¿Eliminar este dato fiscal?')) return
    setEliminandoFiscal(id)
    await dbGolf.from('cat_socios_datos_fiscales').delete().eq('id', id)
    setEliminandoFiscal(null)
    fetchFiscales()
  }

  const nombreCompleto = (f: Familiar) =>
    [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')

  const isTabDisabled = (i: number) => (i === 2 || i === 3 || i === 4 || i === 6 || i === 7 || i === 8 || i === 9 || i === 10) && isNew

  const inputStyle = {
    width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
    borderRadius: 8, background: '#fff', color: '#1e293b',
    fontFamily: 'inherit', outline: 'none',
  }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' as const }

  // Footer: ocultar guardar en tabs Familiares (2), Identificación (3), Contratos (4), Datos Fiscales (6), Federación (7), Facturas (8), Cobranza (9), Recibos (10)
  const showSaveBtn = tab !== 2 && tab !== 3 && tab !== 4 && tab !== 6 && tab !== 7 && tab !== 8 && tab !== 9 && tab !== 10

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 1100,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
      }}>
        {/* Header con gradiente */}
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', borderRadius: '20px 20px 0 0', padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={18} style={{ color: '#fff' }} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'inherit', fontSize: 19, fontWeight: 700, color: '#fff', margin: 0 }}>
                  {isNew ? 'Nuevo Socio' : `Editar Socio`}
                </h2>
                {!isNew && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                    {[form.nombre, form.apellido_paterno, form.apellido_materno].filter(Boolean).join(' ')}
                  </div>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={15} />
            </button>
          </div>

          {/* Tabs pill style */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TABS.map((t, i) => {
              const disabled = isTabDisabled(i)
              const active   = tab === i
              return (
                <button key={t} onClick={() => !disabled && setTab(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 11px', fontSize: 11.5, fontWeight: active ? 700 : 500,
                  border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  borderRadius: '8px 8px 0 0',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  background: active ? '#fff' : 'transparent',
                  color: disabled ? 'rgba(255,255,255,0.25)' : active ? '#2563eb' : 'rgba(255,255,255,0.7)',
                  transition: 'all 0.15s',
                }}>
                  {t}
                  {i === 2 && !isNew && familiares.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                      background: active ? '#dbeafe' : 'rgba(255,255,255,0.2)',
                      color: active ? '#1d4ed8' : '#fff' }}>
                      {familiares.length}
                    </span>
                  )}
                  {i === 3 && !isNew && idUrl && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                      background: active ? '#dcfce7' : 'rgba(34,197,94,0.3)', color: active ? '#16a34a' : '#86efac' }}>✓</span>
                  )}
                  {i === 4 && !isNew && contratos.some(c => c.vigente) && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                      background: active ? '#dbeafe' : 'rgba(255,255,255,0.2)',
                      color: active ? '#1d4ed8' : '#fff' }}>
                      {contratos.length}
                    </span>
                  )}
                  {i === 6 && !isNew && fiscales.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                      background: active ? '#faf5ff' : 'rgba(255,255,255,0.2)',
                      color: active ? '#7c3aed' : '#fff' }}>
                      {fiscales.length}
                    </span>
                  )}
                  {i === 7 && !isNew && federaciones.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                      background: active ? '#fef3c7' : 'rgba(245,158,11,0.3)',
                      color: active ? '#92400e' : '#fde68a' }}>
                      {federaciones.length}
                    </span>
                  )}
                  {i === 8 && !isNew && facturasSocio.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                      background: active ? '#dcfce7' : 'rgba(34,197,94,0.25)',
                      color: active ? '#15803d' : '#86efac' }}>
                      {facturasSocio.length}
                    </span>
                  )}
                  {isTabDisabled(i) && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>🔒</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

          {/* ── Tab 0: Datos Personales ── */}
          {tab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Nombre *</label>
                  <input style={inputStyle} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre(s)" />
                </div>
                <div>
                  <label style={labelStyle}>Apellido Paterno</label>
                  <input style={inputStyle} value={form.apellido_paterno} onChange={e => set('apellido_paterno', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Apellido Materno</label>
                  <input style={inputStyle} value={form.apellido_materno} onChange={e => set('apellido_materno', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha de Nacimiento</label>
                  <input style={inputStyle} type="date" value={form.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>RFC</label>
                  <input style={inputStyle} value={form.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} placeholder="XXXX000000XXX" />
                </div>
                <div>
                  <label style={labelStyle}>CURP</label>
                  <input style={inputStyle} value={form.curp} onChange={e => set('curp', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label style={labelStyle}>Nacionalidad</label>
                  <input style={inputStyle} value={form.nacionalidad} onChange={e => set('nacionalidad', e.target.value)} placeholder="Mexicana" />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input style={inputStyle} value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="(55) 1234-5678" />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 1: Membresía ── */}
          {tab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Número de Socio</label>
                  <input style={inputStyle} value={form.numero_socio} onChange={e => set('numero_socio', e.target.value)} placeholder="Ej. 1042" />
                </div>
                <div>
                  <label style={labelStyle}>Ghin</label>
                  <input style={inputStyle} value={form.numero_tarjeta} onChange={e => set('numero_tarjeta', e.target.value)} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Categoría</label>
                  <select style={{ ...inputStyle }} value={form.id_categoria_fk} onChange={e => set('id_categoria_fk', e.target.value ? Number(e.target.value) : '')}>
                    <option value="">— Sin categoría —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Fecha de Alta</label>
                  <input style={inputStyle} type="date" value={form.fecha_alta} onChange={e => set('fecha_alta', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Vencimiento</label>
                  <input style={inputStyle} type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" id="activo" checked={form.activo} onChange={e => set('activo', e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <label htmlFor="activo" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>Socio activo</label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" id="derecho_intercambios"
                      checked={(form as any).derecho_intercambios ?? false}
                      onChange={e => set('derecho_intercambios' as any, e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }} />
                    <label htmlFor="derecho_intercambios" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer', color: '#2563eb' }}>
                      Derecho a intercambios
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 2: Familiares ── */}
          {tab === 2 && !isNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={15} style={{ color: '#2563eb' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Familiares del socio</span>
                  {!loadingFam && <span style={{ fontSize: 11, color: '#64748b' }}>({familiares.length})</span>}
                </div>
                {!showFormFam && (
                  <button onClick={() => { setShowFormFam(true); setErrorFam('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    <Plus size={13} /> Agregar familiar
                  </button>
                )}
              </div>
              {showFormFam && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Nuevo familiar</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={nuevoFam.nombre} onChange={e => setFam('nombre', e.target.value)} autoFocus />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Paterno</label>
                      <input style={inputStyle} value={nuevoFam.apellido_paterno} onChange={e => setFam('apellido_paterno', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Materno</label>
                      <input style={inputStyle} value={nuevoFam.apellido_materno} onChange={e => setFam('apellido_materno', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Parentesco</label>
                      <select style={inputStyle} value={nuevoFam.parentesco} onChange={e => setFam('parentesco', e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {PARENTESCOS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha de Nacimiento</label>
                      <input style={inputStyle} type="date" value={nuevoFam.fecha_nacimiento} onChange={e => setFam('fecha_nacimiento', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Nacionalidad</label>
                      <input style={inputStyle} value={nuevoFam.nacionalidad} onChange={e => setFam('nacionalidad', e.target.value)} placeholder="Mexicana" />
                    </div>
                  </div>
                  {errorFam && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{errorFam}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowFormFam(false); setNuevoFam(FAMILIAR_VACIO); setErrorFam('') }}
                      style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button onClick={handleGuardarFamiliar} disabled={savingFam}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', opacity: savingFam ? 0.7 : 1 }}>
                      {savingFam ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}
              {loadingFam ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
              ) : familiares.length === 0 && !showFormFam ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👨‍👩‍👧‍👦</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Sin familiares registrados</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Agrega cónyuge, hijos u otros familiares del socio</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {familiares.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: f.activo ? '#fff' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, gap: 12, opacity: f.activo ? 1 : 0.6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombreCompleto(f)}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10 }}>
                          {f.parentesco && <span>{f.parentesco}</span>}
                          {f.fecha_nacimiento && <span>{new Date(f.fecha_nacimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                          {f.nacionalidad && <span>{f.nacionalidad}</span>}
                          {!f.activo && <span style={{ color: '#dc2626', fontWeight: 600 }}>Inactivo</span>}
                        </div>
                      </div>
                      <button onClick={() => handleEliminarFamiliar(f.id)} disabled={eliminando === f.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, opacity: eliminando === f.id ? 0.5 : 1 }} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 3: Identificación ── */}
          {tab === 3 && !isNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <FileText size={15} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Identificación oficial</span>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Sube una foto o PDF de la identificación del socio (INE, pasaporte, etc.). Máximo 5 MB. Formatos: JPG, PNG, PDF.
              </p>

              {/* Si ya hay archivo */}
              {idUrl ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                  {/* Preview */}
                  {idSignedUrl ? (
                    idUrl.match(/\.(jpg|jpeg|png)$/i) ? (
                      <img src={idSignedUrl} alt="Identificación" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: '#f8fafc', display: 'block' }} />
                    ) : (
                      <div style={{ padding: '32px 20px', textAlign: 'center', background: '#f8fafc' }}>
                        <FileText size={40} style={{ color: '#2563eb', marginBottom: 10 }} />
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 6 }}>Documento PDF</div>
                        <a href={idSignedUrl} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 14px', textDecoration: 'none' }}>
                          <ExternalLink size={12} /> Abrir PDF
                        </a>
                      </div>
                    )
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc' }}>
                      <Loader size={20} style={{ color: '#94a3b8' }} className="animate-spin" />
                    </div>
                  )}
                  {/* Acciones */}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => fileInputRef.current?.click()}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#475569' }}>
                      <Upload size={12} /> Reemplazar
                    </button>
                    <button onClick={handleRemoveId}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 12px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}>
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                /* Drop zone */
                <div
                  onClick={() => !uploadingId && fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const file = e.dataTransfer.files[0]
                    if (file) handleUploadId(file)
                  }}
                  style={{
                    border: '2px dashed #bfdbfe', borderRadius: 12, padding: '48px 24px',
                    textAlign: 'center', cursor: uploadingId ? 'wait' : 'pointer',
                    background: '#f8fafc', transition: 'border-color 0.15s',
                  }}>
                  {uploadingId ? (
                    <>
                      <Loader size={28} style={{ color: '#2563eb', marginBottom: 10 }} className="animate-spin" />
                      <div style={{ fontSize: 13, color: '#2563eb' }}>Subiendo…</div>
                    </>
                  ) : (
                    <>
                      <Upload size={28} style={{ color: '#93c5fd', marginBottom: 10 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                        Haz clic o arrastra el archivo aquí
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>JPG, PNG o PDF · máx. 5 MB</div>
                    </>
                  )}
                </div>
              )}

              {uploadError && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{uploadError}</div>
              )}

              {/* Input oculto */}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadId(f); e.target.value = '' }} />
            </div>
          )}

          {/* ── Tab 4: Contratos ── */}
          {tab === 4 && !isNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileCheck size={15} style={{ color: '#7c3aed' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Contratos de membresía</span>
                  {!loadingCon && <span style={{ fontSize: 11, color: '#64748b' }}>({contratos.length})</span>}
                </div>
                {!showFormCon && (
                  <button onClick={() => { setShowFormCon(true); setErrorCon(''); setArchivoConUrl('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    <Plus size={13} /> Nuevo contrato
                  </button>
                )}
              </div>

              {/* Formulario nuevo contrato */}
              {showFormCon && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Nuevo contrato</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Año *</label>
                      <input style={inputStyle} type="number" value={nuevoCon.anio} onChange={e => setCon('anio', e.target.value)} placeholder="2025" />
                    </div>
                    <div>
                      <label style={labelStyle}>Monto (MXN)</label>
                      <input style={inputStyle} type="number" value={nuevoCon.monto} onChange={e => setCon('monto', e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha inicio</label>
                      <input style={inputStyle} type="date" value={nuevoCon.fecha_inicio} onChange={e => setCon('fecha_inicio', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha fin</label>
                      <input style={inputStyle} type="date" value={nuevoCon.fecha_fin} onChange={e => setCon('fecha_fin', e.target.value)} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Notas</label>
                      <input style={inputStyle} value={nuevoCon.notas} onChange={e => setCon('notas', e.target.value)} placeholder="Opcional" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Archivo del contrato (PDF/imagen)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => fileConRef.current?.click()} disabled={uploadingCon}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#475569', opacity: uploadingCon ? 0.6 : 1 }}>
                          {uploadingCon ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
                          {archivoConUrl ? 'Cambiar archivo' : 'Subir archivo'}
                        </button>
                        {archivoConUrl && (
                          <span style={{ fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle size={12} /> Archivo listo
                          </span>
                        )}
                      </div>
                      <input ref={fileConRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadContrato(f); e.target.value = '' }} />
                    </div>
                  </div>
                  {errorCon && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{errorCon}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowFormCon(false); setNuevoCon(CONTRATO_VACIO); setArchivoConUrl('') }}
                      style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button onClick={handleGuardarContrato} disabled={savingCon}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: savingCon ? 0.7 : 1 }}>
                      {savingCon ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de contratos */}
              {loadingCon ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
              ) : contratos.length === 0 && !showFormCon ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Sin contratos registrados</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Agrega el contrato anual de membresía del socio</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contratos.map(c => (
                    <div key={c.id} style={{
                      border: `1px solid ${c.vigente ? '#a3e635' : '#e2e8f0'}`,
                      background: c.vigente ? '#f7fee7' : '#fff',
                      borderRadius: 10, padding: '12px 16px',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{c.anio}</span>
                          {c.vigente && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#84cc16', color: '#fff', letterSpacing: '0.04em' }}>
                              VIGENTE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          {c.fecha_inicio && <span>{new Date(c.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                          {c.fecha_fin && <span>→ {new Date(c.fecha_fin + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                          {c.monto != null && <span style={{ color: '#16a34a', fontWeight: 600 }}>${Number(c.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>}
                          {c.archivo_url && (
                            <ContratoLink path={c.archivo_url} />
                          )}
                        </div>
                        {c.notas && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{c.notas}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {!c.vigente && (
                          <button
                            onClick={() => handleMarcarVigente(c.id)}
                            disabled={marcandoVigente === c.id}
                            title="Marcar como vigente"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '5px 10px', border: '1px solid #84cc16', borderRadius: 7, background: '#f7fee7', color: '#4d7c0f', cursor: 'pointer', opacity: marcandoVigente === c.id ? 0.6 : 1 }}>
                            {marcandoVigente === c.id ? <Loader size={10} className="animate-spin" /> : <CheckCircle size={11} />}
                            Vigente
                          </button>
                        )}
                        <button
                          onClick={() => handleEliminarContrato(c.id)}
                          disabled={eliminandoCon === c.id}
                          title="Eliminar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, opacity: eliminandoCon === c.id ? 0.5 : 1 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 5: Notas ── */}
          {tab === 5 && (
            <div>
              <label style={labelStyle}>Observaciones</label>
              <textarea
                style={{ ...inputStyle, height: 160, resize: 'vertical' }}
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
                placeholder="Notas internas del socio…"
              />
            </div>
          )}

          {/* ── Tab 7: Federación ── */}
          {tab === 7 && !isNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Award size={15} style={{ color: '#d97706' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Inscripciones Federación Mexicana de Golf</span>
                  {!loadingFed && <span style={{ fontSize: 11, color: '#64748b' }}>({federaciones.length})</span>}
                </div>
                {!showFormFed && (
                  <button onClick={() => { setShowFormFed(true); setErrorFed(''); setComprobanteFedUrl('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    <Plus size={13} /> Nueva inscripción
                  </button>
                )}
              </div>

              {/* Formulario nueva inscripción */}
              {showFormFed && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Nueva inscripción federación</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Período (Año) *</label>
                      <input style={inputStyle} type="number" min={2000} max={2100} value={nuevoFed.periodo}
                        onChange={e => setFed('periodo', e.target.value)} placeholder="2025" />
                    </div>
                    <div>
                      <label style={labelStyle}>Clave de federación</label>
                      <input style={inputStyle} value={nuevoFed.clave}
                        onChange={e => setFed('clave', e.target.value)} placeholder="Ej. FMG-00001" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Notas</label>
                      <input style={inputStyle} value={nuevoFed.notas}
                        onChange={e => setFed('notas', e.target.value)} placeholder="Opcional" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Comprobante de pago (PDF/imagen)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => fileFedRef.current?.click()} disabled={uploadingFed}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#475569', opacity: uploadingFed ? 0.6 : 1 }}>
                          {uploadingFed ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
                          {comprobanteFedUrl ? 'Cambiar archivo' : 'Subir comprobante'}
                        </button>
                        {comprobanteFedUrl && (
                          <span style={{ fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle size={12} /> Archivo listo
                          </span>
                        )}
                      </div>
                      <input ref={fileFedRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadComprobanteFed(f); e.target.value = '' }} />
                    </div>
                  </div>
                  {errorFed && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{errorFed}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowFormFed(false); setNuevoFed(FEDERACION_VACIA); setComprobanteFedUrl(''); setErrorFed('') }}
                      style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button onClick={handleGuardarFederacion} disabled={savingFed}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', cursor: 'pointer', opacity: savingFed ? 0.7 : 1 }}>
                      {savingFed ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de inscripciones */}
              {loadingFed ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
              ) : federaciones.length === 0 && !showFormFed ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🏌️</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Sin inscripciones registradas</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Registra la inscripción anual a la Federación Mexicana de Golf</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {federaciones.map(f => (
                    <div key={f.id} style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Award size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{f.periodo}</span>
                          {f.clave && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#92400e', fontFamily: 'monospace' }}>
                              {f.clave}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                          {f.notas && <span>{f.notas}</span>}
                          {f.comprobante_url && <FederacionComprobanteLink path={f.comprobante_url} />}
                        </div>
                      </div>
                      <button onClick={() => handleEliminarFederacion(f.id)} disabled={eliminandoFed === f.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, opacity: eliminandoFed === f.id ? 0.5 : 1 }} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 6: Datos Fiscales ── */}
          {tab === 6 && !isNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '10px 14px', background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#6d28d9' }}>
                Un socio puede tener varios datos fiscales (p. ej. personal y de empresa). Al facturar, se podrá elegir a cuál de ellos se factura.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={15} style={{ color: '#7c3aed' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Datos fiscales registrados</span>
                  {!loadingFiscal && <span style={{ fontSize: 11, color: '#64748b' }}>({fiscales.length})</span>}
                </div>
                {!showFormFiscal && (
                  <button onClick={() => { setShowFormFiscal(true); setErrorFiscal(''); setNuevoFiscal(DATO_FISCAL_VACIO); setEditandoFiscalId(null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    <Plus size={13} /> Agregar dato fiscal
                  </button>
                )}
              </div>

              {/* Formulario nuevo/editar dato fiscal */}
              {showFormFiscal && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>
                    {editandoFiscalId ? 'Editar dato fiscal' : 'Nuevo dato fiscal'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Alias</label>
                      <input style={inputStyle} value={nuevoFiscal.alias} onChange={e => setFiscal('alias', e.target.value)}
                        placeholder="Ej. Personal, Empresa S.A. de C.V." />
                    </div>
                    <div>
                      <label style={labelStyle}>RFC *</label>
                      <input style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
                        value={nuevoFiscal.rfc} onChange={e => setFiscal('rfc', e.target.value.toUpperCase())}
                        placeholder="XAXX010101000" />
                    </div>
                    <div>
                      <label style={labelStyle}>Código Postal (CFDI)</label>
                      <input style={inputStyle} type="text" maxLength={5}
                        value={nuevoFiscal.cp_fiscal} onChange={e => setFiscal('cp_fiscal', e.target.value)}
                        placeholder="76001" />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Nombre / Razón Social Fiscal *</label>
                      <input style={inputStyle}
                        value={nuevoFiscal.razon_social_fiscal} onChange={e => setFiscal('razon_social_fiscal', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Régimen Fiscal SAT</label>
                      <select style={inputStyle} value={nuevoFiscal.regimen_fiscal} onChange={e => setFiscal('regimen_fiscal', e.target.value)}>
                        {REGIMENES_FISCALES_SAT.map(r => <option key={r.clave} value={r.clave}>{r.clave} — {r.desc}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Uso CFDI por defecto</label>
                      <select style={inputStyle} value={nuevoFiscal.uso_cfdi} onChange={e => setFiscal('uso_cfdi', e.target.value)}>
                        {USOS_CFDI_SAT.map(u => <option key={u.clave} value={u.clave}>{u.clave} — {u.desc}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Correo electrónico para envío de facturas</label>
                      <input style={inputStyle} type="email"
                        value={nuevoFiscal.email_fiscal} onChange={e => setFiscal('email_fiscal', e.target.value)}
                        placeholder="facturacion@ejemplo.com" />
                    </div>
                  </div>
                  {errorFiscal && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{errorFiscal}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowFormFiscal(false); setNuevoFiscal(DATO_FISCAL_VACIO); setErrorFiscal(''); setEditandoFiscalId(null) }}
                      style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button onClick={handleGuardarFiscal} disabled={savingFiscal}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: savingFiscal ? 0.7 : 1 }}>
                      {savingFiscal ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de datos fiscales */}
              {loadingFiscal ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
              ) : fiscales.length === 0 && !showFormFiscal ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Sin datos fiscales registrados</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Agrega el RFC y razón social que se usarán al facturar</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fiscales.map(f => (
                    <div key={f.id} style={{
                      border: `1px solid ${f.es_principal ? '#ddd6fe' : '#e2e8f0'}`,
                      background: f.es_principal ? '#faf5ff' : '#fff',
                      borderRadius: 10, padding: '12px 16px',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{f.alias || f.razon_social_fiscal}</span>
                          {f.es_principal && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#7c3aed', color: '#fff', letterSpacing: '0.04em' }}>
                              PRINCIPAL
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace' }}>{f.rfc}</span>
                          {f.alias && <span>{f.razon_social_fiscal}</span>}
                          {f.cp_fiscal && <span>CP {f.cp_fiscal}</span>}
                          {f.regimen_fiscal && <span>Rég. {f.regimen_fiscal}</span>}
                          {f.uso_cfdi && <span>Uso {f.uso_cfdi}</span>}
                          {f.email_fiscal && <span>{f.email_fiscal}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {!f.es_principal && (
                          <button
                            onClick={() => handleMarcarPrincipal(f.id)}
                            disabled={marcandoPrincipal === f.id}
                            title="Marcar como principal"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '5px 10px', border: '1px solid #ddd6fe', borderRadius: 7, background: '#faf5ff', color: '#6d28d9', cursor: 'pointer', opacity: marcandoPrincipal === f.id ? 0.6 : 1 }}>
                            {marcandoPrincipal === f.id ? <Loader size={10} className="animate-spin" /> : <CheckCircle size={11} />}
                            Principal
                          </button>
                        )}
                        <button
                          onClick={() => handleEditarFiscal(f)}
                          title="Editar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 4 }}>
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleEliminarFiscal(f.id)}
                          disabled={eliminandoFiscal === f.id}
                          title="Eliminar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, opacity: eliminandoFiscal === f.id ? 0.5 : 1 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 9: Cobranza ── */}
          {tab === 9 && !isNew && (
            <TabCobranzaSocio
              socioId={socio!.id}
              nombreSocio={[form.nombre, form.apellido_paterno, form.apellido_materno].filter(Boolean).join(' ')}
            />
          )}

          {/* ── Tab 10: Recibos ── */}
          {tab === 10 && !isNew && (
            <TabRecibosSocio
              socioId={socio!.id}
              nombreSocio={[form.nombre, form.apellido_paterno, form.apellido_materno].filter(Boolean).join(' ')}
            />
          )}

          {/* ── Tab 8: Facturas ── */}
          {tab === 8 && !isNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={15} style={{ color: '#15803d' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Facturas emitidas al socio</span>
                {!loadingFact && <span style={{ fontSize: 11, color: '#64748b' }}>({facturasSocio.length})</span>}
              </div>
              <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                Se muestran las facturas cuyos RFC receptor coinciden con los datos fiscales registrados para este socio.
              </div>
              {loadingFact ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
              ) : facturasSocio.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Sin facturas emitidas</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>No se encontraron CFDIs asociados a los RFC de este socio</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {['Folio', 'RFC Receptor', 'Razón Social', 'Total', 'Status', 'Fecha', ''].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facturasSocio.map(f => {
                        const statusColor: Record<string, { bg: string; color: string }> = {
                          Vigente:   { bg: '#dcfce7', color: '#15803d' },
                          Cancelada: { bg: '#fee2e2', color: '#dc2626' },
                          Simulada:  { bg: '#fef9c3', color: '#92400e' },
                        }
                        const sc = statusColor[f.status] ?? { bg: '#f1f5f9', color: '#475569' }
                        return (
                          <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                              {f.folio_interno ?? '—'}
                            </td>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#475569', whiteSpace: 'nowrap' }}>
                              {f.rfc_receptor ?? '—'}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#475569', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.razon_social_receptor ?? '—'}
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                              {f.total != null ? '$' + Number(f.total).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                                {f.status}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {f.created_at ? new Date(f.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {f.pdf_url && (
                                <a href={f.pdf_url} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                                  title="Ver PDF">
                                  <ExternalLink size={12} /> PDF
                                </a>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc', borderRadius: '0 0 20px 20px' }}>
          <button className="btn-secondary" onClick={onClose}>
            {(tab === 2 || tab === 3 || tab === 4 || tab === 7 || tab === 8 || tab === 9 || tab === 10) ? 'Cerrar' : 'Cancelar'}
          </button>
          {showSaveBtn && (
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              {isNew ? 'Crear Socio' : 'Guardar Cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Sub-componente para abrir comprobante de federación
function FederacionComprobanteLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    supabase.storage.from('golf-docs').createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [path])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#d97706', textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>
      <ExternalLink size={10} /> Ver comprobante
    </a>
  )
}

// Sub-componente para abrir link firmado de contrato
function ContratoLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    supabase.storage.from('golf-docs').createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [path])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#2563eb', textDecoration: 'none', fontSize: 11 }}>
      <ExternalLink size={10} /> Ver archivo
    </a>
  )
}
