'use client'
import { useState, useEffect } from 'react'
import { dbCfg, type Lote } from '@/lib/supabase'
import { X, Edit2, MapPin, DollarSign, FileText, User } from 'lucide-react'

type Props = { lote: Lote; onClose: () => void; onEdit: () => void }

export default function LoteDetail({ lote, onClose, onEdit }: Props) {
  const [tipoNombre, setTipoNombre] = useState<string | null>(null)

  useEffect(() => {
    const fk = (lote as any).id_tipo_lote_fk
    if (fk) {
      dbCfg.from('tipos_lote').select('nombre').eq('id', fk).single()
        .then(({ data }) => { if (data) setTipoNombre(data.nombre) })
    }
  }, [(lote as any).id_tipo_lote_fk])

  const tipoDisplay = tipoNombre ?? lote.tipo_lote ?? 'Sin tipo'

  const fmt = (v: number | null) =>
    v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)' }}>
              {lote.cve_lote ?? `Lote #${lote.lote}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {tipoDisplay} · {lote.superficie ? lote.superficie.toLocaleString('es-MX') + ' m²' : 'Sin superficie'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" onClick={onEdit}><Edit2 size={13} /> Editar</button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Status */}
          <Group icon={<MapPin size={14} />} label="Status y Clasificación">
            <Row2 label="Status Lote"        value={lote.status_lote} badge />
            <Row2 label="Status Jurídico"    value={lote.status_juridico} />
            <Row2 label="Cobranza"           value={lote.clasificacion_cobranza} />
            <Row2 label="Paga Cuotas"        value={lote.paga_cuotas} />
            <Row2 label="Urbanización"       value={lote.urbanizacion_disponible} />
          </Group>

          {/* Comercial */}
          <Group icon={<DollarSign size={14} />} label="Información Comercial">
            <Row2 label="Valor Operación"  value={fmt(lote.valor_operacion)} />
            <Row2 label="Precio Lista"     value={fmt(lote.precio_de_lista)} />
            <Row2 label="Forma de Venta"   value={lote.forma_venta} />
            <Row2 label="Incluye Membresía" value={lote.incluye_membresia} />
            <Row2 label="Tipo Membresía"   value={lote.tipo_membresia} />
            <Row2 label="Vendedor"         value={lote.vendedor} />
            <Row2 label="Medio Captación"  value={lote.medio_captacion} />
          </Group>

          {/* Catastral */}
          <Group icon={<FileText size={14} />} label="Datos Catastrales y Fiscales">
            <Row2 label="Clave Catastral"  value={lote.clave_catastral} />
            <Row2 label="Valor Catastral"  value={fmt(lote.valor_catastral)} />
            <Row2 label="RFC Factura"      value={lote.rfc_para_factura} />
            <Row2 label="Razón Social"     value={lote.razon_social_para_factura} />
          </Group>

          {/* Contacto */}
          <Group icon={<User size={14} />} label="Contacto Rápido">
            <Row2 label="Persona"   value={lote.persona_contacto} />
            <Row2 label="Teléfono"  value={lote.telefono_persona_contacto} />
            <Row2 label="Correo"    value={lote.correo_persona_contacto} />
          </Group>

          {lote.observaciones && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Observaciones</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{lote.observaciones}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  'Vendido': 'badge-vendido', 'Libre': 'badge-libre', 'Bloqueado': 'badge-bloqueado',
}

function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        {icon} {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>{children}</div>
    </div>
  )
}

function Row2({ label, value, badge }: { label: string; value?: string | null; badge?: boolean }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {badge
        ? <span className={`badge ${STATUS_COLORS[value] ?? 'badge-default'}`}>{value}</span>
        : <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</div>
      }
    </div>
  )
}
