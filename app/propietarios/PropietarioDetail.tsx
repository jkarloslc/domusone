'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCtrl, type Propietario } from '@/lib/supabase'
import { Edit2, User, Phone, Mail, MapPin, FileText, Home } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Props = { propietario: Propietario; onClose: () => void; onEdit: () => void }

export default function PropietarioDetail({ propietario: p, onClose, onEdit }: Props) {
  const [telefonos, setTelefonos] = useState<any[]>([])
  const [correos, setCorreos]     = useState<any[]>([])
  const [lotes, setLotes]         = useState<any[]>([])

  useEffect(() => {
    dbCat.from('propietarios_telefonos').select('*').eq('id_propietario_fk', p.id).eq('activo', true)
      .then(({ data }) => setTelefonos(data ?? []))
    dbCat.from('propietarios_correos').select('*').eq('id_propietario_fk', p.id).eq('activo', true)
      .then(({ data }) => setCorreos(data ?? []))
    dbCtrl.from('propietarios_lotes').select('*').eq('id_propietario_fk', Number(p.id))
      .then(async ({ data }) => {
        const rows = data ?? []
        if (!rows.length) { setLotes([]); return }
        const loteIds = rows.map((r: any) => r.id_lote_fk).filter(Boolean)
        const { data: lotesData } = await dbCat.from('lotes')
          .select('id, cve_lote, lote, status_lote').in('id', loteIds)
        const lotesMap: Record<number, any> = {}
        ;(lotesData ?? []).forEach((l: any) => { lotesMap[l.id] = l })
        setLotes(rows.map((r: any) => ({ ...r, lotes: lotesMap[r.id_lote_fk] ?? null })))
      })
  }, [p.id])

  const nombre = [p.nombre, (p as any).apellido_paterno, (p as any).apellido_materno].filter(Boolean).join(' ')
  const subtitulo = [(p as any).razon_social, (p as any).tipo_persona ?? 'Física', p.activo ? 'Activo' : 'Inactivo'].filter(Boolean).join(' • ')

  return (
    <ModalShell modulo="propietarios" titulo={nombre} subtitulo={subtitulo} onClose={onClose} maxWidth={500}
      footer={
        <button className="btn-secondary" onClick={onEdit}><Edit2 size={13} /> Editar</button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Datos personales */}
          <Group icon={<User size={14} />} label="Datos Personales">
            <Row2 label="RFC"           value={p.rfc} mono />
            <Row2 label="CURP"          value={(p as any).curp} mono />
            <Row2 label="Fecha Nac."    value={(p as any).fecha_nacimiento} />
            <Row2 label="Estado Civil"  value={(p as any).estado_civil} />
            <Row2 label="Régimen"       value={(p as any).regimen} />
          </Group>

          {/* Domicilio */}
          {((p as any).calle || (p as any).ciudad) && (
            <Group icon={<MapPin size={14} />} label="Domicilio">
              {(p as any).calle   && <Row2 label="Calle"   value={(p as any).calle} />}
              {(p as any).colonia && <Row2 label="Colonia" value={(p as any).colonia} />}
              <Row2 label="C.P. / Ciudad" value={[(p as any).cp, (p as any).ciudad, (p as any).estado].filter(Boolean).join(', ')} />
              <Row2 label="País"          value={(p as any).pais} />
            </Group>
          )}

          {/* Contacto */}
          {(telefonos.length > 0 || correos.length > 0) && (
            <Group icon={<Phone size={14} />} label="Contacto">
              {telefonos.map((t, i) => <Row2 key={i} label={t.tipo} value={t.numero} />)}
              {correos.map((c, i) => <Row2 key={i} label={c.tipo} value={c.correo} />)}
            </Group>
          )}

          {/* Lotes */}
          <Group icon={<Home size={14} />} label={`Lotes (${lotes.length})`}>
            {lotes.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin lotes asignados</span>
              : lotes.map((l: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-700)', borderRadius: 6 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold-light)' }}>
                    {l.lotes?.cve_lote ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.lotes?.status_lote}</span>
                  {l.es_principal && <span className="badge badge-vendido" style={{ marginLeft: 'auto', fontSize: 10 }}>Principal</span>}
                  {l.porcentaje && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.porcentaje}%</span>}
                </div>
              ))
            }
          </Group>

      </div>
    </ModalShell>
  )
}

function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        {icon} {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Row2({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}
