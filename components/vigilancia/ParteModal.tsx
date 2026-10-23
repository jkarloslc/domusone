'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader, Plus, Eye, Edit2, Trash2, Send, Printer, X, User, MessageSquare, Zap } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { Colaborador, nombreCompletoColaborador } from '@/lib/colaboradores'
import NovedadModal from './NovedadModal'
import {
  Parte, Novedad, Tipo, Ubicacion, PLANTILLAS, CRIT_COLOR, STATUS_NOV_COLOR, Pill,
  fmtFecha, fmtHora, hoyISO, horaActual,
} from './tipos'

type Props = {
  parte: Parte | null              // null = nuevo parte
  tipos: Tipo[]
  ubicaciones: Ubicacion[]
  onClose: () => void
  onChanged: () => void
}

export default function ParteModal({ parte, tipos, ubicaciones, onClose, onChanged }: Props) {
  const { authUser, canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('vigilancia-novedades')
  const [actual, setActual] = useState<Parte | null>(parte)
  const cerrado = actual?.status === 'Enviado/Cerrado'
  const soloLectura = !puedeEscribir || cerrado

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    fecha:           parte?.fecha ?? hoyISO(),
    responsable:     parte?.responsable ?? authUser?.nombre ?? '',
    supervisor:      parte?.supervisor ?? '',
    destinatarios:   parte?.destinatarios ?? '',
    resumen:         parte?.resumen ?? '',
    n_vehiculos_adv: parte?.n_vehiculos_adv?.toString() ?? '',
    n_empl_adv:      parte?.n_empl_adv?.toString() ?? '',
    n_empl_bitacora: parte?.n_empl_bitacora?.toString() ?? '',
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [ubicPorNov, setUbicPorNov] = useState<Record<number, string[]>>({})
  const [personal, setPersonal]   = useState<{ id: number; nombre: string; id_colaborador_fk: number | null }[]>([])
  const [colabs, setColabs]       = useState<Colaborador[]>([])
  const [colabQ, setColabQ]       = useState('')
  const [seguimiento, setSeguimiento] = useState<any[]>([])
  const [comentario, setComentario]   = useState('')
  const [novModal, setNovModal] = useState<{ nov: Novedad | null } | null>(null)

  // Valores por defecto de un parte nuevo: supervisor/destinatarios del último parte
  useEffect(() => {
    if (parte) return
    dbCtrl.from('vig_partes').select('supervisor, destinatarios').order('fecha', { ascending: false }).limit(1)
      .then(({ data }) => {
        const u = data?.[0]
        if (u) setForm(f => ({ ...f, supervisor: f.supervisor || u.supervisor || '', destinatarios: f.destinatarios || u.destinatarios || '' }))
      })
  }, [parte])

  useEffect(() => {
    dbCfg.from('colaboradores').select('*').eq('activo', true).eq('puesto', 'Vigilancia').order('nombre')
      .then(({ data }) => setColabs((data ?? []) as Colaborador[]))
  }, [])

  const cargarDetalle = useCallback(async (id: number) => {
    const [n, p, s] = await Promise.all([
      dbCtrl.from('vig_novedades').select('*').eq('id_parte_fk', id).order('hora').order('id'),
      dbCtrl.from('vig_parte_personal').select('id, nombre, id_colaborador_fk').eq('id_parte_fk', id).order('id'),
      dbCtrl.from('vig_seguimiento').select('*').eq('id_parte_fk', id).order('created_at'),
    ])
    const nov = (n.data ?? []) as Novedad[]
    setNovedades(nov)
    setPersonal(p.data ?? [])
    setSeguimiento(s.data ?? [])
    if (nov.length) {
      const { data: nu } = await dbCtrl.from('vig_novedad_ubicaciones').select('id_novedad_fk, id_ubicacion_fk').in('id_novedad_fk', nov.map(x => x.id))
      const map: Record<number, string[]> = {}
      ;(nu ?? []).forEach((r: any) => {
        const nombre = ubicaciones.find(u => u.id === r.id_ubicacion_fk)?.nombre
        if (nombre) (map[r.id_novedad_fk] ??= []).push(nombre)
      })
      setUbicPorNov(map)
    } else setUbicPorNov({})
  }, [ubicaciones])

  useEffect(() => { if (actual) cargarDetalle(actual.id) }, [actual?.id, cargarDetalle])

  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  const guardarEncabezado = async (): Promise<Parte | null> => {
    setSaving(true); setError('')
    const payload = {
      responsable:     form.responsable.trim() || null,
      supervisor:      form.supervisor.trim() || null,
      destinatarios:   form.destinatarios.trim() || null,
      resumen:         form.resumen.trim() || null,
      n_vehiculos_adv: num(form.n_vehiculos_adv),
      n_empl_adv:      num(form.n_empl_adv),
      n_empl_bitacora: num(form.n_empl_bitacora),
      updated_at:      new Date().toISOString(),
    }
    const q = actual
      ? dbCtrl.from('vig_partes').update(payload).eq('id', actual.id).select('*').single()
      : dbCtrl.from('vig_partes').insert({ ...payload, fecha: form.fecha, captured_by: authUser?.nombre ?? null, captured_by_id: authUser?.user.id ?? null }).select('*').single()
    const { data, error: err } = await q
    setSaving(false)
    if (err || !data) {
      setError(err?.code === '23505' ? `Ya existe un parte para ${fmtFecha(form.fecha)}` : (err?.message ?? 'No se pudo guardar'))
      return null
    }
    setActual(data as Parte)
    onChanged()
    return data as Parte
  }

  const enviar = async () => {
    if (novedades.some(n => n.status === 'Abierto') &&
        !confirm('Hay novedades en status Abierto. ¿Enviar y cerrar el parte de todos modos?')) return
    const p = await guardarEncabezado()
    if (!p) return
    const { error: err } = await dbCtrl.from('vig_partes').update({ status: 'Enviado/Cerrado', enviado_at: new Date().toISOString() }).eq('id', p.id)
    if (err) { setError(err.message); return }
    onChanged(); onClose()
  }

  const reabrir = async () => {
    if (!actual || !confirm('¿Reabrir el parte para editarlo?')) return
    const { data, error: err } = await dbCtrl.from('vig_partes').update({ status: 'Borrador', enviado_at: null }).eq('id', actual.id).select('*').single()
    if (err) { setError(err.message); return }
    setActual(data as Parte); onChanged()
  }

  // ── Personal de turno ──
  const addPersonal = async (nombre: string, idColab: number | null) => {
    if (!actual || !nombre.trim()) return
    await dbCtrl.from('vig_parte_personal').insert({ id_parte_fk: actual.id, nombre: nombre.trim(), id_colaborador_fk: idColab })
    setColabQ(''); cargarDetalle(actual.id)
  }
  const delPersonal = async (id: number) => {
    await dbCtrl.from('vig_parte_personal').delete().eq('id', id)
    if (actual) cargarDetalle(actual.id)
  }
  const colabsFiltrados = colabQ.length >= 1
    ? colabs.filter(c => nombreCompletoColaborador(c).toLowerCase().includes(colabQ.toLowerCase())
        && !personal.some(p => p.id_colaborador_fk === c.id)).slice(0, 8)
    : []

  // ── Novedades ──
  const plantilla = async (pl: typeof PLANTILLAS[number]) => {
    if (!actual) return
    const tipo = tipos.find(t => t.nombre === pl.tipo)
    const ubic = ubicaciones.find(u => u.nombre === pl.ubic)
    const { data, error: err } = await dbCtrl.from('vig_novedades').insert({
      id_parte_fk: actual.id, titulo: pl.titulo, id_tipo_fk: tipo?.id ?? null, hora: horaActual(),
      resultado: 'Sin Novedad', status: 'Cerrado', criticidad: 'Baja', captured_by: authUser?.nombre ?? null,
    }).select('id').single()
    if (err || !data) { setError(err?.message ?? 'No se pudo crear la rutina'); return }
    if (ubic) await dbCtrl.from('vig_novedad_ubicaciones').insert({ id_novedad_fk: data.id, id_ubicacion_fk: ubic.id })
    cargarDetalle(actual.id); onChanged()
  }
  const delNovedad = async (n: Novedad) => {
    if (!confirm(`¿Eliminar la novedad "${n.titulo}"?`)) return
    await dbCtrl.from('vig_novedades').delete().eq('id', n.id)
    if (actual) cargarDetalle(actual.id); onChanged()
  }

  // ── Seguimiento ──
  const addComentario = async () => {
    if (!actual || !comentario.trim()) return
    await dbCtrl.from('vig_seguimiento').insert({ id_parte_fk: actual.id, usuario: authUser?.nombre ?? null, comentario: comentario.trim() })
    setComentario(''); cargarDetalle(actual.id)
  }

  const imprimir = () => {
    if (!actual) return
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
    const filas = novedades.map(n => `<tr><td>${fmtHora(n.hora)}</td><td>${esc(n.turno)}</td>
      <td>${esc(tipos.find(t => t.id === n.id_tipo_fk)?.nombre)}</td>
      <td><b>${esc(n.titulo)}</b><br>${esc(n.descripcion)}${n.accion_tomada ? `<br><i>Acción: ${esc(n.accion_tomada)}</i>` : ''}</td>
      <td>${esc((ubicPorNov[n.id] ?? []).join(', '))}</td><td>${esc(n.resultado)}</td><td>${esc(n.status)}</td><td>${esc(n.criticidad)}</td></tr>`).join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>Parte de Novedades ${esc(actual.fecha)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}th{background:#e5e7eb}h1{font-size:18px}</style></head><body>
      <h1>Parte de Novedades — ${esc(fmtFecha(actual.fecha))}</h1>
      <p><b>Responsable:</b> ${esc(actual.responsable)} &nbsp; <b>Supervisor:</b> ${esc(actual.supervisor)}<br>
      <b>Destinatarios:</b> ${esc(actual.destinatarios)}<br>
      <b>Personal de turno:</b> ${esc(personal.map(p => p.nombre).join(', '))}<br>
      <b>Vehículos en ADV:</b> ${esc(actual.n_vehiculos_adv)} &nbsp; <b>Empl. en ADV:</b> ${esc(actual.n_empl_adv)} &nbsp; <b>Empl. en bitácora:</b> ${esc(actual.n_empl_bitacora)}</p>
      ${actual.resumen ? `<p><b>Resumen ejecutivo:</b> ${esc(actual.resumen)}</p>` : ''}
      <table><thead><tr><th>Hora</th><th>Turno</th><th>Tipo</th><th>Novedad</th><th>Ubicación</th><th>Resultado</th><th>Status</th><th>Crit.</th></tr></thead><tbody>${filas}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <ModalShell modulo="accesos" titulo={actual ? `Parte de Novedades · ${fmtFecha(actual.fecha)}` : 'Nuevo Parte de Novedades'}
      subtitulo={cerrado ? 'Enviado / Cerrado' : actual ? 'Borrador' : undefined} onClose={onClose} maxWidth={980}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        {actual && <button className="btn-ghost" onClick={imprimir}><Printer size={13} /> Imprimir</button>}
        {cerrado && puedeEscribir && <button className="btn-ghost" onClick={reabrir}>Reabrir</button>}
        {!soloLectura && <>
          <button className="btn-secondary" onClick={guardarEncabezado} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
          </button>
          {actual && <button className="btn-primary" onClick={enviar} disabled={saving}><Send size={13} /> Enviar / Cerrar</button>}
        </>}
      </>}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
        {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13 }}>{error}</div>}

        {/* Encabezado */}
        <fieldset disabled={soloLectura} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 10 }}>
            <div><label className="label">Fecha *</label>
              <input type="date" className="input" value={form.fecha} onChange={set('fecha')} disabled={!!actual} /></div>
            <div><label className="label">Responsable del reporte</label>
              <input className="input" value={form.responsable} onChange={set('responsable')} /></div>
            <div><label className="label">Supervisor / Revisor</label>
              <input className="input" value={form.supervisor} onChange={set('supervisor')} /></div>
          </div>
          <div><label className="label">Destinatarios</label>
            <input className="input" value={form.destinatarios} onChange={set('destinatarios')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div><label className="label">Vehículos en ADV</label><input type="number" min={0} className="input" value={form.n_vehiculos_adv} onChange={set('n_vehiculos_adv')} /></div>
            <div><label className="label">Empl. en ADV</label><input type="number" min={0} className="input" value={form.n_empl_adv} onChange={set('n_empl_adv')} /></div>
            <div><label className="label">Empl. en bitácora</label><input type="number" min={0} className="input" value={form.n_empl_bitacora} onChange={set('n_empl_bitacora')} /></div>
          </div>
          <div><label className="label">Resumen ejecutivo</label>
            <textarea className="input" rows={2} value={form.resumen} onChange={set('resumen')} style={{ resize: 'vertical' }} /></div>
        </fieldset>

        {!actual ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Guarda el parte para agregar personal de turno y novedades.</div>
        ) : <>
          {/* Personal de turno */}
          <div>
            <div className="label" style={{ marginBottom: 6 }}><User size={12} style={{ verticalAlign: -2 }} /> Personal de turno ({personal.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {personal.map(p => (
                <span key={p.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--surface-700)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {p.nombre}
                  {!soloLectura && <button onClick={() => delPersonal(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}><X size={11} /></button>}
                </span>
              ))}
            </div>
            {!soloLectura && (
              <div style={{ position: 'relative', maxWidth: 360 }}>
                <input className="input" placeholder="Agregar colaborador de Vigilancia…" value={colabQ} onChange={e => setColabQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && colabQ.trim() && colabsFiltrados.length === 0) addPersonal(colabQ, null) }} />
                {colabsFiltrados.length > 0 && (
                  <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, padding: '4px 0', maxHeight: 200, overflowY: 'auto' }}>
                    {colabsFiltrados.map(c => (
                      <button key={c.id} type="button" onClick={() => addPersonal(nombreCompletoColaborador(c), c.id)}
                        style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
                        {nombreCompletoColaborador(c)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Novedades */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
              <div className="label" style={{ margin: 0 }}>Novedades ({novedades.length})</div>
              {!soloLectura && <button className="btn-primary" onClick={() => setNovModal({ nov: null })}><Plus size={13} /> Nueva novedad</button>}
            </div>
            {!soloLectura && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                <Zap size={12} style={{ color: 'var(--text-muted)' }} />
                {PLANTILLAS.map(pl => (
                  <button key={pl.titulo} className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => plantilla(pl)}>{pl.titulo}</button>
                ))}
              </div>
            )}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Hora</th><th>Tipo</th><th>Novedad</th><th>Ubicación / Lote</th><th>Crit.</th><th>Status</th><th style={{ width: 90 }}></th></tr></thead>
                  <tbody>
                    {novedades.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Sin novedades registradas</td></tr>
                    ) : novedades.map(n => (
                      <tr key={n.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtHora(n.hora)}</td>
                        <td style={{ fontSize: 12 }}>{tipos.find(t => t.id === n.id_tipo_fk)?.nombre ?? '—'}</td>
                        <td style={{ fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.descripcion ?? ''}>{n.titulo}</td>
                        <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(ubicPorNov[n.id] ?? []).join(', ') || (n.id_lote_fk ? `Lote #${n.id_lote_fk}` : '—')}</td>
                        <td><Pill txt={n.criticidad} c={CRIT_COLOR[n.criticidad] ?? CRIT_COLOR['Baja']} /></td>
                        <td><Pill txt={n.status} c={STATUS_NOV_COLOR[n.status] ?? STATUS_NOV_COLOR['Abierto']} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-ghost" style={{ padding: 5 }} title="Ver" onClick={() => setNovModal({ nov: n })}><Eye size={13} /></button>
                            {!soloLectura && <button className="btn-ghost" style={{ padding: 5 }} title="Editar" onClick={() => setNovModal({ nov: n })}><Edit2 size={13} /></button>}
                            {!soloLectura && canDelete() && <button className="btn-ghost" style={{ padding: 5, color: '#dc2626' }} title="Eliminar" onClick={() => delNovedad(n)}><Trash2 size={13} /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Seguimiento */}
          <div>
            <div className="label" style={{ marginBottom: 6 }}><MessageSquare size={12} style={{ verticalAlign: -2 }} /> Seguimiento ({seguimiento.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {seguimiento.map(s => (
                <div key={s.id} style={{ fontSize: 12, padding: '8px 12px', background: 'var(--surface-700)', borderRadius: 6 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>
                    {s.usuario ?? '—'} · {new Date(s.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{s.comentario}</div>
                </div>
              ))}
            </div>
            {puedeEscribir && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="Agregar comentario de seguimiento…" value={comentario} onChange={e => setComentario(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addComentario() }} />
                <button className="btn-secondary" onClick={addComentario}>Comentar</button>
              </div>
            )}
          </div>
        </>}
      </div>

      {novModal && actual && (
        <NovedadModal novedad={novModal.nov} idParte={actual.id} fechaParte={actual.fecha} tipos={tipos} ubicaciones={ubicaciones}
          soloLectura={soloLectura} onClose={() => setNovModal(null)}
          onSaved={() => { setNovModal(null); cargarDetalle(actual.id); onChanged() }} />
      )}
    </ModalShell>
  )
}
