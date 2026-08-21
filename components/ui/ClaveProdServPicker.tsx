'use client'
import { useState } from 'react'
import { CLAVE_PROD_SERV_COMUNES } from '@/lib/pacService'
import ModalShell from './ModalShell'
import { Search, Tag, X, CheckCircle, Pencil } from 'lucide-react'

// Combo de "Clave de Producto/Servicio" del catálogo SAT. El catálogo oficial
// completo (c_ClaveProdServ) tiene ~52,000 registros — impráctico para un
// selector — así que se busca sobre una lista curada en memoria
// (CLAVE_PROD_SERV_COMUNES) y, si la clave buscada no está ahí, se permite
// capturarla a mano (8 dígitos).
export default function ClaveProdServPicker({ value, onChange, label = 'Clave de Producto/Servicio (SAT)' }: {
  value: string
  onChange: (clave: string) => void
  label?: string
}) {
  const [open, setOpen]         = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [manual, setManual]     = useState(false)
  const [manualVal, setManualVal] = useState('')

  const encontrada = CLAVE_PROD_SERV_COMUNES.find(c => c.clave === value)

  const q = busqueda.trim().toLowerCase()
  const filtradas = q
    ? CLAVE_PROD_SERV_COMUNES.filter(c => c.clave.includes(q) || c.desc.toLowerCase().includes(q))
    : CLAVE_PROD_SERV_COMUNES

  const seleccionar = (clave: string) => {
    onChange(clave)
    setOpen(false)
    setBusqueda('')
    setManual(false)
  }

  const guardarManual = () => {
    const clave = manualVal.trim()
    if (!/^\d{8}$/.test(clave)) return
    seleccionar(clave)
  }

  const abrir = () => {
    setManual(false)
    setManualVal(value && !encontrada ? value : '')
    setOpen(true)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="input" onClick={abrir}
          style={{ flex: 1, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            color: value ? 'var(--text-primary)' : '#cbd5e1' }}>
          <Tag size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          {value
            ? <span>{value}{encontrada ? ` — ${encontrada.desc}` : ''}</span>
            : 'Seleccionar…'}
        </button>
        {value && (
          <button type="button" className="btn-ghost" style={{ padding: '0 8px' }}
            onClick={() => onChange('')} title="Quitar selección">
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <ModalShell modulo="facturacion" titulo={label} onClose={() => setOpen(false)} maxWidth={480}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" autoFocus style={{ paddingLeft: 28 }} placeholder="Buscar por clave o descripción…"
                value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
            <button type="button" className="btn-ghost" onClick={() => setManual(m => !m)}
              title="Capturar otra clave (8 dígitos)" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <Pencil size={13} /> Otra clave
            </button>
          </div>

          {manual && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" style={{ flex: 1 }} placeholder="8 dígitos, ej. 80131801" maxLength={8}
                value={manualVal} onChange={e => setManualVal(e.target.value.replace(/\D/g, ''))} />
              <button type="button" className="btn-primary" onClick={guardarManual}
                disabled={!/^\d{8}$/.test(manualVal.trim())}>
                Usar
              </button>
            </div>
          )}

          <div style={{ overflowY: 'auto', maxHeight: '55vh', padding: '6px 0' }}>
            {filtradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                Sin coincidencias en la lista curada — usa "Otra clave" para capturar cualquier
                clave del catálogo SAT completo.
              </div>
            ) : filtradas.map(c => {
              const checked = c.clave === value
              return (
                <button key={c.clave} type="button" onClick={() => seleccionar(c.clave)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', width: '100%',
                    background: checked ? '#eff6ff' : 'transparent', border: 'none',
                    borderLeft: `3px solid ${checked ? 'var(--blue)' : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', flexShrink: 0 }}>{c.clave}</span>
                  <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: checked ? '#1d4ed8' : '#1e293b', flex: 1 }}>
                    {c.desc}
                  </span>
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
