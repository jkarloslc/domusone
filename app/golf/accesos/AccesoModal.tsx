'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader, Plus, Trash2, Search } from 'lucide-react'

type Socio = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_tarjeta: string | null; cat_categorias_socios?: { nombre: string } | null }
type Espacio = { id: number; nombre: string }
type FormaJuego = { id: number; nombre: string }

type Props = { onClose: () => void; onSaved: () => void }

const inputStyle = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

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

  // form
  const [idEspacio, setIdEspacio]       = useState<number | ''>('')
  const [idForma, setIdForma]           = useState<number | ''>('')
  const [hoyoInicio, setHoyoInicio]     = useState<number | ''>('')
  const [observaciones, setObs]         = useState('')
  const [acompanantes, setAcomp]        = useState<string[]>([''])

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

  const seleccionarSocio = (s: Socio) => {
    setSocioSelec(s)
    setSocioSearch('')
    setSocioResults([])
  }

  const addAcomp = () => { if (acompanantes.length < 5) setAcomp(a => [...a, '']) }
  const removeAcomp = (i: number) => setAcomp(a => a.filter((_, idx) => idx !== i))
  const setAcompVal = (i: number, v: string) => setAcomp(a => a.map((x, idx) => idx === i ? v : x))

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

    // insertar acompañantes
    const acompFiltrados = acompanantes.map((a, i) => ({ nombre: a.trim(), orden: i + 1 })).filter(a => a.nombre)
    if (acompFiltrados.length > 0) {
      await dbGolf.from('ctrl_acceso_acomp').insert(
        acompFiltrados.map(a => ({ id_acceso_fk: acceso.id, orden: a.orden, nombre: a.nombre }))
      )
    }

    onSaved()
  }

  const nombreSocio = socioSelec
    ? [socioSelec.nombre, socioSelec.apellido_paterno, socioSelec.apellido_materno].filter(Boolean).join(' ')
    : ''

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
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1d4ed8' }}>{nombreSocio}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                    {socioSelec.numero_socio && `#${socioSelec.numero_socio} · `}
                    {socioSelec.cat_categorias_socios?.nombre}
                    {socioSelec.numero_tarjeta && ` · Tarjeta: ${socioSelec.numero_tarjeta}`}
                  </div>
                </div>
                <button onClick={() => setSocioSelec(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
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
                    {socioResults.map(s => {
                      const nombre = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
                      return (
                        <button key={s.id} onClick={() => seleccionarSocio(s)}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombre}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {s.numero_socio && `#${s.numero_socio} · `}{s.cat_categorias_socios?.nombre}
                          </span>
                        </button>
                      )
                    })}
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
              <label style={{ ...labelStyle, marginBottom: 0 }}>Acompañantes <span style={{ fontWeight: 400, color: '#94a3b8' }}>(máx. 5)</span></label>
              {acompanantes.length < 5 && (
                <button onClick={addAcomp} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  <Plus size={13} /> Agregar
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {acompanantes.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder={`Nombre del acompañante ${i + 1}`}
                    value={a}
                    onChange={e => setAcompVal(i, e.target.value)}
                  />
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
