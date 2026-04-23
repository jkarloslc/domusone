'use client'
import { useState, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { X, Save, Loader, Plus, Trash2 } from 'lucide-react'
import { folioGen } from '../types'
import ModalShell from '@/components/ui/ModalShell'

type Detalle = {
  id?: number
  concepto: string
  monto: string
  categoria: string
  tipo_comprobante: string
  num_comprobante: string
  url_comprobante: string
  id_centro_costo_fk: string
  id_area_fk: string
  id_frente_fk: string
}

const CATEGORIAS     = ['Producto', 'Servicio', 'Viáticos', 'Combustible', 'Otro']
const COMPROBANTES   = ['Factura', 'Nota de Remisión', 'Ticket', 'Sin comprobante']

const emptyDetalle = (): Detalle => ({
  concepto: '', monto: '', categoria: 'Otro',
  tipo_comprobante: 'Ticket', num_comprobante: '',
  url_comprobante: '', id_centro_costo_fk: '',
  id_area_fk: '', id_frente_fk: '',
})

type Props = {
  reembolso?: any    // si viene = edición
  fondo: any         // fondo activo del usuario
  authUser: any
  onClose: () => void
  onSaved: () => void
}

export default function ReembolsoModal({ reembolso, fondo, authUser, onClose, onSaved }: Props) {
  const isNew = !reembolso
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [detalles, setDetalles] = useState<Detalle[]>([emptyDetalle()])

  const [form, setForm] = useState({
    fecha:        reembolso?.fecha        ?? new Date().toISOString().slice(0, 10),
    observaciones: reembolso?.observaciones ?? '',
  })

  // Catálogos
  const [ccs,       setCCs]       = useState<any[]>([])
  const [areas, setAreas] = useState<any[]>([])
  const [frentes,   setFrentes]   = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre, id_area_fk').eq('activo', true).order('nombre'),
    ]).then(([cc, sec, frt]) => {
      setCCs(cc.data ?? [])
      setAreas(sec.data ?? [])
      setFrentes(frt.data ?? [])
    })

    // Si es edición, cargar detalles existentes
    if (!isNew && reembolso?.id) {
      dbComp.from('reembolsos_detalle').select('*').eq('id_reembolso_fk', reembolso.id).eq('activo', true)
        .then(({ data }) => {
          if (data?.length) {
            setDetalles(data.map((d: any) => ({
              id: d.id,
              concepto:           d.concepto ?? '',
              monto:              d.monto?.toString() ?? '',
              categoria:          d.categoria ?? 'Otro',
              tipo_comprobante:   d.tipo_comprobante ?? 'Ticket',
              num_comprobante:    d.num_comprobante ?? '',
              url_comprobante:    d.url_comprobante ?? '',
              id_centro_costo_fk: d.id_centro_costo_fk?.toString() ?? '',
              id_area_fk:         d.id_area_fk?.toString() ?? '',
              id_frente_fk:       d.id_frente_fk?.toString() ?? '',
            })))
          }
        })
    }
  }, [isNew, reembolso])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const setDet = (i: number, k: keyof Detalle, v: string) =>
    setDetalles(ds => ds.map((d, j) => j === i ? { ...d, [k]: v,
      // reset frente si cambia seccion, reset seccion/frente si cambia CC
      ...(k === 'id_centro_costo_fk' ? { id_area_fk: '', id_frente_fk: '' } : {}),
      ...(k === 'id_area_fk' ? { id_frente_fk: '' } : {}),
    } : d))

  const addLinea    = () => setDetalles(ds => [...ds, emptyDetalle()])
  const removeLinea = (i: number) => setDetalles(ds => ds.filter((_, j) => j !== i))

  const total = detalles.reduce((a, d) => a + (parseFloat(d.monto) || 0), 0)

  const handleSubmit = async (statusFinal: 'Borrador' | 'Pendiente Auth') => {
    if (!form.fecha)                  { setError('Fecha requerida'); return }
    if (detalles.some(d => !d.concepto.trim())) { setError('Todos los ítems deben tener concepto'); return }
    if (detalles.some(d => !d.monto || parseFloat(d.monto) <= 0)) { setError('Todos los montos deben ser mayores a 0'); return }
    if (total <= 0)                   { setError('El total debe ser mayor a 0'); return }
    setSaving(true); setError('')

    if (isNew) {
      // Insertar cabecera
      const { data: remData, error: remErr } = await dbComp.from('reembolsos').insert({
        id_fondo_fk:    fondo?.id ?? null,
        id_usuario_fk:  authUser?.user?.id ?? '',
        usuario_nombre: authUser?.nombre ?? authUser?.user?.email ?? '',
        fecha:          form.fecha,
        total,
        status:         statusFinal,
        observaciones:  form.observaciones.trim() || null,
        created_by:     authUser?.nombre ?? null,
      }).select('id').single()

      if (remErr) { setError(remErr.message); setSaving(false); return }

      // Folio
      await dbComp.from('reembolsos').update({
        folio: folioGen('REM', remData.id)
      }).eq('id', remData.id)

      // Insertar detalles
      const { error: detErr } = await dbComp.from('reembolsos_detalle').insert(
        detalles.map(d => ({
          id_reembolso_fk:    remData.id,
          concepto:           d.concepto.trim(),
          monto:              parseFloat(d.monto),
          categoria:          d.categoria,
          tipo_comprobante:   d.tipo_comprobante,
          num_comprobante:    d.num_comprobante.trim() || null,
          url_comprobante:    d.url_comprobante || null,
          id_centro_costo_fk: d.id_centro_costo_fk ? Number(d.id_centro_costo_fk) : null,
          id_area_fk:         d.id_area_fk ? Number(d.id_area_fk) : null,
          id_frente_fk:       d.id_frente_fk ? Number(d.id_frente_fk) : null,
        }))
      )
      if (detErr) { setError(detErr.message); setSaving(false); return }

    } else {
      // Actualizar cabecera
      const { error: remErr } = await dbComp.from('reembolsos').update({
        fecha:         form.fecha,
        total,
        status:        statusFinal,
        observaciones: form.observaciones.trim() || null,
      }).eq('id', reembolso.id)
      if (remErr) { setError(remErr.message); setSaving(false); return }

      // Borrar detalles y re-insertar
      await dbComp.from('reembolsos_detalle').delete().eq('id_reembolso_fk', reembolso.id)
      await dbComp.from('reembolsos_detalle').insert(
        detalles.map(d => ({
          id_reembolso_fk:    reembolso.id,
          concepto:           d.concepto.trim(),
          monto:              parseFloat(d.monto),
          categoria:          d.categoria,
          tipo_comprobante:   d.tipo_comprobante,
          num_comprobante:    d.num_comprobante.trim() || null,
          url_comprobante:    d.url_comprobante || null,
          id_centro_costo_fk: d.id_centro_costo_fk ? Number(d.id_centro_costo_fk) : null,
          id_area_fk:         d.id_area_fk ? Number(d.id_area_fk) : null,
          id_frente_fk:       d.id_frente_fk ? Number(d.id_frente_fk) : null,
        }))
      )
    }

    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400 }}>
              {isNew ? 'Nuevo Reembolso de Caja Chica' : `Editar ${reembolso.folio ?? '#' + reembolso.id}`}
            </h2>
            {fondo && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Fondo: ${(fondo.monto_asignado ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} — {fondo.status}
            </div>}
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13 }}>{error}</div>}

          {/* Datos generales */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
            <div>
              <label className="label">Fecha *</label>
              <input className="input" type="date" value={form.fecha} onChange={set('fecha')} />
            </div>
            <div>
              <label className="label">Observaciones generales</label>
              <input className="input" value={form.observaciones} onChange={set('observaciones')} placeholder="Concepto general del reembolso…" />
            </div>
          </div>

          {/* Líneas de gasto */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Detalle de gastos
              </span>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addLinea}>
                <Plus size={12} /> Agregar línea
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {detalles.map((d, i) => {
                const secsFiltradas = d.id_centro_costo_fk
                  ? areas.filter(s => s.id_centro_costo_fk === Number(d.id_centro_costo_fk))
                  : areas
                const frtsFiltrados = d.id_area_fk
                  ? frentes.filter(f => f.id_area_fk === Number(d.id_area_fk))
                  : frentes

                return (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--surface-700)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Línea {i + 1}</span>
                      {detalles.length > 1 && (
                        <button className="btn-ghost" style={{ padding: '2px 6px', color: '#dc2626' }} onClick={() => removeLinea(i)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {/* Concepto + Monto */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
                      <div>
                        <label className="label">Concepto *</label>
                        <input className="input" value={d.concepto} onChange={e => setDet(i, 'concepto', e.target.value)} placeholder="Descripción del gasto" />
                      </div>
                      <div>
                        <label className="label">Monto *</label>
                        <input className="input" type="number" step="0.01" min="0" value={d.monto} onChange={e => setDet(i, 'monto', e.target.value)} placeholder="0.00" />
                      </div>
                    </div>

                    {/* Categoria + Comprobante + Num */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="label">Categoría</label>
                        <select className="select" value={d.categoria} onChange={e => setDet(i, 'categoria', e.target.value)}>
                          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Comprobante</label>
                        <select className="select" value={d.tipo_comprobante} onChange={e => setDet(i, 'tipo_comprobante', e.target.value)}>
                          {COMPROBANTES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Núm. comprobante</label>
                        <input className="input" value={d.num_comprobante} onChange={e => setDet(i, 'num_comprobante', e.target.value)} placeholder="Folio / serie" />
                      </div>
                    </div>

                    {/* CC - Sección - Frente */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="label">Centro de Costo</label>
                        <select className="select" value={d.id_centro_costo_fk} onChange={e => setDet(i, 'id_centro_costo_fk', e.target.value)}>
                          <option value="">— CC —</option>
                          {ccs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Sección</label>
                        <select className="select" value={d.id_area_fk} onChange={e => setDet(i, 'id_area_fk', e.target.value)}>
                          <option value="">— Sección —</option>
                          {secsFiltradas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Frente</label>
                        <select className="select" value={d.id_frente_fk} onChange={e => setDet(i, 'id_frente_fk', e.target.value)}>
                          <option value="">— Frente —</option>
                          {frtsFiltrados.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* URL comprobante */}
                    <div>
                      <label className="label">URL / link del comprobante</label>
                      <input className="input" value={d.url_comprobante} onChange={e => setDet(i, 'url_comprobante', e.target.value)} placeholder="https://… o ruta al archivo" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>TOTAL REEMBOLSO</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold-light)' }}>
                ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-secondary" onClick={() => handleSubmit('Borrador')} disabled={saving}>
            Guardar borrador
          </button>
          <button className="btn-primary" onClick={() => handleSubmit('Pendiente Auth')} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Enviando…' : 'Enviar a autorización'}
          </button>
        </div>
      </div>
    </div>
  )
}
