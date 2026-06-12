'use client'
import { useState } from 'react'
import { Car } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type PensionBit = {
  id: number
  id_socio_fk: number
  id_carrito_fk: number
  id_slot_fk: number | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_carritos: { marca: string | null; modelo: string | null; placa: string | null } | null
  cat_slots: { numero: string } | null
}

type Props = {
  pensiones: PensionBit[]
  onClose: () => void
  onConfirm: (pension: PensionBit) => void
}

const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'

export default function SeleccionCarritoModal({ pensiones, onClose, onConfirm }: Props) {
  const [idPension, setIdPension] = useState<number | ''>('')

  const handleConfirm = () => {
    const p = pensiones.find(x => x.id === idPension)
    if (p) onConfirm(p)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1px solid #e2e8f0', borderRadius: 8,
    background: '#fff', color: '#1e293b',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <ModalShell
      modulo="golf-carritos"
      titulo="Nuevo Registro — Bitácora"
      subtitulo="Selecciona el carrito para registrar el evento"
      maxWidth={480}
      onClose={onClose}
      footer={<>
        <button
          onClick={onClose}
          style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={!idPension}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: idPension ? 1 : 0.5 }}>
          <Car size={14} /> Continuar
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>
            Carrito (pensión activa) *
          </label>
          <select
            value={idPension}
            onChange={e => setIdPension(e.target.value ? Number(e.target.value) : '')}
            style={inp}
            autoFocus>
            <option value="">— Selecciona un carrito —</option>
            {pensiones.map(p => {
              const car = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
              const placa = p.cat_carritos?.placa ? ` · ${p.cat_carritos.placa}` : ''
              const cajon = p.cat_slots ? ` · Cajón ${p.cat_slots.numero}` : ''
              return (
                <option key={p.id} value={p.id}>
                  {p.cat_slots ? `Cajón ${p.cat_slots.numero} — ` : ''}{car}{placa} — {nc(p.cat_socios)}
                </option>
              )
            })}
          </select>
        </div>

        {idPension && (() => {
          const p = pensiones.find(x => x.id === idPension)
          if (!p) return null
          const car = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
          return (
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, marginBottom: 2 }}>
                {p.cat_slots ? `Cajón ${p.cat_slots.numero} — ` : ''}{car}{p.cat_carritos?.placa ? ` · ${p.cat_carritos.placa}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#15803d' }}>
                {nc(p.cat_socios)}{p.cat_socios?.numero_socio ? ` · #${p.cat_socios.numero_socio}` : ''}
              </div>
            </div>
          )
        })()}
      </div>
    </ModalShell>
  )
}
