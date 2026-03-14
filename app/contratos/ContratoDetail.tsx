'use client'
import { X, Edit2, DollarSign, FileText, Users } from 'lucide-react'
import { type Contrato } from './page'

const fmt = (v: number | null) => v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'
const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

export default function ContratoDetail({ contrato: c, onClose, onEdit }: { contrato: Contrato; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: 'var(--gold-light)' }}>{c.sucesivo ?? `Contrato #${c.id}`}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {c.tipo_contrato ?? '—'} · {fmtFecha(c.fecha)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" onClick={onEdit}><Edit2 size={13} /> Editar</button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Group icon={<FileText size={14} />} label="Identificación">
            <Row label="Lote"        value={(c as any).lotes?.cve_lote ?? `#${c.id_lote_fk}`} gold />
            <Row label="Sucesivo"    value={c.sucesivo} mono />
            <Row label="Tipo"        value={c.tipo_contrato} />
            <Row label="Propietario" value={c.propietario_contrato} />
          </Group>

          <Group icon={<Users size={14} />} label="Partes">
            <Row label="Parte 1" value={c.parte_1} />
            <Row label="Parte 2" value={c.parte_2} />
            {c.objeto && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Objeto</div><div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.objeto}</div></div>}
          </Group>

          <Group icon={<DollarSign size={14} />} label="Condiciones Económicas">
            <Row label="Valor Operación" value={fmt(c.valor_operacion)} />
            <Row label="Forma de Pago"   value={c.forma_pago} />
            <Row label="Moneda"          value={c.moneda} />
            {c.tipo_cambio && <Row label="Tipo de Cambio" value={`$${c.tipo_cambio}`} />}
            <Row label="Membresía"       value={c.membresia} />
            <Row label="Cuotas Mantto."  value={c.cuotas_mantto} />
          </Group>

          {(c.clausula_penal || c.concesiones || c.descripcion || c.adendum) && (
            <Group icon={<FileText size={14} />} label="Cláusulas">
              {c.clausula_penal && <TextBlock label="Cláusula Penal" value={c.clausula_penal} />}
              {c.concesiones    && <TextBlock label="Concesiones"    value={c.concesiones} />}
              {c.descripcion    && <TextBlock label="Descripción"    value={c.descripcion} />}
              {c.adendum        && <TextBlock label="Adéndum"        value={c.adendum} />}
            </Group>
          )}
        </div>
      </div>
    </div>
  )
}

const Group = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{icon}{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
  </div>
)
const Row = ({ label, value, gold, mono }: { label: string; value?: string | null; gold?: boolean; mono?: boolean }) => {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: gold ? 'var(--gold-light)' : 'var(--text-primary)', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}
const TextBlock = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 10px', background: 'var(--surface-700)', borderRadius: 5 }}>{value}</div>
  </div>
)
