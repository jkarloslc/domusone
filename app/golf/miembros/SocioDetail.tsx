'use client'
import { X, Edit2, Phone, Mail, Calendar, Tag, CreditCard, User } from 'lucide-react'
import type { Socio } from './SocioModal'

type Props = { socio: Socio; onClose: () => void; onEdit: () => void }

const fmt = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 160, flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{value || '—'}</span>
  </div>
)

export default function SocioDetail({ socio, onClose, onEdit }: Props) {
  const nombre = [socio.nombre, socio.apellido_paterno, socio.apellido_materno].filter(Boolean).join(' ')
  const vencido = socio.fecha_vencimiento && new Date(socio.fecha_vencimiento) < new Date()

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <User size={22} style={{ color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{nombre}</div>
              {socio.numero_socio && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Socio #{socio.numero_socio}</div>
              )}
              <div style={{ marginTop: 4 }}>
                <span className={`badge ${socio.activo && !vencido ? 'badge-libre' : 'badge-bloqueado'}`}>
                  {!socio.activo ? 'Inactivo' : vencido ? 'Vencido' : 'Activo'}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ padding: '6px 10px' }} onClick={onEdit} title="Editar"><Edit2 size={14} /></button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 20px' }}>

          {/* Membresía */}
          <div style={{ margin: '16px 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Membresía
          </div>
          <Row label="Categoría" value={socio.cat_categorias_socios?.nombre} />
          <Row label="Número de tarjeta" value={socio.numero_tarjeta} />
          <Row label="Fecha de alta" value={fmt(socio.fecha_alta)} />
          <Row label="Vencimiento" value={
            <span style={{ color: vencido ? '#dc2626' : 'inherit' }}>{fmt(socio.fecha_vencimiento)}</span>
          } />

          {/* Datos personales */}
          <div style={{ margin: '20px 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Datos Personales
          </div>
          <Row label="Fecha de nacimiento" value={fmt(socio.fecha_nacimiento)} />
          <Row label="RFC" value={socio.rfc} />
          <Row label="CURP" value={socio.curp} />
          <Row label="Teléfono" value={socio.telefono} />
          <Row label="Email" value={socio.email} />

          {/* Notas */}
          {socio.observaciones && (
            <>
              <div style={{ margin: '20px 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Observaciones
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, paddingTop: 8 }}>
                {socio.observaciones}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
