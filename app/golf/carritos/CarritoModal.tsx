'use client'
import { useState, useEffect, useId } from 'react'
import { dbGolf } from '@/lib/supabase'
import { Save, Loader, Search, X, Users, Battery, Plus, Trash2 } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Socio    = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null }
type Familiar = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null }
type Carrito  = { id: number; id_socio_fk: number; id_familiar_fk?: number | null; marca: string | null; modelo: string | null; anio: number | null; color: string | null; numero_serie: string | null; placa: string | null; tipo: string; con_cargador: boolean; activo: boolean; observaciones: string | null }

type BateriaRow = {
  _key:        string   // clave local para React (no va a BD)
  id?:         number   // si ya existe en BD
  tipo:        string
  marca:       string
  anio:        string
  numero_serie: string
}

type Props = {
  carrito?: Carrito | null
  socioInicial?: Socio | null
  onClose: () => void
  onSaved: (carrito: { id: number; id_socio_fk: number; id_familiar_fk?: number | null }) => void
}

const inputStyle   = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null }) =>
  [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

const TIPOS_CARRITO = ['ELECTRICO', 'GASOLINERO', 'OTRO']

const TIPOS_BATERIA = ['6V', '8V', '12V', 'Plomo-Ácido', 'AGM', 'GEL', 'Litio', 'Otro']

function newBateria(key: string): BateriaRow {
  return { _key: key, tipo: '6V', marca: '', anio: '', numero_serie: '' }
}

let _seq = 0
const genKey = () => `bat_${++_seq}_${Date.now()}`

export default function CarritoModal({ carrito, socioInicial, onClose, onSaved }: Props) {
  const isNew = !carrito
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // ── Socio ──────────────────────────────────────────────────
  const [socioSearch, setSocioSearch]   = useState('')
  const [socioResults, setSocioResults] = useState<Socio[]>([])
  const [socioSelec, setSocioSelec]     = useState<Socio | null>(socioInicial ?? null)
  const [buscando, setBuscando]         = useState(false)

  // ── Familiar ───────────────────────────────────────────────
  const [familiares, setFamiliares] = useState<Familiar[]>([])
  const [familiarId, setFamiliarId] = useState<number | null>(carrito?.id_familiar_fk ?? null)

  // ── Formulario del carrito ─────────────────────────────────
  const [form, setForm] = useState({
    marca:         carrito?.marca         ?? '',
    modelo:        carrito?.modelo        ?? '',
    anio:          carrito?.anio          ?? '',
    color:         carrito?.color         ?? '',
    numero_serie:  carrito?.numero_serie  ?? '',
    placa:         carrito?.placa         ?? '',
    tipo:          carrito?.tipo          ?? 'ELECTRICO',
    observaciones: carrito?.observaciones ?? '',
    con_cargador:  carrito?.con_cargador ?? false,
  })
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  // ── Baterías ───────────────────────────────────────────────
  const [baterias, setBaterias]       = useState<BateriaRow[]>([])
  const [loadingBat, setLoadingBat]   = useState(false)

  const isElectrico = form.tipo === 'ELECTRICO'

  // Cargar baterías existentes al editar
  useEffect(() => {
    if (isNew || !carrito?.id || carrito.tipo !== 'ELECTRICO') return
    setLoadingBat(true)
    dbGolf.from('baterias_carritos')
      .select('id, tipo, marca, anio, numero_serie')
      .eq('id_carrito_fk', carrito.id)
      .eq('activo', true)
      .order('id')
      .then(({ data }) => {
        setBaterias((data ?? []).map((b: any) => ({
          _key:        genKey(),
          id:          b.id,
          tipo:        b.tipo        ?? '6V',
          marca:       b.marca       ?? '',
          anio:        b.anio        ? String(b.anio) : '',
          numero_serie: b.numero_serie ?? '',
        })))
        setLoadingBat(false)
      })
  }, [])

  // Buscar socio con debounce
  useEffect(() => {
    if (socioInicial || !isNew) return
    if (socioSearch.trim().length < 2) { setSocioResults([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const { data } = await dbGolf.from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno')
        .eq('activo', true)
        .or(`nombre.ilike.%${socioSearch}%,apellido_paterno.ilike.%${socioSearch}%,numero_socio.ilike.%${socioSearch}%`)
        .limit(8)
      setSocioResults((data as Socio[]) ?? [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [socioSearch])

  // Cargar familiares cuando cambia el socio
  useEffect(() => {
    const idSocio = socioSelec?.id ?? (isNew ? null : carrito?.id_socio_fk)
    if (!idSocio) { setFamiliares([]); return }
    dbGolf.from('cat_familiares')
      .select('id, nombre, apellido_paterno, apellido_materno, parentesco')
      .eq('id_socio_fk', idSocio)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setFamiliares((data as Familiar[]) ?? []))
  }, [socioSelec])

  // ── Helpers de baterías ────────────────────────────────────
  const addBateria = () => {
    if (baterias.length >= 8) return
    setBaterias(prev => [...prev, newBateria(genKey())])
  }
  const removeBateria = (key: string) => setBaterias(prev => prev.filter(b => b._key !== key))
  const setBat = (key: string, field: keyof Omit<BateriaRow, '_key' | 'id'>, value: string) =>
    setBaterias(prev => prev.map(b => b._key === key ? { ...b, [field]: value } : b))

  // ── Guardar ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!socioSelec && isNew) { setError('Selecciona el socio propietario'); return }
    setSaving(true); setError('')

    const payload = {
      id_socio_fk:    isNew ? socioSelec!.id : carrito!.id_socio_fk,
      id_familiar_fk: familiarId ?? null,
      marca:          form.marca         || null,
      modelo:         form.modelo        || null,
      anio:           form.anio          ? Number(form.anio) : null,
      color:          form.color         || null,
      numero_serie:   form.numero_serie  || null,
      placa:          form.placa         || null,
      tipo:           form.tipo,
      con_cargador:   form.con_cargador,
      observaciones:  form.observaciones || null,
    }

    const { data, error: errCarrito } = isNew
      ? await dbGolf.from('cat_carritos').insert(payload).select('id, id_socio_fk, id_familiar_fk').single()
      : await dbGolf.from('cat_carritos').update(payload).eq('id', carrito!.id).select('id, id_socio_fk, id_familiar_fk').single()

    if (errCarrito || !data) { setError(errCarrito?.message ?? 'Error al guardar'); setSaving(false); return }

    const carritoId = (data as any).id as number

    // Guardar baterías si es eléctrico
    if (isElectrico && baterias.length > 0) {
      // En modo edición: eliminar las que ya no están en la lista
      if (!isNew) {
        const idsActuales = baterias.filter(b => b.id).map(b => b.id!)
        if (idsActuales.length > 0) {
          // Marcar como inactivas las que se quitaron
          await dbGolf.from('baterias_carritos')
            .update({ activo: false })
            .eq('id_carrito_fk', carritoId)
            .not('id', 'in', `(${idsActuales.join(',')})`)
        } else {
          // Si no queda ninguna preexistente, inactivar todas las viejas
          await dbGolf.from('baterias_carritos')
            .update({ activo: false })
            .eq('id_carrito_fk', carritoId)
        }
      }

      // Nuevas (sin id) → insert
      const nuevas = baterias.filter(b => !b.id)
      if (nuevas.length > 0) {
        const insertPayload = nuevas.map(b => ({
          id_carrito_fk: carritoId,
          tipo:          b.tipo         || null,
          marca:         b.marca        || null,
          anio:          b.anio         ? Number(b.anio) : null,
          numero_serie:  b.numero_serie || null,
        }))
        const { error: errBat } = await dbGolf.from('baterias_carritos').insert(insertPayload)
        if (errBat) { setError(`Carrito guardado, pero error en baterías: ${errBat.message}`); setSaving(false); return }
      }

      // Existentes (con id) → update
      const existentes = baterias.filter(b => !!b.id)
      for (const b of existentes) {
        await dbGolf.from('baterias_carritos').update({
          tipo:         b.tipo         || null,
          marca:        b.marca        || null,
          anio:         b.anio         ? Number(b.anio) : null,
          numero_serie: b.numero_serie || null,
        }).eq('id', b.id!)
      }
    } else if (!isElectrico && !isNew) {
      // Si cambió de eléctrico a otro tipo, inactivar baterías
      await dbGolf.from('baterias_carritos').update({ activo: false }).eq('id_carrito_fk', carritoId)
    }

    onSaved(data as { id: number; id_socio_fk: number; id_familiar_fk?: number | null })
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <ModalShell
      modulo="golf-carritos"
      titulo={isNew ? 'Registrar Carrito' : 'Editar Carrito'}
      maxWidth={600}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader size={14} /> : <Save size={14} />}
          {isNew ? 'Registrar' : 'Guardar'}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Socio ── */}
        {isNew && (
          <div>
            <label style={labelStyle}>Socio Propietario *</label>
            {socioSelec ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>{nc(socioSelec)}</div>
                  {socioSelec.numero_socio && <div style={{ fontSize: 11, color: '#6b7280' }}>#{socioSelec.numero_socio}</div>}
                </div>
                {!socioInicial && (
                  <button onClick={() => { setSocioSelec(null); setFamiliarId(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                {buscando && <Loader size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
                <input
                  style={{ ...inputStyle, paddingLeft: 30 }}
                  placeholder="Buscar socio…"
                  value={socioSearch}
                  onChange={e => setSocioSearch(e.target.value)}
                  autoFocus
                />
                {socioResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4 }}>
                    {socioResults.map(s => (
                      <button key={s.id}
                        onClick={() => { setSocioSelec(s); setSocioSearch(''); setSocioResults([]) }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nc(s)}</span>
                        {s.numero_socio && <span style={{ fontSize: 11, color: '#64748b' }}>#{s.numero_socio}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Familiar (opcional) ── */}
        {(socioSelec || (!isNew && carrito)) && (
          <div>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={12} style={{ color: '#7c3aed' }} />
              Familiar (opcional)
            </label>
            {familiares.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                Este socio no tiene familiares registrados
              </div>
            ) : (
              <select style={inputStyle} value={familiarId ?? ''} onChange={e => setFamiliarId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Carrito del socio titular —</option>
                {familiares.map(f => (
                  <option key={f.id} value={f.id}>
                    {nc(f)}{f.parentesco ? ` (${f.parentesco})` : ''}
                  </option>
                ))}
              </select>
            )}
            {familiarId && (
              <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4 }}>
                La cuota se cargará al socio titular. El familiar queda registrado para identificar el carrito.
              </div>
            )}
          </div>
        )}

        {/* ── Tipo ── */}
        <div>
          <label style={labelStyle}>Tipo *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TIPOS_CARRITO.map(t => (
              <button key={t} onClick={() => set('tipo', t)} style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${form.tipo === t ? '#059669' : '#e2e8f0'}`, background: form.tipo === t ? '#ecfdf5' : '#fff', color: form.tipo === t ? '#065f46' : '#94a3b8', cursor: 'pointer' }}>
                {t === 'ELECTRICO' ? '⚡ Eléctrico' : t === 'GASOLINERO' ? '⛽ Gasolinero' : '🔧 Otro'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Marca / Modelo / Año ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
          <div>
            <label style={labelStyle}>Marca</label>
            <input style={inputStyle} value={form.marca} onChange={e => set('marca', e.target.value)} placeholder="EZ-GO, Club Car…" />
          </div>
          <div>
            <label style={labelStyle}>Modelo</label>
            <input style={inputStyle} value={form.modelo} onChange={e => set('modelo', e.target.value)} placeholder="TXT, Precedent…" />
          </div>
          <div>
            <label style={labelStyle}>Año</label>
            <input style={inputStyle} type="number" value={form.anio} onChange={e => set('anio', e.target.value)} placeholder="2020" min={1990} max={2030} />
          </div>
        </div>

        {/* ── Color / Serie / Placa ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Color</label>
            <input style={inputStyle} value={form.color} onChange={e => set('color', e.target.value)} placeholder="Blanco" />
          </div>
          <div>
            <label style={labelStyle}>No. de Serie</label>
            <input style={inputStyle} value={form.numero_serie} onChange={e => set('numero_serie', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Placa</label>
            <input style={inputStyle} value={form.placa} onChange={e => set('placa', e.target.value)} />
          </div>
        </div>

        {/* ── Con cargador (solo eléctrico) ── */}
        {isElectrico && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', padding: '10px 14px', background: form.con_cargador ? '#eff6ff' : '#f8fafc', border: `1px solid ${form.con_cargador ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 8, transition: 'all 0.15s' }}>
            <input
              type="checkbox"
              checked={form.con_cargador}
              onChange={e => set('con_cargador', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#2563eb', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: form.con_cargador ? '#1d4ed8' : '#475569' }}>
              Con cargador incluido
            </span>
            {form.con_cargador && (
              <span style={{ fontSize: 11, color: '#60a5fa', marginLeft: 2 }}>🔌 Sí</span>
            )}
          </label>
        )}

        {/* ── Observaciones ── */}
        <div>
          <label style={labelStyle}>Observaciones</label>
          <textarea style={{ ...inputStyle, height: 56, resize: 'vertical' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales…" />
        </div>

        {/* ── Baterías (solo eléctrico) ── */}
        {isElectrico && (
          <div style={{ border: '1px solid #bfdbfe', borderRadius: 10, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#eff6ff', borderBottom: baterias.length > 0 ? '1px solid #bfdbfe' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Battery size={14} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>Baterías</span>
                <span style={{ fontSize: 11, color: '#60a5fa', background: '#dbeafe', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>
                  {baterias.length}/8
                </span>
                {loadingBat && <Loader size={12} style={{ color: '#60a5fa' }} />}
              </div>
              {baterias.length < 8 && (
                <button
                  onClick={addBateria}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}
                >
                  <Plus size={12} /> Agregar batería
                </button>
              )}
            </div>

            {/* Tabla de baterías */}
            {baterias.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', background: '#f8fafc' }}>
                Sin baterías registradas — usa "Agregar batería" para añadir.
              </div>
            ) : (
              <div style={{ background: '#fff' }}>
                {/* Cabecera columnas */}
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 70px 1fr 32px', gap: 6, padding: '6px 12px 4px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  {['Tipo', 'Marca', 'Año', 'No. de Serie', ''].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                  ))}
                </div>

                {/* Filas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {baterias.map((b, idx) => (
                    <div key={b._key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 70px 1fr 32px', gap: 6, padding: '7px 12px', alignItems: 'center', borderBottom: idx < baterias.length - 1 ? '1px solid #f1f5f9' : 'none', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      {/* Tipo */}
                      <select
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
                        value={b.tipo}
                        onChange={e => setBat(b._key, 'tipo', e.target.value)}
                      >
                        {TIPOS_BATERIA.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>

                      {/* Marca */}
                      <input
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
                        placeholder="Trojan, US Bat…"
                        value={b.marca}
                        onChange={e => setBat(b._key, 'marca', e.target.value)}
                      />

                      {/* Año */}
                      <input
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
                        type="number"
                        placeholder="2023"
                        min={2000}
                        max={2040}
                        value={b.anio}
                        onChange={e => setBat(b._key, 'anio', e.target.value)}
                      />

                      {/* No. Serie */}
                      <input
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
                        placeholder="Serie / lote…"
                        value={b.numero_serie}
                        onChange={e => setBat(b._key, 'numero_serie', e.target.value)}
                      />

                      {/* Eliminar */}
                      <button
                        onClick={() => removeBateria(b._key)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', borderRadius: 6 }}
                        title="Quitar batería"
                        onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {baterias.length >= 8 && (
              <div style={{ padding: '7px 14px', background: '#fffbeb', borderTop: '1px solid #fde68a', fontSize: 11, color: '#92400e', fontWeight: 500 }}>
                Límite de 8 baterías alcanzado.
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
