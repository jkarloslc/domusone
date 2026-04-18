'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader, Plus, Trash2, Search, Users } from 'lucide-react'

type Socio = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_tarjeta: string | null; cat_categorias_socios?: { nombre: string } | null }
type Familiar = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null }
type Espacio = { id: number; nombre: string }
type FormaJuego = { id: number; nombre: string }

// Un acompañante puede ser familiar seleccionado, texto libre, o externo (consume pase)
type Acomp = { tipo: 'familiar' | 'libre' | 'externo'; id_familiar?: number; nombre: string }

type Props = { onClose: () => void; onSaved: () => void }

const inputStyle = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

const nombreCompleto = (x: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null }) =>
  [x.nombre, x.apellido_paterno, x.apellido_materno].filter(Boolean).join(' ')

export default function AccesoModal({ onClose, onSaved }: Props) {
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [espacios, setEspacios]   = useState<Espacio[]>([])
  const [formas, setFormas]       = useState<FormaJuego[]>([])

  // búsqueda de socio
  const [socioSearch, setSocioSearch]   = useState('')
  const [socioResults, setSocioResults] = useState<Socio[]>([])
  const [socioSelec, setSocioSelec]     = useState<Socio | null>(null)
  const [buscando, setBuscando]         = useState(false)

  // familiares del socio
  const [familiares, setFamiliares] = useState<Familiar[]>([])

  // form
  const [idEspacio, setIdEspacio]   = useState<number | ''>('')
  const [idForma, setIdForma]       = useState<number | ''>('')
  const [hoyoInicio, setHoyoInicio] = useState<number | ''>('')
  const [observaciones, setObs]     = useState('')
  const [acompanantes, setAcomp]    = useState<Acomp[]>([])

  useEffect(() => {
    dbGolf.from('cat_espacios_deportivos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setEspacios(data ?? []))
    dbGolf.from('cat_formas_juego').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setFormas(data ?? []))
  }, [])

  // debounce búsqueda de socio
  useEffect(() => {
    if (socioSearch.trim().length < 2) { setSocioResults([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const { data } = await dbGolf
        .from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, numero_tarjeta, cat_categorias_socios(nombre)')
        .eq('activo', true)
        .or(`nombre.ilike.%${socioSearch}%,apellido_paterno.ilike.%${socioSearch}%,numero_socio.ilike.%${socioSearch}%,numero_tarjeta.ilike.%${socioSearch}%`)
        .limit(8)
      setSocioResults((data as Socio[]) ?? [])
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
  }

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

  // gestión de acompañantes
  const addAcomp = () => {
    if (acompanantes.length < 5) setAcomp(a => [...a, { tipo: 'libre', nombre: '' }])
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
      ? { tipo: 'libre', nombre: v }
      : x
    ))
  }

  const switchTipoAcomp = (i: number, tipo: 'familiar' | 'libre' | 'externo') => {
    setAcomp(a => a.map((x, idx) => idx === i
      ? { tipo, nombre: '' }
      : x
    ))
  }

  const handleSave = async () => {
    if (!socioSelec) { setError('Selecciona un socio'); return }
    if (!idEspacio)  { setError('Selecciona el espacio deportivo'); return }
    setSaving(true); setError('')

    const { data: acceso, error: err } = await dbGolf
      .from('ctrl_accesos')
      .insert({
        id_socio_fk:       socioSelec.id,
        id_espacio_fk:     idEspacio || null,
        id_forma_juego_fk: idForma   || null,
        hoyo_inicio:       hoyoInicio || null,
        observaciones:     observaciones || null,
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
      // Buscar lote con saldo disponible
      const lote = pasesRestantes.find(p => p.cantidad_disponible > 0)
      if (lote) {
        // Descontar 1 pase del lote
        await dbGolf.from('ctrl_pases')
          .update({ cantidad_usada: lote.cantidad_disponible === undefined ? 1 : undefined })
          .eq('id', lote.id)

        // Usar RPC-free: incrementar cantidad_usada directamente
        const { data: loteActual } = await dbGolf.from('ctrl_pases').select('cantidad_usada').eq('id', lote.id).single()
        await dbGolf.from('ctrl_pases').update({ cantidad_usada: (loteActual?.cantidad_usada ?? 0) + 1 }).eq('id', lote.id)

        // Registrar movimiento
        const { data: mov } = await dbGolf.from('ctrl_pases_movimientos').insert({
          id_pase_fk:   lote.id,
          id_socio_fk:  socioSelec!.id,
          tipo:         'CONSUMO',
          cantidad:     -1,
          motivo:       `Invitado: ${ext.nombre.trim()}`,
          id_acceso_fk: acceso.id,
        }).select('id').single()

        if (mov) movIds.push(mov.id)

        // Actualizar disponible local para siguientes iteraciones
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
      await dbGolf.from('ctrl_acceso_acomp').insert(
        acompFiltrados.map(a => ({
          id_acceso_fk:    acceso.id,
          orden:           a.orden,
          nombre:          a.nombre.trim(),
          id_familiar_fk:  a.tipo === 'familiar' ? (a.id_familiar ?? null) : null,
          es_externo:      a.tipo === 'externo',
          origen_pago:     (a as any)._origen_pago ?? null,
          id_pase_mov_fk:  (a as any)._pase_mov_id ?? null,
        }))
      )
    }

    onSaved()
  }

  const socioNombre = socioSelec ? nombreCompleto(socioSelec) : ''

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>Registrar Salida al Campo</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

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
            ) : (
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

          {/* Espacio y Forma de juego */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Espacio Deportivo *</label>
              <select style={inputStyle} value={idEspacio} onChange={e => setIdEspacio(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Seleccionar —</option>
                {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Forma de Juego</label>
              <select style={inputStyle} value={idForma} onChange={e => setIdForma(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Seleccionar —</option>
                {formas.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Hoyo de inicio */}
          <div style={{ maxWidth: 140 }}>
            <label style={labelStyle}>Hoyo de Inicio</label>
            <select style={inputStyle} value={hoyoInicio} onChange={e => setHoyoInicio(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(h => (
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
                    Sin pases — invitado como green fee
                  </span>
                )}
              </div>
              {acompanantes.length < 5 && (
                <button onClick={addAcomp} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  <Plus size={13} /> Agregar
                </button>
              )}
            </div>

            {!socioSelec && acompanantes.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                Selecciona un socio para agregar acompañantes
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {acompanantes.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* Toggle tipo: Familiar / Externo (pase) / Otro */}
                  <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                    {familiares.length > 0 && (
                      <button
                        onClick={() => switchTipoAcomp(i, 'familiar')}
                        style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, background: a.tipo === 'familiar' ? '#eff6ff' : '#fff', color: a.tipo === 'familiar' ? '#1d4ed8' : '#94a3b8', border: 'none', cursor: 'pointer' }}>
                        Familiar
                      </button>
                    )}
                    <button
                      onClick={() => switchTipoAcomp(i, 'externo')}
                      style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, background: a.tipo === 'externo' ? '#fffbeb' : '#fff', color: a.tipo === 'externo' ? '#d97706' : '#94a3b8', border: 'none', borderLeft: familiares.length > 0 ? '1px solid #e2e8f0' : 'none', cursor: 'pointer' }}>
                      🎫 Invitado
                    </button>
                    <button
                      onClick={() => switchTipoAcomp(i, 'libre')}
                      style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, background: a.tipo === 'libre' ? '#f8fafc' : '#fff', color: a.tipo === 'libre' ? '#475569' : '#94a3b8', border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer' }}>
                      Otro
                    </button>
                  </div>

                  {/* Input según tipo */}
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
                  ) : (
                    <input
                      style={{ ...inputStyle, flex: 1, borderColor: a.tipo === 'externo' ? '#fde68a' : '#e2e8f0' }}
                      placeholder={a.tipo === 'externo' ? `Nombre del invitado ${i + 1} (consumirá 1 pase)` : `Nombre del acompañante ${i + 1}`}
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

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            Registrar Entrada
          </button>
        </div>
      </div>
    </div>
  )
}
