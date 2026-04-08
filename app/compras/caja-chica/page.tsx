'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Wallet, Plus, Eye, Edit2, CheckCircle, Clock, AlertTriangle, Ban, DollarSign, Users } from 'lucide-react'
import FondoModal from './FondoModal'
import ReembolsoModal from './ReembolsoModal'
import ReembolsoDetail from './ReembolsoDetail'

const STATUS_COLORS: Record<string, string> = {
  'Borrador':       'badge-default',
  'Pendiente Auth': 'badge-bloqueado',
  'Autorizado':     'badge-libre',
  'Pagado':         'badge-vendido',
  'Rechazado':      'badge-cancelado',
}
const STATUS_ICONS: Record<string, React.ReactNode> = {
  'Borrador':       <Clock size={11} />,
  'Pendiente Auth': <AlertTriangle size={11} />,
  'Autorizado':     <CheckCircle size={11} />,
  'Pagado':         <DollarSign size={11} />,
  'Rechazado':      <Ban size={11} />,
}

export default function CajaChicaPage() {
  const { authUser, canAuth } = useAuth()
  const isAdmin = authUser?.rol === 'superadmin' || authUser?.rol === 'admin' || authUser?.rol === 'compras_supervisor'

  const [fondos,      setFondos]      = useState<any[]>([])
  const [reembolsos,  setReembolsos]  = useState<any[]>([])
  const [fondoModal,  setFondoModal]  = useState<{ open: boolean; fondo?: any }>({ open: false })
  const [remModal,    setRemModal]    = useState<{ open: boolean; rem?: any; fondo?: any }>({ open: false })
  const [detail,      setDetail]      = useState<any | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [tab, setTab] = useState<'reembolsos' | 'fondos'>('reembolsos')

  // Fondo activo del usuario actual (si existe)
  const [misFondos, setMisFondos] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    const uid = authUser?.user?.id ?? ''
    const [remQ, fondosQ] = await Promise.all([
      isAdmin
        ? dbComp.from('reembolsos').select('*').eq('activo', true).order('created_at', { ascending: false })
        : dbComp.from('reembolsos').select('*').eq('id_usuario_fk', uid).eq('activo', true).order('created_at', { ascending: false }),
      dbComp.from('fondos_caja_chica').select('*').eq('activo', true).order('created_at', { ascending: false }),
    ])
    setReembolsos(remQ.data ?? [])
    setFondos(fondosQ.data ?? [])
    setMisFondos((fondosQ.data ?? []).filter((f: any) => f.id_usuario_fk === uid && f.status === 'Activo'))
  }, [authUser, isAdmin])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = reembolsos.filter(r => !filterStatus || r.status === filterStatus)

  // Stats
  const pendAuth  = reembolsos.filter(r => r.status === 'Pendiente Auth').length
  const autorizados = reembolsos.filter(r => r.status === 'Autorizado').length
  const totalPendiente = reembolsos.filter(r => r.status === 'Pendiente Auth' || r.status === 'Autorizado')
    .reduce((a, r) => a + (r.total ?? 0), 0)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Wallet size={16} style={{ color: '#d97706' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Compras</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Caja Chica</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Fondos y reembolsos de gastos menores</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {misFondos.length > 0 && (
            <button className="btn-primary" onClick={() => setRemModal({ open: true, fondo: misFondos[0] })}>
              <Plus size={13} /> Nuevo Reembolso
            </button>
          )}
          {isAdmin && (
            <button className="btn-primary" onClick={() => setFondoModal({ open: true })}>
              <Plus size={13} /> Asignar Fondo
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Pendientes auth.',  value: pendAuth,     color: '#d97706', icon: <AlertTriangle size={15} /> },
          { label: 'Autorizados',       value: autorizados,  color: '#059669', icon: <CheckCircle size={15} /> },
          { label: 'Total por pagar',   value: `$${totalPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            color: '#0891b2', icon: <DollarSign size={15} /> },
          ...(isAdmin ? [{ label: 'Fondos activos', value: fondos.filter(f => f.status === 'Activo').length, color: '#7c3aed', icon: <Users size={15} /> }] : []),
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
            <div style={{ color: s.color }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs (admin) */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {(['reembolsos', 'fondos'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
                color: tab === t ? 'var(--gold)' : 'var(--text-muted)', cursor: 'pointer', textTransform: 'capitalize' }}>
              {t === 'reembolsos' ? 'Reembolsos' : 'Fondos Asignados'}
            </button>
          ))}
        </div>
      )}

      {/* Tab: Fondos (admin) */}
      {tab === 'fondos' && isAdmin && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th><th>Monto Asignado</th><th>Apertura</th><th>Cierre</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {fondos.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin fondos registrados</td></tr>
                : fondos.map(f => (
                  <tr key={f.id}>
                    <td><div style={{ fontWeight: 600 }}>{f.usuario_nombre ?? f.id_usuario_fk}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.id_usuario_fk}</div></td>
                    <td style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>${(f.monto_asignado ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontSize: 13 }}>{f.fecha_apertura}</td>
                    <td style={{ fontSize: 13 }}>{f.fecha_cierre ?? <span style={{ color: 'var(--text-muted)' }}>Abierto</span>}</td>
                    <td><span className={`badge ${f.status === 'Activo' ? 'badge-libre' : 'badge-default'}`}>{f.status}</span></td>
                    <td>
                      <button className="btn-ghost" style={{ padding: '4px 8px' }}
                        onClick={() => setFondoModal({ open: true, fondo: f })}>
                        <Edit2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Reembolsos */}
      {tab === 'reembolsos' && (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['', 'Borrador', 'Pendiente Auth', 'Autorizado', 'Pagado', 'Rechazado'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={filterStatus === s ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: 12, padding: '5px 12px' }}>
                {s || 'Todos'}
              </button>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Folio</th><th>Usuario</th><th>Fecha</th><th>Total</th><th>Ítems</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin reembolsos</td></tr>
                  : filtered.map(r => (
                    <tr key={r.id} style={{ opacity: r.status === 'Rechazado' ? 0.5 : 1 }}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.folio ?? `#${r.id}`}</td>
                      <td style={{ fontSize: 13 }}>{r.usuario_nombre ?? r.id_usuario_fk}</td>
                      <td style={{ fontSize: 13 }}>{r.fecha}</td>
                      <td style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold-light)' }}>
                        ${(r.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[r.status] ?? 'badge-default'}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {STATUS_ICONS[r.status]}{r.status}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setDetail(r)}>
                          <Eye size={13} />
                        </button>
                        {(r.status === 'Borrador') && (r.id_usuario_fk === authUser?.user?.id || isAdmin) && (
                          <button className="btn-ghost" style={{ padding: '4px 8px' }}
                            onClick={() => setRemModal({ open: true, rem: r })}>
                            <Edit2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modales */}
      {fondoModal.open && (
        <FondoModal
          fondo={fondoModal.fondo}
          onClose={() => setFondoModal({ open: false })}
          onSaved={() => { setFondoModal({ open: false }); fetchData() }}
        />
      )}
      {remModal.open && (
        <ReembolsoModal
          reembolso={remModal.rem}
          fondo={remModal.fondo ?? misFondos[0]}
          authUser={authUser}
          onClose={() => setRemModal({ open: false })}
          onSaved={() => { setRemModal({ open: false }); fetchData() }}
        />
      )}
      {detail && (
        <ReembolsoDetail
          reembolso={detail}
          canAuth={canAuth()}
          onClose={() => setDetail(null)}
          onUpdated={() => { setDetail(null); fetchData() }}
        />
      )}
    </div>
  )
}
