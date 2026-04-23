'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Receipt, ChevronLeft, ChevronRight,
  X, Save, Loader, Calendar, Eye, Ban, Layers, DollarSign
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import ModalShell from '@/components/ui/ModalShell'

// ── Tipos ──────────────────────────────────────────────────────
type Centro = {
  id: number; nombre: string; codigo: string | null
  tipo: string | null; tipo_desglose: string; activo: boolean
}
type Seccion = { id: number; nombre: string; clave_alfa: string | null }
type SeccionRow = { id_seccion_fk: number; nombre_seccion: string; monto: number; notas: string }
type Frente = { id: number; nombre: string; codigo: string | null; id_centro_ingreso_fk: number | null }
type FrenteRow = { id_frente_fk: number; nombre_frente: string; monto: number; notas: string }
type Recibo = {
  id: number; folio: string | null; fecha: string
  id_centro_ingreso_fk: number | null
  descripcion: string | null
  monto_efectivo: number; monto_transferencia: number
  monto_tarjeta: number; monto_cheque: number; monto_total: number
  status: string; origen: string; notas: string | null
  usuario_crea: string | null; usuario_cancela: string | null
  fecha_cancela: string | null; motivo_cancelacion: string | null
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFolioIng = (id: number) =>
  `ING-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Confirmado: { bg: '#f0fdf4', color: '#15803d' },
  Borrador:   { bg: '#fffbeb', color: '#d97706' },
  Cancelado:  { bg: '#f8fafc', color: '#94a3b8' },
}
const CENTRO_COLOR: Record<string, string> = {
  golf: '#059669', cuotas: '#2563eb', rentas_espacios: '#7c3aed', caballerizas: '#d97706', otro: '#64748b',
}

const PAGE_SIZE = 25

// ── Modal Nuevo / Ver / Cancelar ───────────────────────────────
function ReciboModal({
  recibo, centros, secciones, onClose, onSaved, authUser,
}: {
  recibo: Recibo | null
  centros: Centro[]
  secciones: Seccion[]
  onClose: () => void
  onSaved: () => void
  authUser: any
}) {
  const isView   = !!recibo
  const today    = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    fecha:               recibo?.fecha ?? today,
    id_centro_ingreso_fk: recibo?.id_centro_ingreso_fk ?? (centros[0]?.id ?? null),
    descripcion:         recibo?.descripcion ?? '',
    monto_efectivo:      recibo?.monto_efectivo ?? 0,
    monto_transferencia: recibo?.monto_transferencia ?? 0,
    monto_tarjeta:       recibo?.monto_tarjeta ?? 0,
    monto_cheque:        recibo?.monto_cheque ?? 0,
    notas:               recibo?.notas ?? '',
    status:              recibo?.status ?? 'Confirmado',
  })
  const [secRows, setSecRows]     = useState<SeccionRow[]>([])
  const [frenteRows, setFrenteRows] = useState<FrenteRow[]>([])
  const [loadingSecs, setLoadingSecs] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [error, setError]         = useState('')

  const centroSel  = centros.find(c => c.id === Number(form.id_centro_ingreso_fk))
  const esSecciones = centroSel?.tipo_desglose === 'secciones'
  const esFrente    = centroSel?.tipo_desglose === 'frentes'

  // ── Cargar secciones existentes (vista) o init (nuevo) ──────
  useEffect(() => {
    if (!esSecciones) { setSecRows([]); return }
    if (recibo) {
      setLoadingSecs(true)
      dbCtrl.from('recibos_ingreso_secciones')
        .select('id_seccion_fk, nombre_seccion, monto, notas')
        .eq('id_recibo_fk', recibo.id)
        .then(({ data }) => {
          setSecRows(data && data.length > 0 ? (data as SeccionRow[]) : initSecRowsVal())
          setLoadingSecs(false)
        })
    } else {
      setSecRows(initSecRowsVal())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recibo?.id, esSecciones])

  // ── Cargar frentes del centro seleccionado ──────────────────
  useEffect(() => {
    if (!esFrente) { setFrenteRows([]); return }
    const centroId = Number(form.id_centro_ingreso_fk)
    if (!centroId) { setFrenteRows([]); return }

    if (recibo) {
      // Vista: cargar desglose guardado
      setLoadingSecs(true)
      dbCtrl.from('recibos_ingreso_frentes')
        .select('id_frente_fk, nombre_frente, monto, notas')
        .eq('id_recibo_fk', recibo.id)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setFrenteRows(data as FrenteRow[])
          } else {
            loadFrentesFromCfg(centroId)
          }
          setLoadingSecs(false)
        })
    } else {
      loadFrentesFromCfg(centroId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recibo?.id, esFrente, form.id_centro_ingreso_fk])

  const loadFrentesFromCfg = async (centroId: number) => {
    setLoadingSecs(true)
    const { data } = await dbCfg.from('frentes_ingreso')
      .select('id, nombre, codigo, id_centro_ingreso_fk')
      .eq('id_centro_ingreso_fk', centroId)
      .eq('activo', true)
      .order('nombre')
    setFrenteRows((data ?? []).map((f: Frente) => ({
      id_frente_fk: f.id,
      nombre_frente: f.nombre,
      monto: 0,
      notas: '',
    })))
    setLoadingSecs(false)
  }

  const initSecRowsVal = () =>
    secciones.map(s => ({ id_seccion_fk: s.id, nombre_seccion: s.nombre, monto: 0, notas: '' }))

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const setSecMonto    = (idx: number, val: number) =>
    setSecRows(rows => rows.map((r, i) => i === idx ? { ...r, monto: val } : r))
  const setFrenteMonto = (idx: number, val: number) =>
    setFrenteRows(rows => rows.map((r, i) => i === idx ? { ...r, monto: val } : r))

  // Total calculado
  const totalUnico   = form.monto_efectivo + form.monto_transferencia + form.monto_tarjeta + form.monto_cheque
  const totalSecs    = secRows.reduce((a, r) => a + (r.monto || 0), 0)
  const totalFrentes = frenteRows.reduce((a, r) => a + (r.monto || 0), 0)
  const totalFinal   = esSecciones ? totalSecs : esFrente ? totalFrentes : totalUnico

  const handleSave = async () => {
    if (!form.id_centro_ingreso_fk) { setError('Selecciona un centro de ingreso'); return }
    if (totalFinal === 0)           { setError('El monto total debe ser mayor a $0'); return }
    setSaving(true); setError('')

    const usaDesglose = esSecciones || esFrente
    const payload = {
      fecha:               form.fecha,
      id_centro_ingreso_fk: Number(form.id_centro_ingreso_fk),
      descripcion:         form.descripcion || null,
      monto_efectivo:      usaDesglose ? 0 : form.monto_efectivo,
      monto_transferencia: usaDesglose ? 0 : form.monto_transferencia,
      monto_tarjeta:       usaDesglose ? 0 : form.monto_tarjeta,
      monto_cheque:        usaDesglose ? 0 : form.monto_cheque,
      monto_total:         totalFinal,
      status:              form.status,
      notas:               form.notas || null,
      usuario_crea:        authUser?.nombre ?? authUser?.email ?? 'sistema',
    }

    const { data: newRec, error: err } = await dbCtrl.from('recibos_ingreso')
      .insert(payload).select('id').single()

    if (err || !newRec) { setSaving(false); setError(err?.message ?? 'Error al guardar'); return }

    // Folio
    const folio = fmtFolioIng(newRec.id)
    await dbCtrl.from('recibos_ingreso').update({ folio }).eq('id', newRec.id)

    // Secciones
    if (esSecciones && secRows.some(r => r.monto > 0)) {
      const secsPayload = secRows
        .filter(r => r.monto > 0)
        .map(r => ({ id_recibo_fk: newRec.id, id_seccion_fk: r.id_seccion_fk, nombre_seccion: r.nombre_seccion, monto: r.monto, notas: r.notas || null }))
      await dbCtrl.from('recibos_ingreso_secciones').insert(secsPayload)
    }

    // Frentes
    if (esFrente && frenteRows.some(r => r.monto > 0)) {
      const frentesPayload = frenteRows
        .filter(r => r.monto > 0)
        .map(r => ({ id_recibo_fk: newRec.id, id_frente_fk: r.id_frente_fk, nombre_frente: r.nombre_frente, monto: r.monto, notas: r.notas || null }))
      await dbCtrl.from('recibos_ingreso_frentes').insert(frentesPayload)
    }

    setSaving(false)
    onSaved()
  }

  const handleCancel = async () => {
    if (!cancelMotivo.trim()) { setError('Escribe el motivo de cancelación'); return }
    setCancelling(true); setError('')
    const { error: err } = await dbCtrl.from('recibos_ingreso').update({
      status: 'Cancelado',
      usuario_cancela: authUser?.nombre ?? authUser?.email,
      fecha_cancela: new Date().toISOString(),
      motivo_cancelacion: cancelMotivo.trim(),
    }).eq('id', recibo!.id)
    setCancelling(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const numInput = (label: string, key: string, val: number) => (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        className="input" type="number" min="0" step="0.01"
        value={val || ''}
        onChange={e => set(key, parseFloat(e.target.value) || 0)}
        disabled={isView}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Cabecera */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Receipt size={16} style={{ color: '#059669' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
                {isView ? recibo!.folio ?? `Recibo #${recibo!.id}` : 'Nuevo Recibo de Ingreso'}
              </h2>
            </div>
            {isView && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: STATUS_STYLE[recibo!.status]?.bg ?? '#f8fafc',
                color: STATUS_STYLE[recibo!.status]?.color ?? '#64748b',
                marginTop: 4, display: 'inline-block' }}>
                {recibo!.status}
              </span>
            )}
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>{error}</div>}

          {/* Fecha + Centro */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Fecha *</label>
              <input className="input" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} disabled={isView} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Centro de Ingreso *</label>
              <select className="select" value={form.id_centro_ingreso_fk ?? ''} onChange={e => set('id_centro_ingreso_fk', e.target.value)} disabled={isView}>
                <option value="">Seleccionar…</option>
                {centros.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Descripción / Concepto</label>
            <input className="input" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} disabled={isView}
              placeholder="ej. Ventas del día — green fees, carros, práctica" />
          </div>

          {/* Montos: desglose por sección, frente, o monto único */}
          {esSecciones ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={13} style={{ color: '#7c3aed' }} /> Monto por sección residencial
              </div>
              {loadingSecs ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Loader size={16} className="animate-spin" /></div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '7px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>SECCIÓN</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>MONTO</span>
                  </div>
                  {secRows.map((row, i) => (
                    <div key={row.id_seccion_fk} style={{
                      display: 'grid', gridTemplateColumns: '1fr 140px', padding: '8px 12px', alignItems: 'center',
                      borderBottom: i < secRows.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: row.monto > 0 ? '#f0fdf4' : '#fff',
                    }}>
                      <span style={{ fontSize: 13, color: '#1e293b', fontWeight: row.monto > 0 ? 600 : 400 }}>{row.nombre_seccion}</span>
                      <div>
                        <input
                          className="input" type="number" min="0" step="0.01"
                          value={row.monto || ''}
                          onChange={e => setSecMonto(i, parseFloat(e.target.value) || 0)}
                          disabled={isView}
                          style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '5px 8px', fontSize: 13 }}
                        />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '9px 12px', background: '#f0fdf4', borderTop: '2px solid #bbf7d0' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>TOTAL</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSecs)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : esFrente ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={13} style={{ color: '#0d9488' }} /> Monto por frente de ingreso
              </div>
              {loadingSecs ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Loader size={16} className="animate-spin" /></div>
              ) : frenteRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13, border: '1px dashed #e2e8f0', borderRadius: 8 }}>
                  Sin frentes configurados para este centro.{' '}
                  <a href="/catalogos" target="_blank" style={{ color: '#0d9488' }}>Agregar en Catálogos</a>
                </div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '7px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>FRENTE</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>MONTO</span>
                  </div>
                  {frenteRows.map((row, i) => (
                    <div key={row.id_frente_fk} style={{
                      display: 'grid', gridTemplateColumns: '1fr 140px', padding: '8px 12px', alignItems: 'center',
                      borderBottom: i < frenteRows.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: row.monto > 0 ? '#f0fdfa' : '#fff',
                    }}>
                      <span style={{ fontSize: 13, color: '#1e293b', fontWeight: row.monto > 0 ? 600 : 400 }}>{row.nombre_frente}</span>
                      <div>
                        <input
                          className="input" type="number" min="0" step="0.01"
                          value={row.monto || ''}
                          onChange={e => setFrenteMonto(i, parseFloat(e.target.value) || 0)}
                          disabled={isView}
                          style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '5px 8px', fontSize: 13 }}
                        />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '9px 12px', background: '#f0fdfa', borderTop: '2px solid #99f6e4' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0d9488' }}>TOTAL</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0d9488', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalFrentes)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarSign size={13} style={{ color: '#059669' }} /> Desglose por forma de cobro
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {numInput('Efectivo', 'monto_efectivo', form.monto_efectivo)}
                {numInput('Transferencia', 'monto_transferencia', form.monto_transferencia)}
                {numInput('Tarjeta', 'monto_tarjeta', form.monto_tarjeta)}
                {numInput('Cheque', 'monto_cheque', form.monto_cheque)}
              </div>
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalUnico)}</span>
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={e => set('notas', e.target.value)}
              disabled={isView} style={{ resize: 'vertical', minHeight: 52 }} />
          </div>

          {/* Datos de auditoría (vista) */}
          {isView && (
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
              Registrado por <strong>{recibo!.usuario_crea ?? '—'}</strong> · {fmtFecha(recibo!.created_at?.slice(0, 10))}
              {recibo!.status === 'Cancelado' && recibo!.motivo_cancelacion && (
                <div style={{ marginTop: 4, color: '#dc2626' }}>Cancelación: {recibo!.motivo_cancelacion}</div>
              )}
            </div>
          )}

          {/* Cancelar recibo */}
          {isView && recibo!.status === 'Confirmado' && showCancel && (
            <div style={{ padding: '14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>Motivo de cancelación</div>
              <textarea className="input" rows={2} value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)}
                style={{ resize: 'vertical', borderColor: '#fca5a5' }} placeholder="Escribe el motivo…" />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowCancel(false)}>Volver</button>
                <button onClick={handleCancel} disabled={cancelling}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {cancelling ? <Loader size={13} className="animate-spin" /> : <Ban size={13} />}
                  Confirmar cancelación
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            {isView && recibo!.status === 'Confirmado' && !showCancel && (
              <button onClick={() => setShowCancel(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'none', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <Ban size={13} /> Cancelar recibo
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose}>
              {isView ? 'Cerrar' : 'Cancelar'}
            </button>
            {!isView && (
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar Recibo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — Lista de recibos
// ════════════════════════════════════════════════════════════════
export default function RecibosIngresoPage() {
  const router = useRouter()
  const { authUser, canWrite } = useAuth()
  const [rows, setRows]         = useState<Recibo[]>([])
  const [centros, setCentros]   = useState<Centro[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [centrosMap, setCentrosMap] = useState<Record<number, Centro>>({})
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const [filterCentro, setFilterCentro] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFechaIni, setFilterFechaIni] = useState('')
  const [filterFechaFin, setFilterFechaFin] = useState('')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [detalle, setDetalle]   = useState<Recibo | null>(null)

  // Carga catálogos una sola vez
  useEffect(() => {
    Promise.all([
      dbCfg.from('centros_ingreso').select('*').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, nombre, clave_alfa').eq('activo', true).order('nombre'),
    ]).then(([{ data: cs }, { data: ss }]) => {
      const list = (cs ?? []) as Centro[]
      setCentros(list)
      const map: Record<number, Centro> = {}
      list.forEach(c => { map[c.id] = c })
      setCentrosMap(map)
      setSecciones((ss ?? []) as Seccion[])
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('recibos_ingreso')
      .select('*', { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (filterStatus)   q = q.eq('status', filterStatus)
    if (filterCentro)   q = q.eq('id_centro_ingreso_fk', Number(filterCentro))
    if (filterFechaIni) q = q.gte('fecha', filterFechaIni)
    if (filterFechaFin) q = q.lte('fecha', filterFechaFin)
    if (search)         q = q.ilike('folio', `%${search}%`)

    const { data, count } = await q
    setRows((data ?? []) as Recibo[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filterStatus, filterCentro, filterFechaIni, filterFechaFin, search])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const totalMes   = rows.filter(r => r.status === 'Confirmado').reduce((a, r) => a + (r.monto_total ?? 0), 0)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <button onClick={() => router.push('/ingresos')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>
            <ChevronLeft size={14} /> Ingresos
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Receipt size={16} style={{ color: '#059669' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Captura</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Recibos de Ingreso</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            {total} recibos · {fmt(totalMes)} en los filtros actuales
          </p>
        </div>
        {canWrite('ingresos') && (
          <button className="btn-primary" onClick={() => setModal(true)}>
            <Plus size={14} /> Nuevo Recibo
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar folio…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <select className="select" style={{ width: 180 }} value={filterCentro} onChange={e => { setFilterCentro(e.target.value); setPage(0) }}>
          <option value="">Todos los centros</option>
          {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
          <input className="input" type="date" style={{ width: 148 }} value={filterFechaIni}
            onChange={e => { setFilterFechaIni(e.target.value); setPage(0) }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" style={{ width: 148 }} value={filterFechaFin}
            onChange={e => { setFilterFechaFin(e.target.value); setPage(0) }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Centro de Ingreso</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Efectivo</th>
                <th style={{ textAlign: 'right' }}>Transf.</th>
                <th style={{ textAlign: 'right' }}>Tarjeta</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <Receipt size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                  <div style={{ fontSize: 14 }}>Sin recibos de ingreso</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {total === 0 ? 'Crea el primer recibo con el botón "Nuevo Recibo"' : 'Sin resultados con los filtros actuales'}
                  </div>
                </td></tr>
              ) : rows.map(r => {
                const centro = centrosMap[r.id_centro_ingreso_fk ?? 0]
                const color  = CENTRO_COLOR[centro?.tipo ?? 'otro'] ?? '#64748b'
                const sc     = STATUS_STYLE[r.status] ?? { bg: '#f8fafc', color: '#94a3b8' }
                const esCancelado = r.status === 'Cancelado'
                return (
                  <tr key={r.id} style={{ opacity: esCancelado ? 0.55 : 1 }}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>
                        {r.folio ?? `#${r.id}`}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtFecha(r.fecha)}</td>
                    <td>
                      {centro && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {centro.nombre}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.descripcion ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{r.monto_efectivo > 0 ? fmt(r.monto_efectivo) : '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{r.monto_transferencia > 0 ? fmt(r.monto_transferencia) : '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{r.monto_tarjeta > 0 ? fmt(r.monto_tarjeta) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: esCancelado ? '#94a3b8' : '#059669' }}>
                      {fmt(r.monto_total ?? 0)}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }}
                        onClick={() => setDetalle(r)} title="Ver detalle">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Página {page + 1} de {totalPages} · {total} registros
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={13} />
              </button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal nuevo */}
      {modal && (
        <ReciboModal
          recibo={null}
          centros={centros}
          secciones={secciones}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchData() }}
          authUser={authUser}
        />
      )}

      {/* Modal detalle/cancelar */}
      {detalle && (
        <ReciboModal
          recibo={detalle}
          centros={centros}
          secciones={secciones}
          onClose={() => setDetalle(null)}
          onSaved={() => { setDetalle(null); fetchData() }}
          authUser={authUser}
        />
      )}
    </div>
  )
}
