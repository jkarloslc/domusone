'use client'
import { useState, useEffect } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { X, Save, Loader, Plus, Trash2, Search, Users, CheckCircle, Printer, AlertTriangle, Circle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { fechaLocal, inicioDelDia, finDelDia, fmtFechaLocal } from '@/lib/dateUtils'

type Socio = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_tarjeta: string | null; cat_categorias_socios?: { nombre: string } | null }
type Familiar = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null }
type Espacio = { id: number; nombre: string }
type AdeudoRow = { id: number; concepto: string; monto_final: number; fecha_vencimiento: string | null }
type InvitadoCat = { id: number; nombre: string; apellido_paterno: string; apellido_materno: string }
const nombreCompletoInvitado = (i: InvitadoCat) => [i.nombre, i.apellido_paterno, i.apellido_materno].filter(Boolean).join(' ')
const soloMayusculas = (v: string) => v.toUpperCase()

const fmt$ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

// Un acompañante puede ser familiar, visitante Green Fee, invitado por pase o intercambio
type Acomp = {
  tipo: 'familiar' | 'libre' | 'externo' | 'intercambio'
  id_familiar?: number
  id_invitado?: number
  nombre: string
  club_origen?: string
  _pase_mov_id?: number | null
  _origen_pago?: string | null
  _searchInvitado?: string
}

// Buscador/creador de invitados contra el catálogo golf.cat_invitados —
// da identidad persistente al invitado (antes era solo texto libre),
// lo que permite contar su frecuencia de asistencia entre distintos socios.
function InvitadoPicker({ value, nombreActual, search, onSearchChange, onSelect, placeholder, borderColor }: {
  value: number | undefined
  nombreActual: string
  search: string
  onSearchChange: (v: string) => void
  onSelect: (inv: InvitadoCat | null) => void
  placeholder: string
  borderColor: string
}) {
  const [results, setResults] = useState<InvitadoCat[]>([])
  const [buscando, setBuscando] = useState(false)

  // Alta de invitado nuevo — con nombre y apellidos por separado (no se
  // adivinan a partir del texto buscado) para reducir el riesgo de
  // duplicados por captura; el upsert además los bloquea a nivel de BD.
  const [showNuevo, setShowNuevo] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', apellido_paterno: '', apellido_materno: '' })
  const [creando, setCreando]     = useState(false)
  const [errorNuevo, setErrorNuevo] = useState('')

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const words = search.trim().split(/\s+/).filter(Boolean)
      let qb: any = dbGolf.from('cat_invitados').select('id, nombre, apellido_paterno, apellido_materno').eq('activo', true)
      for (const w of words) {
        qb = qb.or(`nombre.ilike.%${w}%,apellido_paterno.ilike.%${w}%,apellido_materno.ilike.%${w}%`)
      }
      const { data } = await qb.order('nombre').limit(6)
      setResults((data as InvitadoCat[]) ?? [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const abrirNuevo = () => {
    setNuevo({ nombre: soloMayusculas(search.trim()), apellido_paterno: '', apellido_materno: '' })
    setErrorNuevo('')
    setShowNuevo(true)
  }

  const crearInvitado = async () => {
    const nombre = nuevo.nombre.trim()
    if (!nombre) { setErrorNuevo('El nombre es obligatorio'); return }
    setCreando(true); setErrorNuevo('')
    const { data, error } = await dbGolf.from('cat_invitados')
      .upsert(
        { nombre, apellido_paterno: nuevo.apellido_paterno.trim(), apellido_materno: nuevo.apellido_materno.trim() },
        { onConflict: 'nombre,apellido_paterno,apellido_materno' }
      )
      .select('id, nombre, apellido_paterno, apellido_materno')
      .single()
    setCreando(false)
    if (error) { setErrorNuevo(error.message); return }
    if (data) { onSelect(data as InvitadoCat); onSearchChange(''); setResults([]); setShowNuevo(false) }
  }

  if (value) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#f8fafc', border: `1px solid ${borderColor}`, borderRadius: 8, minWidth: 0 }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreActual}</span>
      <button onClick={() => onSelect(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}><X size={13} /></button>
    </div>
  )

  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      <input
        style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: `1px solid ${borderColor}`, borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
        placeholder={placeholder}
        value={search}
        onChange={e => { onSearchChange(e.target.value); setShowNuevo(false) }}
      />
      {search.trim().length >= 2 && !showNuevo && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
          {buscando ? (
            <div style={{ padding: 10, fontSize: 12, color: '#94a3b8' }}>Buscando…</div>
          ) : (
            <>
              {results.map(inv => (
                <button key={inv.id} onClick={() => { onSelect(inv); onSearchChange(''); setResults([]) }}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9' }}>
                  {nombreCompletoInvitado(inv)}
                </button>
              ))}
              <button onClick={abrirNuevo}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 12px', background: '#f0fdf4', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#16a34a' }}>
                <Plus size={12} /> Registrar invitado nuevo
              </button>
            </>
          )}
        </div>
      )}
      {showNuevo && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            style={{ width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, textTransform: 'uppercase', boxSizing: 'border-box' }}
            placeholder="Nombre(s) *"
            value={nuevo.nombre}
            onChange={e => setNuevo(n => ({ ...n, nombre: soloMayusculas(e.target.value) }))}
            autoFocus
          />
          <input
            style={{ width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, textTransform: 'uppercase', boxSizing: 'border-box' }}
            placeholder="Apellido Paterno"
            value={nuevo.apellido_paterno}
            onChange={e => setNuevo(n => ({ ...n, apellido_paterno: soloMayusculas(e.target.value) }))}
          />
          <input
            style={{ width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, textTransform: 'uppercase', boxSizing: 'border-box' }}
            placeholder="Apellido Materno"
            value={nuevo.apellido_materno}
            onChange={e => setNuevo(n => ({ ...n, apellido_materno: soloMayusculas(e.target.value) }))}
          />
          {errorNuevo && <div style={{ fontSize: 11, color: '#dc2626' }}>{errorNuevo}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={crearInvitado} disabled={creando}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: '#16a34a', color: '#fff', cursor: 'pointer', opacity: creando ? 0.7 : 1 }}>
              {creando ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
              Guardar
            </button>
            <button onClick={() => setShowNuevo(false)}
              style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Badge con las visitas del invitado en el año en curso — cuenta cruzada
// entre todos los socios que lo hayan traído, no solo el socio actual.
function InvitadoVisitasBadge({ idInvitado, limite }: { idInvitado: number; limite: number }) {
  const [count, setCount] = useState<number | null>(null)
  const anio = new Date().getFullYear()

  useEffect(() => {
    let cancel = false
    dbGolf.from('ctrl_acceso_acomp')
      .select('id, ctrl_accesos!inner(fecha_entrada)', { count: 'exact', head: true })
      .eq('id_invitado_fk', idInvitado)
      .gte('ctrl_accesos.fecha_entrada', `${anio}-01-01T00:00:00`)
      .lt('ctrl_accesos.fecha_entrada', `${anio + 1}-01-01T00:00:00`)
      .then(({ count: c, error }) => {
        if (error) console.error('[InvitadoVisitasBadge] error:', error.message)
        if (!cancel) setCount(c ?? 0)
      })
    return () => { cancel = true }
  }, [idInvitado, anio])

  if (count === null) return <span style={{ fontSize: 11, color: '#94a3b8' }}>Verificando visitas…</span>
  const alTope = count >= limite
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: alTope ? '#fef2f2' : '#f0fdf4', color: alTope ? '#dc2626' : '#15803d' }}>
      {alTope && <AlertTriangle size={11} />}
      Visitas {anio}: {count}/{limite}{alTope ? ' — tope alcanzado' : ''}
    </span>
  )
}

type Props = { onClose: () => void; onSaved: () => void }

const inputStyle = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

const nombreCompleto = (x: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null }) =>
  [x.nombre, x.apellido_paterno, x.apellido_materno].filter(Boolean).join(' ')

export default function AccesoModal({ onClose, onSaved }: Props) {
  const { authUser } = useAuth()
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [espacios, setEspacios]   = useState<Espacio[]>([])
  const [success, setSuccess]     = useState<{ id: number } | null>(null)

  // búsqueda de socio
  const [socioSearch, setSocioSearch]   = useState('')
  const [socioResults, setSocioResults] = useState<Socio[]>([])
  const [socioSelec, setSocioSelec]     = useState<Socio | null>(null)
  const [buscando, setBuscando]         = useState(false)

  // Validación de adeudos
  const [adeudos, setAdeudos]                 = useState<AdeudoRow[]>([])
  const [verificandoAdeudo, setVerificandoAdeudo] = useState(false)

  // familiares del socio
  const [familiares, setFamiliares] = useState<Familiar[]>([])

  // form
  const [idEspacio, setIdEspacio]   = useState<number | ''>('')
  const [hoyoInicio, setHoyoInicio] = useState<number | ''>(1)
  const [observaciones, setObs]     = useState('')
  const [acompanantes, setAcomp]    = useState<Acomp[]>([])

  // Folio de ticket POS — obligatorio para salidas Green Fee, validado contra ctrl_ventas
  const [folioTicketPOS, setFolioTicketPOS]     = useState('')
  const [centroGreenFeeId, setCentroGreenFeeId] = useState<number | null>(null)
  const [centroGreenFeeLoaded, setCentroGreenFeeLoaded] = useState(false)
  const [verificandoFolio, setVerificandoFolio] = useState(false)
  const [folioValidado, setFolioValidado]       = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    dbGolf.from('cat_espacios_deportivos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        const list = data ?? []
        setEspacios(list)
        // Precargar "Campo Golf" si existe
        const campo = list.find((e: Espacio) => e.nombre.toLowerCase().includes('campo golf'))
        if (campo) setIdEspacio(campo.id)
      })
    dbGolf.from('cat_centros_venta').select('id, nombre').ilike('nombre', '%green%').limit(1).maybeSingle()
      .then(({ data }) => {
        setCentroGreenFeeId((data as { id: number } | null)?.id ?? null)
        setCentroGreenFeeLoaded(true)
      })
  }, [])

  // debounce búsqueda de socio
  useEffect(() => {
    if (socioSearch.trim().length < 2) { setSocioResults([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const words = socioSearch.trim().split(/\s+/).filter(Boolean)
      let qb: any = dbGolf
        .from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, numero_tarjeta, cat_categorias_socios(nombre)')
        .eq('activo', true)
      for (const w of words) {
        qb = qb.or(`nombre.ilike.%${w}%,apellido_paterno.ilike.%${w}%,apellido_materno.ilike.%${w}%,numero_socio.ilike.%${w}%,numero_tarjeta.ilike.%${w}%`)
      }
      const { data } = await qb.limit(8)
      setSocioResults((data as unknown as Socio[]) ?? [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [socioSearch])

  // cargar familiares al seleccionar socio
  const seleccionarSocio = async (s: Socio) => {
    setSocioSelec(s)
    setSocioSearch('')
    setSocioResults([])
    setAcomp([])
    const { data } = await dbGolf
      .from('cat_familiares')
      .select('id, nombre, apellido_paterno, apellido_materno, parentesco')
      .eq('id_socio_fk', s.id)
      .eq('activo', true)
      .order('nombre')
    setFamiliares((data as Familiar[]) ?? [])
  }

  const limpiarSocio = () => {
    setSocioSelec(null)
    setFamiliares([])
    setAcomp([])
    setAdeudos([])
    setFolioTicketPOS('')
    setFolioValidado(null)
  }

  // Verificar adeudo (cuotas vencidas) al seleccionar socio — no permite salida al campo
  useEffect(() => {
    if (!socioSelec) { setAdeudos([]); return }
    const hoy = fechaLocal()
    setVerificandoAdeudo(true)
    dbGolf
      .from('cxc_golf')
      .select('id, concepto, monto_final, fecha_vencimiento')
      .eq('id_socio_fk', socioSelec.id)
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .lt('fecha_vencimiento', hoy)
      .limit(5)
      .then(({ data }) => {
        setAdeudos((data as AdeudoRow[]) ?? [])
        setVerificandoAdeudo(false)
      })
  }, [socioSelec])

  const tieneAdeudo = adeudos.length > 0

  // pases disponibles del socio seleccionado
  const [pasesDisponibles, setPasesDisponibles] = useState<{ id: number; cantidad_disponible: number; periodo: string | null }[]>([])

  useEffect(() => {
    if (!socioSelec) { setPasesDisponibles([]); return }
    const hoy = fechaLocal()
    dbGolf
      .from('ctrl_pases')
      .select('id, cantidad_disponible, periodo')
      .eq('id_socio_fk', socioSelec.id)
      .gte('fecha_vencimiento', hoy)
      .gt('cantidad_disponible', 0)
      .order('fecha_vencimiento', { ascending: true })
      .then(({ data }) => setPasesDisponibles(data ?? []))
  }, [socioSelec])

  const totalPasesDisp = pasesDisponibles.reduce((a, p) => a + (p.cantidad_disponible ?? 0), 0)

  // Tope anual de visitas por invitado (igual para todo tipo de socio)
  const [limiteInvitados, setLimiteInvitados] = useState(20)
  useEffect(() => {
    dbGolf.from('cfg_invitados_politica').select('limite_anual').order('id').limit(1).maybeSingle()
      .then(({ data }) => { if (data?.limite_anual) setLimiteInvitados(data.limite_anual) })
  }, [])

  // Fila de invitado con texto buscado pero sin confirmar (ni seleccionado
  // de la lista ni dado de alta) — se bloquea el guardado para no perderla en silencio.
  const hayInvitadoSinConfirmar = acompanantes.some(a =>
    (a.tipo === 'externo' || a.tipo === 'libre') && !a.id_invitado && (a._searchInvitado ?? '').trim()
  )

  // La salida se considera "Green Fee" si hay algún acompañante marcado como tal,
  // o un invitado sin pases disponibles (se cobrará como green fee al no poder descontar un pase).
  const tieneGreenFee = acompanantes.some(a =>
    a.nombre.trim() && (a.tipo === 'libre' || (a.tipo === 'externo' && totalPasesDisp <= 0))
  )

  // Valida el folio contra las ventas del POS del centro "Green Fees" — solo se
  // acepta un folio de una venta PAGADA emitida el mismo día del registro.
  // El folio del ticket es el número grande impreso en el ticket (#000123 = ctrl_ventas.id),
  // NO el "Folio del día" (chico, reinicia cada día por centro) que aparece debajo.
  useEffect(() => {
    if (!tieneGreenFee || !folioTicketPOS.trim()) { setFolioValidado(null); setVerificandoFolio(false); return }
    const folioNum = Number(folioTicketPOS.trim())
    if (!Number.isInteger(folioNum) || folioNum <= 0) {
      setFolioValidado({ ok: false, msg: 'El folio debe ser el número del ticket (el folio grande impreso, ej. #000123)' })
      setVerificandoFolio(false)
      return
    }
    // Mientras se resuelve la búsqueda del centro "Green Fees" (al montar el modal),
    // no mostrar el error de "no encontrado" — solo mostrarlo si de verdad no existe.
    if (!centroGreenFeeLoaded) {
      setFolioValidado(null)
      setVerificandoFolio(true)
      return
    }
    if (!centroGreenFeeId) {
      setFolioValidado({ ok: false, msg: 'No se encontró el centro de venta "Green Fees" configurado en el POS' })
      setVerificandoFolio(false)
      return
    }
    // Limpiar de inmediato el resultado del folio anterior — evita que, mientras el
    // usuario sigue escribiendo, quede visible (y "válido") el resultado de otro folio.
    setFolioValidado(null)
    setVerificandoFolio(true)
    const t = setTimeout(async () => {
      const hoy = fechaLocal()
      const { data: ventaHoy } = await dbGolf
        .from('ctrl_ventas')
        .select('id, fecha, status, total, nombre_cliente')
        .eq('id_centro_fk', centroGreenFeeId)
        .eq('id', folioNum)
        .gte('fecha', inicioDelDia(hoy))
        .lte('fecha', finDelDia(hoy))
        .maybeSingle()

      if (!ventaHoy) {
        // ¿Existe ese folio pero de un día anterior? — mensaje más claro para el usuario
        const { data: ventaAnterior } = await dbGolf
          .from('ctrl_ventas')
          .select('fecha')
          .eq('id_centro_fk', centroGreenFeeId)
          .eq('id', folioNum)
          .lt('fecha', inicioDelDia(hoy))
          .maybeSingle()
        setVerificandoFolio(false)
        setFolioValidado(ventaAnterior
          ? { ok: false, msg: `Ese ticket corresponde a una venta del ${fmtFechaLocal((ventaAnterior as { fecha: string }).fecha)} — no es válido para la salida de hoy` }
          : { ok: false, msg: 'No se encontró ese ticket en las ventas de Green Fees de hoy' })
        return
      }
      const v = ventaHoy as { id: number; fecha: string; status: string; total: number; nombre_cliente: string | null }
      setVerificandoFolio(false)
      if (v.status !== 'PAGADA') {
        setFolioValidado({ ok: false, msg: `Ese ticket está ${v.status.toLowerCase()} — no es válido` })
        return
      }
      setFolioValidado({ ok: true, msg: `Ticket #${String(v.id).padStart(6, '0')} de hoy · ${v.nombre_cliente ?? '—'} · ${fmt$(v.total)}` })
    }, 400)
    return () => clearTimeout(t)
  }, [folioTicketPOS, tieneGreenFee, centroGreenFeeId, centroGreenFeeLoaded])

  // Si el socio tiene pases disponibles, los acompañantes libres se marcan por defecto como invitados.
  useEffect(() => {
    if (totalPasesDisp <= 0) return
    setAcomp(prev => prev.map(a => a.tipo === 'libre' ? { ...a, tipo: 'externo' } : a))
  }, [totalPasesDisp])

  // gestión de acompañantes
  const addAcomp = () => {
    if (acompanantes.length < 5) {
      setAcomp(a => [...a, { tipo: totalPasesDisp > 0 ? 'externo' : 'libre', nombre: '' }])
    }
  }

  const removeAcomp = (i: number) => setAcomp(a => a.filter((_, idx) => idx !== i))

  const setAcompFamiliar = (i: number, id_familiar: number) => {
    const fam = familiares.find(f => f.id === id_familiar)
    if (!fam) return
    setAcomp(a => a.map((x, idx) => idx === i
      ? { tipo: 'familiar', id_familiar: fam.id, nombre: nombreCompleto(fam) }
      : x
    ))
  }

  const setAcompLibre = (i: number, v: string) => {
    setAcomp(a => a.map((x, idx) => idx === i
      ? { ...x, nombre: v }
      : x
    ))
  }

  const setAcompInvitado = (i: number, inv: InvitadoCat | null) => {
    setAcomp(a => a.map((x, idx) => idx === i
      ? { ...x, id_invitado: inv?.id, nombre: inv ? nombreCompletoInvitado(inv) : '', _searchInvitado: '' }
      : x
    ))
  }

  const setAcompSearchInvitado = (i: number, v: string) => {
    setAcomp(a => a.map((x, idx) => idx === i ? { ...x, _searchInvitado: v } : x))
  }

  const setAcompClubOrigen = (i: number, v: string) => {
    setAcomp(a => a.map((x, idx) => idx === i
      ? { ...x, club_origen: v }
      : x
    ))
  }

  const switchTipoAcomp = (i: number, tipo: 'familiar' | 'libre' | 'externo' | 'intercambio') => {
    setAcomp(a => a.map((x, idx) => idx === i
      ? { tipo, nombre: '', club_origen: tipo === 'intercambio' ? x.club_origen ?? '' : '' }
      : x
    ))
  }

  const handleSave = async () => {
    if (!socioSelec) { setError('Selecciona un socio'); return }
    if (!idEspacio)  { setError('Selecciona el espacio deportivo'); return }
    if (tieneAdeudo) { setError('El socio tiene cuotas vencidas — no puede salir al campo'); return }
    if (tieneGreenFee && !folioValidado?.ok) {
      setError('Captura y valida el folio del Ticket de Venta (Green Fees) del POS de Golf, emitido el día de hoy')
      return
    }

    // Si el usuario escribió una búsqueda de invitado pero nunca confirmó un
    // resultado (ni dio de alta uno nuevo), la fila quedaría con nombre vacío
    // y se descartaría en silencio del guardado — sin invitado, sin pase
    // consumido y sin ningún aviso. Se bloquea el guardado en ese caso.
    for (let i = 0; i < acompanantes.length; i++) {
      const a = acompanantes[i]
      if ((a.tipo === 'externo' || a.tipo === 'libre') && !a.id_invitado && (a._searchInvitado ?? '').trim()) {
        setError(`Falta confirmar al invitado de la fila ${i + 1} — selecciónalo de la lista o da clic en "Registrar invitado nuevo" y guarda sus datos`)
        return
      }
    }

    const acompFiltrados = acompanantes
      .map((a, i) => ({ ...a, orden: i + 1 }))
      .filter(a => a.nombre.trim())

    // Invitados (pase o Green Fee) deben venir del catálogo y no haber
    // alcanzado el tope anual de visitas (cuenta cruzada entre todos los socios)
    const anioActual = new Date().getFullYear()
    for (const a of acompFiltrados) {
      if (a.tipo !== 'externo' && a.tipo !== 'libre') continue
      if (!a.id_invitado) { setError(`Selecciona o crea del catálogo al invitado "${a.nombre}"`); return }
      const { count, error: countErr } = await dbGolf.from('ctrl_acceso_acomp')
        .select('id, ctrl_accesos!inner(fecha_entrada)', { count: 'exact', head: true })
        .eq('id_invitado_fk', a.id_invitado)
        .gte('ctrl_accesos.fecha_entrada', `${anioActual}-01-01T00:00:00`)
        .lt('ctrl_accesos.fecha_entrada', `${anioActual + 1}-01-01T00:00:00`)
      if (countErr) { setError(countErr.message); return }
      if ((count ?? 0) >= limiteInvitados) {
        setError(`${a.nombre} ya alcanzó el límite de ${limiteInvitados} visitas este año — no se puede registrar su acceso`)
        return
      }
    }

    setSaving(true); setError('')

    const { data: acceso, error: err } = await dbGolf
      .from('ctrl_accesos')
      .insert({
        id_socio_fk:       socioSelec.id,
        id_espacio_fk:     idEspacio || null,
        hoyo_inicio:       hoyoInicio || null,
        observaciones:     observaciones || null,
        folio_ticket_pos:  tieneGreenFee ? folioTicketPOS.trim() : null,
        fecha_entrada:     new Date().toISOString(),
      })
      .select('id')
      .single()

    if (err || !acceso) { setError(err?.message ?? 'Error al guardar'); setSaving(false); return }

    // Cuántos acompañantes externos hay — intentar descontar pases
    const externosFiltrados = acompFiltrados.filter(a => a.tipo === 'externo')
    let pasesRestantes = [...pasesDisponibles]
    const movIds: number[] = []

    for (const ext of externosFiltrados) {
      const lote = pasesRestantes.find(p => p.cantidad_disponible > 0)
      if (lote) {
        const { data: loteActual } = await dbGolf.from('ctrl_pases').select('cantidad_usada').eq('id', lote.id).single()
        await dbGolf.from('ctrl_pases').update({ cantidad_usada: (loteActual?.cantidad_usada ?? 0) + 1 }).eq('id', lote.id)

        const { data: mov } = await dbGolf.from('ctrl_pases_movimientos').insert({
          id_pase_fk:   lote.id,
          id_socio_fk:  socioSelec!.id,
          tipo:         'CONSUMO',
          cantidad:     -1,
          motivo:       `Invitado: ${ext.nombre.trim()}`,
          id_acceso_fk: acceso.id,
          created_by:   authUser?.nombre ?? null,
        }).select('id').single()

        if (mov) movIds.push(mov.id)

        pasesRestantes = pasesRestantes.map(p =>
          p.id === lote.id ? { ...p, cantidad_disponible: p.cantidad_disponible - 1 } : p
        )
        ext._pase_mov_id = mov?.id ?? null
        ext._origen_pago = 'PASE'
      } else {
        ext._origen_pago = 'GREEN_FEE'
      }
    }

    if (acompFiltrados.length > 0) {
      const { error: acompErr } = await dbGolf.from('ctrl_acceso_acomp').insert(
        acompFiltrados.map(a => ({
          id_acceso_fk:   acceso.id,
          orden:          a.orden,
          nombre:         a.nombre.trim(),
          id_familiar_fk: a.tipo === 'familiar' ? (a.id_familiar ?? null) : null,
          es_externo:     a.tipo === 'externo' || a.tipo === 'libre' || a.tipo === 'intercambio',
          club_origen:    a.tipo === 'intercambio' ? (a.club_origen?.trim() || null) : null,
          origen_pago:    a.tipo === 'libre'
            ? 'GREEN_FEE'
            : a.tipo === 'intercambio'
              ? 'INTERCAMBIO'
              : ((a as any)._origen_pago ?? null),
          id_pase_mov_fk: (a as any)._pase_mov_id ?? null,
          id_invitado_fk: (a.tipo === 'externo' || a.tipo === 'libre') ? (a.id_invitado ?? null) : null,
        }))
      )
      if (acompErr) {
        console.error('[AccesoModal] error guardando acompañantes:', acompErr.message)
        setError(`Entrada guardada pero error en acompañantes: ${acompErr.message}`)
        setSaving(false)
        return
      }
    }

    setSuccess({ id: acceso.id })
    setSaving(false)
  }

  const abrirTicket = async (autoPrint = false) => {
    if (!success) return
    const { data: cfg } = await dbGolf.from('cfg_pos').select('*').single()
    const ticketData = {
      id:           success.id,
      fecha_entrada: new Date().toISOString(),
      socio:        socioSelec ? nombreCompleto(socioSelec) : '—',
      numero_socio: socioSelec?.numero_socio ?? null,
      categoria:    socioSelec?.cat_categorias_socios?.nombre ?? null,
      espacio:      espacios.find(e => e.id === idEspacio)?.nombre ?? '—',
      hoyo_inicio:  hoyoInicio || null,
      observaciones: observaciones || null,
      razon_social:  cfg?.razon_social ?? 'Balvanera Golf, Polo & Country Club',
      municipio:     cfg?.municipio ?? '',
      direccion:     cfg?.direccion ?? '',
      rfc:           cfg?.rfc ?? '',
      telefono:      cfg?.telefono ?? '',
      leyenda:       cfg?.leyenda_ticket ?? '¡Buen juego!',
      acompanantes: acompanantes
        .filter(a => a.nombre.trim())
        .map(a => ({ nombre: a.nombre.trim(), tipo: a.tipo, club_origen: a.club_origen ?? null })),
    }
    const encoded = encodeURIComponent(JSON.stringify(ticketData))
    const url = `/ticket-acceso.html?data=${encoded}${autoPrint ? '&print=1' : ''}`
    window.open(url, '_blank', 'width=400,height=700')
  }

  const socioNombre = socioSelec ? nombreCompleto(socioSelec) : ''

  if (success) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 32px', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <CheckCircle size={52} color="#059669" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>¡Salida registrada!</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
          {socioNombre && <span style={{ fontWeight: 600, color: '#1e293b' }}>{socioNombre}</span>}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24 }}>Folio #{String(success.id).padStart(6, '0')}</div>
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <button onClick={() => abrirTicket(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Printer size={15} /> Imprimir Ticket
          </button>
          <button onClick={() => abrirTicket(false)}
            style={{ padding: '8px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            Ver Ticket
          </button>
          <button onClick={onSaved}
            style={{ padding: '8px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <ModalShell
      modulo="golf-accesos"
      titulo="Registrar Salida al Campo"
      onClose={onClose}
      maxWidth={560}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || verificandoAdeudo || tieneAdeudo || hayInvitadoSinConfirmar || (tieneGreenFee && !folioValidado?.ok)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Registrar Salida
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Búsqueda de socio */}
        <div>
          <label style={labelStyle}>Socio *</label>
          {socioSelec ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1d4ed8' }}>{socioNombre}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                  {socioSelec.numero_socio && `#${socioSelec.numero_socio} · `}
                  {socioSelec.cat_categorias_socios?.nombre}
                  {socioSelec.numero_tarjeta && ` · Tarjeta: ${socioSelec.numero_tarjeta}`}
                </div>
              </div>
              <button onClick={limpiarSocio} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
            </div>
          ) : null}

          {/* Estado de adeudos */}
          {socioSelec && (
            verificandoAdeudo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                <Loader size={13} className="animate-spin" /> Verificando cuotas…
              </div>
            ) : tieneAdeudo ? (
              <div style={{ marginTop: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                  <AlertTriangle size={13} /> Socio con adeudo — no puede salir al campo
                </div>
                {adeudos.map(a => (
                  <div key={a.id} style={{ fontSize: 11, color: '#991b1b', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{a.concepto}</span>
                    <span style={{ fontWeight: 600 }}>{fmt$(a.monto_final ?? 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                <Circle size={8} style={{ fill: '#15803d', color: '#15803d' }} /> Sin adeudos — puede salir al campo
              </div>
            )
          )}

          {!socioSelec && (
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              {buscando && <Loader size={12} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
              <input
                style={{ ...inputStyle, paddingLeft: 30 }}
                placeholder="Buscar por nombre, número de socio o tarjeta…"
                value={socioSearch}
                onChange={e => setSocioSearch(e.target.value)}
                autoFocus
              />
              {socioResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4 }}>
                  {socioResults.map(s => (
                    <button key={s.id} onClick={() => seleccionarSocio(s)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombreCompleto(s)}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {s.numero_socio && `#${s.numero_socio} · `}{s.cat_categorias_socios?.nombre}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Espacio Deportivo */}
        <div>
          <label style={labelStyle}>Espacio Deportivo *</label>
          <select style={inputStyle} value={idEspacio} onChange={e => setIdEspacio(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Seleccionar —</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>

        {/* Hoyo de inicio */}
        <div style={{ maxWidth: 140 }}>
          <label style={labelStyle}>Hoyo de Inicio</label>
          <select style={inputStyle} value={hoyoInicio} onChange={e => setHoyoInicio(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {[1, 10].map(h => (
              <option key={h} value={h}>Hoyo {h}</option>
            ))}
          </select>
        </div>

        {/* Acompañantes */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Acompañantes</label>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>(máx. 5)</span>
              {familiares.length > 0 && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#2563eb', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={10} /> {familiares.length} familiar{familiares.length !== 1 ? 'es' : ''}
                </span>
              )}
              {socioSelec && totalPasesDisp > 0 && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fffbeb', color: '#d97706', fontWeight: 600 }}>
                  🎫 {totalPasesDisp} pase{totalPasesDisp !== 1 ? 's' : ''} disponible{totalPasesDisp !== 1 ? 's' : ''}
                </span>
              )}
              {socioSelec && totalPasesDisp === 0 && acompanantes.some(a => a.tipo === 'externo') && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>
                  Sin pases — se registrará como Green Fee
                </span>
              )}
            </div>
            {socioSelec && acompanantes.length < 5 && (
              <button onClick={addAcomp} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                <Plus size={13} /> Agregar
              </button>
            )}
          </div>

          {!socioSelec && (
            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
              Selecciona un socio para agregar acompañantes
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {acompanantes.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  {familiares.length > 0 && (
                    <button
                      onClick={() => switchTipoAcomp(i, 'familiar')}
                      style={{ padding: '7px 11px', fontSize: 12, fontWeight: 600, background: a.tipo === 'familiar' ? '#eff6ff' : '#fff', color: a.tipo === 'familiar' ? '#1d4ed8' : '#94a3b8', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Familiar
                    </button>
                  )}
                  <button
                    onClick={() => switchTipoAcomp(i, 'externo')}
                    style={{ padding: '7px 11px', fontSize: 12, fontWeight: 600, background: a.tipo === 'externo' ? '#fffbeb' : '#fff', color: a.tipo === 'externo' ? '#d97706' : '#94a3b8', border: 'none', borderLeft: familiares.length > 0 ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    🎫 Invitado
                  </button>
                  <button
                    onClick={() => switchTipoAcomp(i, 'libre')}
                    style={{ padding: '7px 11px', fontSize: 12, fontWeight: 600, background: a.tipo === 'libre' ? '#f0fdf4' : '#fff', color: a.tipo === 'libre' ? '#16a34a' : '#94a3b8', border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Green Fee
                  </button>
                  <button
                    onClick={() => switchTipoAcomp(i, 'intercambio')}
                    style={{ padding: '7px 11px', fontSize: 12, fontWeight: 600, background: a.tipo === 'intercambio' ? '#fdf4ff' : '#fff', color: a.tipo === 'intercambio' ? '#a21caf' : '#94a3b8', border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Intercambio
                  </button>
                </div>

                {a.tipo === 'familiar' && familiares.length > 0 ? (
                  <select
                    style={{ ...inputStyle, flex: 1 }}
                    value={a.id_familiar ?? ''}
                    onChange={e => e.target.value ? setAcompFamiliar(i, Number(e.target.value)) : setAcomp(ac => ac.map((x, idx) => idx === i ? { tipo: 'familiar', nombre: '' } : x))}>
                    <option value="">— Seleccionar familiar —</option>
                    {familiares.map(f => (
                      <option key={f.id} value={f.id}>
                        {nombreCompleto(f)}{f.parentesco ? ` (${f.parentesco})` : ''}
                      </option>
                    ))}
                  </select>
                ) : a.tipo === 'intercambio' ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      style={{ ...inputStyle, borderColor: '#f5d0fe' }}
                      placeholder={`Nombre del visitante ${i + 1} (intercambio)`}
                      value={a.nombre}
                      onChange={e => setAcompLibre(i, e.target.value)}
                    />
                    <input
                      style={{ ...inputStyle, borderColor: '#f5d0fe' }}
                      placeholder="Club origen"
                      value={a.club_origen ?? ''}
                      onChange={e => setAcompClubOrigen(i, e.target.value)}
                    />
                  </div>
                ) : (a.tipo === 'externo' || a.tipo === 'libre') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <InvitadoPicker
                      value={a.id_invitado}
                      nombreActual={a.nombre}
                      search={a._searchInvitado ?? ''}
                      onSearchChange={v => setAcompSearchInvitado(i, v)}
                      onSelect={inv => setAcompInvitado(i, inv)}
                      placeholder={a.tipo === 'externo'
                        ? `Buscar o crear invitado ${i + 1} (consumirá 1 pase)`
                        : `Buscar o crear invitado ${i + 1} (green fee)`}
                      borderColor={a.tipo === 'externo' ? '#fde68a' : '#e2e8f0'}
                    />
                    {a.id_invitado && <InvitadoVisitasBadge idInvitado={a.id_invitado} limite={limiteInvitados} />}
                    {!a.id_invitado && (a._searchInvitado ?? '').trim() && (
                      <span style={{ fontSize: 11, color: '#dc2626' }}>Falta confirmar — selecciona un resultado o registra al invitado nuevo</span>
                    )}
                  </div>
                ) : (
                  <input
                    style={{ ...inputStyle, flex: 1, borderColor: '#e2e8f0' }}
                    placeholder={`Nombre del acompañante ${i + 1}`}
                    value={a.nombre}
                    onChange={e => setAcompLibre(i, e.target.value)}
                  />
                )}

                <button onClick={() => removeAcomp(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Folio de Ticket POS — obligatorio y validado cuando hay acompañante Green Fee */}
        {tieneGreenFee && (
          <div>
            <label style={labelStyle}>Folio del Ticket de Venta — Green Fees (POS Golf) *</label>
            <div style={{ position: 'relative' }}>
              <input
                style={{
                  ...inputStyle, paddingRight: 34,
                  borderColor: !folioTicketPOS.trim() ? '#e2e8f0' : folioValidado?.ok ? '#86efac' : '#fca5a5',
                }}
                type="number" min="1"
                placeholder="Folio impreso en el ticket (el número grande, ej. 123)…"
                value={folioTicketPOS}
                onChange={e => setFolioTicketPOS(e.target.value)}
              />
              {verificandoFolio && <Loader size={14} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
            </div>
            {!verificandoFolio && folioValidado && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, fontWeight: 600, color: folioValidado.ok ? '#15803d' : '#dc2626' }}>
                {folioValidado.ok ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                {folioValidado.msg}
              </div>
            )}
            {!folioTicketPOS.trim() && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                La salida incluye un visitante Green Fee — captura el folio del ticket cobrado hoy en el POS antes de registrar la salida.
              </div>
            )}
          </div>
        )}

        {/* Observaciones */}
        <div>
          <label style={labelStyle}>Observaciones</label>
          <textarea
            style={{ ...inputStyle, height: 72, resize: 'vertical' }}
            value={observaciones}
            onChange={e => setObs(e.target.value)}
            placeholder="Notas adicionales…"
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
