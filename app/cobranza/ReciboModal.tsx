'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { X, Save, Loader, Plus, Trash2, CheckCircle } from 'lucide-react'
import { type ReciboDetalle, type ReciboPago, type Cargo, fmt, MESES, CUENTAS } from './types'
import ModalShell from '@/components/ui/ModalShell'

type Lote = { id: number; cve_lote: string | null; lote: number | null }
type FormaPago = { id: number; nombre: string }

const ANIOS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i)

type Props = {
  cargoInicial?: Cargo
  onClose: () => void
  onSaved: () => void
}

export default function ReciboModal({ cargoInicial, onClose, onSaved }: Props) {
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [lotes, setLotes]           = useState<Lote[]>([])
  const [formasPago, setFormasPago] = useState<FormaPago[]>([])
  const [cargosPendientes, setCargosPendientes] = useState<Cargo[]>([])
  const [loteSearch, setLoteSearch] = useState(cargoInicial ? ((cargoInicial as any).lotes?.cve_lote ?? '') : '')

  const [form, setForm] = useState({
    id_lote_fk:       cargoInicial?.id_lote_fk?.toString() ?? '',
    folio:            '',
    fecha_recibo:     new Date().toISOString().split('T')[0],
    fecha_pago:       new Date().toISOString().split('T')[0],
    propietario:      '',
    empresa:          '',
    cuenta_receptora: '1',
    rfc_factura:      '',
    folio_factura:    '',
  })

  type Linea = ReciboDetalle & { id_cargo_fk?: number | null; cargo_saldo?: number }

  const [lineas, setLineas] = useState<Linea[]>(
    cargoInicial ? [{
      id_cargo_fk: cargoInicial.id, cargo_saldo: cargoInicial.saldo,
      concepto: cargoInicial.concepto, cantidad: 1,
      precio_unitario: cargoInicial.saldo, descuento: 0,
      subtotal: cargoInicial.saldo, iva: 0, total: cargoInicial.saldo,
      periodo_mes: cargoInicial.periodo_mes, periodo_anio: cargoInicial.periodo_anio,
      id_cuota_lote_fk: null,
    }] : [{
      id_cargo_fk: null, concepto: '', cantidad: 1, precio_unitario: 0,
      descuento: 0, subtotal: 0, iva: 0, total: 0,
      periodo_mes: MESES[new Date().getMonth()], periodo_anio: new Date().getFullYear(),
      id_cuota_lote_fk: null,
    }]
  )

  const [pagos, setPagos] = useState<ReciboPago[]>([{
    monto: cargoInicial?.saldo ?? 0, referencia: '',
    fecha: new Date().toISOString().split('T')[0], id_forma_pago_fk: null
  }])

  useEffect(() => {
    dbCat.from('lotes').select('id, cve_lote, lote').order('cve_lote')
      .then(({ data }) => setLotes(data as Lote[] ?? []))
    dbCfg.from('formas_pago').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setFormasPago(data as FormaPago[] ?? []))
  }, [])

  useEffect(() => {
    if (!form.id_lote_fk) { setCargosPendientes([]); return }
    dbCtrl.from('cargos').select('*').eq('id_lote_fk', Number(form.id_lote_fk))
      .in('status', ['Pendiente', 'Parcial']).order('fecha_cargo')
      .then(({ data }) => setCargosPendientes(data as Cargo[] ?? []))
  }, [form.id_lote_fk])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const calcLinea = (l: Linea): Linea => {
    const subtotal = Number(l.cantidad) * Number(l.precio_unitario) - Number(l.descuento)
    return { ...l, subtotal, iva: 0, total: subtotal }
  }

  const setLinea = (i: number, partial: Partial<Linea>) =>
    setLineas(ls => ls.map((l, j) => j === i ? calcLinea({ ...l, ...partial }) : l))

  const agregarCargo = (cargo: Cargo) => {
    if (lineas.some(l => l.id_cargo_fk === cargo.id)) return
    const nueva: Linea = {
      id_cargo_fk: cargo.id, cargo_saldo: cargo.saldo,
      concepto: `${cargo.concepto}${cargo.periodo_mes ? ` — ${cargo.periodo_mes} ${cargo.periodo_anio}` : ''}`,
      cantidad: 1, precio_unitario: cargo.saldo, descuento: 0,
      subtotal: cargo.saldo, iva: 0, total: cargo.saldo,
      periodo_mes: cargo.periodo_mes, periodo_anio: cargo.periodo_anio,
      id_cuota_lote_fk: cargo.id_cuota_lote_fk ?? null,
    }
    setLineas(ls => {
      const sinVacias = ls.filter(l => l.id_cargo_fk !== null || l.concepto.trim() !== '')
      return [...sinVacias, nueva]
    })
  }

  const totalRecibo = lineas.reduce((a, l) => a + (l.total ?? 0), 0)
  const totalPagado = pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0)
  const diferencia  = totalRecibo - totalPagado

  const handleSubmit = async () => {
    const lineasValidas = lineas.filter(l => l.concepto.trim() && l.total > 0)
    if (!form.id_lote_fk) { setError('Selecciona un lote'); return }
    if (!lineasValidas.length) { setError('Agrega al menos una línea con monto'); return }
    setSaving(true); setError('')

    const { data: recibo, error: err1 } = await dbCtrl.from('recibos').insert({
      id_lote_fk:       Number(form.id_lote_fk),
      folio:            form.folio.trim() || null,
      fecha_recibo:     form.fecha_recibo,
      fecha_pago:       form.fecha_pago || null,
      propietario:      form.propietario.trim() || null,
      empresa:          form.empresa.trim() || null,
      cuenta_receptora: form.cuenta_receptora ? Number(form.cuenta_receptora) : null,
      monto:            totalRecibo,
      rfc_factura:      form.rfc_factura.trim() || null,
      folio_factura:    form.folio_factura.trim() || null,
      tipo_concepto:    'Pago de Cuota',
      activo:           true,
    }).select('id').single()

    if (err1) { setError(err1.message); setSaving(false); return }
    const reciboId = recibo.id

    await dbCtrl.from('recibos_detalle').insert(
      lineasValidas.map(l => ({
        id_recibo_fk:     reciboId,
        id_cargo_fk:      (l as any).id_cargo_fk ?? null,
        id_cuota_lote_fk: l.id_cuota_lote_fk ?? null,
        concepto:         l.concepto,
        cantidad:         l.cantidad,
        precio_unitario:  l.precio_unitario,
        descuento:        l.descuento ?? 0,
        subtotal:         l.subtotal,
        iva:              0,
        total:            l.total,
        periodo_mes:      l.periodo_mes ?? null,
        periodo_anio:     l.periodo_anio ?? null,
      }))
    )

    const pagosValidos = pagos.filter(p => Number(p.monto) > 0)
    if (pagosValidos.length) {
      await dbCtrl.from('recibos_pagos').insert(
        pagosValidos.map(p => ({
          id_recibo_fk:     reciboId,
          id_forma_pago_fk: p.id_forma_pago_fk ?? null,
          monto:            Number(p.monto),
          referencia:       p.referencia?.trim() || null,
          fecha:            p.fecha || null,
        }))
      )
    }

    // Actualizar saldo de cada cargo vinculado
    for (const linea of lineasValidas) {
      if ((linea as any).id_cargo_fk) {
        const cargoId = (linea as any).id_cargo_fk
        const { data: cargoDB } = await dbCtrl.from('cargos').select('monto_pagado').eq('id', cargoId).single()
        if (cargoDB) {
          const nuevoPagado = (cargoDB.monto_pagado ?? 0) + linea.total
          await dbCtrl.from('cargos').update({ monto_pagado: nuevoPagado }).eq('id', cargoId)
        }
      }
    }

    setSaving(false)
    onSaved()
  }

  const filteredLotes = lotes.filter(l => l.cve_lote?.toLowerCase().includes(loteSearch.toLowerCase())).slice(0, 6)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 780, maxHeight: '92vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>
            {cargoInicial ? `Pagar: ${cargoInicial.concepto}` : 'Nuevo Recibo'}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(92vh - 130px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* Cabecera */}
          <Section label="Datos del Recibo">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <div>
                <label className="label">Lote *</label>
                {cargoInicial ? (
                  <div className="input" style={{ background: '#eff6ff', color: 'var(--blue)', fontWeight: 600 }}>
                    {(cargoInicial as any).lotes?.cve_lote ?? `#${cargoInicial.id_lote_fk}`}
                  </div>
                ) : (
                  <>
                    <input className="input" placeholder="Busca clave…" value={loteSearch}
                      onChange={e => { setLoteSearch(e.target.value); if (form.id_lote_fk) setForm(f => ({ ...f, id_lote_fk: '' })) }} />
                    {filteredLotes.length > 0 && loteSearch.length >= 2 && !form.id_lote_fk && (
                      <div className="card" style={{ position: 'absolute', zIndex: 10, width: 200, marginTop: 4, padding: '4px 0' }}>
                        {filteredLotes.map(l => (
                          <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`) }}
                            style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            {l.cve_lote ?? `#${l.lote}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <Field label="Folio"><input className="input" value={form.folio} onChange={set('folio')} placeholder="Autogenerado" /></Field>
              <Field label="Fecha Recibo"><input className="input" type="date" value={form.fecha_recibo} onChange={set('fecha_recibo')} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <Field label="Propietario"><input className="input" value={form.propietario} onChange={set('propietario')} /></Field>
              <Field label="Fecha de Pago"><input className="input" type="date" value={form.fecha_pago} onChange={set('fecha_pago')} /></Field>
              <Field label="Cuenta Receptora">
                <select className="select" value={form.cuenta_receptora} onChange={set('cuenta_receptora')}>
                  {CUENTAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Cargos pendientes */}
          {!cargoInicial && cargosPendientes.length > 0 && (
            <Section label={`Cargos Pendientes del Lote (${cargosPendientes.length})`}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Haz clic para incluir en el recibo</div>
              {cargosPendientes.map(c => {
                const yaAgregado = lineas.some(l => (l as any).id_cargo_fk === c.id)
                return (
                  <button key={c.id} onClick={() => !yaAgregado && agregarCargo(c)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, cursor: yaAgregado ? 'default' : 'pointer', background: yaAgregado ? '#f0fdf4' : '#f8fafc', border: `1px solid ${yaAgregado ? '#bbf7d0' : '#e2e8f0'}`, textAlign: 'left', width: '100%' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: yaAgregado ? '#15803d' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {yaAgregado && <CheckCircle size={12} />}{c.concepto}
                        {c.periodo_mes && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{c.periodo_mes} {c.periodo_anio}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Cargo: {fmt(c.monto)} · Pagado: {fmt(c.monto_pagado)} · <strong style={{ color: '#dc2626' }}>Saldo: {fmt(c.saldo)}</strong>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: yaAgregado ? '#dcfce7' : '#dbeafe', color: yaAgregado ? '#15803d' : 'var(--blue)' }}>
                      {yaAgregado ? '✓ Incluido' : '+ Agregar'}
                    </span>
                  </button>
                )
              })}
            </Section>
          )}

          {/* Líneas */}
          <Section label="Conceptos">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 110px 90px 100px 32px', gap: 6, marginBottom: 4 }}>
              {['Concepto', 'Cant.', 'Monto', 'Descuento', 'Total', ''].map(h => (
                <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {lineas.map((l, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                {(l as any).id_cargo_fk && (l as any).cargo_saldo !== undefined && (
                  <div style={{ fontSize: 11, marginBottom: 3, color: l.total >= ((l as any).cargo_saldo ?? 0) ? '#15803d' : '#d97706' }}>
                    Saldo del cargo: {fmt((l as any).cargo_saldo)} · {l.total >= ((l as any).cargo_saldo ?? 0) ? '✓ Pago completo' : '~ Pago parcial'}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 110px 90px 100px 32px', gap: 6 }}>
                  <input className="input" value={l.concepto} onChange={e => setLinea(i, { concepto: e.target.value })} />
                  <input className="input" type="number" min="1" style={{ textAlign: 'right' }} value={l.cantidad} onChange={e => setLinea(i, { cantidad: Number(e.target.value) })} />
                  <input className="input" type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={l.precio_unitario} onChange={e => setLinea(i, { precio_unitario: Number(e.target.value) })} />
                  <input className="input" type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={l.descuento} onChange={e => setLinea(i, { descuento: Number(e.target.value) })} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{fmt(l.total)}</div>
                  <button className="btn-ghost" style={{ padding: '6px' }} onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            <button className="btn-ghost" style={{ marginTop: 4 }}
              onClick={() => setLineas(ls => [...ls, { id_cargo_fk: null, concepto: '', cantidad: 1, precio_unitario: 0, descuento: 0, subtotal: 0, iva: 0, total: 0, periodo_mes: MESES[new Date().getMonth()], periodo_anio: new Date().getFullYear(), id_cuota_lote_fk: null }])}>
              <Plus size={12} /> Agregar línea manual
            </button>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>TOTAL</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalRecibo)}</span>
              </div>
            </div>
          </Section>

          {/* Formas de pago */}
          <Section label="Formas de Pago">
            {pagos.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 110px 1fr 120px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div><label className="label">Forma</label>
                  <select className="select" value={p.id_forma_pago_fk?.toString() ?? ''}
                    onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, id_forma_pago_fk: e.target.value ? Number(e.target.value) : null } : x))}>
                    <option value="">—</option>
                    {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select>
                </div>
                <div><label className="label">Monto</label>
                  <input className="input" type="number" step="0.01" style={{ textAlign: 'right' }} value={p.monto}
                    onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, monto: Number(e.target.value) } : x))} />
                </div>
                <div><label className="label">Referencia</label>
                  <input className="input" value={p.referencia ?? ''} onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, referencia: e.target.value } : x))} />
                </div>
                <div><label className="label">Fecha</label>
                  <input className="input" type="date" value={p.fecha ?? ''} onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, fecha: e.target.value } : x))} />
                </div>
                <button className="btn-ghost" style={{ padding: '6px' }} onClick={() => setPagos(ps => ps.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
              </div>
            ))}
            <button className="btn-ghost"
              onClick={() => setPagos(ps => [...ps, { monto: diferencia > 0 ? diferencia : 0, referencia: '', fecha: new Date().toISOString().split('T')[0], id_forma_pago_fk: null }])}>
              <Plus size={12} /> Agregar forma de pago
            </button>
            <div style={{ marginTop: 10, padding: '10px 14px', background: diferencia === 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Diferencia (total − pagado)</span>
              <span style={{ fontWeight: 700, color: diferencia === 0 ? '#15803d' : '#dc2626' }}>{fmt(diferencia)}</span>
            </div>
          </Section>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar Recibo'}
          </button>
        </div>
      </div>
    </div>
  )
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  </div>
)
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div><label className="label">{label}</label>{children}</div>
