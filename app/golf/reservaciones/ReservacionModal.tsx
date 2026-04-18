'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader, Search, Car } from 'lucide-react'

type Socio = {
  id: number; numero_socio: string | null; nombre: string
  apellido_paterno: string | null; apellido_materno: string | null
  cat_categorias_socios?: { nombre: string } | null
}
type Espacio    = { id: number; nombre: string }
type FormaJuego = { id: number; nombre: string }

type Props = {
  fecha: string         // YYYY-MM-DD preseleccionada
  onClose: () => void
  onSaved: () => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none',
}
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

// Genera slots de 7:00 a 20:00 cada 10 min
const HORAS = Array.from({ length: 79 }, (_, i) => {
  const totalMin = 7 * 60 + i * 10
  const h = String(Math.floor(totalMin / 60)).padStart(2, '0')
  const m = String(totalMin % 60).padStart(2, '0')
  return `${h}:${m}`
})

export default function ReservacionModal({ fecha, onClose, onSaved }: Props) {
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [formas, setFormas]     = useState<FormaJuego[]>([])

  // búsqueda socio
  const [socioSearch, setSocioSearch]   = useState('')
  const [socioResults, setSocioResults] = useState<Socio[]>([])
  const [socioSelec, setSocioSelec]     = useState<Socio | null>(null)
  const [buscando, setBuscando]         = useState(false)

  const [form, setForm] = useState({
    fecha_reservacion: fecha,
    hora_reservacion:  '08:00',
    id_espacio_fk:     '' as number | '',
    id_forma_juego_fk: '' as number | '',
    num_jugadores:     1,
    carro_golf:        false,
    monto:             '' as number | '',
    monto_carro_golf:  '' as number | '',
    observaciones:     '',
  })
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    dbGolf.from('cat_espacios_deportivos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setEspacios(data ?? []))
    dbGolf.from('cat_formas_juego').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setFormas(data ?? []))
  }, [])

  useEffect(() => {
    if (socioSearch.trim().length < 2) { setSocioResults([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const { data } = await dbGolf
        .from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre)')
        .eq('activo', true)
        .or(`nombre.ilike.%${socioSearch}%,apellido_paterno.ilike.%${socioSearch}%,numero_socio.ilike.%${socioSearch}%`)
        .limit(8)
      setSocioResults((data as Socio[]) ?? [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [socioSearch])

  const seleccionarSocio = (s: Socio) => { setSocioSelec(s); setSocioSearch(''); setSocioResults([]) }

  const handleSave = async () => {
    if (!socioSelec)          { setError('Selecciona un socio'); return }
    if (!form.id_espacio_fk)  { setError('Selecciona el espacio deportivo'); return }
    if (!form.hora_reservacion) { setError('Selecciona la hora'); return }
    setSaving(true); setError('')

    const { error: err } = await dbGolf.from('ctrl_reservaciones').insert({
      id_socio_fk:        socioSelec.id,
      id_espacio_fk:      form.id_espacio_fk || null,
      id_forma_juego_fk:  form.id_forma_juego_fk || null,
      fecha_reservacion:  form.fecha_reservacion,
      hora_reservacion:   form.hora_reservacion,
      num_jugadores:      form.num_jugadores,
      carro_golf:         form.carro_golf,
      monto:              form.monto || null,
      monto_carro_golf:   form.carro_golf ? (form.monto_carro_golf || null) : null,
      observaciones:      form.observaciones || null,
    })

    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const nombreSocio = socioSelec
    ? [socioSelec.nombre, socioSelec.apellido_paterno, socioSelec.apellido_materno].filter(Boolean).join(' ')
    : ''

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>Nueva Reservación</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Socio */}
          <div>
            <label style={lbl}>Socio *</label>
            {socioSelec ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1d4ed8' }}>{nombreSocio}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                    {socioSelec.numero_socio && `#${socioSelec.numero_socio} · `}
                    {socioSelec.cat_categorias_socios?.nombre}
                  </div>
                </div>
                <button onClick={() => setSocioSelec(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                {buscando && <Loader size={12} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
                <input style={{ ...inp, paddingLeft: 30 }} placeholder="Buscar por nombre o número de socio…"
                  value={socioSearch} onChange={e => setSocioSearch(e.target.value)} autoFocus />
                {socioResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4 }}>
                    {socioResults.map(s => {
                      const nombre = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
                      return (
                        <button key={s.id} onClick={() => seleccionarSocio(s)}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombre}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{s.numero_socio && `#${s.numero_socio} · `}{s.cat_categorias_socios?.nombre}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fecha, Hora, Espacio */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Fecha *</label>
              <input style={inp} type="date" value={form.fecha_reservacion} onChange={e => set('fecha_reservacion', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Hora *</label>
              <select style={inp} value={form.hora_reservacion} onChange={e => set('hora_reservacion', e.target.value)}>
                {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Espacio Deportivo *</label>
              <select style={inp} value={form.id_espacio_fk} onChange={e => set('id_espacio_fk', e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Seleccionar —</option>
                {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Forma de Juego</label>
              <select style={inp} value={form.id_forma_juego_fk} onChange={e => set('id_forma_juego_fk', e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Seleccionar —</option>
                {formas.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Jugadores y Monto */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Núm. de Jugadores</label>
              <select style={inp} value={form.num_jugadores} onChange={e => set('num_jugadores', Number(e.target.value))}>
                {[1,2,3,4].map(n => <option key={n} value={n}>{n} jugador{n > 1 ? 'es' : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Monto</label>
              <input style={inp} type="number" min="0" step="0.01" value={form.monto} onChange={e => set('monto', e.target.value ? Number(e.target.value) : '')} placeholder="0.00" />
            </div>
          </div>

          {/* Carro de Golf */}
          <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.carro_golf ? 12 : 0 }}>
              <input type="checkbox" id="carro" checked={form.carro_golf} onChange={e => set('carro_golf', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="carro" style={{ ...lbl, marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Car size={14} style={{ color: '#64748b' }} /> Incluye carro de golf
              </label>
            </div>
            {form.carro_golf && (
              <div>
                <label style={lbl}>Monto carro de golf</label>
                <input style={inp} type="number" min="0" step="0.01" value={form.monto_carro_golf} onChange={e => set('monto_carro_golf', e.target.value ? Number(e.target.value) : '')} placeholder="0.00" />
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label style={lbl}>Observaciones</label>
            <textarea style={{ ...inp, height: 68, resize: 'vertical' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales…" />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar Reservación
          </button>
        </div>
      </div>
    </div>
  )
}
