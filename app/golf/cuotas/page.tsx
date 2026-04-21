'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  ChevronLeft, Plus, Zap, Search, X, RefreshCw,
  Save, Loader, CreditCard,
} from 'lucide-react'
import Link from 'next/link'

// ── Tipos ────────────────────────────────────────────────────
type Cuota = {
  id: number
  id_socio_fk: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  status: string
  fecha_emision: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  tipo: string
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; id_categoria_fk: number | null } | null
}

type CuotaConfig = {
  id: number
  id_categoria_fk: number | null
  tipo: string
  nombre: string
  monto: number
  meses_aplicar: number
  dia_vencimiento: number
  cat_categorias_socios?: { nombre: string } | null
}

type Socio = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; id_categoria_fk: number | null }
type Categoria = { id: number; nombre: string }

const hoy  = new Date().toISOString().split('T')[0]
const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc   = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const vencida = (f: string | null) => !!f && f < hoy

const STATUS_OPTS = ['', 'PENDIENTE', 'PAGADO', 'CANCELADO']
const TIPO_OPTS   = ['', 'INSCRIPCION', 'MENSUALIDAD', 'PENSION_CARRITO']
const TIPOS_LABEL: Record<string, string> = {
  INSCRIPCION: 'Inscripción', MENSUALIDAD: 'Mensualidad', PENSION_CARRITO: 'Pensión Carrito',
}
const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  PENDIENTE:  { color: '#d97706', bg: '#fffbeb' },
  PAGADO:     { color: '#15803d', bg: '#f0fdf4' },
  CANCELADO:  { color: '#64748b', bg: '#f8fafc' },
  VENCIDA:    { color: '#dc2626', bg: '#fef2f2' },
}

const inp = { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' } as React.CSSProperties
const lbl = { fontSize: 12, fontWeight: 600 as const, color: '#475569', marginBottom: 4, display: 'block' as const }

// ── NuevaCuotaModal ──────────────────────────────────────────
function NuevaCuotaModal({ onClose, onSaved, authUser }: { onClose: () => void; onSaved: () => void; authUser: any }) {
  const [configs, setConfigs]         = useState<CuotaConfig[]>([])
  const [socios, setSocios]           = useState<Socio[]>([])
  const [socioSearch, setSocioSearch] = useState('')
  const [socioSel, setSocioSel]       = useState<Socio | null>(null)
  const [configSel, setConfigSel]     = useState<CuotaConfig | null>(null)
  const [form, setForm] = useState({
    tipo: 'MENSUALIDAD',
    concepto: '',
    periodo: new Date().toISOString().slice(0, 7),
    monto_original: '',
    descuento: '0',
    fecha_vencimiento: '',
    observaciones: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    dbGolf.from('cat_cuotas_config').select('*, cat_categorias_socios(nombre)').eq('activo', true).order('nombre')
      .then(({ data }) => setConfigs((data as CuotaConfig[]) ?? []))
  }, [])

  useEffect(() => {
    if (socioSearch.length < 2) { setSocios([]); return }
    const t = setTimeout(() => {
      dbGolf.from('cat_socios')
        .select('id, nombre, apellido_paterno, apellido_materno, id_categoria_fk')
        .or(`nombre.ilike.%${socioSearch}%,apellido_paterno.ilike.%${socioSearch}%,numero_socio.ilike.%${socioSearch}%`)
        .eq('activo', true).limit(8)
        .then(({ data }) => setSocios((data as unknown as Socio[]) ?? []))
    }, 300)
    return () => clearTimeout(t)
  }, [socioSearch])

  const selectConfig = (c: CuotaConfig) => {
    setConfigSel(c)
    setForm(f => ({
      ...f, tipo: c.tipo, concepto: c.nombre, monto_original: String(c.monto),
      fecha_vencimiento: c.tipo === 'MENSUALIDAD' ? `${f.periodo}-${String(c.dia_vencimiento).padStart(2, '0')}` : '',
    }))
  }

  const handleSave = async () => {
    if (!socioSel) { setError('Selecciona un socio'); return }
    if (!form.concepto.trim()) { setError('El concepto es obligatorio'); return }
    if (!form.monto_original || Number(form.monto_original) <= 0) { setError('El monto debe ser mayor a 0'); return }
    setSaving(true); setError('')
    const { error: err } = await dbGolf.from('cxc_golf').insert({
      id_socio_fk: socioSel.id, tipo: form.tipo, concepto: form.concepto.trim(),
      periodo: form.periodo || null, monto_original: Number(form.monto_original),
      descuento: Number(form.descuento) || 0, status: 'PENDIENTE', fecha_emision: hoy,
      fecha_vencimiento: form.fecha_vencimiento || null, observaciones: form.observaciones || null,
      id_cuota_config_fk: configSel?.id ?? null, usuario_crea: authUser?.nombre ?? null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Nueva Cuota</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={17} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {configs.length > 0 && (
            <div>
              <label style={lbl}>Tipo de cuota <span style={{ fontWeight: 400, color: '#94a3b8' }}>(precarga datos)</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {configs.map(c => (
                  <button key={c.id} onClick={() => selectConfig(c)}
                    style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: configSel?.id === c.id ? '#7c3aed' : '#e2e8f0', background: configSel?.id === c.id ? '#f5f3ff' : '#fff', color: configSel?.id === c.id ? '#7c3aed' : '#475569' }}>
                    {c.nombre} {c.cat_categorias_socios ? `(${c.cat_categorias_socios.nombre})` : ''} · {fmt$(c.monto)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label style={lbl}>Socio *</label>
            {socioSel ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#166534' }}>{nc(socioSel)}</span>
                <button onClick={() => { setSocioSel(null); setSocioSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={13} /></button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input style={inp} placeholder="Buscar por nombre o número…" value={socioSearch} onChange={e => setSocioSearch(e.target.value)} autoFocus />
                {socios.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                    {socios.map(s => (
                      <div key={s.id} onClick={() => { setSocioSel(s); setSocioSearch(''); setSocios([]) }}
                        style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                        {nc(s)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Tipo *</label>
            <select style={inp} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              <option value="INSCRIPCION">Inscripción</option>
              <option value="MENSUALIDAD">Mensualidad</option>
              <option value="PENSION_CARRITO">Pensión Carrito</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Concepto *</label>
              <input style={inp} value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder="ej. Mensualidad Octubre 2026" />
            </div>
            <div>
              <label style={lbl}>Periodo</label>
              <input style={inp} type="month" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Fecha Vencimiento</label>
              <input style={inp} type="date" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Monto *</label>
              <input style={inp} type="number" value={form.monto_original} onChange={e => setForm(f => ({ ...f, monto_original: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label style={lbl}>Descuento</label>
              <input style={inp} type="number" value={form.descuento} onChange={e => setForm(f => ({ ...f, descuento: e.target.value }))} placeholder="0.00" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Observaciones</label>
              <input style={inp} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
            </div>
          </div>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── GenerarMasivoModal ───────────────────────────────────────
function GenerarMasivoModal({ onClose, onSaved, authUser }: { onClose: () => void; onSaved: () => void; authUser: any }) {
  const [configs, setConfigs]         = useState<CuotaConfig[]>([])
  const [configSel, setConfigSel]     = useState<number | ''>('')
  const [periodo, setPeriodo]         = useState(new Date().toISOString().slice(0, 7))
  const [preview, setPreview]         = useState<{ socioId: number; nombre: string; existente: boolean }[]>([])
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [done, setDone]               = useState<{ creadas: number; omitidas: number } | null>(null)
  const [error, setError]             = useState('')

  useEffect(() => {
    dbGolf.from('cat_cuotas_config').select('*, cat_categorias_socios(nombre)').eq('activo', true).order('nombre')
      .then(({ data }) => setConfigs((data as CuotaConfig[]) ?? []))
  }, [])

  const configObj = configs.find(c => c.id === Number(configSel))

  const handlePreview = async () => {
    if (!configSel || !periodo) { setError('Selecciona tipo de cuota y periodo'); return }
    setError(''); setLoadingPrev(true)
    const cfg = configs.find(c => c.id === Number(configSel))!
    const { data: sociosData } = await dbGolf.from('cat_socios')
      .select('id, nombre, apellido_paterno, apellido_materno')
      .eq('activo', true).eq('id_categoria_fk', cfg.id_categoria_fk!)
    if (!sociosData || sociosData.length === 0) {
      setPreview([]); setLoadingPrev(false); setError('No hay socios activos en esta categoría'); return
    }
    const { data: existentes } = await dbGolf.from('cxc_golf')
      .select('id_socio_fk').eq('periodo', periodo).eq('id_cuota_config_fk', cfg.id)
      .in('id_socio_fk', sociosData.map((s: any) => s.id))
    const existSet = new Set((existentes ?? []).map((e: any) => e.id_socio_fk))
    setPreview(sociosData.map((s: any) => ({
      socioId: s.id,
      nombre: [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' '),
      existente: existSet.has(s.id),
    })))
    setLoadingPrev(false)
  }

  const handleGenerar = async () => {
    if (preview.length === 0) return
    setSaving(true); setError('')
    const cfg    = configObj!
    const nuevos = preview.filter(p => !p.existente)
    const [anio, mes] = periodo.split('-').map(Number)
    const fechaVenc   = `${anio}-${String(mes).padStart(2,'0')}-${String(cfg.dia_vencimiento).padStart(2,'0')}`
    const rows = nuevos.map(p => ({
      id_socio_fk: p.socioId, tipo: cfg.tipo, concepto: cfg.nombre, periodo,
      monto_original: cfg.monto, descuento: 0, status: 'PENDIENTE', fecha_emision: hoy,
      fecha_vencimiento: fechaVenc, id_cuota_config_fk: cfg.id, usuario_crea: authUser?.nombre ?? null,
    }))
    if (rows.length > 0) {
      const { error: err } = await dbGolf.from('cxc_golf').insert(rows)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setDone({ creadas: rows.length, omitidas: preview.filter(p => p.existente).length })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Generación Masiva</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Genera cuotas para todos los socios de una categoría</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={17} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#16a34a', marginBottom: 6 }}>Generación completada</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                <strong>{done.creadas}</strong> cuotas creadas · <strong>{done.omitidas}</strong> omitidas (ya existían)
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Tipo de cuota *</label>
                  <select style={inp} value={configSel} onChange={e => { setConfigSel(e.target.value ? Number(e.target.value) : ''); setPreview([]) }}>
                    <option value="">— Seleccionar —</option>
                    {configs.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} · {TIPOS_LABEL[c.tipo] ?? c.tipo} · {fmt$(c.monto)} {c.cat_categorias_socios ? `(${c.cat_categorias_socios.nombre})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Periodo *</label>
                  <input type="month" style={inp} value={periodo} onChange={e => { setPeriodo(e.target.value); setPreview([]) }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={handlePreview} disabled={loadingPrev || !configSel}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: '1px solid #bfdbfe', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', opacity: !configSel ? 0.5 : 1 }}>
                    {loadingPrev ? <Loader size={12} className="animate-spin" /> : <Search size={12} />} Previsualizar
                  </button>
                </div>
              </div>
              {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>}
              {preview.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                    {preview.filter(p => !p.existente).length} a crear · {preview.filter(p => p.existente).length} ya existentes
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                    {preview.map((p, i) => (
                      <div key={p.socioId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < preview.length - 1 ? '1px solid #f1f5f9' : 'none', background: p.existente ? '#f8fafc' : '#fff' }}>
                        <span style={{ fontSize: 13, color: p.existente ? '#94a3b8' : '#1e293b' }}>{p.nombre}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: p.existente ? '#f1f5f9' : '#f0fdf4', color: p.existente ? '#94a3b8' : '#16a34a' }}>
                          {p.existente ? 'Ya existe' : 'Crear'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {configObj && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                      Monto: <strong>{fmt$(configObj.monto)}</strong> · Vencimiento día <strong>{configObj.dia_vencimiento}</strong> de {periodo}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-ghost" onClick={done ? onSaved : onClose}>{done ? 'Listo' : 'Cancelar'}</button>
          {!done && preview.filter(p => !p.existente).length > 0 && (
            <button onClick={handleGenerar} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Zap size={13} />}
              Generar {preview.filter(p => !p.existente).length} cuotas
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────
export default function CuotasGolfPage() {
  const { canWrite, authUser } = useAuth()
  const puedeEscribir = canWrite('golf-cxc')

  const [cuotas, setCuotas]             = useState<Cuota[]>([])
  const [categorias, setCategorias]     = useState<Categoria[]>([])
  const [loading, setLoading]           = useState(true)
  const [busqueda, setBusqueda]         = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [filtroCat, setFiltroCat]       = useState('')
  const [showNueva, setShowNueva]       = useState(false)
  const [showMasivo, setShowMasivo]     = useState(false)

  const fetchCuotas = useCallback(async () => {
    setLoading(true)
    let q = dbGolf.from('cxc_golf')
      .select(`id, id_socio_fk, concepto, periodo, monto_original, descuento, monto_final,
        status, fecha_emision, fecha_vencimiento, fecha_pago, tipo,
        cat_socios(nombre, apellido_paterno, apellido_materno, id_categoria_fk)`)
      .order('fecha_vencimiento', { ascending: false })
      .limit(300)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    if (filtroTipo)   q = q.eq('tipo', filtroTipo)
    const { data } = await q
    const rows = (data as unknown as Cuota[]) ?? []

    // Filtro por categoría client-side
    const filtered = filtroCat
      ? rows.filter(r => String(r.cat_socios?.id_categoria_fk) === filtroCat)
      : rows

    setCuotas(filtered)
    setLoading(false)
  }, [filtroStatus, filtroTipo, filtroCat])

  useEffect(() => { fetchCuotas() }, [fetchCuotas])

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCategorias((data as Categoria[]) ?? []))
  }, [])

  const cuotasF = cuotas.filter(c => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    const nombre = [c.cat_socios?.nombre, c.cat_socios?.apellido_paterno, c.cat_socios?.apellido_materno].filter(Boolean).join(' ').toLowerCase()
    return nombre.includes(q) || c.concepto.toLowerCase().includes(q) || (c.periodo ?? '').includes(q)
  })

  const totalPendiente = cuotasF.filter(c => c.status === 'PENDIENTE').reduce((a, c) => a + c.monto_final, 0)

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', textDecoration: 'none', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2563eb'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94a3b8'}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>/</span>
            <CreditCard size={13} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cuotas</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)' }}>
            Asignación de Cuotas
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Administra las cuotas asignadas — para cobrar ve a <Link href="/golf/cxc" style={{ color: '#2563eb', textDecoration: 'none' }}>CXC Golf</Link></p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={fetchCuotas} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && (
            <>
              <button className="btn-ghost" onClick={() => setShowMasivo(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7c3aed', borderColor: '#ddd6fe' }}>
                <Zap size={13} /> Generar masivo
              </button>
              <button className="btn-primary" onClick={() => setShowNueva(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={13} /> Asignar cuota
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
            placeholder="Socio, concepto, período…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
        </div>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todos los tipos</option>
          {TIPO_OPTS.filter(Boolean).map(t => <option key={t} value={t}>{TIPOS_LABEL[t]}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todos los status</option>
          {STATUS_OPTS.filter(Boolean).map(s => <option key={s} value={s}>{s === 'PENDIENTE' ? 'Pendiente' : s === 'PAGADO' ? 'Pagado' : 'Cancelado'}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {cuotasF.length} registro{cuotasF.length !== 1 ? 's' : ''}
          {totalPendiente > 0 && <span style={{ marginLeft: 8, color: '#d97706', fontWeight: 600 }}>· Pendiente: {fmt$(totalPendiente)}</span>}
        </span>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}><Loader size={18} className="animate-spin" /></div>
        ) : cuotasF.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#94a3b8' }}>
            <CreditCard size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin cuotas</div>
            <div style={{ fontSize: 12 }}>No hay registros con los filtros actuales</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                {['Socio', 'Concepto', 'Tipo', 'Período', 'Vencimiento', 'Monto', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuotasF.map(c => {
                const venc = vencida(c.fecha_vencimiento) && c.status === 'PENDIENTE'
                const stKey = venc ? 'VENCIDA' : c.status
                const st = STATUS_STYLE[stKey] ?? STATUS_STYLE.PENDIENTE
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td style={{ padding: '9px 14px', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {[c.cat_socios?.nombre, c.cat_socios?.apellido_paterno, c.cat_socios?.apellido_materno].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#475569', maxWidth: 220 }}>{c.concepto}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
                        {TIPOS_LABEL[c.tipo] ?? c.tipo}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{c.periodo ?? '—'}</td>
                    <td style={{ padding: '9px 14px', color: venc ? '#dc2626' : '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.fecha_vencimiento ? new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {fmt$(c.monto_final)}
                      {c.descuento > 0 && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4, textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</span>}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: st.bg, color: st.color }}>
                        {venc ? 'Vencida' : c.status === 'PENDIENTE' ? 'Pendiente' : c.status === 'PAGADO' ? 'Pagado' : 'Cancelado'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNueva && <NuevaCuotaModal authUser={authUser} onClose={() => setShowNueva(false)} onSaved={() => { setShowNueva(false); fetchCuotas() }} />}
      {showMasivo && <GenerarMasivoModal authUser={authUser} onClose={() => setShowMasivo(false)} onSaved={() => { setShowMasivo(false); fetchCuotas() }} />}
    </div>
  )
}
