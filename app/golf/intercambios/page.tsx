'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, Edit2, Trash2,
  Printer, ArrowRightLeft, Building2, Users, Save,
  Loader, AlertTriangle, Check, CalendarDays, ChevronLeft, ChevronRight, ShieldAlert, Mail
} from 'lucide-react'
import { fechaLocal } from '@/lib/dateUtils'
import ModalShell from '@/components/ui/ModalShell'
import PageHeader from '@/components/layout/PageHeader'

import Paginador from '@/components/ui/Paginador'
// ── Tipos ──────────────────────────────────────────────────────
type Socio = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  activo: boolean
  derecho_intercambios: boolean
}

type Club = {
  id: number
  nombre: string
  ciudad: string | null
  estado: string | null
  pais: string | null
  representante: string | null
  cargo_rep: string | null
  telefono_rep: string | null
  email_rep: string | null
  contacto?: string | null
  notas: string | null
  activo: boolean
  max_intercambios_dia: number | null
  max_intercambios_dia_finsemana: number | null
  alerta_pct: number
}

type Carta = {
  id: number
  folio: string | null
  id_socio_fk: number
  id_club_fk: number
  fecha_elaboracion: string
  fecha_visita: string | null
  texto_carta: string | null
  elaborado_por: string | null
  notas: string | null
  enviada_at?: string | null
  enviada_a?: string | null
  created_at: string
  cat_socios?: { nombre: string; apellido_paterno: string | null; numero_socio: string | null } | null
  cat_clubes_intercambio?: { nombre: string; ciudad: string | null; estado: string | null } | null
  cartas_intercambio_familiares?: { id_familiar_fk: number; cat_familiares: FamiliarMin | null }[] | null
}

type FamiliarMin = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno?: string | null
  parentesco: string | null
  activo?: boolean
}
const fmtFam = (f: Partial<FamiliarMin>) => [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')
const personasCarta = (c: Carta) => 1 + (c.cartas_intercambio_familiares ?? []).length
const famsDeCarta = (c: Carta): FamiliarMin[] =>
  (c.cartas_intercambio_familiares ?? []).map(x => x.cat_familiares).filter(Boolean) as FamiliarMin[]

// ── Helpers ────────────────────────────────────────────────────
const fmtNombre = (s: Partial<Socio>) =>
  [s.nombre, s.apellido_paterno].filter(Boolean).join(' ')
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Política de máximos por día ────────────────────────────────
// NULL = sin límite. Sábado/domingo usan su propio máximo si está definido.
const maxDelDia = (club: Partial<Club> | undefined | null, fecha: string): number | null => {
  if (!club) return null
  const dow = new Date(fecha + 'T12:00:00').getDay()
  const finde = dow === 0 || dow === 6
  if (finde && club.max_intercambios_dia_finsemana != null) return club.max_intercambios_dia_finsemana
  return club.max_intercambios_dia ?? null
}
type NivelCupo = 'libre' | 'ok' | 'alerta' | 'lleno'
const nivelCupo = (ocupados: number, max: number | null, pct: number): NivelCupo => {
  if (max == null) return 'libre'
  if (ocupados >= max) return 'lleno'
  if (max > 0 && ocupados / max * 100 >= pct) return 'alerta'
  return 'ok'
}
const NIVEL_CFG: Record<NivelCupo, { bg: string; border: string; color: string; label: string }> = {
  libre:  { bg: '#f8fafc', border: '#e2e8f0', color: '#64748b', label: 'Sin límite' },
  ok:     { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', label: 'Disponible' },
  alerta: { bg: '#fffbeb', border: '#fde68a', color: '#b45309', label: 'Por llenarse' },
  lleno:  { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', label: 'Cupo lleno' },
}

// ── Texto base por defecto (respaldo; el vigente vive en cfg.configuracion) ──
const CLAVE_TEXTO = 'golf_intercambio_texto_carta'
const TEXTO_BASE = `Por medio de la presente, Balvanera Golf, Polo & Country Club se complace en presentar a su distinguido socio, quien visitará sus instalaciones en la fecha indicada.

Hacemos constar que el portador cuenta con los derechos plenos de socio activo de este club y que la presente carta tiene una vigencia de 30 días naturales a partir de su fecha de elaboración.

Agradecemos de antemano las atenciones y cortesías que se brinden a nuestro asociado y quedamos a sus apreciables órdenes para cualquier intercambio recíproco.`

// ══════════════════════════════════════════════════════════════
// MODAL CARTA
// ══════════════════════════════════════════════════════════════
function CartaModal({
  carta, clubes, onClose, onSaved,
}: {
  carta: Carta | null
  clubes: Club[]
  onClose: () => void
  onSaved: () => void
}) {
  const { authUser } = useAuth()
  const isNew = !carta

  const [form, setForm] = useState({
    id_club_fk:        carta?.id_club_fk?.toString()    ?? '',
    fecha_elaboracion: carta?.fecha_elaboracion          ?? fechaLocal(),
    fecha_visita:      carta?.fecha_visita               ?? '',
    texto_carta:       carta?.texto_carta                ?? TEXTO_BASE,
    elaborado_por:     carta?.elaborado_por              ?? authUser?.nombre ?? '',
    notas:             carta?.notas                      ?? '',
  })

  // Búsqueda de socio
  const [socioId,      setSocioId]      = useState<number | ''>(carta?.id_socio_fk ?? '')
  const [socioSel,     setSocioSel]     = useState<Socio | null>(null)
  const [busqueda,     setBusqueda]     = useState('')
  const [opciones,     setOpciones]     = useState<Socio[]>([])
  const [buscando,     setBuscando]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  // Familiares (beneficiarios) acompañantes
  const [acompanado,   setAcompanado]   = useState(famsDeCarta(carta ?? ({} as Carta)).length > 0)
  const [familiares,   setFamiliares]   = useState<FamiliarMin[]>([])
  const [famSel,       setFamSel]       = useState<number[]>(famsDeCarta(carta ?? ({} as Carta)).map(f => f.id))
  const [loadingFam,   setLoadingFam]   = useState(false)
  useEffect(() => {
    if (!socioId) { setFamiliares([]); return }
    let vivo = true
    setLoadingFam(true)
    dbGolf.from('cat_familiares')
      .select('id, nombre, apellido_paterno, apellido_materno, parentesco, activo')
      .eq('id_socio_fk', Number(socioId)).eq('activo', true).order('nombre')
      .then(({ data }) => {
        if (!vivo) return
        const lista = (data as FamiliarMin[]) ?? []
        setFamiliares(lista)
        setFamSel(sel => sel.filter(id => lista.some(f => f.id === id)))
        setLoadingFam(false)
      })
    return () => { vivo = false }
  }, [socioId])
  const toggleFam = (id: number) =>
    setFamSel(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ── Cupo del club en la fecha de visita ──
  const [ocupados, setOcupados] = useState<number | null>(null)
  const clubSel = clubes.find(c => String(c.id) === form.id_club_fk)
  const maxDia  = form.fecha_visita ? maxDelDia(clubSel, form.fecha_visita) : null
  useEffect(() => {
    setOcupados(null)
    if (!form.id_club_fk || !form.fecha_visita) return
    let vivo = true
    let q: any = dbGolf.from('cartas_intercambio').select('id, cartas_intercambio_familiares(id)')
      .eq('id_club_fk', Number(form.id_club_fk)).eq('fecha_visita', form.fecha_visita)
    if (carta?.id) q = q.neq('id', carta.id)
    q.then(({ data }: any) => {
      if (!vivo) return
      setOcupados((data ?? []).reduce((n: number, c: any) => n + 1 + (c.cartas_intercambio_familiares?.length ?? 0), 0))
    })
    return () => { vivo = false }
  }, [form.id_club_fk, form.fecha_visita, carta?.id])
  // Esta carta ocupa un lugar por persona (titular + familiares)
  const misLugares = 1 + (acompanado ? famSel.length : 0)
  const nivel: NivelCupo | null = ocupados == null || !form.fecha_visita ? null
    : nivelCupo(ocupados + misLugares, maxDia, clubSel?.alerta_pct ?? 80)
  const cupoLleno = ocupados != null && maxDia != null && ocupados + misLugares > maxDia

  // Texto base vigente desde Configuración (solo cartas nuevas)
  useEffect(() => {
    if (!isNew) return
    let vivo = true
    dbCfg.from('configuracion').select('valor').eq('clave', CLAVE_TEXTO).maybeSingle()
      .then(({ data }) => {
        const v = (data as any)?.valor
        if (vivo && v) setForm(f => f.texto_carta === TEXTO_BASE ? { ...f, texto_carta: v } : f)
      })
    return () => { vivo = false }
  }, [isNew])

  // Cargar socio actual si es edición
  useEffect(() => {
    if (carta?.id_socio_fk) {
      dbGolf.from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, activo, derecho_intercambios')
        .eq('id', carta.id_socio_fk)
        .single()
        .then(({ data }) => { if (data) { setSocioSel(data as Socio); setBusqueda(fmtNombre(data as Socio)) } })
    }
  }, [carta])

  // Autocompletar socios
  const buscarSocio = useCallback(async (q: string) => {
    setBusqueda(q)
    if (q.length < 2) { setOpciones([]); return }
    setBuscando(true)
    const words = q.trim().split(/\s+/).filter(Boolean)
    let qb: any = dbGolf.from('cat_socios')
      .select('id, numero_socio, nombre, apellido_paterno, activo, derecho_intercambios')
      .eq('activo', true)
    for (const w of words) {
      qb = qb.or(`nombre.ilike.%${w}%,apellido_paterno.ilike.%${w}%,apellido_materno.ilike.%${w}%,numero_socio.ilike.%${w}%`)
    }
    const { data } = await qb.order('apellido_paterno').limit(15)
    setOpciones((data as Socio[]) ?? [])
    setBuscando(false)
  }, [])

  const seleccionarSocio = (s: Socio) => {
    setSocioSel(s)
    setSocioId(s.id)
    setBusqueda(`${s.numero_socio ? `#${s.numero_socio} — ` : ''}${fmtNombre(s)}`)
    setOpciones([])
  }

  const handleSave = async () => {
    if (!socioId)       { setError('Selecciona un socio'); return }
    if (!form.id_club_fk) { setError('Selecciona un club destino'); return }
    if (!form.fecha_elaboracion) { setError('La fecha de elaboración es obligatoria'); return }
    if (socioSel && !socioSel.derecho_intercambios) { setError('El socio no tiene derecho a cartas de intercambio'); return }
    if (acompanado && famSel.length === 0) { setError('Selecciona al menos un familiar o cambia a "Socio titular solo"'); return }
    if (cupoLleno) { setError(`El club solo admite ${maxDia} personas ese día y ya hay ${ocupados} registradas; esta carta suma ${misLugares}. Reduce acompañantes o elige otro día.`); return }

    setSaving(true); setError('')

    // Generar folio si es nueva
    let folio: string | undefined
    if (isNew) {
      const anio = new Date().getFullYear()
      const { count } = await dbGolf.from('cartas_intercambio').select('id', { count: 'exact', head: true })
      folio = `CI-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`
    }

    const payload: any = {
      id_socio_fk:       Number(socioId),
      id_club_fk:        Number(form.id_club_fk),
      fecha_elaboracion: form.fecha_elaboracion,
      fecha_visita:      form.fecha_visita || null,
      texto_carta:       form.texto_carta  || null,
      elaborado_por:     form.elaborado_por || authUser?.nombre || null,
      notas:             form.notas        || null,
      ...(isNew && folio ? { folio } : {}),
    }

    let idCarta = carta?.id
    let err: any = null
    if (isNew) {
      const res = await dbGolf.from('cartas_intercambio').insert(payload).select('id').single()
      err = res.error; idCarta = (res.data as any)?.id
    } else {
      const res = await dbGolf.from('cartas_intercambio').update(payload).eq('id', carta!.id)
      err = res.error
    }
    if (err || !idCarta) { setSaving(false); setError(err?.message ?? 'No se pudo guardar la carta'); return }

    // Reemplazar familiares de la carta
    const { error: eDel } = await dbGolf.from('cartas_intercambio_familiares').delete().eq('id_carta_fk', idCarta)
    if (eDel) { setSaving(false); setError(eDel.message); return }
    if (acompanado && famSel.length > 0) {
      const { error: eFam } = await dbGolf.from('cartas_intercambio_familiares')
        .insert(famSel.map(id => ({ id_carta_fk: idCarta, id_familiar_fk: id })))
      if (eFam) { setSaving(false); setError(eFam.message); return }
    }

    setSaving(false)
    onSaved()
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 7,
    border: '1px solid #e2e8f0', fontSize: 13, background: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  return (
    <ModalShell modulo="golf-pos" titulo={isNew ? 'Nueva Carta de Intercambio' : `Editar — ${carta?.folio ?? ''}`}
      subtitulo="Balvanera Golf, Polo & Country Club" icono={ArrowRightLeft} size="lg" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-ghost" disabled={saving}>Cancelar</button>
        <button onClick={handleSave} className="btn-primary" disabled={saving || cupoLleno || (!!socioSel && !socioSel.derecho_intercambios)}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          {isNew ? 'Guardar carta' : 'Guardar cambios'}
        </button>
      </>}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Socio */}
          <div>
            <label style={lbl}>Socio *</label>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%',
                transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 1 }} />
              <input style={{ ...inp, paddingLeft: 28 }}
                placeholder="Buscar por nombre o número de socio…"
                value={busqueda}
                onChange={e => { buscarSocio(e.target.value); setSocioSel(null); setSocioId('') }}
              />
              {buscando && (
                <RefreshCw size={12} style={{ position: 'absolute', right: 9, top: '50%',
                  transform: 'translateY(-50%)', color: '#94a3b8' }} className="animate-spin" />
              )}
              {opciones.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                  {opciones.map(s => (
                    <button key={s.id} onMouseDown={e => { e.preventDefault(); seleccionarSocio(s) }}
                      style={{ display: 'flex', width: '100%', textAlign: 'left', padding: '9px 12px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9', alignItems: 'center', gap: 8 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{fmtNombre(s)}</span>
                        {s.numero_socio && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>#{s.numero_socio}</span>}
                      </div>
                      {s.derecho_intercambios
                        ? <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d', background: '#f0fdf4', padding: '2px 6px', borderRadius: 8 }}>✓ Intercambio</span>
                        : <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: 8 }}>Sin derecho</span>
                      }
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Validación de derecho */}
            {socioSel && !socioSel.derecho_intercambios && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '7px 10px' }}>
                <AlertTriangle size={13} style={{ color: '#dc2626', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                  Este socio no tiene derecho a cartas de intercambio. Actívalo en su expediente.
                </span>
              </div>
            )}
            {socioSel && socioSel.derecho_intercambios && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '7px 10px' }}>
                <Check size={13} style={{ color: '#15803d', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#15803d', fontWeight: 500 }}>
                  Socio con derecho a intercambios confirmado
                </span>
              </div>
            )}
          </div>

          {/* Acompañantes */}
          {socioId !== '' && (
            <div>
              <label style={lbl}>Asistentes</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {([[false, 'Socio titular solo'], [true, 'Titular acompañado']] as const).map(([val, txt]) => (
                  <button key={txt} type="button" onClick={() => setAcompanado(val)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      border: `1px solid ${acompanado === val ? '#2563eb' : '#e2e8f0'}`,
                      background: acompanado === val ? '#eff6ff' : '#fff',
                      color: acompanado === val ? '#2563eb' : '#64748b' }}>
                    {txt}
                  </button>
                ))}
              </div>
              {acompanado && (
                loadingFam ? <div style={{ fontSize: 12, color: '#94a3b8' }}>Cargando familiares…</div>
                : familiares.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 10px' }}>
                    El socio no tiene familiares activos registrados. Agrégalos en su expediente (pestaña Familiares).
                  </div>
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    {familiares.map(f => (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: famSel.includes(f.id) ? '#f8fbff' : '#fff' }}>
                        <input type="checkbox" checked={famSel.includes(f.id)} onChange={() => toggleFam(f.id)}
                          style={{ width: 15, height: 15 }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{fmtFam(f)}</span>
                        {f.parentesco && <span style={{ fontSize: 11, color: '#94a3b8' }}>{f.parentesco}</span>}
                      </label>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Club destino */}
          <div>
            <label style={lbl}>Club Destino *</label>
            <select style={inp} value={form.id_club_fk} onChange={e => set('id_club_fk', e.target.value)}>
              <option value="">— Seleccionar club —</option>
              {clubes.filter(c => c.activo).map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.ciudad ? ` — ${c.ciudad}${c.estado ? ', ' + c.estado : ''}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Fecha de elaboración *</label>
              <input style={inp} type="date" value={form.fecha_elaboracion}
                onChange={e => set('fecha_elaboracion', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Fecha de visita</label>
              <input style={inp} type="date" value={form.fecha_visita}
                onChange={e => set('fecha_visita', e.target.value)} />
            </div>
          </div>
          {nivel && ocupados != null && maxDia != null && (nivel === 'alerta' || nivel === 'lleno' || cupoLleno) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8,
              background: NIVEL_CFG[cupoLleno ? 'lleno' : 'alerta'].bg, border: `1px solid ${NIVEL_CFG[cupoLleno ? 'lleno' : 'alerta'].border}`,
              color: NIVEL_CFG[cupoLleno ? 'lleno' : 'alerta'].color, fontSize: 12.5, fontWeight: 500 }}>
              <ShieldAlert size={14} style={{ flexShrink: 0 }} />
              {cupoLleno
                ? `Cupo insuficiente: ${clubSel?.nombre} tiene ${ocupados} de ${maxDia} personas ese día y esta carta suma ${misLugares}. No se puede emitir la carta.`
                : `Atención: con esta carta serán ${ocupados + misLugares} de ${maxDia} personas permitidas por ${clubSel?.nombre} ese día.`}
            </div>
          )}
          {nivel === 'ok' && ocupados != null && maxDia != null && (
            <div style={{ fontSize: 12, color: '#15803d' }}>
              Cupo disponible: {maxDia - ocupados} de {maxDia} lugares ese día (esta carta usa {misLugares}).
            </div>
          )}

          {/* Texto de la carta */}
          <div>
            <label style={lbl}>Texto de la carta</label>
            <textarea style={{ ...inp, minHeight: 140, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              value={form.texto_carta}
              onChange={e => set('texto_carta', e.target.value)}
              placeholder="Texto personalizado de la carta…"
            />
          </div>

          {/* Elaborado por + Notas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Elaborado por</label>
              <input style={inp} value={form.elaborado_por}
                onChange={e => set('elaborado_por', e.target.value)}
                placeholder="Nombre del responsable" />
            </div>
            <div>
              <label style={lbl}>Notas internas</label>
              <input style={inp} value={form.notas}
                onChange={e => set('notas', e.target.value)}
                placeholder="Observaciones opcionales" />
            </div>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '10px 14px', color: '#dc2626', fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
        </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// MODAL CLUB
// ══════════════════════════════════════════════════════════════
function ClubModal({ club, onClose, onSaved }: { club: Club | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    nombre:       club?.nombre       ?? '',
    ciudad:       club?.ciudad       ?? '',
    estado:       club?.estado       ?? '',
    pais:         club?.pais         ?? 'México',
    representante: club?.representante ?? '',
    cargo_rep:    club?.cargo_rep    ?? '',
    telefono_rep: club?.telefono_rep ?? '',
    email_rep:    club?.email_rep    ?? '',
    contacto:     club?.contacto     ?? '',
    notas:        club?.notas        ?? '',
    activo:       club?.activo       ?? true,
    max_dia:      club?.max_intercambios_dia?.toString()           ?? '',
    max_finde:    club?.max_intercambios_dia_finsemana?.toString() ?? '',
    alerta_pct:   String(club?.alerta_pct ?? 80),
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre:       form.nombre.trim(),
      ciudad:       form.ciudad       || null,
      estado:       form.estado       || null,
      pais:         form.pais         || 'México',
      representante: form.representante || null,
      cargo_rep:    form.cargo_rep    || null,
      telefono_rep: form.telefono_rep || null,
      email_rep:    form.email_rep    || null,
      contacto:     form.contacto.trim() || null,
      notas:        form.notas        || null,
      activo:       form.activo,
      max_intercambios_dia:           form.max_dia   !== '' ? Number(form.max_dia)   : null,
      max_intercambios_dia_finsemana: form.max_finde !== '' ? Number(form.max_finde) : null,
      alerta_pct:   Math.min(100, Math.max(1, Number(form.alerta_pct) || 80)),
    }
    const { error: err } = club
      ? await dbGolf.from('cat_clubes_intercambio').update(payload).eq('id', club.id)
      : await dbGolf.from('cat_clubes_intercambio').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 7,
    border: '1px solid #e2e8f0', fontSize: 13, background: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  return (
    <ModalShell modulo="locales" titulo={club ? 'Editar Club' : 'Nuevo Club de Intercambio'} icono={Building2} size="md" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-ghost" disabled={saving}>Cancelar</button>
        <button onClick={handleSave} className="btn-primary" disabled={saving}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          Guardar
        </button>
      </>}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Nombre del club *</label>
            <input style={inp} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Club de Golf…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Ciudad</label>
              <input style={inp} value={form.ciudad} onChange={e => set('ciudad', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Estado</label>
              <input style={inp} value={form.estado} onChange={e => set('estado', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>País</label>
              <input style={inp} value={form.pais} onChange={e => set('pais', e.target.value)} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>Datos del representante</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Nombre</label>
                <input style={inp} value={form.representante} onChange={e => set('representante', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Cargo</label>
                <input style={inp} value={form.cargo_rep} onChange={e => set('cargo_rep', e.target.value)} placeholder="Director, Gerente…" />
              </div>
              <div>
                <label style={lbl}>Teléfono</label>
                <input style={inp} value={form.telefono_rep} onChange={e => set('telefono_rep', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={form.email_rep} onChange={e => set('email_rep', e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Contacto (solo referencia)</label>
                <input style={inp} value={form.contacto} onChange={e => set('contacto', e.target.value)}
                  placeholder="Persona o dato de contacto para coordinar visitas" />
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>Política de máximos por día</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Máx. entre semana</label>
                <input style={inp} type="number" min={0} value={form.max_dia} placeholder="Sin límite"
                  onChange={e => set('max_dia', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Máx. sáb / dom</label>
                <input style={inp} type="number" min={0} value={form.max_finde} placeholder="Igual que semana"
                  onChange={e => set('max_finde', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Alertar al (%)</label>
                <input style={inp} type="number" min={1} max={100} value={form.alerta_pct}
                  onChange={e => set('alerta_pct', e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
              Número máximo de personas (socio + familiares) que el club acepta por día de visita. Vacío = sin límite.
              Se avisa al llegar al porcentaje indicado y se bloquea la emisión al alcanzar el máximo.
            </div>
          </div>

          <div>
            <label style={lbl}>Notas</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }}
              value={form.notas} onChange={e => set('notas', e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="club-activo" checked={form.activo}
              onChange={e => set('activo', e.target.checked)} style={{ width: 16, height: 16 }} />
            <label htmlFor="club-activo" style={{ ...lbl, marginBottom: 0, cursor: 'pointer' }}>Club activo (disponible para selección)</label>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '9px 12px', color: '#dc2626', fontSize: 13 }}>{error}</div>
          )}
        </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// IMPRESIÓN DE CARTA
// ══════════════════════════════════════════════════════════════
async function htmlCarta(carta: Carta, socio: Partial<Socio>, club: Partial<Club>, modo: 'impresion' | 'correo'): Promise<string> {
  let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = '', textoBase = TEXTO_BASE
  try {
    const { data: cfgRows } = await dbCfg.from('configuracion')
      .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url', CLAVE_TEXTO])
    ;(cfgRows ?? []).forEach((r: any) => {
      if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
      if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
      if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      if (r.clave === CLAVE_TEXTO && r.valor) textoBase = r.valor
    })
  } catch {}
  const logoHtml = orgLogo
    ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
    : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
  const fams = famsDeCarta(carta)
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Carta de Intercambio — ${carta.folio ?? ''}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Georgia',serif;font-size:13px;color:#1e293b;padding:0}
    @page{size:A4;margin:0}
    html,body{width:210mm;height:297mm}
    .page{width:210mm;height:297mm;margin:0 auto;padding:14mm 20mm 24mm;position:relative;overflow:hidden;page-break-after:avoid;page-break-inside:avoid}
    /* Encabezado */
    .org-header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #0D4F80;padding-bottom:14px;margin-bottom:16px}
    .org-nombre{font-size:18px;font-weight:700;color:#0D4F80;margin:0 0 2px}
    .org-sub{font-size:11px;color:#64748b}
    .doc-title{font-size:14px;font-weight:600;color:#0D4F80;margin-bottom:2px}
    .folio-lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em}
    .folio-val{font-size:18px;font-weight:700;color:#0D4F80;letter-spacing:1px}
    /* Tipo documento */
    .doc-type{text-align:center;margin-bottom:14px}
    .doc-type h1{font-size:17px;font-weight:700;color:#0D4F80;letter-spacing:2px;text-transform:uppercase;border:2px solid #0D4F80;display:inline-block;padding:6px 24px;border-radius:4px}
    /* Fechas */
    .fechas{display:flex;gap:32px;margin-bottom:14px;font-size:12px;color:#475569}
    .fecha-item span{font-weight:600;color:#1e293b}
    /* Destinatario */
    .destinatario{margin-bottom:14px;background:#f8fafc;border-left:3px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0}
    .dest-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:6px}
    .dest-nombre{font-size:14px;font-weight:700;color:#0D4F80}
    .dest-cargo{font-size:12px;color:#475569}
    .dest-club{font-size:13px;font-weight:600;color:#2563eb;margin-top:2px}
    .dest-lugar{font-size:11px;color:#64748b}
    /* Saludo */
    .saludo{margin-bottom:10px;font-size:13px}
    /* Cuerpo */
    .cuerpo{line-height:1.6;font-size:13px;text-align:justify;color:#334155;margin-bottom:14px;white-space:pre-wrap}
    /* Socio box */
    .socio-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 16px;margin-bottom:16px}
    .socio-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3b82f6;margin-bottom:6px}
    .socio-nombre{font-size:15px;font-weight:700;color:#0D4F80}
    .socio-num{font-size:11px;color:#3b82f6;margin-top:2px}
    /* Firma */
    .firma{display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px}
    .firma-bloque{text-align:center;width:200px}
    .firma-linea{border-top:1px solid #0D4F80;padding-top:6px;margin-top:36px}
    .firma-nombre{font-size:12px;font-weight:700;color:#1e293b}
    .firma-cargo{font-size:10px;color:#64748b}
    /* Pie */
    .pie{position:absolute;bottom:10mm;left:20mm;right:20mm;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
    .vigencia{font-size:10px;color:#dc2626;font-style:italic;margin-top:4px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}button{display:none}}
    ${modo === 'correo' ? 'html,body{width:auto;height:auto}.page{width:auto;max-width:680px;height:auto;padding:24px;overflow:visible}.pie{position:static;margin-top:24px}' : ''}
  </style>
</head>
<body>
<div class="page">
<div id="contenido">
  <!-- Encabezado institucional -->
  <div class="org-header">
    ${logoHtml}
    <div>
      <div class="org-nombre">${orgNombre}</div>
      ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
    </div>
    <div style="margin-left:auto;text-align:right">
      <div class="doc-title">Carta de Intercambio</div>
      <div class="folio-lbl">Folio</div>
      <div class="folio-val">${carta.folio ?? '—'}</div>
    </div>
  </div>

  <!-- Tipo de documento -->
  <div class="doc-type">
    <h1>Carta de Intercambio</h1>
  </div>

  <!-- Fechas -->
  <div class="fechas">
    <div class="fecha-item">Fecha de elaboración: <span>${fmtFecha(carta.fecha_elaboracion)}</span></div>
    ${carta.fecha_visita ? `<div class="fecha-item">Fecha de visita: <span>${fmtFecha(carta.fecha_visita)}</span></div>` : ''}
  </div>

  <!-- Destinatario -->
  <div class="destinatario">
    ${club.representante ? `<div class="dest-nombre">${club.representante}</div>` : ''}
    ${club.cargo_rep ? `<div class="dest-cargo">${club.cargo_rep}</div>` : ''}
    <div class="dest-club">${club.nombre ?? '—'}</div>
    ${(club.ciudad || club.estado) ? `<div class="dest-lugar">${[club.ciudad, club.estado, club.pais].filter(Boolean).join(', ')}</div>` : ''}
  </div>

  <!-- Saludo -->
  <div class="saludo">Estimado(a) ${club.representante ? club.representante.split(' ')[0] : 'representante'}:</div>

  <!-- Cuerpo de la carta -->
  <div class="cuerpo">${(carta.texto_carta ?? textoBase).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

  <!-- Datos del socio -->
  <div class="socio-box">
    <div class="socio-label">Datos del socio${fams.length > 0 ? ' titular' : ''}</div>
    <div class="socio-nombre">${fmtNombre(socio)}</div>
    ${socio.numero_socio ? `<div class="socio-num">Número de socio: #${socio.numero_socio}</div>` : ''}
    ${fams.length > 0 ? `<div class="socio-label" style="margin-top:12px">Acompañado(a) por</div>
      ${fams.map(f => `<div class="socio-nombre" style="font-size:13px;font-weight:600">${esc(fmtFam(f))}${f.parentesco ? ` <span style="font-weight:400;color:#64748b;font-size:11px">(${esc(f.parentesco)})</span>` : ''}</div>`).join('')}` : ''}
  </div>

  <!-- Firma -->
  <div class="firma">
    <div class="firma-bloque">
      <div class="firma-linea">
        <div class="firma-nombre">${carta.elaborado_por ?? 'Dirección General'}</div>
        <div class="firma-cargo">Balvanera Golf, Polo & Country Club</div>
      </div>
    </div>
  </div>

  ${carta.fecha_visita ? `<div class="vigencia" style="margin-top:18px">* La presente carta es válida exclusivamente para la fecha de visita indicada.</div>` : ''}

</div>
  <!-- Pie de página -->
  <div class="pie">
    Balvanera Golf, Polo &amp; Country Club, Corregidora, Querétaro, México<br/>
    Folio: ${carta.folio ?? '—'} · Emitida: ${fmtFecha(carta.fecha_elaboracion)}
  </div>
</div>
${modo === 'correo' ? '' : `<script>
window.onload=()=>{
  const page=document.querySelector('.page'), c=document.getElementById('contenido');
  const cs=getComputedStyle(page);
  const disp=page.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  if(c.scrollHeight>disp){ c.style.zoom=Math.max(0.5,disp/c.scrollHeight); }
  window.print();
}
</script>`}
</body>
</html>`
}

async function imprimirCarta(carta: Carta, socio: Partial<Socio>, club: Partial<Club>) {
  const win = window.open('', '_blank', 'width=800,height=700')
  if (!win) return
  const html = await htmlCarta(carta, socio, club, 'impresion')
  win.document.write(html)
  win.document.close()
}

// ══════════════════════════════════════════════════════════════
// PDF DE LA CARTA (jsPDF, en el navegador; texto vectorial, 1 hoja A4)
// ══════════════════════════════════════════════════════════════
async function cargarLogo(url: string): Promise<{ data: string; fmt: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const data: string = await new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = ko; fr.readAsDataURL(blob) })
    const dim: { w: number; h: number } = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = ko; im.src = data })
    const fmt = /png/i.test(blob.type) ? 'PNG' : /jpe?g/i.test(blob.type) ? 'JPEG' : ''
    return fmt ? { data, fmt, ...dim } : null   // webp/svg no los soporta jsPDF
  } catch { return null }
}

async function pdfCartaBase64(carta: Carta, socio: Partial<Socio>, club: Partial<Club>): Promise<string> {
  const { jsPDF } = await import('jspdf')
  let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = '', textoBase = TEXTO_BASE
  try {
    const { data: cfgRows } = await dbCfg.from('configuracion')
      .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url', CLAVE_TEXTO])
    ;(cfgRows ?? []).forEach((r: any) => {
      if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
      if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
      if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      if (r.clave === CLAVE_TEXTO && r.valor) textoBase = r.valor
    })
  } catch {}
  const logo = orgLogo ? await cargarLogo(orgLogo) : null
  const fams = famsDeCarta(carta)
  const texto = carta.texto_carta ?? textoBase

  const M = 20, W = 210 - M * 2, LIM = 297 - 24   // límite inferior antes del pie
  const AZUL: [number, number, number] = [13, 79, 128]
  const GRIS: [number, number, number] = [100, 116, 139]
  const OSC:  [number, number, number] = [30, 41, 59]

  // Dibuja la carta con un factor de tamaño; devuelve el doc y la altura usada
  const dibujar = (k: number) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    let y = 16
    const fs = (n: number) => doc.setFontSize(n * k)
    const col = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])

    // Encabezado
    let xTxt = M
    if (logo) {
      const h = 14 * Math.min(1, k + 0.1), w = Math.min(40, h * logo.w / logo.h)
      const hh = Math.min(h, w * logo.h / logo.w), ww = hh * logo.w / logo.h
      try { doc.addImage(logo.data, logo.fmt, M, y - 2, ww, hh); xTxt = M + ww + 4 } catch {}
    }
    doc.setFont('helvetica', 'bold'); fs(15); col(AZUL); doc.text(orgNombre, xTxt, y + 4)
    if (orgSubtitulo) { doc.setFont('helvetica', 'normal'); fs(9); col(GRIS); doc.text(orgSubtitulo, xTxt, y + 9) }
    doc.setFont('helvetica', 'bold'); fs(10); col(AZUL); doc.text('Carta de Intercambio', 210 - M, y + 1, { align: 'right' })
    doc.setFont('helvetica', 'normal'); fs(7); col(GRIS); doc.text('FOLIO', 210 - M, y + 5.5, { align: 'right' })
    doc.setFont('helvetica', 'bold'); fs(14); col(AZUL); doc.text(carta.folio ?? '—', 210 - M, y + 11, { align: 'right' })
    y += 17
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.5); doc.line(M, y, 210 - M, y)
    y += 9

    // Título en recuadro
    doc.setFont('helvetica', 'bold'); fs(14); col(AZUL)
    const tit = 'CARTA DE INTERCAMBIO', tw = doc.getTextWidth(tit) + 14
    doc.setLineWidth(0.5); doc.roundedRect(105 - tw / 2, y - 6, tw, 10, 1.5, 1.5)
    doc.text(tit, 105, y + 0.8, { align: 'center' })
    y += 12

    // Fechas
    doc.setFont('helvetica', 'normal'); fs(10); col(GRIS)
    let x = M
    const par = (lbl: string, val: string) => {
      doc.setFont('helvetica', 'normal'); col(GRIS); doc.text(lbl + ' ', x, y)
      x += doc.getTextWidth(lbl + ' ')
      doc.setFont('helvetica', 'bold'); col(OSC); doc.text(val, x, y); x += doc.getTextWidth(val) + 10
    }
    par('Fecha de elaboración:', fmtFecha(carta.fecha_elaboracion))
    if (carta.fecha_visita) par('Fecha de visita:', fmtFecha(carta.fecha_visita))
    y += 7

    // Destinatario
    const lugar = [club.ciudad, club.estado, club.pais].filter(Boolean).join(', ')
    const lineasDest: { t: string; b?: boolean; sz: number; c: [number, number, number] }[] = []
    if (club.representante) lineasDest.push({ t: club.representante, b: true, sz: 11, c: AZUL })
    if (club.cargo_rep)     lineasDest.push({ t: club.cargo_rep, sz: 9.5, c: GRIS })
    lineasDest.push({ t: club.nombre ?? '—', b: true, sz: 10.5, c: [37, 99, 235] })
    if (lugar)              lineasDest.push({ t: lugar, sz: 9, c: GRIS })
    const hDest = 6 + lineasDest.length * 5 * k
    doc.setFillColor(248, 250, 252); doc.rect(M, y - 3, W, hDest, 'F')
    doc.setFillColor(37, 99, 235); doc.rect(M, y - 3, 0.9, hDest, 'F')
    let yy = y + 2
    lineasDest.forEach(l => { doc.setFont('helvetica', l.b ? 'bold' : 'normal'); fs(l.sz); col(l.c); doc.text(l.t, M + 5, yy); yy += 5 * k })
    y += hDest + 4

    // Saludo
    doc.setFont('helvetica', 'normal'); fs(10.5); col(OSC)
    doc.text(`Estimado(a) ${club.representante ? club.representante.split(' ')[0] : 'representante'}:`, M, y)
    y += 7

    // Cuerpo
    fs(10.5); col([51, 65, 85])
    const lh = 5.3 * k
    texto.split('\n').forEach(par => {
      if (!par.trim()) { y += lh * 0.6; return }
      const ls = doc.splitTextToSize(par, W) as string[]
      ls.forEach((ln, i) => { doc.text(ln, M, y + i * lh, i < ls.length - 1 ? { maxWidth: W, align: 'justify' } : undefined) })
      // justificado excepto última línea
      y += ls.length * lh
    })
    y += 5

    // Datos del socio
    const hSoc = 12 + (socio.numero_socio ? 5 : 0) * k + (fams.length ? (7 + fams.length * 5) * k : 0)
    doc.setFillColor(239, 246, 255); doc.setDrawColor(191, 219, 254); doc.setLineWidth(0.3)
    doc.roundedRect(M, y - 3, W, hSoc, 2, 2, 'FD')
    let ys = y + 2
    doc.setFont('helvetica', 'bold'); fs(7.5); col([59, 130, 246]); doc.text(fams.length ? 'DATOS DEL SOCIO TITULAR' : 'DATOS DEL SOCIO', M + 5, ys); ys += 5.5 * k
    fs(12); col(AZUL); doc.text(fmtNombre(socio), M + 5, ys); ys += 5 * k
    if (socio.numero_socio) { doc.setFont('helvetica', 'normal'); fs(9); col([59, 130, 246]); doc.text(`Número de socio: #${socio.numero_socio}`, M + 5, ys); ys += 5 * k }
    if (fams.length) {
      ys += 2 * k
      doc.setFont('helvetica', 'bold'); fs(7.5); col([59, 130, 246]); doc.text('ACOMPAÑADO(A) POR', M + 5, ys); ys += 5 * k
      fams.forEach(f => {
        doc.setFont('helvetica', 'bold'); fs(10); col(AZUL)
        const n = fmtFam(f); doc.text(n, M + 5, ys)
        if (f.parentesco) { const w0 = doc.getTextWidth(n); doc.setFont('helvetica', 'normal'); fs(8.5); col(GRIS); doc.text(`(${f.parentesco})`, M + 7 + w0, ys) }
        ys += 5 * k
      })
    }
    y += hSoc + 8

    // Firma
    y += 14 * k
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.3); doc.line(M, y, M + 60, y)
    doc.setFont('helvetica', 'bold'); fs(10); col(OSC); doc.text(carta.elaborado_por ?? 'Dirección General', M, y + 5)
    doc.setFont('helvetica', 'normal'); fs(8); col(GRIS); doc.text('Balvanera Golf, Polo & Country Club', M, y + 9.5)
    y += 14

    if (carta.fecha_visita) {
      doc.setFont('helvetica', 'italic'); fs(8); doc.setTextColor(220, 38, 38)
      doc.text('* La presente carta es válida exclusivamente para la fecha de visita indicada.', M, y + 2); y += 6
    }

    // Pie
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(M, 297 - 18, 210 - M, 297 - 18)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); col([148, 163, 184])
    doc.text('Balvanera Golf, Polo & Country Club, Corregidora, Querétaro, México', 105, 297 - 13.5, { align: 'center' })
    doc.text(`Folio: ${carta.folio ?? '—'} · Emitida: ${fmtFecha(carta.fecha_elaboracion)}`, 105, 297 - 9.5, { align: 'center' })
    return { doc, y }
  }

  // Reduce el tamaño hasta que todo quepa en una hoja
  let k = 1, res = dibujar(k)
  while (res.y > LIM && k > 0.6) { k = Math.round((k - 0.05) * 100) / 100; res = dibujar(k) }
  return res.doc.output('datauristring').split(',')[1]
}

// ══════════════════════════════════════════════════════════════
// MODAL ENVÍO POR CORREO
// ══════════════════════════════════════════════════════════════
function EnviarCartaModal({ carta, club, onClose, onSent }: {
  carta: Carta; club: Club | undefined; onClose: () => void; onSent: () => void
}) {
  const socio: Partial<Socio> = carta.cat_socios ?? {}
  const nombreSocio = [socio.nombre, socio.apellido_paterno].filter(Boolean).join(' ')
  const [para,    setPara]    = useState(carta.enviada_a ?? club?.email_rep ?? '')
  const [cc,      setCc]      = useState('')
  const [asunto,  setAsunto]  = useState(`Carta de Intercambio ${carta.folio ?? ''} — ${nombreSocio}`.replace('  ', ' '))
  const [mensaje, setMensaje] = useState(
    `Estimados,\n\nAdjuntamos la carta de intercambio ${carta.folio ?? ''} de nuestro socio ${nombreSocio}` +
    `${carta.fecha_visita ? `, con fecha de visita ${fmtFecha(carta.fecha_visita)}` : ''}.\n\nQuedamos a sus órdenes.\n\nSaludos cordiales.`)
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState('')

  const listaMails = (t: string) => t.split(/[;,\s]+/).map(x => x.trim()).filter(Boolean)
  const mailOk = (m: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)

  const enviar = async () => {
    const to = listaMails(para), copia = listaMails(cc)
    if (to.length === 0) { setError('Indica al menos un destinatario'); return }
    const malo = [...to, ...copia].find(m => !mailOk(m))
    if (malo) { setError(`Correo inválido: ${malo}`); return }
    if (!asunto.trim()) { setError('El asunto es obligatorio'); return }
    setSending(true); setError('')
    try {
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const htmlCuerpo = await htmlCarta(carta, socio, club ?? {}, 'correo')
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;white-space:pre-wrap;margin-bottom:20px">${esc(mensaje)}</div>${htmlCuerpo}`
      const pdf64 = await pdfCartaBase64(carta, socio, club ?? {})
      const res = await fetch('/api/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil: 'intercambios', to, cc: copia, subject: asunto.trim(), html, text: mensaje,
          adjuntos: [{ filename: `Carta-${carta.folio ?? carta.id}.pdf`, content: pdf64, encoding: 'base64', contentType: 'application/pdf' }],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'No se pudo enviar el correo'); setSending(false); return }
      await dbGolf.from('cartas_intercambio')
        .update({ enviada_at: new Date().toISOString(), enviada_a: to.join(', ') }).eq('id', carta.id)
      setSending(false)
      onSent()
    } catch (e: any) {
      setSending(false); setError(e?.message ?? 'Error al enviar')
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <ModalShell modulo="golf-pos" titulo={`Enviar carta ${carta.folio ?? ''}`} subtitulo={club?.nombre} icono={Mail} size="md" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-ghost" disabled={sending}>Cancelar</button>
        <button onClick={enviar} className="btn-primary" disabled={sending}>
          {sending ? <Loader size={13} className="animate-spin" /> : <Mail size={13} />} Enviar correo
        </button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {carta.enviada_at && (
          <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 10px' }}>
            Ya se envió el {new Date(carta.enviada_at).toLocaleString('es-MX')} a {carta.enviada_a}. Se enviará de nuevo.
          </div>
        )}
        <div>
          <label style={lbl}>Para * (separa varios con coma)</label>
          <input style={inp} value={para} onChange={e => setPara(e.target.value)} placeholder="correo@club.com" />
          {!club?.email_rep && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>El club no tiene correo de representante registrado.</div>}
        </div>
        <div>
          <label style={lbl}>CC</label>
          <input style={inp} value={cc} onChange={e => setCc(e.target.value)} placeholder="Opcional" />
        </div>
        <div>
          <label style={lbl}>Asunto *</label>
          <input style={inp} value={asunto} onChange={e => setAsunto(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Mensaje</label>
          <textarea style={{ ...inp, minHeight: 130, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            value={mensaje} onChange={e => setMensaje(e.target.value)} />
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b' }}>
          La carta se incluye en el cuerpo del correo y como archivo PDF adjunto. Se envía desde el correo configurado para Intercambios.
        </div>
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px', color: '#dc2626', fontSize: 13 }}>{error}</div>}
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// ALERTAS DE CUPO (próximos 60 días)
// ══════════════════════════════════════════════════════════════
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function AlertasCupo({ clubes, refreshKey, onVer }: { clubes: Club[]; refreshKey: number; onVer: (idClub: number, fecha: string) => void }) {
  const [filas, setFilas] = useState<{ club: Club; fecha: string; ocupados: number; max: number; nivel: NivelCupo }[]>([])
  useEffect(() => {
    const hoy = new Date(); const fin = new Date(); fin.setDate(fin.getDate() + 60)
    ;(dbGolf.from('cartas_intercambio') as any).select('id_club_fk, fecha_visita, cartas_intercambio_familiares(id)')
      .gte('fecha_visita', isoLocal(hoy)).lte('fecha_visita', isoLocal(fin))
      .then(({ data }: any) => {
        const cnt = new Map<string, number>()
        ;(data ?? []).forEach((r: any) => { const k = `${r.id_club_fk}|${r.fecha_visita}`; cnt.set(k, (cnt.get(k) ?? 0) + 1 + (r.cartas_intercambio_familiares?.length ?? 0)) })
        const out: typeof filas = []
        cnt.forEach((n, k) => {
          const [id, fecha] = k.split('|')
          const club = clubes.find(c => c.id === Number(id))
          const max = maxDelDia(club, fecha)
          if (!club || max == null) return
          const nivel = nivelCupo(n, max, club.alerta_pct ?? 80)
          if (nivel === 'alerta' || nivel === 'lleno') out.push({ club, fecha, ocupados: n, max, nivel })
        })
        out.sort((a, b) => a.fecha.localeCompare(b.fecha))
        setFilas(out)
      })
  }, [clubes, refreshKey])
  if (filas.length === 0) return null
  return (
    <div style={{ marginBottom: 16, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>
        <ShieldAlert size={14} /> Alertas de cupo · próximos 60 días ({filas.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filas.slice(0, 8).map(f => (
          <button key={`${f.club.id}${f.fecha}`} onClick={() => onVer(f.club.id, f.fecha)}
            style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12.5, padding: 0 }}>
            <span style={{ fontWeight: 600, color: NIVEL_CFG[f.nivel].color, minWidth: 92 }}>{f.nivel === 'lleno' ? 'CUPO LLENO' : 'Por llenarse'}</span>
            <span style={{ color: '#1e293b' }}>{f.club.nombre}</span>
            <span style={{ color: '#64748b' }}>{fmtFecha(f.fecha)}</span>
            <span style={{ color: '#64748b' }}>{f.ocupados}/{f.max}</span>
          </button>
        ))}
        {filas.length > 8 && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>y {filas.length - 8} más… revisa el calendario del club.</span>}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CALENDARIO POR CLUB
// ══════════════════════════════════════════════════════════════
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

function CalendarioClub({ clubes, refreshKey, inicial }: { clubes: Club[]; refreshKey: number; inicial: { idClub: number; fecha: string } | null }) {
  const hoy = new Date()
  const [idClub, setIdClub] = useState<number | ''>(inicial?.idClub ?? '')
  const [anio, setAnio] = useState(inicial ? Number(inicial.fecha.slice(0, 4)) : hoy.getFullYear())
  const [mes, setMes]   = useState(inicial ? Number(inicial.fecha.slice(5, 7)) - 1 : hoy.getMonth())
  const [cartas, setCartas] = useState<Carta[]>([])
  const [loading, setLoading] = useState(false)
  const [diaSel, setDiaSel] = useState<string | null>(inicial?.fecha ?? null)

  useEffect(() => {
    if (idClub === '' && clubes.length) setIdClub((clubes.find(c => c.activo) ?? clubes[0]).id)
  }, [clubes, idClub])

  useEffect(() => {
    if (idClub === '') return
    setLoading(true)
    const desde = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
    const hasta = isoLocal(new Date(anio, mes + 1, 0))
    ;(dbGolf.from('cartas_intercambio') as any)
      .select('id, folio, id_socio_fk, id_club_fk, fecha_elaboracion, fecha_visita, texto_carta, elaborado_por, notas, created_at, cat_socios(nombre, apellido_paterno, numero_socio), cartas_intercambio_familiares(id_familiar_fk, cat_familiares(id, nombre, apellido_paterno, parentesco))')
      .eq('id_club_fk', idClub).gte('fecha_visita', desde).lte('fecha_visita', hasta)
      .order('created_at')
      .then(({ data }: any) => { setCartas((data as Carta[]) ?? []); setLoading(false) })
  }, [idClub, anio, mes, refreshKey])

  const club = clubes.find(c => c.id === idClub)
  const porDia = new Map<string, Carta[]>()
  cartas.forEach(c => { if (c.fecha_visita) porDia.set(c.fecha_visita, [...(porDia.get(c.fecha_visita) ?? []), c]) })

  const primer = new Date(anio, mes, 1)
  const offset = (primer.getDay() + 6) % 7 // lunes = 0
  const diasMes = new Date(anio, mes + 1, 0).getDate()
  const celdas: (string | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: diasMes }, (_, i) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (celdas.length % 7) celdas.push(null)

  const mover = (d: number) => {
    const f = new Date(anio, mes + d, 1); setAnio(f.getFullYear()); setMes(f.getMonth()); setDiaSel(null)
  }
  const hoyIso = isoLocal(hoy)
  const totalOcupados = cartas.reduce((n, c) => n + personasCarta(c), 0)
  const ocupDia = (l: Carta[]) => l.reduce((n, c) => n + personasCarta(c), 0)
  const diasLlenos = club ? Array.from(porDia.entries()).filter(([f, l]) => nivelCupo(ocupDia(l), maxDelDia(club, f), club.alerta_pct) === 'lleno').length : 0
  const sel = diaSel ? (porDia.get(diaSel) ?? []) : []

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" style={{ width: 'auto', minWidth: 240 }} value={idClub}
          onChange={e => { setIdClub(Number(e.target.value)); setDiaSel(null) }}>
          {clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="btn-ghost" onClick={() => mover(-1)}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 140, textAlign: 'center' }}>{MESES[mes]} {anio}</span>
          <button className="btn-ghost" onClick={() => mover(1)}><ChevronRight size={14} /></button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setAnio(hoy.getFullYear()); setMes(hoy.getMonth()) }}>Hoy</button>
        </div>
        {loading && <Loader size={14} className="animate-spin" style={{ color: '#94a3b8' }} />}
        {club && (
          <div style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>
            Política: <b>{club.max_intercambios_dia ?? 'sin límite'}</b> entre semana · <b>{club.max_intercambios_dia_finsemana ?? club.max_intercambios_dia ?? 'sin límite'}</b> sáb/dom · alerta al {club.alerta_pct}%
            {' '}· {totalOcupados} persona(s) en el mes{diasLlenos > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {diasLlenos} día(s) llenos</span>}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {DIAS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#64748b', padding: '4px 0' }}>{d}</div>)}
          {celdas.map((f, i) => {
            if (!f) return <div key={i} />
            const lista = porDia.get(f) ?? []
            const max = maxDelDia(club, f)
            const ocup = ocupDia(lista)
            const nivel = nivelCupo(ocup, max, club?.alerta_pct ?? 80)
            const cfg = NIVEL_CFG[nivel]
            const disp = max != null ? Math.max(0, max - ocup) : null
            return (
              <button key={f} onClick={() => setDiaSel(f === diaSel ? null : f)}
                style={{ textAlign: 'left', minHeight: 74, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                  background: cfg.bg, border: `${f === diaSel ? 2 : 1}px solid ${f === diaSel ? '#2563eb' : cfg.border}`,
                  outline: f === hoyIso ? '2px solid #93c5fd' : 'none', outlineOffset: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{Number(f.slice(8))}</div>
                <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600, marginTop: 2 }}>
                  {ocup} ocupado{ocup === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: 11, color: cfg.color }}>
                  {disp != null ? `${disp} disponible${disp === 1 ? '' : 's'}` : 'sin límite'}
                </div>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11.5, color: '#64748b', flexWrap: 'wrap' }}>
          {(['ok', 'alerta', 'lleno', 'libre'] as NivelCupo[]).map(n => (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: NIVEL_CFG[n].bg, border: `1px solid ${NIVEL_CFG[n].border}` }} />{NIVEL_CFG[n].label}
            </span>
          ))}
        </div>
      </div>

      {diaSel && (
        <div className="card" style={{ marginTop: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {fmtFecha(diaSel)} · {ocupDia(sel)} persona{ocupDia(sel) === 1 ? '' : 's'} ({sel.length} carta{sel.length === 1 ? '' : 's'})
            {maxDelDia(club, diaSel) != null && ` de ${maxDelDia(club, diaSel)}`}
          </div>
          {sel.length === 0 ? <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Sin intercambios ese día.</div> : sel.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 12, fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontWeight: 600, minWidth: 110 }}>{c.folio ?? `#${c.id}`}</span>
              <span>{[c.cat_socios?.nombre, c.cat_socios?.apellido_paterno].filter(Boolean).join(' ')}</span>
              {c.cat_socios?.numero_socio && <span style={{ color: '#94a3b8' }}>#{c.cat_socios.numero_socio}</span>}
              {famsDeCarta(c).length > 0 && <span style={{ color: '#2563eb' }}>+ {famsDeCarta(c).map(f => f.nombre).join(', ')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function IntercambiosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir  = canWrite('golf-intercambios')
  const puedeEliminar  = canDelete()

  const [tab, setTab] = useState<'cartas' | 'calendario' | 'clubes'>('cartas')
  const [verCal, setVerCal] = useState<{ idClub: number; fecha: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pgIdx, setPgIdx]   = useState(0)
  const [pgSize, setPgSize] = useState(25)

  // ── Cartas ─────────────────────────────────────────────────
  const [cartas,   setCartas]   = useState<Carta[]>([])
  const [loadingC, setLoadingC] = useState(true)
  const [searchC,  setSearchC]  = useState('')
  const [filtroClub, setFiltroClub] = useState('')
  const [showCartaModal, setShowCartaModal] = useState(false)
  const [editCarta,      setEditCarta]      = useState<Carta | null>(null)
  const [deletingC, setDeletingC] = useState<number | null>(null)
  const [enviarCarta, setEnviarCarta] = useState<Carta | null>(null)

  // ── Clubes ─────────────────────────────────────────────────
  const [clubes,   setClubes]   = useState<Club[]>([])
  const [loadingCl, setLoadingCl] = useState(true)
  const [searchCl,  setSearchCl]  = useState('')
  const [showClubModal, setShowClubModal] = useState(false)
  const [editClub,      setEditClub]      = useState<Club | null>(null)
  const [deletingCl, setDeletingCl] = useState<number | null>(null)

  // ── Carga clubes ───────────────────────────────────────────
  const fetchClubes = useCallback(async () => {
    setLoadingCl(true)
    const { data } = await dbGolf.from('cat_clubes_intercambio')
      .select('*').order('nombre')
    setClubes((data as Club[]) ?? [])
    setLoadingCl(false)
  }, [])

  // ── Carga cartas ───────────────────────────────────────────
  const fetchCartas = useCallback(async () => {
    setLoadingC(true)
    let q = (dbGolf.from('cartas_intercambio') as any)
      .select(`
        id, folio, id_socio_fk, id_club_fk,
        fecha_elaboracion, fecha_visita, texto_carta,
        elaborado_por, notas, enviada_at, enviada_a, created_at,
        cat_socios(nombre, apellido_paterno, numero_socio),
        cat_clubes_intercambio(nombre, ciudad, estado),
        cartas_intercambio_familiares(id_familiar_fk, cat_familiares(id, nombre, apellido_paterno, apellido_materno, parentesco))
      `)
      .order('created_at', { ascending: false })
    if (filtroClub) q = q.eq('id_club_fk', Number(filtroClub))
    const { data } = await q
    setCartas((data as Carta[]) ?? [])
    setLoadingC(false)
  }, [filtroClub])

  useEffect(() => { fetchClubes() }, [fetchClubes])
  useEffect(() => { fetchCartas() }, [fetchCartas])

  // ── Filtro de cartas ───────────────────────────────────────
  const cartasFiltradas = cartas.filter(c => {
    if (!searchC) return true
    const q = searchC.toLowerCase()
    const socio = c.cat_socios
    const nombre = [socio?.nombre, socio?.apellido_paterno].filter(Boolean).join(' ').toLowerCase()
    return nombre.includes(q) || (socio?.numero_socio ?? '').toLowerCase().includes(q) ||
      (c.folio ?? '').toLowerCase().includes(q) ||
      (c.cat_clubes_intercambio?.nombre ?? '').toLowerCase().includes(q)
  })

  const clubesFiltrados = clubes.filter(c =>
    !searchCl || c.nombre.toLowerCase().includes(searchCl.toLowerCase()) ||
    (c.ciudad ?? '').toLowerCase().includes(searchCl.toLowerCase())
  )

  // ── Eliminar carta ─────────────────────────────────────────
  const eliminarCarta = async (id: number, folio: string | null) => {
    if (!confirm(`¿Eliminar la carta ${folio ?? `#${id}`}? Esta acción no se puede deshacer.`)) return
    setDeletingC(id)
    await dbGolf.from('cartas_intercambio').delete().eq('id', id)
    setDeletingC(null)
    fetchCartas()
  }

  const eliminarClub = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar el club "${nombre}"?`)) return
    setDeletingCl(id)
    const { error } = await dbGolf.from('cat_clubes_intercambio').delete().eq('id', id)
    setDeletingCl(null)
    if (error) alert('No se puede eliminar: el club tiene cartas asociadas.')
    else fetchClubes()
  }

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left' as const, fontWeight: 600,
    fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em',
  }
  const tdStyle: React.CSSProperties = { padding: '9px 12px', fontSize: 13 }

  const curPg = Math.min(pgIdx, Math.max(0, Math.ceil(cartasFiltradas.length / pgSize) - 1))
  const cartasFiltradasPag = cartasFiltradas.slice(curPg * pgSize, (curPg + 1) * pgSize)
  useEffect(() => { setPgIdx(0) }, [cartasFiltradas.length])

  return (
    <div style={{ padding: '28px 36px', animation: 'fadeIn 0.3s ease-out' }}>

        <PageHeader
          variant="xl"
          backHref="/golf"
          icon={ArrowRightLeft}
          color="#2563eb"
          eyebrowLabel="Golf"
          title="Cartas de Intercambio"
          subtitle="Emisión, historial y catálogo de clubes con convenio"
          actions={<>
            {tab === 'cartas' && puedeEscribir && (
              <button className="btn-primary" onClick={() => { setEditCarta(null); setShowCartaModal(true) }}>
                <Plus size={14} /> Nueva Carta
              </button>
            )}
            {tab === 'clubes' && puedeEscribir && (
              <button className="btn-primary" onClick={() => { setEditClub(null); setShowClubModal(true) }}>
                <Plus size={14} /> Nuevo Club
              </button>
            )}
          </>}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20,
          background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {([
            { key: 'cartas', label: 'Cartas emitidas', icon: ArrowRightLeft },
            { key: 'calendario', label: 'Calendario por club', icon: CalendarDays },
            { key: 'clubes', label: 'Clubes', icon: Building2 },
          ] as const).map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                  borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? '#2563eb' : 'var(--text-muted)',
                  boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s' }}>
                <Icon size={14} /> {t.label}
                {t.key === 'cartas' && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 10, background: tab === 'cartas' ? '#eff6ff' : '#e2e8f0',
                  color: tab === 'cartas' ? '#2563eb' : '#64748b' }}>{cartas.length}</span>}
                {t.key === 'clubes' && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 10, background: tab === 'clubes' ? '#eff6ff' : '#e2e8f0',
                  color: tab === 'clubes' ? '#2563eb' : '#64748b' }}>{clubes.length}</span>}
              </button>
            )
          })}
        </div>

        <AlertasCupo clubes={clubes} refreshKey={refreshKey + cartas.length}
          onVer={(idClub, fecha) => { setVerCal({ idClub, fecha }); setTab('calendario') }} />

        {/* ══ TAB: CALENDARIO ══════════════════════════════════ */}
        {tab === 'calendario' && (
          <CalendarioClub clubes={clubes} refreshKey={refreshKey + cartas.length} inicial={verCal} />
        )}

        {/* ══ TAB: CARTAS ══════════════════════════════════════ */}
        {tab === 'cartas' && (
          <>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
                <Search size={12} style={{ position: 'absolute', left: 9, top: '50%',
                  transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 1 }} />
                <input className="input" style={{ paddingLeft: 28 }}
                  placeholder="Buscar por socio, folio o club…"
                  value={searchC} onChange={e => setSearchC(e.target.value)} />
              </div>
              <select className="select" style={{ width: 'auto', minWidth: 200 }}
                value={filtroClub} onChange={e => setFiltroClub(e.target.value)}>
                <option value="">Todos los clubes</option>
                {clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <button className="btn-ghost" onClick={fetchCartas}>
                <RefreshCw size={13} className={loadingC ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Folio</th>
                    <th style={thStyle}>Socio</th>
                    <th style={thStyle}>Club destino</th>
                    <th style={thStyle}>Elaboración</th>
                    <th style={thStyle}>Fecha visita</th>
                    <th style={thStyle}>Elaborado por</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingC ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                      <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: '#94a3b8' }} />
                    </td></tr>
                  ) : cartasFiltradas.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      {searchC || filtroClub ? 'Sin resultados para los filtros aplicados' : 'No hay cartas de intercambio emitidas aún'}
                    </td></tr>
                  ) : cartasFiltradasPag.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
                          {c.folio ?? `#${c.id}`}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{[c.cat_socios?.nombre, c.cat_socios?.apellido_paterno].filter(Boolean).join(' ')}</div>
                        {c.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: '#94a3b8' }}>#{c.cat_socios.numero_socio}</div>}
                        {famsDeCarta(c).length > 0 && (
                          <div style={{ fontSize: 11, color: '#2563eb', marginTop: 2 }}>
                            + {famsDeCarta(c).map(f => f.nombre).join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{c.cat_clubes_intercambio?.nombre ?? '—'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {[c.cat_clubes_intercambio?.ciudad, c.cat_clubes_intercambio?.estado].filter(Boolean).join(', ')}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {fmtFecha(c.fecha_elaboracion)}
                      </td>
                      <td style={{ ...tdStyle, color: c.fecha_visita ? '#059669' : '#94a3b8', whiteSpace: 'nowrap' }}>
                        {fmtFecha(c.fecha_visita)}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12 }}>
                        {c.elaborado_por ?? '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" style={{ padding: '5px 7px' }}
                            title="Imprimir carta"
                            onClick={() => imprimirCarta(c, c.cat_socios ?? {}, clubes.find(cl => cl.id === c.id_club_fk) ?? {})}>
                            <Printer size={13} />
                          </button>
                          {puedeEscribir && (
                            <button className="btn-ghost" style={{ padding: '5px 7px', color: c.enviada_at ? '#15803d' : undefined }}
                              title={c.enviada_at ? `Enviada ${new Date(c.enviada_at).toLocaleDateString('es-MX')} a ${c.enviada_a}. Reenviar` : 'Enviar por correo'}
                              onClick={() => setEnviarCarta(c)}>
                              <Mail size={13} />
                            </button>
                          )}
                          {puedeEscribir && (
                            <button className="btn-ghost" style={{ padding: '5px 7px' }} title="Editar"
                              onClick={() => { setEditCarta(c); setShowCartaModal(true) }}>
                              <Edit2 size={13} />
                            </button>
                          )}
                          {puedeEliminar && (
                            <button className="btn-ghost" style={{ padding: '5px 7px', color: '#dc2626' }}
                              title="Eliminar" disabled={deletingC === c.id}
                              onClick={() => eliminarCarta(c.id, c.folio)}>
                              {deletingC === c.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <Paginador page={curPg} pageSize={pgSize} totalItems={cartasFiltradas.length} onChange={setPgIdx}
                onPageSizeChange={n => { setPgSize(n); setPgIdx(0) }} />
            </div>
          </>
        )}

        {/* ══ TAB: CLUBES ══════════════════════════════════════ */}
        {tab === 'clubes' && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
                <Search size={12} style={{ position: 'absolute', left: 9, top: '50%',
                  transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 1 }} />
                <input className="input" style={{ paddingLeft: 28 }}
                  placeholder="Buscar club…"
                  value={searchCl} onChange={e => setSearchCl(e.target.value)} />
              </div>
              <button className="btn-ghost" onClick={fetchClubes}>
                <RefreshCw size={13} className={loadingCl ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Club</th>
                    <th style={thStyle}>Ubicación</th>
                    <th style={thStyle}>Representante</th>
                    <th style={thStyle}>Teléfono / Email</th>
                    <th style={thStyle}>Máx. por día</th>
                    <th style={thStyle}>Estado</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCl ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                      <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: '#94a3b8' }} />
                    </td></tr>
                  ) : clubesFiltrados.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      {searchCl ? 'Sin resultados' : 'No hay clubes registrados. Agrega el primer club.'}
                    </td></tr>
                  ) : clubesFiltrados.map((cl, i) => (
                    <tr key={cl.id} style={{ borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)',
                      opacity: cl.activo ? 1 : 0.6 }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cl.nombre}</div>
                        {cl.notas && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{cl.notas}</div>}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {[cl.ciudad, cl.estado, cl.pais].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td style={tdStyle}>
                        <div>{cl.representante ?? '—'}</div>
                        {cl.cargo_rep && <div style={{ fontSize: 11, color: '#94a3b8' }}>{cl.cargo_rep}</div>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        {cl.telefono_rep && <div>{cl.telefono_rep}</div>}
                        {cl.email_rep && <div style={{ color: '#2563eb' }}>{cl.email_rep}</div>}
                        {cl.contacto && <div style={{ color: '#64748b' }}>Contacto: {cl.contacto}</div>}
                        {!cl.telefono_rep && !cl.email_rep && !cl.contacto && <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        <div>Sem: <b>{cl.max_intercambios_dia ?? '∞'}</b></div>
                        <div>Sáb/Dom: <b>{cl.max_intercambios_dia_finsemana ?? cl.max_intercambios_dia ?? '∞'}</b></div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                          background: cl.activo ? '#f0fdf4' : '#f8fafc',
                          color: cl.activo ? '#15803d' : '#64748b' }}>
                          {cl.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {puedeEscribir && (
                            <button className="btn-ghost" style={{ padding: '5px 7px' }} title="Editar"
                              onClick={() => { setEditClub(cl); setShowClubModal(true) }}>
                              <Edit2 size={13} />
                            </button>
                          )}
                          {puedeEliminar && (
                            <button className="btn-ghost" style={{ padding: '5px 7px', color: '#dc2626' }}
                              title="Eliminar" disabled={deletingCl === cl.id}
                              onClick={() => eliminarClub(cl.id, cl.nombre)}>
                              {deletingCl === cl.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}

      {/* Modales */}
      {showCartaModal && (
        <CartaModal
          carta={editCarta}
          clubes={clubes}
          onClose={() => setShowCartaModal(false)}
          onSaved={() => { setShowCartaModal(false); setRefreshKey(k => k + 1); fetchCartas() }}
        />
      )}
      {enviarCarta && (
        <EnviarCartaModal
          carta={enviarCarta}
          club={clubes.find(cl => cl.id === enviarCarta.id_club_fk)}
          onClose={() => setEnviarCarta(null)}
          onSent={() => { setEnviarCarta(null); fetchCartas() }}
        />
      )}
      {showClubModal && (
        <ClubModal
          club={editClub}
          onClose={() => setShowClubModal(false)}
          onSaved={() => { setShowClubModal(false); fetchClubes() }}
        />
      )}
    </div>
  )
}
