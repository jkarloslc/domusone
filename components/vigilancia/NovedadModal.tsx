'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader, Search, X, AlertTriangle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import MultiImageUpload from '@/components/MultiImageUpload'
import {
  Novedad, Tipo, Ubicacion, TURNOS, RESULTADOS, STATUS_NOV, CRITICIDADES, horaActual,
} from './tipos'

type Props = {
  novedad: Novedad | null          // null = nueva
  idParte: number
  fechaParte: string
  tipos: Tipo[]
  ubicaciones: Ubicacion[]
  soloLectura?: boolean
  onClose: () => void
  onSaved: () => void
}

export default function NovedadModal({ novedad, idParte, fechaParte, tipos, ubicaciones, soloLectura, onClose, onSaved }: Props) {
  const { authUser } = useAuth()
  const isNew = !novedad
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    turno:         novedad?.turno ?? '',
    hora:          novedad?.hora?.slice(0, 5) ?? (isNew ? horaActual() : ''),
    id_tipo_fk:    novedad?.id_tipo_fk ? String(novedad.id_tipo_fk) : '',
    titulo:        novedad?.titulo ?? '',
    descripcion:   novedad?.descripcion ?? '',
    accion_tomada: novedad?.accion_tomada ?? '',
    resultado:     novedad?.resultado ?? '',
    status:        novedad?.status ?? 'Abierto',
    criticidad:    novedad?.criticidad ?? 'Baja',
    hora_salida:   novedad?.hora_salida?.slice(0, 5) ?? '',
    desc_salida:   novedad?.desc_salida ?? '',
    id_lote_fk:    novedad?.id_lote_fk ? String(novedad.id_lote_fk) : '',
  })
  const [ubicSel, setUbicSel]   = useState<number[]>([])
  const [ubicQ, setUbicQ]       = useState('')
  const [evidencias, setEvid]   = useState<string[]>([])
  const [evidIniciales, setEvidIni] = useState<string[]>([])
  const [loteLabel, setLoteLabel]   = useState('')
  const [loteSearch, setLoteSearch] = useState('')
  const [lotes, setLotes]           = useState<any[]>([])
  const [idIncidencia, setIdIncidencia] = useState<number | null>(novedad?.id_incidencia_fk ?? null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Carga de ubicaciones, evidencias y etiqueta del lote de una novedad existente
  useEffect(() => {
    if (!novedad) return
    dbCtrl.from('vig_novedad_ubicaciones').select('id_ubicacion_fk').eq('id_novedad_fk', novedad.id)
      .then(({ data }) => setUbicSel((data ?? []).map((r: any) => r.id_ubicacion_fk)))
    dbCtrl.from('vig_novedad_evidencias').select('url').eq('id_novedad_fk', novedad.id).order('id')
      .then(({ data }) => { const u = (data ?? []).map((r: any) => r.url); setEvid(u); setEvidIni(u) })
    if (novedad.id_lote_fk)
      dbCat.from('lotes').select('cve_lote, lote').eq('id', novedad.id_lote_fk).single()
        .then(({ data }) => setLoteLabel(data?.cve_lote ?? `#${data?.lote ?? ''}`))
  }, [novedad])

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote, calle, numero')
      .or(`cve_lote.ilike.%${loteSearch}%,calle.ilike.%${loteSearch}%,numero.ilike.%${loteSearch}%`)
      .order('cve_lote').limit(10).then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const tipoSel = tipos.find(t => String(t.id) === form.id_tipo_fk)
  const sugiereEscalar = !!tipoSel?.genera_incidencia || ['Alta', 'Crítica', 'Media'].includes(form.criticidad)

  const toggleUbic = (id: number) =>
    setUbicSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const ubicFiltradas = ubicaciones.filter(u => u.nombre.toLowerCase().includes(ubicQ.toLowerCase()))

  const guardar = async (): Promise<number | null> => {
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return null }
    if (!form.id_tipo_fk)    { setError('Selecciona el tipo de novedad'); return null }
    if (!form.id_lote_fk && ubicSel.length === 0) { setError('Indica un lote o al menos una ubicación'); return null }
    setSaving(true); setError('')

    const payload = {
      id_parte_fk:   idParte,
      turno:         form.turno || null,
      hora:          form.hora || null,
      id_tipo_fk:    Number(form.id_tipo_fk),
      titulo:        form.titulo.trim(),
      descripcion:   form.descripcion.trim() || null,
      accion_tomada: form.accion_tomada.trim() || null,
      resultado:     form.resultado || null,
      status:        form.status,
      criticidad:    form.criticidad,
      hora_salida:   form.hora_salida || null,
      desc_salida:   form.desc_salida.trim() || null,
      id_lote_fk:    form.id_lote_fk ? Number(form.id_lote_fk) : null,
      updated_at:    new Date().toISOString(),
      ...(isNew ? { captured_by: authUser?.nombre ?? null } : {}),
    }

    let id = novedad?.id ?? 0
    if (isNew) {
      const { data, error: err } = await dbCtrl.from('vig_novedades').insert(payload).select('id').single()
      if (err || !data) { setSaving(false); setError(err?.message ?? 'No se pudo guardar'); return null }
      id = data.id
    } else {
      const { error: err } = await dbCtrl.from('vig_novedades').update(payload).eq('id', id)
      if (err) { setSaving(false); setError(err.message); return null }
    }

    // Ubicaciones (N:M): se reemplazan
    await dbCtrl.from('vig_novedad_ubicaciones').delete().eq('id_novedad_fk', id)
    if (ubicSel.length) {
      const { error: e2 } = await dbCtrl.from('vig_novedad_ubicaciones')
        .insert(ubicSel.map(u => ({ id_novedad_fk: id, id_ubicacion_fk: u })))
      if (e2) { setSaving(false); setError(e2.message); return null }
    }

    // Evidencias: diferencia contra las que había
    const nuevas = evidencias.filter(u => !evidIniciales.includes(u))
    const quitadas = evidIniciales.filter(u => !evidencias.includes(u))
    if (quitadas.length) await dbCtrl.from('vig_novedad_evidencias').delete().eq('id_novedad_fk', id).in('url', quitadas)
    if (nuevas.length) await dbCtrl.from('vig_novedad_evidencias').insert(nuevas.map(url => ({ id_novedad_fk: id, url })))
    setEvidIni(evidencias)

    setSaving(false)
    return id
  }

  const handleSave = async () => {
    const id = await guardar()
    if (id) onSaved()
  }

  // Escala a Incidencia (módulo de mantenimiento/administración) sin duplicar captura
  const escalar = async () => {
    const id = await guardar()
    if (!id) return
    setSaving(true)
    const ubicTxt = ubicaciones.filter(u => ubicSel.includes(u.id)).map(u => u.nombre).join(', ')
    const { data, error: err } = await dbCtrl.from('incidencias').insert({
      id_lote_fk:       form.id_lote_fk ? Number(form.id_lote_fk) : null,
      tipo:             tipoSel?.nombre ?? null,
      origen:           'Vigilancia',
      area_responsable: 'Seguridad',
      descripcion:      [form.titulo.trim(), form.descripcion.trim(), ubicTxt && `Ubicación: ${ubicTxt}`, `Parte de Vigilancia ${fechaParte}`]
                          .filter(Boolean).join('\n'),
      status:           'Abierta',
      responsable:      authUser?.nombre ?? null,
      fecha:            fechaParte,
      imagenes_antes:   evidencias,
    }).select('id').single()
    if (err || !data) { setSaving(false); setError(err?.message ?? 'No se pudo crear la incidencia'); return }
    await dbCtrl.from('vig_novedades').update({ id_incidencia_fk: data.id, resultado: 'Escalado' }).eq('id', id)
    setSaving(false)
    setIdIncidencia(data.id)
    onSaved()
  }

  const dis = !!soloLectura
  return (
    <ModalShell modulo="accesos" titulo={isNew ? 'Nueva novedad' : `Novedad #${novedad!.id}`} onClose={onClose} maxWidth={720}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>{dis ? 'Cerrar' : 'Cancelar'}</button>
        {!dis && !idIncidencia && sugiereEscalar && (
          <button className="btn-ghost" onClick={escalar} disabled={saving} title="Crea una incidencia ligada a esta novedad">
            <AlertTriangle size={13} /> Escalar a Incidencia
          </button>
        )}
        {!dis && (
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </>}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
        {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13 }}>{error}</div>}
        {idIncidencia && (
          <div style={{ padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, fontSize: 12, color: '#c2410c' }}>
            Escalada a la Incidencia #{idIncidencia}
          </div>
        )}

        <fieldset disabled={dis} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Tipo *</label>
              <select className="select" value={form.id_tipo_fk} onChange={set('id_tipo_fk')}>
                <option value="">— Seleccionar —</option>
                {(['Incidencia', 'Acceso', 'Rutina'] as const).map(clase => (
                  <optgroup key={clase} label={clase}>
                    {tipos.filter(t => t.clase === clase).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Turno</label>
              <select className="select" value={form.turno} onChange={set('turno')}>
                <option value="">—</option>
                {TURNOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" className="input" value={form.hora} onChange={set('hora')} />
            </div>
          </div>

          <div>
            <label className="label">Título *</label>
            <input className="input" value={form.titulo} onChange={set('titulo')} placeholder="Ej. Ingreso de CFE, Poste dañado…" />
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={4} value={form.descripcion} onChange={set('descripcion')} style={{ resize: 'vertical' }} />
          </div>

          {/* Lote */}
          <div>
            <label className="label">Lote (opcional si indicas ubicación)</label>
            {form.id_lote_fk ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 15 }}>{loteLabel || `#${form.id_lote_fk}`}</span>
                {!dis && <button className="btn-ghost" onClick={() => { setForm(f => ({ ...f, id_lote_fk: '' })); setLoteLabel(''); setLoteSearch('') }}><X size={12} /> Quitar</button>}
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input className="input" style={{ paddingLeft: 28 }} placeholder="Clave, calle o número…" value={loteSearch} onChange={e => setLoteSearch(e.target.value)} />
                {lotes.length > 0 && (
                  <div className="card" style={{ marginTop: 2, padding: '4px 0', maxHeight: 200, overflowY: 'auto' }}>
                    {lotes.map((l: any) => (
                      <button key={l.id} type="button"
                        onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteLabel(l.cve_lote ?? `#${l.lote}`); setLotes([]); setLoteSearch('') }}
                        style={{ display: 'flex', gap: 10, alignItems: 'baseline', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 14 }}>{l.cve_lote ?? `#${l.lote}`}</span>
                        {(l.calle || l.numero) && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[l.calle, l.numero].filter(Boolean).join(' ')}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ubicaciones */}
          <div>
            <label className="label">Ubicaciones {ubicSel.length > 0 && `(${ubicSel.length})`}</label>
            <input className="input" placeholder="Filtrar ubicaciones…" value={ubicQ} onChange={e => setUbicQ(e.target.value)} style={{ marginBottom: 6 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
              {ubicFiltradas.map(u => {
                const on = ubicSel.includes(u.id)
                return (
                  <button key={u.id} type="button" onClick={() => toggleUbic(u.id)}
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                      border: `1px solid ${on ? '#334155' : 'var(--border)'}`,
                      background: on ? '#334155' : 'transparent', color: on ? '#fff' : 'var(--text-secondary)' }}>
                    {u.nombre}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">Acción tomada</label>
            <textarea className="input" rows={2} value={form.accion_tomada} onChange={set('accion_tomada')} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Resultado</label>
              <select className="select" value={form.resultado} onChange={set('resultado')}>
                <option value="">—</option>
                {RESULTADOS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={set('status')}>
                {STATUS_NOV.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Criticidad</label>
              <select className="select" value={form.criticidad} onChange={set('criticidad')}>
                {CRITICIDADES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
            <div>
              <label className="label">Hora de salida</label>
              <input type="time" className="input" value={form.hora_salida} onChange={set('hora_salida')} />
            </div>
            <div>
              <label className="label">Descripción de salida</label>
              <input className="input" value={form.desc_salida} onChange={set('desc_salida')} placeholder="Solo para ingresos que registran salida" />
            </div>
          </div>
        </fieldset>

        <MultiImageUpload label="Evidencia" values={evidencias} onChange={setEvid} folder={`vigilancia-novedades/${fechaParte}`} max={12} />
      </div>
    </ModalShell>
  )
}
