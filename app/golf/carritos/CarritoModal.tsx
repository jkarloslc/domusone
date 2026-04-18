'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader, Search } from 'lucide-react'

type Socio = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null }
type Carrito = { id: number; id_socio_fk: number; marca: string | null; modelo: string | null; anio: number | null; color: string | null; numero_serie: string | null; placa: string | null; tipo: string; activo: boolean; observaciones: string | null }

type Props = {
  carrito?: Carrito | null
  socioInicial?: Socio | null
  onClose: () => void
  onSaved: (carrito: { id: number; id_socio_fk: number }) => void
}

const inputStyle = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null }) =>
  [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

const TIPOS = ['ELECTRICO', 'GASOLINERO', 'OTRO']

export default function CarritoModal({ carrito, socioInicial, onClose, onSaved }: Props) {
  const isNew = !carrito
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const [socioSearch, setSocioSearch]   = useState('')
  const [socioResults, setSocioResults] = useState<Socio[]>([])
  const [socioSelec, setSocioSelec]     = useState<Socio | null>(socioInicial ?? null)
  const [buscando, setBuscando]         = useState(false)

  const [form, setForm] = useState({
    marca:        carrito?.marca        ?? '',
    modelo:       carrito?.modelo       ?? '',
    anio:         carrito?.anio         ?? '',
    color:        carrito?.color        ?? '',
    numero_serie: carrito?.numero_serie ?? '',
    placa:        carrito?.placa        ?? '',
    tipo:         carrito?.tipo         ?? 'ELECTRICO',
    observaciones: carrito?.observaciones ?? '',
  })
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

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

  const handleSave = async () => {
    if (!socioSelec && isNew) { setError('Selecciona el socio propietario'); return }
    setSaving(true); setError('')

    const payload = {
      id_socio_fk:   isNew ? socioSelec!.id : carrito!.id_socio_fk,
      marca:         form.marca         || null,
      modelo:        form.modelo        || null,
      anio:          form.anio          ? Number(form.anio) : null,
      color:         form.color         || null,
      numero_serie:  form.numero_serie  || null,
      placa:         form.placa         || null,
      tipo:          form.tipo,
      observaciones: form.observaciones || null,
    }

    const { data, error: err } = isNew
      ? await dbGolf.from('cat_carritos').insert(payload).select('id, id_socio_fk').single()
      : await dbGolf.from('cat_carritos').update(payload).eq('id', carrito!.id).select('id, id_socio_fk').single()

    if (err || !data) { setError(err?.message ?? 'Error al guardar'); setSaving(false); return }
    onSaved(data as { id: number; id_socio_fk: number })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>{isNew ? 'Registrar Carrito' : 'Editar Carrito'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Socio */}
          {isNew && (
            <div>
              <label style={labelStyle}>Socio Propietario *</label>
              {socioSelec ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>{nc(socioSelec)}</div>
                    {socioSelec.numero_socio && <div style={{ fontSize: 11, color: '#6b7280' }}>#{socioSelec.numero_socio}</div>}
                  </div>
                  {!socioInicial && <button onClick={() => setSocioSelec(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>}
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  {buscando && <Loader size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
                  <input style={{ ...inputStyle, paddingLeft: 30 }} placeholder="Buscar socio…" value={socioSearch} onChange={e => setSocioSearch(e.target.value)} autoFocus />
                  {socioResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4 }}>
                      {socioResults.map(s => (
                        <button key={s.id} onClick={() => { setSocioSelec(s); setSocioSearch(''); setSocioResults([]) }}
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

          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {TIPOS.map(t => (
                <button key={t} onClick={() => set('tipo', t)} style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${form.tipo === t ? '#059669' : '#e2e8f0'}`, background: form.tipo === t ? '#ecfdf5' : '#fff', color: form.tipo === t ? '#065f46' : '#94a3b8', cursor: 'pointer' }}>
                  {t === 'ELECTRICO' ? '⚡ Eléctrico' : t === 'GASOLINERO' ? '⛽ Gasolinero' : '🔧 Otro'}
                </button>
              ))}
            </div>
          </div>

          {/* Marca / Modelo / Año */}
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

          {/* Color / Serie / Placa */}
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

          {/* Observaciones */}
          <div>
            <label style={labelStyle}>Observaciones</label>
            <textarea style={{ ...inputStyle, height: 60, resize: 'vertical' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales…" />
          </div>

          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader size={14} /> : <Save size={14} />}
            {isNew ? 'Registrar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
