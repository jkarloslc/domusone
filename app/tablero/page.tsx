'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  LayoutDashboard, Send, Loader, RefreshCw, User, MessageCircle, Search,
} from 'lucide-react'

type UsuarioRow = { id: string; nombre: string; rol: string; activo: boolean | null }
type MensajeRow = {
  id: number
  remitente_id: string
  destinatario_id: string
  remitente_nombre: string | null
  cuerpo: string
  leido_en: string | null
  created_at: string
}

type ThreadPreview = {
  partnerId: string
  partnerNombre: string
  last: MensajeRow
  unread: number
}

export default function TableroPage() {
  const { authUser } = useAuth()
  const myId = authUser?.user?.id ?? ''

  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([])
  const [mensajes, setMensajes] = useState<MensajeRow[]>([])
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [searchU, setSearchU] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const nombreMap = useMemo(() => {
    const m: Record<string, string> = {}
    usuarios.forEach(u => { m[u.id] = u.nombre })
    return m
  }, [usuarios])

  const fetchUsuarios = useCallback(async () => {
    setLoadingUsers(true)
    const { data, error: e } = await dbCfg.from('usuarios')
      .select('id, nombre, rol, activo')
      .eq('activo', true)
      .order('nombre')
    if (e) setError(e.message)
    setUsuarios((data ?? []) as UsuarioRow[])
    setLoadingUsers(false)
  }, [])

  const fetchMensajes = useCallback(async () => {
    if (!myId) return
    setLoadingMsgs(true)
    setError('')
    const { data, error: e } = await dbCtrl.from('mensajes_internos')
      .select('id, remitente_id, destinatario_id, remitente_nombre, cuerpo, leido_en, created_at')
      .or(`remitente_id.eq.${myId},destinatario_id.eq.${myId}`)
      .order('created_at', { ascending: true })
    if (e) setError(e.message)
    setMensajes((data ?? []) as MensajeRow[])
    setLoadingMsgs(false)
  }, [myId])

  useEffect(() => { fetchUsuarios() }, [fetchUsuarios])
  useEffect(() => { fetchMensajes() }, [fetchMensajes])

  const threads = useMemo((): ThreadPreview[] => {
    if (!myId) return []
    const byPartner = new Map<string, { last: MensajeRow; unread: number }>()
    for (const m of mensajes) {
      const other = m.remitente_id === myId ? m.destinatario_id : m.remitente_id
      const unreadInc = m.destinatario_id === myId && !m.leido_en ? 1 : 0
      const cur = byPartner.get(other)
      if (!cur) {
        byPartner.set(other, { last: m, unread: unreadInc })
      } else {
        const newer = new Date(m.created_at) > new Date(cur.last.created_at)
        byPartner.set(other, {
          last: newer ? m : cur.last,
          unread: cur.unread + unreadInc,
        })
      }
    }
    return Array.from(byPartner.entries())
      .map(([pid, v]) => ({
        partnerId: pid,
        partnerNombre: nombreMap[pid] ?? 'Usuario',
        last: v.last,
        unread: v.unread,
      }))
      .sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime())
  }, [mensajes, myId, nombreMap])

  useEffect(() => {
    if (!partnerId || !myId || loadingMsgs) return
    ;(async () => {
      const { data } = await dbCtrl.from('mensajes_internos').select('id')
        .eq('destinatario_id', myId)
        .eq('remitente_id', partnerId)
        .is('leido_en', null)
      const ids = (data ?? []).map((r: { id: number }) => r.id)
      if (ids.length === 0) return
      const now = new Date().toISOString()
      const { error: uErr } = await dbCtrl.from('mensajes_internos').update({ leido_en: now }).in('id', ids)
      if (!uErr) setMensajes(prev => prev.map(m => (ids.includes(m.id) ? { ...m, leido_en: now } : m)))
    })()
  }, [partnerId, myId, loadingMsgs])

  const mensajesThread = useMemo(() => {
    if (!partnerId || !myId) return []
    return mensajes.filter(
      m =>
        (m.remitente_id === myId && m.destinatario_id === partnerId) ||
        (m.remitente_id === partnerId && m.destinatario_id === myId)
    )
  }, [mensajes, myId, partnerId])

  const enviar = async () => {
    const t = draft.trim()
    if (!t || !partnerId || !authUser || !myId) return
    setSending(true)
    setError('')
    const { data, error: e } = await dbCtrl.from('mensajes_internos').insert({
      remitente_id: myId,
      destinatario_id: partnerId,
      remitente_nombre: authUser.nombre,
      cuerpo: t,
    }).select('id, remitente_id, destinatario_id, remitente_nombre, cuerpo, leido_en, created_at').single()
    if (e) {
      setError(e.message)
      setSending(false)
      return
    }
    if (data) setMensajes(prev => [...prev, data as MensajeRow])
    setDraft('')
    setSending(false)
  }

  const otrosUsuarios = useMemo(() => {
    const q = searchU.trim().toLowerCase()
    return usuarios
      .filter(u => u.id !== myId)
      .filter(u => !q || u.nombre.toLowerCase().includes(q) || u.rol.toLowerCase().includes(q))
  }, [usuarios, myId, searchU])

  const partnerNombre = partnerId ? (nombreMap[partnerId] ?? 'Usuario') : ''

  if (!authUser) return null

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 8 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #2563eb18, #0891b218)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <LayoutDashboard size={24} style={{ color: 'var(--blue)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, margin: 0 }}>
            Mi Tablero
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
            Mensajería interna entre usuarios de DomusOne
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => { fetchMensajes(); fetchUsuarios() }} title="Actualizar">
          <RefreshCw size={15} className={loadingMsgs ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(0, 1.4fr)', gap: 16, minHeight: 480 }}>
        {/* Columna izquierda: conversaciones + nuevo */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--blue)', textTransform: 'uppercase' }}>
            Conversaciones
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', borderBottom: '1px solid #e2e8f0' }}>
            {loadingMsgs && threads.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={18} className="animate-spin" /></div>
            ) : threads.length === 0 ? (
              <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                No hay mensajes aún. Elige un compañero abajo para iniciar.
              </div>
            ) : (
              threads.map(th => (
                <button
                  key={th.partnerId}
                  type="button"
                  onClick={() => setPartnerId(th.partnerId)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid #f1f5f9',
                    background: partnerId === th.partnerId ? '#eff6ff' : 'transparent', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{th.partnerNombre}</span>
                    {th.unread > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 10, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
                        {th.unread}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {th.last.remitente_id === myId ? 'Tú: ' : ''}{th.last.cuerpo}
                  </div>
                </button>
              ))
            )}
          </div>
          <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Escribir a…
          </div>
          <div style={{ padding: '0 12px 8px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" style={{ paddingLeft: 30, fontSize: 13 }} placeholder="Buscar por nombre o rol…"
                value={searchU} onChange={e => setSearchU(e.target.value)} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 220, padding: '0 8px 12px' }}>
            {loadingUsers ? (
              <div style={{ padding: 16, textAlign: 'center' }}><Loader size={16} className="animate-spin" /></div>
            ) : (
              otrosUsuarios.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setPartnerId(u.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 8, border: 'none', background: partnerId === u.id ? '#f0fdf4' : 'transparent',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={14} style={{ color: '#64748b' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.nombre}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{u.rol}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Columna derecha: hilo */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 480 }}>
          {!partnerId ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>
              <MessageCircle size={40} style={{ opacity: 0.35, marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Selecciona una conversación o un usuario</div>
              <div style={{ fontSize: 12, marginTop: 6, maxWidth: 320 }}>El hilo muestra solo mensajes entre tú y esa persona.</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={16} style={{ color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{partnerNombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mensajes internos</div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc' }}>
                {mensajesThread.map(m => {
                  const mine = m.remitente_id === myId
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '82%', padding: '10px 14px', borderRadius: 12,
                        background: mine ? '#2563eb' : '#fff',
                        color: mine ? '#fff' : 'var(--text-primary)',
                        border: mine ? 'none' : '1px solid #e2e8f0',
                        boxShadow: mine ? '0 1px 4px rgba(37,99,235,0.25)' : '0 1px 2px rgba(0,0,0,0.04)',
                      }}>
                        {!mine && (
                          <div style={{ fontSize: 10, opacity: 0.85, marginBottom: 4 }}>{m.remitente_nombre ?? '—'}</div>
                        )}
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.cuerpo}</div>
                        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 6, textAlign: mine ? 'right' : 'left' }}>
                          {new Date(m.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '14px 18px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Escribe un mensaje…"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    style={{ flex: 1, resize: 'vertical', fontSize: 13 }}
                    disabled={sending}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        enviar()
                      }
                    }}
                  />
                  <button type="button" className="btn-primary" style={{ padding: '10px 16px' }} disabled={sending || !draft.trim()} onClick={enviar}>
                    {sending ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>Enter envía · Shift+Enter nueva línea</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
