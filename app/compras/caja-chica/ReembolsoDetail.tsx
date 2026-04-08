'use client'
import { useState, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { X, CheckCircle, XCircle, ExternalLink, DollarSign } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { folioGen } from '../types'

type Props = {
  reembolso: any
  canAuth: boolean
  onClose: () => void
  onUpdated: () => void
}

const CAT_COLORS: Record<string, string> = {
  'Producto':    '#2563eb',
  'Servicio':    '#7c3aed',
  'Viáticos':   '#d97706',
  'Combustible': '#dc2626',
  'Otro':        '#475569',
}

export default function ReembolsoDetail({ reembolso: r, canAuth, onClose, onUpdated }: Props) {
  const { authUser } = useAuth()
  const [detalles,  setDetalles]  = useState<any[]>([])
  const [ccMap,     setCCMap]     = useState<Record<number, string>>({})
  const [secMap,    setSecMap]    = useState<Record<number, string>>({})
  const [frtMap,    setFrtMap]    = useState<Record<number, string>>({})
  const [notasAuth, setNotasAuth] = useState('')
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    Promise.all([
      dbComp.from('reembolsos_detalle').select('*').eq('id_reembolso_fk', r.id).eq('activo', true),
      dbCfg.from('centros_costo').select('id, nombre'),
      dbCfg.from('secciones').select('id, nombre'),
      dbCfg.from('frentes').select('id, nombre'),
    ]).then(([det, cc, sec, frt]) => {
      setDetalles(det.data ?? [])
      const toMap = (arr: any[]) => Object.fromEntries((arr ?? []).map((x: any) => [x.id, x.nombre]))
      setCCMap(toMap(cc.data ?? []))
      setSecMap(toMap(sec.data ?? []))
      setFrtMap(toMap(frt.data ?? []))
    })
  }, [r.id])

  const handleAuth = async (aprobado: boolean) => {
    setLoading(true)
    if (aprobado) {
      // 1. Actualizar reembolso
      await dbComp.from('reembolsos').update({
        status:     'Autorizado',
        notas_auth: notasAuth.trim() || null,
      }).eq('id', r.id)

      // 2. Generar OP automática al usuario como beneficiario
      const { count: folioCount } = await dbComp.from('ordenes_pago').select('id', { count: 'exact', head: true })
      const folio = folioGen('OP', Number(folioCount ?? 0) + 1)

      const { data: opData } = await dbComp.from('ordenes_pago').insert({
        folio,
        concepto:         `Reembolso caja chica ${r.folio ?? '#' + r.id} — ${r.usuario_nombre ?? r.id_usuario_fk}`,
        monto:            r.total,
        fecha_vencimiento: new Date().toISOString().slice(0, 10),
        forma_pago:       'Cheque',
        status:           'Pendiente',      // ya autorizado, va directo a CXP
        tipo_op:          'Reembolso',
        id_reembolso_fk:  r.id,
        // CC/Sección/Frente = null (la trazabilidad está en reembolsos_detalle)
        id_centro_costo_fk: null,
        id_seccion_fk:      null,
        id_frente_fk:       null,
        created_by:       authUser?.nombre ?? null,
      }).select('id').single()

      // 3. Enlazar OP al reembolso
      if (opData) {
        await dbComp.from('reembolsos').update({ id_op_fk: opData.id, status: 'Autorizado' }).eq('id', r.id)
      }

    } else {
      await dbComp.from('reembolsos').update({
        status:     'Rechazado',
        notas_auth: notasAuth.trim() || null,
      }).eq('id', r.id)
    }
    setLoading(false)
    onUpdated()
  }

  const canAuthorize = canAuth && r.status === 'Pendiente Auth'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>
              {r.folio ?? `Reembolso #${r.id}`}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${r.status === 'Pagado' ? 'badge-vendido' : r.status === 'Autorizado' ? 'badge-libre' : r.status === 'Pendiente Auth' ? 'badge-bloqueado' : r.status === 'Rechazado' ? 'badge-cancelado' : 'badge-default'}`}>
                {r.status}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.fecha}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.usuario_nombre ?? r.id_usuario_fk}</span>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Observaciones */}
          {r.observaciones && (
            <div style={{ padding: '10px 14px', background: 'var(--surface-700)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              {r.observaciones}
            </div>
          )}

          {/* Detalle de gastos */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              Detalle de gastos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detalles.map((d, i) => (
                <div key={i} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-700)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.concepto}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: (CAT_COLORS[d.categoria] ?? '#475569') + '20', color: CAT_COLORS[d.categoria] ?? '#475569', fontWeight: 600 }}>
                          {d.categoria}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.tipo_comprobante}</span>
                        {d.num_comprobante && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{d.num_comprobante}</span>}
                      </div>
                      {/* CC-Sección-Frente */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {d.id_centro_costo_fk && <span style={{ fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 7px', borderRadius: 10 }}>{ccMap[d.id_centro_costo_fk]}</span>}
                        {d.id_seccion_fk      && <span style={{ fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 7px', borderRadius: 10 }}>{secMap[d.id_seccion_fk]}</span>}
                        {d.id_frente_fk       && <span style={{ fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 7px', borderRadius: 10 }}>{frtMap[d.id_frente_fk]}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold-light)' }}>
                        ${(d.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                      {d.url_comprobante && (
                        <a href={d.url_comprobante} target="_blank" rel="noreferrer"
                          style={{ fontSize: 11, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                          <ExternalLink size={10} /> Ver comprobante
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold-light)' }}>
                ${(r.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* OP generada */}
          {r.id_op_fk && (
            <div style={{ padding: '10px 14px', background: '#0f2a1a', border: '1px solid #166534', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={14} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: 13, color: '#4ade80' }}>OP generada: #{r.id_op_fk}</span>
            </div>
          )}

          {/* Notas de auth si ya fue procesado */}
          {r.notas_auth && (
            <div style={{ padding: '10px 14px', background: 'var(--surface-700)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notas del autorizador</div>
              <div style={{ fontSize: 13 }}>{r.notas_auth}</div>
            </div>
          )}

          {/* Sección de autorización */}
          {canAuthorize && (
            <div style={{ padding: '14px', background: '#1a1a2e', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                Autorización
              </div>
              <textarea className="input" rows={2} value={notasAuth} onChange={e => setNotasAuth(e.target.value)}
                placeholder="Comentario opcional (rechazo o aprobación)…"
                style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ color: '#dc2626', borderColor: '#dc2626' }}
                  onClick={() => handleAuth(false)} disabled={loading}>
                  <XCircle size={13} /> Rechazar
                </button>
                <button className="btn-primary" onClick={() => handleAuth(true)} disabled={loading}>
                  <CheckCircle size={13} /> Autorizar y generar OP
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
