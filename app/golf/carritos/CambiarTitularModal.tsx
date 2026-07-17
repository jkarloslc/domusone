'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { Save, Loader, Search, X, Users, ArrowRightLeft } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Socio    = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null }
type Familiar = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null }

type Props = {
  idPension: number
  idCarrito: number
  idSocioActual: number
  nombreSocioActual: string
  idFamiliarActual?: number | null
  descCarrito: string
  onClose: () => void
  onSaved: () => void
}

const inputStyle = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null }) =>
  [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

export default function CambiarTitularModal({
  idPension, idCarrito, idSocioActual, nombreSocioActual, idFamiliarActual,
  descCarrito, onClose, onSaved,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [socioSearch, setSocioSearch]   = useState('')
  const [socioResults, setSocioResults] = useState<Socio[]>([])
  const [socioSelec, setSocioSelec]     = useState<Socio | null>(null)
  const [buscando, setBuscando]         = useState(false)

  const [familiares, setFamiliares] = useState<Familiar[]>([])
  const [familiarId, setFamiliarId] = useState<number | null>(null)

  const [motivo, setMotivo] = useState('')

  // Buscar socio con debounce — búsqueda multi-palabra
  useEffect(() => {
    const trimmed = socioSearch.trim()
    if (trimmed.length < 2) { setSocioResults([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
      const first = words[0]
      const { data } = await dbGolf.from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno')
        .eq('activo', true)
        .or(`nombre.ilike.%${first}%,apellido_paterno.ilike.%${first}%,apellido_materno.ilike.%${first}%,numero_socio.ilike.%${first}%`)
        .limit(60)
      const todos = (data as Socio[]) ?? []
      const filtered = words.length === 1 ? todos : todos.filter(s => {
        const full = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ').toLowerCase()
        return words.every(w => full.includes(w) || (s.numero_socio ?? '').toLowerCase().includes(w))
      })
      setSocioResults(filtered.filter(s => s.id !== idSocioActual).slice(0, 8))
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [socioSearch, idSocioActual])

  // Familiares del nuevo socio seleccionado
  useEffect(() => {
    if (!socioSelec) { setFamiliares([]); setFamiliarId(null); return }
    dbGolf.from('cat_familiares')
      .select('id, nombre, apellido_paterno, apellido_materno, parentesco')
      .eq('id_socio_fk', socioSelec.id)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setFamiliares((data as Familiar[]) ?? []))
  }, [socioSelec])

  const handleSave = async () => {
    if (!socioSelec) { setError('Busca y selecciona el nuevo socio titular'); return }
    setSaving(true); setError('')

    const fechaHoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    const nota = `Cambio de titular ${fechaHoy}: ${nombreSocioActual} → ${nc(socioSelec)}${motivo.trim() ? ` — ${motivo.trim()}` : ''}`

    // 1) Transferir la propiedad registrada del carrito (activo físico)
    const { error: errCarrito } = await dbGolf.from('cat_carritos')
      .update({ id_socio_fk: socioSelec.id, id_familiar_fk: familiarId })
      .eq('id', idCarrito)
    if (errCarrito) { setError(errCarrito.message); setSaving(false); return }

    // 2) Transferir el contrato de pensión (cajón, tarifa y cuotas futuras siguen igual)
    const { data: pensionActual } = await dbGolf.from('ctrl_pensiones').select('observaciones').eq('id', idPension).single()
    const obsPrevias = (pensionActual as any)?.observaciones ?? null
    const obsNuevas  = obsPrevias ? `${obsPrevias}\n${nota}` : nota

    const { error: errPension } = await dbGolf.from('ctrl_pensiones')
      .update({ id_socio_fk: socioSelec.id, id_familiar_fk: familiarId, observaciones: obsNuevas })
      .eq('id', idPension)
    if (errPension) { setError(errPension.message); setSaving(false); return }

    onSaved()
  }

  return (
    <ModalShell
      modulo="golf-carritos"
      titulo="Cambiar Titular"
      subtitulo={`${descCarrito} · Titular actual: ${nombreSocioActual}`}
      maxWidth={520}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || !socioSelec}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: (saving || !socioSelec) ? 0.6 : 1 }}>
          {saving ? <Loader size={14} /> : <ArrowRightLeft size={14} />}
          Transferir Titularidad
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#5b21b6', lineHeight: 1.5 }}>
          El carrito, el cajón y la pensión se conservan sin cambios — solo cambia el socio titular.
          Las cuotas ya generadas (pagadas o pendientes) quedan a nombre de <strong>{nombreSocioActual}</strong>.
          Las cuotas que se generen de aquí en adelante se cargarán al nuevo titular.
        </div>

        <div>
          <label style={labelStyle}>Nuevo Socio Titular *</label>
          {socioSelec ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#5b21b6' }}>{nc(socioSelec)}</div>
                {socioSelec.numero_socio && <div style={{ fontSize: 11, color: '#6b7280' }}>#{socioSelec.numero_socio}</div>}
              </div>
              <button onClick={() => { setSocioSelec(null); setFamiliarId(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={14} />
              </button>
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

        {socioSelec && (
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
          </div>
        )}

        <div>
          <label style={labelStyle}>Motivo (opcional)</label>
          <input style={inputStyle} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Venta de carrito" />
        </div>

        {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      </div>
    </ModalShell>
  )
}
