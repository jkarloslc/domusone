'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader, Search } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Socio = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; cat_categorias_socios?: { nombre: string } | null }
type Config = { id: number; nombre: string }

type Props = {
  socioInicial?: Socio | null   // si se abre desde detalle de un socio
  onClose: () => void
  onSaved: () => void
}

const inputStyle = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

const nombreCompleto = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null }) =>
  [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

const finDeMesActual = () => {
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  return fin.toISOString().split('T')[0]
}

const mesActual = () => {
  const hoy = new Date()
  return hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

export default function PaseModal({ socioInicial, onClose, onSaved }: Props) {
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [configs, setConfigs] = useState<Config[]>([])

  const [socioSearch, setSocioSearch]   = useState('')
  const [socioResults, setSocioResults] = useState<Socio[]>([])
  const [socioSelec, setSocioSelec]     = useState<Socio | null>(socioInicial ?? null)
  const [buscando, setBuscando]         = useState(false)

  const [form, setForm] = useState({
    id_config_fk:      '' as number | '',
    cantidad:          1,
    periodo:           mesActual(),
    fecha_inicio:      new Date().toISOString().split('T')[0],
    fecha_vencimiento: finDeMesActual(),
    observaciones:     '',
  })

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    dbGolf.from('cat_pases_config').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setConfigs(data ?? []))
  }, [])

  useEffect(() => {
    if (socioInicial) return
    if (socioSearch.trim().length < 2) { setSocioResults([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const { data } = await dbGolf
        .from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre)')
        .eq('activo', true)
        .or(`nombre.ilike.%${socioSearch}%,apellido_paterno.ilike.%${socioSearch}%,numero_socio.ilike.%${socioSearch}%`)
        .limit(8)
      setSocioResults((data as unknown as Socio[]) ?? [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [socioSearch])

  const seleccionarSocio = (s: Socio) => {
    setSocioSelec(s); setSocioSearch(''); setSocioResults([])
  }

  const handleSave = async () => {
    if (!socioSelec)        { setError('Selecciona un socio'); return }
    if (form.cantidad < 1)  { setError('La cantidad debe ser al menos 1'); return }
    if (!form.fecha_vencimiento) { setError('La fecha de vencimiento es obligatoria'); return }
    setSaving(true); setError('')

    const { data: pase, error: err1 } = await dbGolf
      .from('ctrl_pases')
      .insert({
        id_socio_fk:       socioSelec.id,
        id_config_fk:      form.id_config_fk || null,
        cantidad_otorgada: form.cantidad,
        cantidad_usada:    0,
        periodo:           form.periodo || null,
        fecha_inicio:      form.fecha_inicio,
        fecha_vencimiento: form.fecha_vencimiento,
        observaciones:     form.observaciones || null,
      })
      .select('id')
      .single()

    if (err1 || !pase) { setError(err1?.message ?? 'Error al crear lote'); setSaving(false); return }

    await dbGolf.from('ctrl_pases_movimientos').insert({
      id_pase_fk:  pase.id,
      id_socio_fk: socioSelec.id,
      tipo:        'ASIGNACION',
      cantidad:    form.cantidad,
      motivo:      `Asignación ${form.periodo || ''}`.trim(),
    })

    onSaved()
  }

  return (
    <ModalShell
      modulo="golf"
      titulo="Asignar Pases"
      onClose={onClose}
      maxWidth={500}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Asignar Pases
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Socio */}
        <div>
          <label style={labelStyle}>Socio *</label>
          {socioSelec ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>{nombreCompleto(socioSelec)}</div>
                <div style={{ fontSize: 11, color: '#78716c', marginTop: 1 }}>
                  {socioSelec.numero_socio && `#${socioSelec.numero_socio} · `}
                  {socioSelec.cat_categorias_socios?.nombre}
                </div>
              </div>
              {!socioInicial && (
                <button onClick={() => setSocioSelec(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              {buscando && <Loader size={12} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
              <input
                style={{ ...inputStyle, paddingLeft: 30 }}
                placeholder="Buscar socio por nombre o número…"
                value={socioSearch}
                onChange={e => setSocioSearch(e.target.value)}
                autoFocus={!socioInicial}
              />
              {socioResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4 }}>
                  {socioResults.map(s => (
                    <button key={s.id} onClick={() => seleccionarSocio(s)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombreCompleto(s)}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{s.numero_socio && `#${s.numero_socio} · `}{s.cat_categorias_socios?.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tipo de pase + Cantidad */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
          <div>
            <label style={labelStyle}>Tipo de Pase</label>
            <select style={inputStyle} value={form.id_config_fk} onChange={e => set('id_config_fk', e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Sin tipo específico —</option>
              {configs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 100 }}>
            <label style={labelStyle}>Cantidad *</label>
            <input
              style={{ ...inputStyle, textAlign: 'center', fontWeight: 700, fontSize: 16 }}
              type="number" min={1} max={99}
              value={form.cantidad}
              onChange={e => set('cantidad', Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>

        {/* Período */}
        <div>
          <label style={labelStyle}>Período</label>
          <input style={inputStyle} value={form.periodo} onChange={e => set('periodo', e.target.value)} placeholder="Ej. Mayo 2026, Q2 2026" />
        </div>

        {/* Fechas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Fecha de Inicio</label>
            <input style={inputStyle} type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Vencimiento *</label>
            <input style={inputStyle} type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
          </div>
        </div>

        {/* Observaciones */}
        <div>
          <label style={labelStyle}>Observaciones</label>
          <textarea style={{ ...inputStyle, height: 64, resize: 'vertical' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas sobre esta asignación…" />
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
