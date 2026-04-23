'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { X, UserCheck, Plus, Loader, Save, Clock, CheckCircle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type PropietarioLote = {
  id: number
  id_propietario_fk: number
  id_lote_fk: number
  es_principal: boolean
  porcentaje: number | null
  fecha_desde: string | null
  fecha_hasta: string | null
  activo: boolean
  propietarios?: {
    id: number
    nombre: string
    apellido_paterno: string | null
    apellido_materno: string | null
    rfc: string | null
    tipo_persona: string | null
  }
}

type Props = {
  loteId: number
  cveLote: string
  onClose: () => void
}

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

export default function HistorialPropietarios({ loteId, cveLote, onClose }: Props) {
  const [historial, setHistorial]   = useState<PropietarioLote[]>([])
  const [loading, setLoading]       = useState(true)
  const [showTransfer, setShowTransfer] = useState(false)

  const fetchHistorial = async () => {
    setLoading(true)
    // Paso 1: cargar propietarios_lotes sin join cross-schema
    const { data: plData } = await dbCtrl
      .from('propietarios_lotes')
      .select('*')
      .eq('id_lote_fk', loteId)
      .order('fecha_desde', { ascending: false })

    const rows = plData ?? []

    // Paso 2: cargar propietarios de cat schema por separado
    const propIds = Array.from(new Set(rows.map((r: any) => r.id_propietario_fk).filter(Boolean)))
    let propsMap: Record<number, any> = {}
    if (propIds.length) {
      const { data: propsData } = await dbCat
        .from('propietarios')
        .select('id, nombre, apellido_paterno, apellido_materno, rfc, tipo_persona')
        .in('id', propIds)
      ;(propsData ?? []).forEach((p: any) => { propsMap[p.id] = p })
    }

    // Combinar
    const combined = rows.map((r: any) => ({
      ...r,
      propietarios: propsMap[r.id_propietario_fk] ?? null,
    }))

    setHistorial(combined as PropietarioLote[])
    setLoading(false)
  }

  useEffect(() => { fetchHistorial() }, [loteId])

  const principal = historial.find(h => h.es_principal && h.activo)
  const anteriores = historial.filter(h => !(h.es_principal && h.activo))

  const nombreCompleto = (p: PropietarioLote['propietarios']) =>
    p ? [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') : '—'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>
              Historial de Propietarios
            </h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Lote <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{cveLote}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => setShowTransfer(true)} style={{ fontSize: 12 }}>
              <UserCheck size={13} /> Cambio de Propietario
            </button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', maxHeight: 'calc(90vh - 100px)', overflowY: 'auto' }}>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <Loader size={18} className="animate-spin" style={{ margin: '0 auto' }} />
            </div>
          ) : (
            <>
              {/* Propietario actual */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={12} /> Propietario Actual
                </div>
                {principal ? (
                  <PropietarioCard item={principal} actual />
                ) : (
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Sin propietario principal asignado
                  </div>
                )}
              </div>

              {/* Historial anterior */}
              {anteriores.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} /> Propietarios Anteriores ({anteriores.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {anteriores.map(item => (
                      <PropietarioCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {historial.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                  Sin propietarios registrados para este lote
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal de transferencia */}
        {showTransfer && (
          <TransferirPropietarioModal
            loteId={loteId}
            propietarioActualId={principal?.id_propietario_fk ?? null}
            onClose={() => setShowTransfer(false)}
            onSaved={() => { setShowTransfer(false); fetchHistorial() }}
          />
        )}
      </div>
    </div>
  )
}

// ── Tarjeta de propietario ────────────────────────────────────
function PropietarioCard({ item, actual }: { item: PropietarioLote; actual?: boolean }) {
  const nombre = item.propietarios
    ? [item.propietarios.nombre, item.propietarios.apellido_paterno, item.propietarios.apellido_materno].filter(Boolean).join(' ')
    : '—'

  return (
    <div style={{
      padding: '14px 16px',
      background: actual ? '#eff6ff' : '#f8fafc',
      border: `1px solid ${actual ? '#bfdbfe' : '#e2e8f0'}`,
      borderRadius: 8,
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 12,
      alignItems: 'start',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: actual ? '#1d4ed8' : 'var(--text-primary)' }}>
          {nombre}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          {item.propietarios?.rfc && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              RFC: {item.propietarios.rfc}
            </span>
          )}
          {item.propietarios?.tipo_persona && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.propietarios.tipo_persona}</span>
          )}
          {item.porcentaje && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.porcentaje}% propiedad</span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {item.fecha_desde && <div>Desde: <strong>{new Date(item.fecha_desde + 'T12:00:00').toLocaleDateString('es-MX')}</strong></div>}
        {item.fecha_hasta && <div>Hasta: <strong>{new Date(item.fecha_hasta + 'T12:00:00').toLocaleDateString('es-MX')}</strong></div>}
        {actual && !item.fecha_hasta && (
          <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
            ACTUAL
          </span>
        )}
      </div>
    </div>
  )
}

// ── Modal transferencia de propietario ───────────────────────
function TransferirPropietarioModal({
  loteId, propietarioActualId, onClose, onSaved
}: {
  loteId: number
  propietarioActualId: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [propSearch, setPropSearch]   = useState('')
  const [propResults, setPropResults] = useState<any[]>([])
  const [selectedProp, setSelectedProp] = useState<any>(null)
  const [fechaCambio, setFechaCambio] = useState(new Date().toISOString().split('T')[0])
  const [porcentaje, setPorcentaje]   = useState('100')
  const [motivo, setMotivo]           = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    if (propSearch.length < 2) { setPropResults([]); return }
    dbCat.from('propietarios')
      .select('id, nombre, apellido_paterno, apellido_materno, rfc')
      .or(`nombre.ilike.%${propSearch}%,apellido_paterno.ilike.%${propSearch}%,rfc.ilike.%${propSearch}%`)
      .eq('activo', true)
      .limit(8)
      .then(({ data }) => setPropResults(data ?? []))
  }, [propSearch])

  const handleTransfer = async () => {
    if (!selectedProp) { setError('Selecciona el nuevo propietario'); return }
    setSaving(true); setError('')

    try {
      // 1. Cerrar propietario actual: es_principal=false, fecha_hasta=hoy
      if (propietarioActualId) {
        await dbCtrl.from('propietarios_lotes')
          .update({
            es_principal: false,
            fecha_hasta:  fechaCambio,
          })
          .eq('id_lote_fk', loteId)
          .eq('es_principal', true)
          .eq('activo', true)
      }

      // 2. Insertar nuevo propietario como principal
      await dbCtrl.from('propietarios_lotes').insert({
        id_lote_fk:       loteId,
        id_propietario_fk: selectedProp.id,
        es_principal:     true,
        porcentaje:       porcentaje ? Number(porcentaje) : null,
        fecha_desde:      fechaCambio,
        fecha_hasta:      null,
        activo:           true,
      })

      setSaving(false)
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Error al registrar el cambio')
      setSaving(false)
    }
  }

  const nombreCompleto = (p: any) =>
    [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')

  return (
    <div className="modal-overlay" style={{ zIndex: 60 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Cambio de Propietario</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>El propietario anterior quedará en el historial con fecha de cierre</p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Fecha del cambio */}
          <div>
            <label className="label">Fecha del Cambio *</label>
            <input className="input" type="date" value={fechaCambio} onChange={e => setFechaCambio(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Esta fecha se registra como fecha de cierre del propietario anterior y fecha de inicio del nuevo.
            </div>
          </div>

          {/* Buscador nuevo propietario */}
          <div>
            <label className="label">Nuevo Propietario *</label>
            <input
              className="input"
              placeholder="Busca por nombre o RFC…"
              value={propSearch}
              onChange={e => { setPropSearch(e.target.value); setSelectedProp(null) }}
            />
            {propResults.length > 0 && (
              <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                {propResults.map((p: any) => (
                  <button key={p.id}
                    onClick={() => { setSelectedProp(p); setPropSearch(nombreCompleto(p)); setPropResults([]) }}
                    style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{nombreCompleto(p)}</span>
                    {p.rfc && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.rfc}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedProp && (
              <div style={{ marginTop: 6, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={13} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 500 }}>{nombreCompleto(selectedProp)}</span>
              </div>
            )}
          </div>

          {/* Porcentaje */}
          <div>
            <label className="label">% de Propiedad</label>
            <input className="input" type="number" min="0" max="100" step="0.01"
              value={porcentaje} onChange={e => setPorcentaje(e.target.value)}
              style={{ maxWidth: 120 }} />
          </div>

          {/* Resumen del cambio */}
          {selectedProp && (
            <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>Resumen del cambio</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-secondary)' }}>
                {propietarioActualId && (
                  <div>🔴 Propietario anterior: fecha de cierre <strong>{new Date(fechaCambio + 'T12:00:00').toLocaleDateString('es-MX')}</strong></div>
                )}
                <div>🟢 Nuevo propietario: <strong>{nombreCompleto(selectedProp)}</strong> desde <strong>{new Date(fechaCambio + 'T12:00:00').toLocaleDateString('es-MX')}</strong></div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  El historial del propietario anterior se conserva en el sistema.
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleTransfer} disabled={saving || !selectedProp}>
            {saving ? <Loader size={13} className="animate-spin" /> : <UserCheck size={13} />}
            {saving ? 'Registrando…' : 'Confirmar Cambio'}
          </button>
        </div>
      </div>
    </div>
  )
}
