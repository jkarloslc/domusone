'use client'
import { useState, useEffect } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { X, Save, Loader, Plus, Trash2, Search, Users, CheckCircle, Printer, AlertTriangle, Circle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Socio = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_tarjeta: string | null; cat_categorias_socios?: { nombre: string } | null }
type Familiar = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null }
type Espacio = { id: number; nombre: string }
type AdeudoRow = { id: number; concepto: string; monto_final: number; fecha_vencimiento: string | null }

const fmt$ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

// Un acompañante puede ser familiar, visitante Green Fee, invitado por pase o intercambio
type Acomp = {
  tipo: 'familiar' | 'libre' | 'externo' | 'intercambio'
  id_familiar?: number
  nombre: string
  club_origen?: string
  _pase_mov_id?: number | null
  _origen_pago?: string | null
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
  const [folioTicketPOS, setFolioTicketPOS] = useState('')

  useEffect(() => {
    dbGolf.from('cat_espacios_deportivos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        const list = data ?? []
        setEspacios(list)
        // Precargar "Campo Golf" si existe
        const campo = list.find((e: Espacio) => e.nombre.toLowerCase().includes('campo golf'))
        if (campo) setIdEspacio(campo.id)
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
  }

  // Verificar adeudo (cuotas vencidas) al seleccionar socio — no permite salida al campo
  useEffect(() => {
    if (!socioSelec) { setAdeudos([]); return }
    const hoy = new Date().toLocaleDateString('en-CA')
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
    const hoy = new Date().toISOString().split('T')[0]
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

  // La salida se considera "Green Fee" si hay algún acompañante marcado como tal,
  // o un invitado sin pases disponibles (se cobrará como green fee al no poder descontar un pase).
  const tieneGreenFee = acompanantes.some(a =>
    a.nombre.trim() && (a.tipo === 'libre' || (a.tipo === 'externo' && totalPasesDisp <= 0))
  )

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
    if (tieneGreenFee && !folioTicketPOS.trim()) {
      setError('Captura el folio del Ticket de Venta del POS de Golf para registrar la salida Green Fee')
      return
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

    // insertar acompañantes con FK a familiar si aplica
    const acompFiltrados = acompanantes
      .map((a, i) => ({ ...a, orden: i + 1 }))
      .filter(a => a.nombre.trim())

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
        <button className="btn-primary" onClick={handleSave} disabled={saving || verificandoAdeudo || tieneAdeudo || (tieneGreenFee && !folioTicketPOS.trim())} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                ) : (
                  <input
                    style={{ ...inputStyle, flex: 1, borderColor: a.tipo === 'externo' ? '#fde68a' : '#e2e8f0' }}
                    placeholder={a.tipo === 'externo'
                      ? `Nombre del invitado ${i + 1} (consumirá 1 pase)`
                      : a.tipo === 'libre'
                        ? `Nombre del visitante ${i + 1} (green fee)`
                        : `Nombre del acompañante ${i + 1}`}
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

        {/* Folio de Ticket POS — obligatorio cuando hay acompañante Green Fee */}
        {tieneGreenFee && (
          <div>
            <label style={labelStyle}>Folio del Ticket de Venta (POS Golf) *</label>
            <input
              style={{ ...inputStyle, borderColor: !folioTicketPOS.trim() ? '#fca5a5' : '#e2e8f0' }}
              placeholder="Folio del ticket emitido en el POS de Golf…"
              value={folioTicketPOS}
              onChange={e => setFolioTicketPOS(e.target.value)}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              La salida incluye un visitante Green Fee — captura el folio del ticket cobrado en el POS antes de registrar la salida.
            </div>
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
