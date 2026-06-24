'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, Edit2, Trash2,
  Printer, ArrowRightLeft, Building2, Users, X, Save,
  Loader, ChevronLeft, AlertTriangle, Check
} from 'lucide-react'
import Link from 'next/link'
import { fechaLocal } from '@/lib/dateUtils'

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
  notas: string | null
  activo: boolean
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
  created_at: string
  cat_socios?: { nombre: string; apellido_paterno: string | null; numero_socio: string | null } | null
  cat_clubes_intercambio?: { nombre: string; ciudad: string | null; estado: string | null } | null
}

// ── Helpers ────────────────────────────────────────────────────
const fmtNombre = (s: Partial<Socio>) =>
  [s.nombre, s.apellido_paterno].filter(Boolean).join(' ')
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Texto base por defecto ─────────────────────────────────────
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
    elaborado_por:     carta?.elaborado_por              ?? '',
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

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

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

    const { error: err } = isNew
      ? await dbGolf.from('cartas_intercambio').insert(payload)
      : await dbGolf.from('cartas_intercambio').update(payload).eq('id', carta!.id)

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg,#0D4F80,#2563eb)', borderRadius: '14px 14px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ArrowRightLeft size={18} style={{ color: '#93c5fd' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
                {isNew ? 'Nueva Carta de Intercambio' : `Editar — ${carta?.folio ?? ''}`}
              </div>
              <div style={{ fontSize: 11, color: '#93c5fd' }}>Balvanera Golf, Polo & Country Club</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

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

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc',
          borderRadius: '0 0 14px 14px' }}>
          <button onClick={onClose} className="btn-ghost" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || (!!socioSel && !socioSel.derecho_intercambios)}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {isNew ? 'Guardar carta' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
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
    notas:        club?.notas        ?? '',
    activo:       club?.activo       ?? true,
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
      notas:        form.notas        || null,
      activo:       form.activo,
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg,#0D4F80,#0891b2)', borderRadius: '14px 14px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} style={{ color: '#7dd3fc' }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
              {club ? 'Editar Club' : 'Nuevo Club de Intercambio'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: 8, padding: '5px 7px', cursor: 'pointer', color: '#fff' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc',
          borderRadius: '0 0 14px 14px' }}>
          <button onClick={onClose} className="btn-ghost" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// IMPRESIÓN DE CARTA
// ══════════════════════════════════════════════════════════════
async function imprimirCarta(carta: Carta, socio: Partial<Socio>, club: Partial<Club>) {
  let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
  try {
    const { data: cfgRows } = await dbCfg.from('configuracion')
      .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
    ;(cfgRows ?? []).forEach((r: any) => {
      if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
      if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
      if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
    })
  } catch {}
  const logoHtml = orgLogo
    ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
    : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
  const win = window.open('', '_blank', 'width=800,height=700')
  if (!win) return
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Carta de Intercambio — ${carta.folio ?? ''}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Georgia',serif;font-size:13px;color:#1e293b;padding:0}
    .page{width:210mm;min-height:297mm;margin:0 auto;padding:20mm 22mm;position:relative}
    /* Encabezado */
    .org-header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #0D4F80;padding-bottom:14px;margin-bottom:24px}
    .org-nombre{font-size:18px;font-weight:700;color:#0D4F80;margin:0 0 2px}
    .org-sub{font-size:11px;color:#64748b}
    .doc-title{font-size:14px;font-weight:600;color:#0D4F80;margin-bottom:2px}
    .folio-lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em}
    .folio-val{font-size:18px;font-weight:700;color:#0D4F80;letter-spacing:1px}
    /* Tipo documento */
    .doc-type{text-align:center;margin-bottom:22px}
    .doc-type h1{font-size:17px;font-weight:700;color:#0D4F80;letter-spacing:2px;text-transform:uppercase;border:2px solid #0D4F80;display:inline-block;padding:6px 24px;border-radius:4px}
    /* Fechas */
    .fechas{display:flex;gap:32px;margin-bottom:22px;font-size:12px;color:#475569}
    .fecha-item span{font-weight:600;color:#1e293b}
    /* Destinatario */
    .destinatario{margin-bottom:22px;background:#f8fafc;border-left:3px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0}
    .dest-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:6px}
    .dest-nombre{font-size:14px;font-weight:700;color:#0D4F80}
    .dest-cargo{font-size:12px;color:#475569}
    .dest-club{font-size:13px;font-weight:600;color:#2563eb;margin-top:2px}
    .dest-lugar{font-size:11px;color:#64748b}
    /* Saludo */
    .saludo{margin-bottom:16px;font-size:13px}
    /* Cuerpo */
    .cuerpo{line-height:1.8;font-size:13px;text-align:justify;color:#334155;margin-bottom:22px;white-space:pre-wrap}
    /* Socio box */
    .socio-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;margin-bottom:26px}
    .socio-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3b82f6;margin-bottom:6px}
    .socio-nombre{font-size:15px;font-weight:700;color:#0D4F80}
    .socio-num{font-size:11px;color:#3b82f6;margin-top:2px}
    /* Firma */
    .firma{display:flex;justify-content:space-between;align-items:flex-end;margin-top:40px}
    .firma-bloque{text-align:center;width:200px}
    .firma-linea{border-top:1px solid #0D4F80;padding-top:8px;margin-top:50px}
    .firma-nombre{font-size:12px;font-weight:700;color:#1e293b}
    .firma-cargo{font-size:10px;color:#64748b}
    /* Pie */
    .pie{position:absolute;bottom:15mm;left:22mm;right:22mm;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
    .vigencia{font-size:10px;color:#dc2626;font-style:italic;margin-top:4px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}button{display:none}}
  </style>
</head>
<body>
<div class="page">
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
    <div class="dest-label">A quien corresponda</div>
    ${club.representante ? `<div class="dest-nombre">${club.representante}</div>` : ''}
    ${club.cargo_rep ? `<div class="dest-cargo">${club.cargo_rep}</div>` : ''}
    <div class="dest-club">${club.nombre ?? '—'}</div>
    ${(club.ciudad || club.estado) ? `<div class="dest-lugar">${[club.ciudad, club.estado, club.pais].filter(Boolean).join(', ')}</div>` : ''}
  </div>

  <!-- Saludo -->
  <div class="saludo">Estimado(a) ${club.representante ? club.representante.split(' ')[0] : 'representante'}:</div>

  <!-- Cuerpo de la carta -->
  <div class="cuerpo">${(carta.texto_carta ?? TEXTO_BASE).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

  <!-- Datos del socio -->
  <div class="socio-box">
    <div class="socio-label">Datos del socio</div>
    <div class="socio-nombre">${fmtNombre(socio)}</div>
    ${socio.numero_socio ? `<div class="socio-num">Número de socio: #${socio.numero_socio}</div>` : ''}
  </div>

  <!-- Firma -->
  <div class="firma">
    <div class="firma-bloque">
      <div class="firma-linea">
        <div class="firma-nombre">${carta.elaborado_por ?? 'Dirección General'}</div>
        <div class="firma-cargo">Balvanera Golf, Polo & Country Club</div>
      </div>
    </div>
    <div class="firma-bloque">
      <div class="firma-linea">
        <div class="firma-nombre">Sello del Club</div>
        <div class="firma-cargo"></div>
      </div>
    </div>
  </div>

  ${carta.fecha_visita ? `<div class="vigencia" style="margin-top:18px">* La presente carta es válida exclusivamente para la fecha de visita indicada.</div>` : ''}

  <!-- Pie de página -->
  <div class="pie">
    Balvanera Golf, Polo &amp; Country Club, Corregidora, Querétaro, México<br/>
    Folio: ${carta.folio ?? '—'} · Emitida: ${fmtFecha(carta.fecha_elaboracion)}
  </div>
</div>
<script>window.onload=()=>window.print()</script>
</body>
</html>`
  win.document.write(html)
  win.document.close()
}

// ══════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function IntercambiosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir  = canWrite('golf-intercambios')
  const puedeEliminar  = canDelete()

  const [tab, setTab] = useState<'cartas' | 'clubes'>('cartas')

  // ── Cartas ─────────────────────────────────────────────────
  const [cartas,   setCartas]   = useState<Carta[]>([])
  const [loadingC, setLoadingC] = useState(true)
  const [searchC,  setSearchC]  = useState('')
  const [filtroClub, setFiltroClub] = useState('')
  const [showCartaModal, setShowCartaModal] = useState(false)
  const [editCarta,      setEditCarta]      = useState<Carta | null>(null)
  const [deletingC, setDeletingC] = useState<number | null>(null)

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
        elaborado_por, notas, created_at,
        cat_socios(nombre, apellido_paterno, numero_socio),
        cat_clubes_intercambio(nombre, ciudad, estado)
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

  return (
    <div style={{ padding: '28px 36px', animation: 'fadeIn 0.3s ease-out' }}>

        {/* Header */}
        <div className="page-header">
          <div className="page-header-left" style={{ display: 'block' }}>
            <Link href="/golf" style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textDecoration: 'none' }}>
              <ChevronLeft size={13} /> Golf
            </Link>
            <div className="page-eyebrow">
              <ArrowRightLeft size={16} style={{ color: '#2563eb' }} />
              <span className="page-eyebrow-label">Golf</span>
            </div>
            <h1 className="page-title-xl">Cartas de Intercambio</h1>
            <p className="page-subtitle">Emisión, historial y catálogo de clubes con convenio</p>
          </div>
          <div className="page-header-actions">
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
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20,
          background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {([
            { key: 'cartas', label: 'Cartas emitidas', icon: ArrowRightLeft },
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
              <select className="select" style={{ minWidth: 200 }}
                value={filtroClub} onChange={e => setFiltroClub(e.target.value)}>
                <option value="">Todos los clubes</option>
                {clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <button className="btn-ghost" onClick={fetchCartas}>
                <RefreshCw size={13} className={loadingC ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
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
                  ) : cartasFiltradas.map((c, i) => (
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Club</th>
                    <th style={thStyle}>Ubicación</th>
                    <th style={thStyle}>Representante</th>
                    <th style={thStyle}>Teléfono / Email</th>
                    <th style={thStyle}>Estado</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCl ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                      <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: '#94a3b8' }} />
                    </td></tr>
                  ) : clubesFiltrados.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
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
                        {!cl.telefono_rep && !cl.email_rep && <span style={{ color: '#94a3b8' }}>—</span>}
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
          </>
        )}

      {/* Modales */}
      {showCartaModal && (
        <CartaModal
          carta={editCarta}
          clubes={clubes}
          onClose={() => setShowCartaModal(false)}
          onSaved={() => { setShowCartaModal(false); fetchCartas() }}
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
