'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCtrl, dbCat } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  MessageSquare, Plus, Eye, Send, RefreshCw, X, Loader,
  Search, CheckCircle, AlertTriangle, Mail, Users,
  FileText, Clock, Trash2, ChevronDown
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────
const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const TIPOS = ['Aviso', 'Comunicado', 'Urgente'] as const
type Tipo = typeof TIPOS[number]

const TIPO_COLOR: Record<Tipo, { bg: string; color: string; border: string }> = {
  Aviso:       { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  Comunicado:  { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  Urgente:     { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const TipoBadge = ({ tipo }: { tipo: string }) => {
  const t = tipo as Tipo
  const c = TIPO_COLOR[t] ?? { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
      background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {tipo}
    </span>
  )
}

// HTML template para email
const buildEmailHtml = (titulo: string, cuerpo: string, tipo: string, fromName: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
  .header { background: ${tipo === 'Urgente' ? '#dc2626' : tipo === 'Comunicado' ? '#15803d' : '#1d4ed8'}; padding: 24px 32px; color: #fff; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
  .header .tipo { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; opacity: .8; margin-bottom: 6px; }
  .body { padding: 28px 32px; font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap; }
  .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="tipo">${tipo}</div>
    <h1>${titulo}</h1>
  </div>
  <div class="body">${cuerpo.replace(/\n/g, '<br>')}</div>
  <div class="footer">${fromName} &nbsp;·&nbsp; Este correo fue enviado automáticamente, por favor no responder directamente.</div>
</div>
</body>
</html>`

// ══════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function ComunicadosPage() {
  const { authUser } = useAuth()
  const [comunicados, setComunicados] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [modalNew, setModalNew]       = useState(false)
  const [envioModal, setEnvioModal]   = useState<any | null>(null)
  const [detailModal, setDetailModal] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCtrl.from('comunicados')
      .select('*').order('created_at', { ascending: false })
    setComunicados(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este comunicado? Se borrarán también sus registros de envío.')) return
    await dbCtrl.from('comunicados').delete().eq('id', id)
    fetchData()
  }

  const enviados   = comunicados.filter(c => c.estado === 'Enviado').length
  const borradores = comunicados.filter(c => c.estado === 'Borrador').length

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <MessageSquare size={16} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Residencial</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Comunicados y Avisos</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            Crea y envía comunicados por correo a propietarios individualmente o de forma masiva
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData} style={{ padding: '8px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn-primary" onClick={() => setModalNew(true)}>
            <Plus size={14} /> Nuevo Comunicado
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '12px 20px', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={15} style={{ color: '#15803d' }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>{enviados}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Enviados</div>
          </div>
        </div>
        <div className="card" style={{ padding: '12px 20px', background: '#fff7ed', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={15} style={{ color: '#d97706' }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>{borradores}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Borradores</div>
          </div>
        </div>
        <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mail size={15} style={{ color: 'var(--blue)' }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>
              {comunicados.reduce((a, c) => a + (c.total_envios ?? 0), 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Correos enviados</div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Enviados</th>
              <th>Creado por</th>
              <th>Fecha</th>
              <th style={{ width: 130 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : comunicados.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Sin comunicados. Haz clic en "Nuevo Comunicado" para empezar.
              </td></tr>
            ) : comunicados.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600, fontSize: 14 }}>{c.titulo}</td>
                <td><TipoBadge tipo={c.tipo} /></td>
                <td>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: c.estado === 'Enviado' ? '#f0fdf4' : '#fff7ed',
                    color: c.estado === 'Enviado' ? '#15803d' : '#d97706',
                    border: `1px solid ${c.estado === 'Enviado' ? '#bbf7d0' : '#fed7aa'}`,
                  }}>{c.estado}</span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--blue)' }}>
                  {c.total_envios ?? 0}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.created_by ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(c.created_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px', color: '#0891b2' }}
                      onClick={() => setDetailModal(c)} title="Ver envíos">
                      <Eye size={13} />
                    </button>
                    <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => setEnvioModal(c)} title="Enviar">
                      <Send size={12} /> Enviar
                    </button>
                    {c.estado === 'Borrador' && (
                      <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }}
                        onClick={() => handleDelete(c.id)} title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      {modalNew && (
        <NuevoComunicadoModal
          authUser={authUser}
          onClose={() => setModalNew(false)}
          onSaved={() => { setModalNew(false); fetchData() }}
        />
      )}
      {envioModal && (
        <EnvioModal
          comunicado={envioModal}
          authUser={authUser}
          onClose={() => { setEnvioModal(null); fetchData() }}
        />
      )}
      {detailModal && (
        <EnviosDetailModal
          comunicado={detailModal}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal Nuevo Comunicado
// ══════════════════════════════════════════════════════════════
function NuevoComunicadoModal({ authUser, onClose, onSaved }:
  { authUser: any; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({ titulo: '', cuerpo: '', tipo: 'Aviso' as Tipo })

  const handleSave = async () => {
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return }
    if (!form.cuerpo.trim()) { setError('El cuerpo del comunicado es obligatorio'); return }
    setSaving(true); setError('')
    const { error: err } = await dbCtrl.from('comunicados').insert({
      titulo:     form.titulo.trim(),
      cuerpo:     form.cuerpo.trim(),
      tipo:       form.tipo,
      estado:     'Borrador',
      created_by: authUser?.nombre ?? null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={14} style={{ color: 'var(--blue)' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>Nuevo Comunicado</h2>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label className="label">Título *</label>
              <input className="input" value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="ej. Aviso de mantenimiento programado" autoFocus />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Tipo }))}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Cuerpo del comunicado *</label>
            <textarea className="input" rows={8} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              value={form.cuerpo}
              onChange={e => setForm(f => ({ ...f, cuerpo: e.target.value }))}
              placeholder="Escribe el contenido del aviso o comunicado aquí…" />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              El texto se enviará con formato de correo electrónico.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <FileText size={13} />}
            Guardar Borrador
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal Envío — Individual o Masivo
// ══════════════════════════════════════════════════════════════
function EnvioModal({ comunicado, authUser, onClose }:
  { comunicado: any; authUser: any; onClose: () => void }) {
  const [tab, setTab]                 = useState<'individual'|'masivo'>('individual')
  const [search, setSearch]           = useState('')
  const [results, setResults]         = useState<any[]>([])
  const [searching, setSearching]     = useState(false)
  const [selectedProp, setSelectedProp] = useState<any | null>(null)
  const [correos, setCorreos]         = useState<any[]>([])
  const [selectedCorreo, setSelectedCorreo] = useState<string>('')
  const [masivoList, setMasivoList]   = useState<any[]>([])
  const [loadingMasivo, setLoadingMasivo] = useState(false)
  const [sending, setSending]         = useState(false)
  const [progress, setProgress]       = useState(0)
  const [done, setDone]               = useState(false)
  const [error, setError]             = useState('')
  const searchTimer = useRef<NodeJS.Timeout>()

  // Buscar propietarios por nombre
  useEffect(() => {
    if (tab !== 'individual') return
    if (search.length < 2) { setResults([]); return }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await dbCat.from('propietarios')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .or(`nombre.ilike.%${search}%,apellido_paterno.ilike.%${search}%`)
        .limit(8)
      setResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [search, tab])

  // Cargar correos al seleccionar propietario
  const selectPropietario = async (prop: any) => {
    setSelectedProp(prop)
    setResults([])
    setSearch('')
    const { data } = await dbCat.from('propietarios_correos')
      .select('id, correo, tipo').eq('id_propietario_fk', prop.id).eq('activo', true)
    setCorreos(data ?? [])
    setSelectedCorreo(data?.[0]?.correo ?? '')
  }

  // Cargar lista masiva
  useEffect(() => {
    if (tab !== 'masivo') return
    setLoadingMasivo(true)
    dbCat.from('propietarios_correos')
      .select('id, correo, tipo, id_propietario_fk')
      .eq('activo', true)
      .then(async ({ data: emailRows }) => {
        const rows = emailRows ?? []
        const propIds = Array.from(new Set(rows.map((r: any) => r.id_propietario_fk).filter(Boolean)))
        let propMap: Record<number, string> = {}
        if (propIds.length) {
          const { data: props } = await dbCat.from('propietarios')
            .select('id, nombre, apellido_paterno').in('id', propIds)
          ;(props ?? []).forEach((p: any) => {
            propMap[p.id] = [p.nombre, p.apellido_paterno].filter(Boolean).join(' ')
          })
        }
        setMasivoList(rows.map((r: any) => ({
          ...r,
          nombre: propMap[r.id_propietario_fk] ?? '—'
        })))
        setLoadingMasivo(false)
      })
  }, [tab])

  const nombreProp = (p: any) => [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')

  // Envío individual
  const sendIndividual = async () => {
    if (!selectedProp || !selectedCorreo) { setError('Selecciona un propietario y correo destino'); return }
    setSending(true); setError('')

    const html = buildEmailHtml(comunicado.titulo, comunicado.cuerpo, comunicado.tipo, 'DomusOne')

    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: selectedCorreo, subject: `[${comunicado.tipo}] ${comunicado.titulo}`, html }),
    })
    const json = await res.json()

    if (!res.ok) { setError(json.error ?? 'Error al enviar'); setSending(false); return }

    // Registrar envío
    await dbCtrl.from('comunicados_envios').insert({
      id_comunicado_fk:  comunicado.id,
      id_propietario_fk: selectedProp.id,
      correo_destino:    selectedCorreo,
      nombre_destino:    nombreProp(selectedProp),
      status:            'Enviado',
    })
    await dbCtrl.from('comunicados').update({
      estado:       'Enviado',
      total_envios: (comunicado.total_envios ?? 0) + 1,
      updated_at:   new Date().toISOString(),
    }).eq('id', comunicado.id)

    setSending(false); setDone(true)
  }

  // Envío masivo
  const sendMasivo = async () => {
    if (masivoList.length === 0) { setError('No hay correos disponibles'); return }
    setSending(true); setError(''); setProgress(0)

    let enviados = 0
    for (let i = 0; i < masivoList.length; i++) {
      const dest = masivoList[i]
      const html = buildEmailHtml(comunicado.titulo, comunicado.cuerpo, comunicado.tipo, 'DomusOne')
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: dest.correo, subject: `[${comunicado.tipo}] ${comunicado.titulo}`, html }),
        })
        const json = await res.json()
        await dbCtrl.from('comunicados_envios').insert({
          id_comunicado_fk:  comunicado.id,
          id_propietario_fk: dest.id_propietario_fk,
          correo_destino:    dest.correo,
          nombre_destino:    dest.nombre,
          status:            res.ok ? 'Enviado' : 'Error',
          error_msg:         res.ok ? null : (json.error ?? 'Error'),
        })
        if (res.ok) enviados++
      } catch (e: any) {
        await dbCtrl.from('comunicados_envios').insert({
          id_comunicado_fk: comunicado.id,
          correo_destino:   dest.correo,
          nombre_destino:   dest.nombre,
          status:           'Error',
          error_msg:        e.message,
        })
      }
      setProgress(Math.round(((i + 1) / masivoList.length) * 100))
    }

    await dbCtrl.from('comunicados').update({
      estado:       'Enviado',
      total_envios: (comunicado.total_envios ?? 0) + enviados,
      updated_at:   new Date().toISOString(),
    }).eq('id', comunicado.id)

    setSending(false); setDone(true)
  }

  return (
    <div className="modal-overlay" onClick={e => !sending && e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginBottom: 2 }}>{comunicado.titulo}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <TipoBadge tipo={comunicado.tipo} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Envío de comunicado</span>
            </div>
          </div>
          {!sending && <button className="btn-ghost" onClick={onClose}><X size={16} /></button>}
        </div>

        {done ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <CheckCircle size={48} style={{ color: '#15803d', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>¡Enviado correctamente!</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              {tab === 'individual'
                ? `El comunicado fue enviado a ${selectedCorreo}`
                : `El comunicado fue enviado a ${masivoList.length} destinatario(s)`}
            </div>
            <button className="btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              {(['individual', 'masivo'] as const).map(t => (
                <button key={t} onClick={() => !sending && setTab(t)}
                  style={{ flex: 1, padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: tab === t ? 600 : 400,
                    color: tab === t ? 'var(--blue)' : 'var(--text-muted)',
                    borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
                  {t === 'individual' ? <><Mail size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Individual</>
                    : <><Users size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Envío Masivo</>}
                </button>
              ))}
            </div>

            <div style={{ padding: '20px 24px', minHeight: 240 }}>
              {error && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
                  {error}
                </div>
              )}

              {/* ── Tab Individual ── */}
              {tab === 'individual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="label">Buscar propietario</label>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      {searching && <Loader size={12} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />}
                      <input className="input" style={{ paddingLeft: 30 }} placeholder="Nombre del propietario…"
                        value={search} onChange={e => { setSearch(e.target.value); setSelectedProp(null); setCorreos([]) }} />
                    </div>
                    {results.length > 0 && (
                      <div className="card" style={{ position: 'absolute', zIndex: 10, marginTop: 2, minWidth: 300, padding: '4px 0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                        {results.map(p => (
                          <button key={p.id} onClick={() => selectPropietario(p)}
                            style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            {nombreProp(p)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedProp && (
                    <>
                      <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle size={14} style={{ color: 'var(--blue)' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{nombreProp(selectedProp)}</span>
                      </div>

                      {correos.length === 0 ? (
                        <div style={{ padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                          ⚠ Este propietario no tiene correos registrados
                        </div>
                      ) : (
                        <div>
                          <label className="label">Correo destino</label>
                          <select className="select" value={selectedCorreo} onChange={e => setSelectedCorreo(e.target.value)}>
                            {correos.map(c => (
                              <option key={c.id} value={c.correo}>{c.correo} ({c.tipo})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Tab Masivo ── */}
              {tab === 'masivo' && (
                <div>
                  {loadingMasivo ? (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                      <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: '14px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 14 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>
                          <Users size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                          {masivoList.length} destinatarios
                        </div>
                        <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
                          Se enviará un correo a cada dirección registrada en propietarios activos
                        </div>
                      </div>

                      {/* Preview de destinatarios (los primeros 5) */}
                      {masivoList.slice(0, 5).map((d, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                          <Mail size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          <span style={{ fontWeight: 500 }}>{d.nombre}</span>
                          <span style={{ color: 'var(--text-muted)', flex: 1 }}>{d.correo}</span>
                        </div>
                      ))}
                      {masivoList.length > 5 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0', textAlign: 'center' }}>
                          … y {masivoList.length - 5} más
                        </div>
                      )}

                      {sending && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                            <span>Enviando…</span>
                            <span>{progress}%</span>
                          </div>
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--blue)', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
              <button className="btn-secondary" onClick={onClose} disabled={sending}>Cancelar</button>
              <button className="btn-primary"
                onClick={tab === 'individual' ? sendIndividual : sendMasivo}
                disabled={sending || (tab === 'individual' && (!selectedProp || !selectedCorreo)) || (tab === 'masivo' && masivoList.length === 0)}>
                {sending
                  ? <><Loader size={13} className="animate-spin" /> Enviando…</>
                  : <><Send size={13} /> {tab === 'masivo' ? `Enviar a ${masivoList.length} destinatarios` : 'Enviar correo'}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal Detalle de Envíos
// ══════════════════════════════════════════════════════════════
function EnviosDetailModal({ comunicado, onClose }: { comunicado: any; onClose: () => void }) {
  const [envios, setEnvios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbCtrl.from('comunicados_envios').select('*')
      .eq('id_comunicado_fk', comunicado.id)
      .order('fecha_envio', { ascending: false })
      .then(({ data }) => { setEnvios(data ?? []); setLoading(false) })
  }, [comunicado.id])

  const exitosos = envios.filter(e => e.status === 'Enviado').length
  const errores  = envios.filter(e => e.status === 'Error').length

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{comunicado.titulo}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <TipoBadge tipo={comunicado.tipo} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Historial de envíos</span>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {envios.length > 0 && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 24px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>✓ {exitosos} enviados</span>
            {errores > 0 && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>✗ {errores} con error</span>}
          </div>
        )}

        <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 160px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
            </div>
          ) : envios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin envíos registrados</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {envios.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 13 }}>{e.nombre_destino ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.correo_destino}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(e.fecha_envio)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                        background: e.status === 'Enviado' ? '#f0fdf4' : '#fef2f2',
                        color: e.status === 'Enviado' ? '#15803d' : '#dc2626',
                        border: `1px solid ${e.status === 'Enviado' ? '#bbf7d0' : '#fecaca'}`,
                      }}>{e.status}</span>
                      {e.error_msg && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{e.error_msg}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
