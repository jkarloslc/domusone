'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader, AlertCircle, Car } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { abrirTicketSalidaCarrito } from './ticket'

type PensionCarrito = {
  id: number
  id_socio_fk: number
  id_carrito_fk: number
  id_slot_fk: number | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_carritos: { marca: string | null; modelo: string | null; placa: string | null; tipo: string; activo: boolean } | null
  cat_slots: { numero: string } | null
}

type Elegibilidad = {
  pension: PensionCarrito
  cuotasVencidas: number
  montoVencido: number
  enRonda: boolean
}

type Props = { onClose: () => void; onSaved: () => void }

const hoy = new Date().toISOString().split('T')[0]

// Corte de adeudos al día 10: hasta el día 10 inclusive, la cuota del mes en curso
// aún no es exigible (solo bloquean meses anteriores); a partir del día 11 la cuota
// del mes en curso también cuenta como adeudo.
function periodoCorte(): string {
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  if (now.getDate() <= 10) {
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return `${y}-${String(m).padStart(2, '0')}`
}
const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

export default function SalidaCarritoModal({ onClose, onSaved }: Props) {
  const { authUser } = useAuth()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [lista, setLista]       = useState<Elegibilidad[]>([])
  const [idPension, setIdPension] = useState<number | ''>('')
  const [observaciones, setObs] = useState('')

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      // Pensiones activas con carrito activo
      const [{ data: pData }, { data: cxcData }, { data: salidasData }] = await Promise.all([
        dbGolf.from('ctrl_pensiones')
          .select(`id, id_socio_fk, id_carrito_fk, id_slot_fk,
            cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
            cat_carritos(marca, modelo, placa, tipo, activo),
            cat_slots(numero)`)
          .eq('activo', true),
        // Cuotas de pensión de carrito pendientes — el corte por periodo se aplica abajo
        dbGolf.from('cxc_golf')
          .select('id_pension_fk, saldo, fecha_vencimiento, periodo')
          .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
          .eq('tipo', 'PENSION_CARRITO'),
        // Carritos que siguen en ronda (salida sin regreso)
        dbGolf.from('ctrl_salidas_carritos')
          .select('id_carrito_fk')
          .is('fecha_regreso', null),
      ])

      const corte = periodoCorte()
      const vencPorPension: Record<number, { count: number; monto: number }> = {}
      for (const c of (cxcData ?? []) as { id_pension_fk: number | null; saldo: number; fecha_vencimiento: string | null; periodo: string | null }[]) {
        if (!c.id_pension_fk) continue
        // Regla del día 10: cuenta como adeudo si el periodo es <= al periodo de corte.
        // Cuotas sin periodo caen al criterio anterior (fecha de vencimiento ya pasada).
        const exigible = c.periodo
          ? c.periodo <= corte
          : (c.fecha_vencimiento != null && c.fecha_vencimiento < hoy)
        if (!exigible) continue
        if (!vencPorPension[c.id_pension_fk]) vencPorPension[c.id_pension_fk] = { count: 0, monto: 0 }
        vencPorPension[c.id_pension_fk].count++
        vencPorPension[c.id_pension_fk].monto += c.saldo ?? 0
      }
      const enRondaSet = new Set(((salidasData ?? []) as { id_carrito_fk: number }[]).map(s => s.id_carrito_fk))

      const result: Elegibilidad[] = ((pData ?? []) as unknown as PensionCarrito[])
        .filter(p => p.cat_carritos?.activo !== false)
        .map(p => ({
          pension: p,
          cuotasVencidas: vencPorPension[p.id]?.count ?? 0,
          montoVencido:   vencPorPension[p.id]?.monto ?? 0,
          enRonda:        enRondaSet.has(p.id_carrito_fk),
        }))
        // Orden por id de cajón (sin cajón al final), después por nombre de socio
        .sort((a, b) =>
          ((a.pension.id_slot_fk ?? Number.MAX_SAFE_INTEGER) - (b.pension.id_slot_fk ?? Number.MAX_SAFE_INTEGER))
          || nc(a.pension.cat_socios).localeCompare(nc(b.pension.cat_socios)))

      setLista(result)
      setLoading(false)
    }
    cargar()
  }, [])

  const descCarrito = (p: PensionCarrito) => {
    const car = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
    const placa = p.cat_carritos?.placa ? ` · ${p.cat_carritos.placa}` : ''
    const cajon = p.cat_slots ? ` · Cajón ${p.cat_slots.numero}` : ''
    return `${car}${placa}${cajon} — ${nc(p.cat_socios)}`
  }

  const seleccionado = lista.find(e => e.pension.id === idPension)
  const elegibles    = lista.filter(e => e.cuotasVencidas === 0 && !e.enRonda)
  const conAdeudo    = lista.filter(e => e.cuotasVencidas > 0)
  const enRonda      = lista.filter(e => e.cuotasVencidas === 0 && e.enRonda)

  const handleSave = async () => {
    if (!seleccionado) { setError('Selecciona un carrito'); return }
    if (seleccionado.cuotasVencidas > 0) { setError('El carrito tiene adeudo de cuotas — no puede salir a ronda'); return }
    if (seleccionado.enRonda) { setError('El carrito ya está en ronda de juego'); return }
    setSaving(true); setError('')

    const fechaSalida = new Date().toISOString()
    const usuario = authUser?.nombre ?? null
    const { data: salida, error: err } = await dbGolf.from('ctrl_salidas_carritos').insert({
      id_carrito_fk:    seleccionado.pension.id_carrito_fk,
      id_pension_fk:    seleccionado.pension.id,
      id_socio_fk:      seleccionado.pension.id_socio_fk,
      fecha_salida:     fechaSalida,
      observaciones:    observaciones.trim() || null,
      usuario_registra: usuario,
    }).select('id').single()

    if (err || !salida) { setError(err?.message ?? 'Error al guardar'); setSaving(false); return }

    // Impresión obligatoria: Motor Lobby da salida física solo con el ticket
    await abrirTicketSalidaCarrito({
      id:               salida.id,
      fecha_salida:     fechaSalida,
      carrito:          [seleccionado.pension.cat_carritos?.marca, seleccionado.pension.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito',
      placa:            seleccionado.pension.cat_carritos?.placa ?? null,
      tipo:             seleccionado.pension.cat_carritos?.tipo ?? null,
      cajon:            seleccionado.pension.cat_slots ? `Cajón ${seleccionado.pension.cat_slots.numero}` : null,
      socio:            nc(seleccionado.pension.cat_socios),
      numero_socio:     seleccionado.pension.cat_socios?.numero_socio ?? null,
      observaciones:    observaciones.trim() || null,
      usuario_registra: usuario,
    }, true)

    onSaved()
  }

  return (
    <ModalShell modulo="golf-carritos" titulo="Registrar Salida a Ronda de Juego" onClose={onClose} maxWidth={560}
      footer={<>
        <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || loading || !idPension}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669' }}>
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Registrar e Imprimir Ticket
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div>
          <label style={labelStyle}>Carrito (solo carritos al corriente en cuotas)</label>
          {loading ? (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>Cargando carritos…</div>
          ) : (
            <select value={idPension} onChange={e => { setIdPension(e.target.value ? Number(e.target.value) : ''); setError('') }} style={inputStyle}>
              <option value="">— Selecciona un carrito —</option>
              {elegibles.map(e => (
                <option key={e.pension.id} value={e.pension.id}>{descCarrito(e.pension)}</option>
              ))}
              {enRonda.length > 0 && (
                <optgroup label="En ronda de juego (no disponibles)">
                  {enRonda.map(e => (
                    <option key={e.pension.id} value={e.pension.id} disabled>
                      {descCarrito(e.pension)} — en ronda
                    </option>
                  ))}
                </optgroup>
              )}
              {conAdeudo.length > 0 && (
                <optgroup label="Con adeudo de cuotas (bloqueados)">
                  {conAdeudo.map(e => (
                    <option key={e.pension.id} value={e.pension.id} disabled>
                      {descCarrito(e.pension)} — {e.cuotasVencidas} cuota{e.cuotasVencidas !== 1 ? 's' : ''} vencida{e.cuotasVencidas !== 1 ? 's' : ''} ({fmt$(e.montoVencido)})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {!loading && elegibles.length === 0 && (
            <div style={{ fontSize: 12, color: '#d97706', marginTop: 6 }}>
              No hay carritos disponibles: todos tienen adeudo de cuotas o ya están en ronda.
            </div>
          )}
        </div>

        {seleccionado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ecfdf5', borderRadius: 10, border: '1px solid #a7f3d0' }}>
            <Car size={18} style={{ color: '#059669', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>
                {[seleccionado.pension.cat_carritos?.marca, seleccionado.pension.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'}
                {seleccionado.pension.cat_carritos?.placa ? ` · Placa ${seleccionado.pension.cat_carritos.placa}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#047857' }}>
                {nc(seleccionado.pension.cat_socios)}
                {seleccionado.pension.cat_socios?.numero_socio ? ` · #${seleccionado.pension.cat_socios.numero_socio}` : ''}
                {seleccionado.pension.cat_slots ? ` · Cajón ${seleccionado.pension.cat_slots.numero}` : ''}
                <span style={{ marginLeft: 8, fontWeight: 600, color: '#15803d' }}>✓ Al corriente</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label style={labelStyle}>Observaciones</label>
          <textarea value={observaciones} onChange={e => setObs(e.target.value)} rows={2}
            placeholder="Opcional — condiciones del carrito, quién lo conduce, etc."
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
          🖨 Al registrar la salida se imprime el ticket automáticamente. Motor Lobby da salida física al carrito únicamente con el ticket.
        </div>

      </div>
    </ModalShell>
  )
}
