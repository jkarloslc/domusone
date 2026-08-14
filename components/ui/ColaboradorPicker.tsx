'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCfg } from '@/lib/supabase'
import { Colaborador, nombreCompletoColaborador } from '@/lib/colaboradores'
import ModalShell from './ModalShell'
import { Search, User, X, RefreshCw, CheckCircle } from 'lucide-react'

export default function ColaboradorPicker({ value, onChange, onSelect, filtro, label }: {
  value: string
  onChange: (nombre: string) => void
  onSelect?: (c: Colaborador) => void
  filtro?: 'es_asignado' | 'es_supervisor'
  label: string
}) {
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState<Colaborador[]>([])
  const [loading, setLoading]   = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    let q = dbCfg.from('colaboradores').select('*').eq('activo', true)
    if (filtro) q = q.eq(filtro, true)
    const { data } = await q.order('nombre')
    setItems((data as Colaborador[]) ?? [])
    setLoading(false)
  }, [filtro])

  useEffect(() => { if (open) fetchItems() }, [open, fetchItems])

  const filtrados = items.filter(c =>
    !busqueda.trim() || nombreCompletoColaborador(c).toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  const seleccionar = (c: Colaborador) => {
    onChange(nombreCompletoColaborador(c))
    onSelect?.(c)
    setOpen(false)
    setBusqueda('')
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="input" onClick={() => setOpen(true)}
          style={{ flex: 1, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            color: value ? 'var(--text-primary)' : '#cbd5e1' }}>
          <User size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          {value || 'Seleccionar…'}
        </button>
        {value && (
          <button type="button" className="btn-ghost" style={{ padding: '0 8px' }}
            onClick={() => onChange('')} title="Quitar selección">
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <ModalShell modulo="mantenimiento" titulo={label} onClose={() => setOpen(false)} maxWidth={420}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" autoFocus style={{ paddingLeft: 28 }} placeholder="Buscar colaborador…"
                value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '60vh', padding: '6px 0' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </div>
            ) : filtrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                {items.length === 0
                  ? filtro
                    ? `Sin colaboradores marcados como "${filtro === 'es_asignado' ? 'Es Asignado' : 'Es Supervisor'}". Configúralos en Catálogos → Colaboradores.`
                    : 'Sin colaboradores activos. Configúralos en Catálogos → Colaboradores.'
                  : 'Sin coincidencias'}
              </div>
            ) : filtrados.map(c => {
              const nombre = nombreCompletoColaborador(c)
              const checked = nombre === value
              return (
                <button key={c.id} type="button" onClick={() => seleccionar(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', width: '100%',
                    background: checked ? '#eff6ff' : 'transparent', border: 'none',
                    borderLeft: `3px solid ${checked ? 'var(--blue)' : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: checked ? '#1d4ed8' : '#1e293b', flex: 1 }}>
                    {nombre}
                  </span>
                  {c.puesto && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.puesto}</span>}
                  {checked && <CheckCircle size={14} style={{ color: '#2563eb', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </ModalShell>
      )}
    </>
  )
}
