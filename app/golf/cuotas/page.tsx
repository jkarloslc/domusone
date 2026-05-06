'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  ChevronLeft, Plus, Zap, Search, X, RefreshCw,
  Save, Loader, CreditCard, ChevronDown, ChevronRight, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

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

// ── Helpers de periodo ────────────────────────────────────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
function addMeses(year: number, month: number, n: number) {
  const t = year * 12 + (month - 1) + n
  return { year: Math.floor(t / 12), month: (t % 12) + 1 }
}
function diffMeses(y1: number, m1: number, y2: number, m2: number) {
  return (y2 * 12 + (m2 - 1)) - (y1 * 12 + (m1 - 1))
}
function periodoKey(y: number, m: number) { return `${y}-${String(m).padStart(2,'0')}` }
function periodoLabel(y: number, m: number) { return `${MESES[m-1]} ${y}` }
function fechaVenc(y: number, m: number, dia: number) {
  return `${y}-${String(m).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
}

// ── NuevaCuotaModal ──────────────────────────────────────────
function NuevaCuotaModal({ onClose, onSaved, authUser }: { onClose: () => void; onSaved: () => void; authUser: any }) {
  const now = new Date()

  const [configs, setConfigs]         = useState<CuotaConfig[]>([])
  const [loadingCfg, setLoadingCfg]   = useState(true)
  const [showPicker, setShowPicker]   = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const [socios, setSocios]           = useState<Socio[]>([])
  const [socioSearch, setSocioSearch] = useState('')
  const [socioSel, setSocioSel]       = useState<Socio | null>(null)
  const [configSel, setConfigSel]     = useState<CuotaConfig | null>(null)

  // Datos de la cuota
  const [tipo,       setTipo]       = useState('MENSUALIDAD')
  const [concepto,   setConcepto]   = useState('')       // prefijo del concepto
  const [monto,      setMonto]      = useState('')
  const [descuento,  setDescuento]  = useState('0')
  const [diaVenc,    setDiaVenc]    = useState('10')
  const [obs,        setObs]        = useState('')

  // Modalidad
  const [modalidad,  setModalidad]  = useState<'UNICA' | 'RANGO'>('RANGO')

  // Cuota única
  const [periodoU,   setPeriodoU]   = useState(periodoKey(now.getFullYear(), now.getMonth() + 1))
  const [fechaVencU, setFechaVencU] = useState('')

  // Rango mensual
  const [mesIni,  setMesIni]  = useState(now.getMonth() + 1)
  const [anioIni, setAnioIni] = useState(now.getFullYear())
  const [mesFin,  setMesFin]  = useState(now.getMonth() + 1)
  const [anioFin, setAnioFin] = useState(now.getFullYear())

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    dbGolf.from('cat_cuotas_config').select('*, cat_categorias_socios(nombre)').eq('activo', true).order('tipo').order('nombre')
      .then(({ data }) => { setConfigs((data as CuotaConfig[]) ?? []); setLoadingCfg(false) })
  }, [])

  // Búsqueda de socios
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

  // Seleccionar tipo de cuota desde el picker
  const selectConfig = (c: CuotaConfig) => {
    setConfigSel(c)
    setTipo(c.tipo)
    setConcepto(c.nombre)
    setMonto(String(c.monto))
    setDiaVenc(String(c.dia_vencimiento))
    setShowPicker(false)
    setPickerSearch('')
    // Si es inscripción, cambiar a cuota única automáticamente
    if (c.tipo === 'INSCRIPCION') setModalidad('UNICA')
    else setModalidad('RANGO')
  }

  const clearConfig = () => {
    setConfigSel(null)
    setTipo('MENSUALIDAD')
    setConcepto('')
    setMonto('')
    setDescuento('0')
    setDiaVenc('10')
  }

  // ── Preview de cuotas a generar ───────────────────────────
  type Preview = { periodo: string; label: string; monto_original: number; descuento: number; monto_neto: number; fecha_vencimiento: string }

  const preview = useMemo<Preview[]>(() => {
    const m = parseFloat(monto) || 0
    const d = parseFloat(descuento) || 0
    const dia = parseInt(diaVenc) || 10
    if (m <= 0) return []

    if (modalidad === 'UNICA') {
      if (!periodoU) return []
      const [y, mo] = periodoU.split('-').map(Number)
      const fv = fechaVencU || fechaVenc(y, mo, dia)
      return [{ periodo: periodoU, label: periodoLabel(y, mo), monto_original: m, descuento: d, monto_neto: Math.max(0, m - d), fecha_vencimiento: fv }]
    } else {
      const diff = diffMeses(anioIni, mesIni, anioFin, mesFin)
      if (diff < 0) return []
      const rows: Preview[] = []
      for (let i = 0; i <= diff; i++) {
        const { year: y, month: mo } = addMeses(anioIni, mesIni, i)
        rows.push({
          periodo: periodoKey(y, mo),
          label: periodoLabel(y, mo),
          monto_original: m,
          descuento: d,
          monto_neto: Math.max(0, m - d),
          fecha_vencimiento: fechaVenc(y, mo, dia),
        })
      }
      return rows
    }
  }, [monto, descuento, diaVenc, modalidad, periodoU, fechaVencU, mesIni, anioIni, mesFin, anioFin])

  const totalNeto = preview.reduce((a, r) => a + r.monto_neto, 0)

  // Filtro del picker
  const configsFiltradas = configs.filter(c => {
    if (!pickerSearch.trim()) return true
    const q = pickerSearch.toLowerCase()
    return c.nombre.toLowerCase().includes(q) || (c.cat_categorias_socios?.nombre ?? '').toLowerCase().includes(q)
  })

  // ── Guardar ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!socioSel)          { setError('Selecciona un socio'); return }
    if (!concepto.trim())   { setError('El concepto / tipo de cuota es obligatorio'); return }
    if (preview.length === 0) { setError('No hay cuotas a generar. Revisa el monto y el período.'); return }
    setSaving(true); setError('')

    const rows = preview.map(p => ({
      id_socio_fk:       socioSel.id,
      tipo,
      // Concepto dinámico: si es rango y hay más de 1, agrega el mes al nombre
      concepto:          preview.length > 1 ? `${concepto.trim()} — ${p.label}` : concepto.trim(),
      periodo:           p.periodo,
      monto_original:    p.monto_original,
      descuento:         p.descuento,
      // monto_final es GENERATED ALWAYS AS (monto_original - descuento) — NO incluir
      saldo:             p.monto_neto,   // para cobros parciales
      status:            'PENDIENTE',
      fecha_emision:     hoy,
      fecha_vencimiento: p.fecha_vencimiento || null,
      observaciones:     obs || null,
      id_cuota_config_fk: configSel?.id ?? null,
      usuario_crea:      authUser?.nombre ?? null,
    }))

    const { error: err } = await dbGolf.from('cxc_golf').insert(rows)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <ModalShell
      modulo="golf-miembros"
      titulo="Asignar Cuotas"
      subtitulo={socioSel ? nc(socioSel) : undefined}
      onClose={onClose}
      maxWidth={600}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || preview.length === 0 || !socioSel}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: (saving || preview.length === 0 || !socioSel) ? 0.6 : 1 }}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          {preview.length > 1 ? `Generar ${preview.length} cuotas` : 'Guardar cuota'}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── 1. Tipo de cuota (picker popup) ── */}
        <div>
          <label style={lbl}>Tipo de cuota</label>
          <div style={{ position: 'relative' }}>
            {configSel ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f3ff', border: '2px solid #7c3aed', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#7c3aed', color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {TIPOS_LABEL[configSel.tipo] ?? configSel.tipo}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#3b0764' }}>{configSel.nombre}</div>
                    {configSel.cat_categorias_socios && (
                      <div style={{ fontSize: 11, color: '#7c3aed' }}>{configSel.cat_categorias_socios.nombre}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed' }}>{fmt$(configSel.monto)}</span>
                  <button onClick={() => { clearConfig(); setShowPicker(true) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowPicker(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: 13, border: '1px dashed #c4b5fd', borderRadius: 10, background: '#faf5ff', color: '#7c3aed', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ fontWeight: 500 }}>
                  {loadingCfg ? 'Cargando tipos…' : '— Elegir tipo de cuota —'}
                </span>
                <ChevronDown size={14} style={{ transform: showPicker ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
            )}

            {/* Picker popup */}
            {showPicker && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', zIndex: 50, overflow: 'hidden' }}>
                {/* Buscador dentro del picker */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      autoFocus
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Buscar tipo de cuota…"
                      style={{ ...inp, padding: '6px 8px 6px 28px', fontSize: 12 }}
                    />
                  </div>
                </div>
                {/* Lista de configs */}
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {configsFiltradas.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin resultados</div>
                  ) : (
                    configsFiltradas.map(c => (
                      <button key={c.id} onClick={() => selectConfig(c)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', border: 'none', borderBottom: '1px solid #f8fafc', background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#faf5ff'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: c.tipo === 'INSCRIPCION' ? '#fef3c7' : '#ede9fe', color: c.tipo === 'INSCRIPCION' ? '#92400e' : '#6d28d9', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                            {TIPOS_LABEL[c.tipo] ?? c.tipo}
                          </span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.nombre}</div>
                            {c.cat_categorias_socios && (
                              <div style={{ fontSize: 11, color: '#64748b' }}>{c.cat_categorias_socios.nombre}</div>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{fmt$(c.monto)}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>vence día {c.dia_vencimiento}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                {/* Opción manual */}
                <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
                  <button onClick={() => { clearConfig(); setShowPicker(false) }}
                    style={{ width: '100%', padding: '7px 12px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Captura manual (sin precargar datos)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Campos editables del tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px', gap: 8, marginTop: 10 }}>
            <div>
              <label style={{ ...lbl, marginBottom: 2 }}>Concepto / nombre *</label>
              <input style={inp} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="ej. Mensualidad" />
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 2 }}>Monto *</label>
              <input style={inp} type="number" min={0} step={0.01} value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 2 }}>Descuento</label>
              <input style={inp} type="number" min={0} step={0.01} value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 2 }}>Día venc.</label>
              <input style={inp} type="number" min={1} max={31} value={diaVenc} onChange={e => setDiaVenc(e.target.value)} />
            </div>
          </div>

          {/* Tipo (select) — solo manual */}
          {!configSel && (
            <div style={{ marginTop: 8 }}>
              <label style={{ ...lbl, marginBottom: 2 }}>Categoría</label>
              <select style={inp} value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="MENSUALIDAD">Mensualidad</option>
                <option value="INSCRIPCION">Inscripción</option>
                <option value="PENSION_CARRITO">Pensión Carrito</option>
              </select>
            </div>
          )}
        </div>

        {/* ── 2. Socio ── */}
        <div>
          <label style={lbl}>Socio *</label>
          {socioSel ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>{nc(socioSel)}</span>
              <button onClick={() => { setSocioSel(null); setSocioSearch('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ ...inp, paddingLeft: 30 }} placeholder="Buscar por nombre o número de socio…"
                value={socioSearch} onChange={e => setSocioSearch(e.target.value)} autoFocus={!!configSel} />
              {socios.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 20, maxHeight: 200, overflowY: 'auto' }}>
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

        {/* ── 3. Período ── */}
        <div>
          <label style={lbl}>Período a generar</label>

          {/* Toggle Una / Rango */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
            {(['UNICA', 'RANGO'] as const).map(m => (
              <button key={m} onClick={() => setModalidad(m)}
                style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', borderRight: m === 'UNICA' ? '1px solid #e2e8f0' : 'none', background: modalidad === m ? '#f5f3ff' : '#fff', color: modalidad === m ? '#6d28d9' : '#94a3b8' }}>
                {m === 'UNICA' ? 'Una sola cuota' : 'Rango mensual (varias cuotas)'}
              </button>
            ))}
          </div>

          {modalidad === 'UNICA' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...lbl, marginBottom: 2 }}>Mes / año</label>
                <input style={inp} type="month" value={periodoU} onChange={e => setPeriodoU(e.target.value)} />
              </div>
              <div>
                <label style={{ ...lbl, marginBottom: 2 }}>Fecha vencimiento</label>
                <input style={inp} type="date" value={fechaVencU} onChange={e => setFechaVencU(e.target.value)} placeholder="Auto desde día venc." />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Vacío = día {diaVenc} del mes</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Desde</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6 }}>
                  <select style={inp} value={mesIni} onChange={e => {
                    const m = Number(e.target.value); setMesIni(m)
                    if (diffMeses(anioIni, m, anioFin, mesFin) < 0) { setMesFin(m); setAnioFin(anioIni) }
                  }}>
                    {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                  </select>
                  <input style={inp} type="number" value={anioIni} min={2020} max={2040}
                    onChange={e => { const a = Number(e.target.value); setAnioIni(a); if (diffMeses(a, mesIni, anioFin, mesFin) < 0) setAnioFin(a) }} />
                </div>
              </div>
              <div style={{ paddingBottom: 9, color: '#94a3b8', fontSize: 20, textAlign: 'center' }}>→</div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Hasta</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6 }}>
                  <select style={inp} value={mesFin} onChange={e => setMesFin(Number(e.target.value))}>
                    {MESES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
                  </select>
                  <input style={inp} type="number" value={anioFin} min={anioIni} max={2040}
                    onChange={e => setAnioFin(Number(e.target.value))} />
                </div>
              </div>
            </div>
          )}
          {modalidad === 'RANGO' && diffMeses(anioIni, mesIni, anioFin, mesFin) < 0 && (
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>El mes final debe ser igual o posterior al inicial.</div>
          )}
        </div>

        {/* ── Observaciones ── */}
        <div>
          <label style={lbl}>Observaciones</label>
          <input style={inp} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional…" />
        </div>

        {/* ── 4. Preview ── */}
        {preview.length > 0 && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Vista previa — {preview.length} cuota{preview.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {preview.map(p => (
                <div key={p.periodo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{p.label}</span>
                    <span style={{ marginLeft: 10, color: '#94a3b8' }}>
                      vence {new Date(p.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{fmt$(p.monto_neto)}</span>
                    {p.descuento > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(p.monto_original)}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: '#1e293b' }}>Total a generar</span>
              <span style={{ color: '#059669' }}>{fmt$(totalNeto)}</span>
            </div>
          </div>
        )}

        {preview.length === 0 && parseFloat(monto) > 0 && modalidad === 'RANGO' && diffMeses(anioIni, mesIni, anioFin, mesFin) < 0 && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
            El rango de meses no produce cuotas.
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
      </div>
    </ModalShell>
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
    <ModalShell
      modulo="golf-miembros"
      titulo="Generación Masiva"
      subtitulo="Genera cuotas para todos los socios de una categoría"
      onClose={onClose}
      maxWidth={560}
      footer={<>
        <button className="btn-ghost" onClick={done ? onSaved : onClose}>{done ? 'Listo' : 'Cancelar'}</button>
        {!done && preview.filter(p => !p.existente).length > 0 && (
          <button onClick={handleGenerar} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Zap size={13} />}
            Generar {preview.filter(p => !p.existente).length} cuotas
          </button>
        )}
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
    </ModalShell>
  )
}

// ── Página principal ─────────────────────────────────────────
export default function CuotasGolfPage() {
  const { canWrite, authUser } = useAuth()
  const puedeEscribir  = canWrite('golf-cxc')
  const esSuperAdmin   = authUser?.rol === 'superadmin'

  const [cuotas, setCuotas]             = useState<Cuota[]>([])
  const [categorias, setCategorias]     = useState<Categoria[]>([])
  const [loading, setLoading]           = useState(true)
  const [busqueda, setBusqueda]         = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [filtroCat, setFiltroCat]       = useState('')
  const [showNueva, setShowNueva]       = useState(false)
  const [showMasivo, setShowMasivo]     = useState(false)
  // grupos expandidos (socioId → bool); por defecto todos expandidos
  const [expandidos, setExpandidos]     = useState<Record<number, boolean>>({})

  const fetchCuotas = useCallback(async () => {
    setLoading(true)
    // Paginar hasta obtener TODOS los registros (PostgREST devuelve máx. 1000/página)
    const PAGE = 1000
    let allRows: Cuota[] = []
    let from = 0
    while (true) {
      let q = dbGolf.from('cxc_golf')
        .select(`id, id_socio_fk, concepto, periodo, monto_original, descuento, monto_final,
          status, fecha_emision, fecha_vencimiento, fecha_pago, tipo,
          cat_socios(nombre, apellido_paterno, apellido_materno, id_categoria_fk)`)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (filtroStatus) q = q.eq('status', filtroStatus)
      if (filtroTipo)   q = q.eq('tipo', filtroTipo)
      const { data } = await q
      if (!data || data.length === 0) break
      allRows = [...allRows, ...(data as unknown as Cuota[])]
      if (data.length < PAGE) break   // última página
      from += PAGE
    }
    const filtered = filtroCat
      ? allRows.filter(r => String(r.cat_socios?.id_categoria_fk) === filtroCat)
      : allRows
    setCuotas(filtered)
    setLoading(false)
  }, [filtroStatus, filtroTipo, filtroCat])

  useEffect(() => { fetchCuotas() }, [fetchCuotas])

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCategorias((data as Categoria[]) ?? []))
  }, [])

  // ── Eliminar cuota (solo superadmin) ─────────────────────
  const deleteCuota = async (id: number) => {
    if (!confirm('¿Eliminar esta cuota? Esta acción no se puede deshacer.')) return
    await dbGolf.from('cxc_golf').delete().eq('id', id)
    fetchCuotas()
  }

  // ── Filtrado por búsqueda ─────────────────────────────────
  const cuotasF = cuotas.filter(c => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    const nombre = [c.cat_socios?.nombre, c.cat_socios?.apellido_paterno, c.cat_socios?.apellido_materno].filter(Boolean).join(' ').toLowerCase()
    return nombre.includes(q) || c.concepto.toLowerCase().includes(q) || (c.periodo ?? '').includes(q)
  })

  // ── Agrupación por socio ──────────────────────────────────
  type SocioGroup = { socioId: number; nombre: string; cuotas: Cuota[]; totalPendiente: number; totalTotal: number }
  const grupos = useMemo<SocioGroup[]>(() => {
    const map = new Map<number, SocioGroup>()
    for (const c of cuotasF) {
      const sid = c.id_socio_fk
      if (!map.has(sid)) {
        const nombre = [c.cat_socios?.nombre, c.cat_socios?.apellido_paterno, c.cat_socios?.apellido_materno].filter(Boolean).join(' ') || '—'
        map.set(sid, { socioId: sid, nombre, cuotas: [], totalPendiente: 0, totalTotal: 0 })
      }
      const g = map.get(sid)!
      g.cuotas.push(c)
      g.totalTotal += c.monto_final
      if (c.status === 'PENDIENTE') g.totalPendiente += c.monto_final
    }
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [cuotasF])

  const toggleGrupo = (sid: number) =>
    setExpandidos(prev => ({ ...prev, [sid]: !(prev[sid] ?? true) }))
  const isExpanded = (sid: number) => expandidos[sid] ?? true

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
          {grupos.length} socio{grupos.length !== 1 ? 's' : ''} · {cuotasF.length} cuota{cuotasF.length !== 1 ? 's' : ''}
          {totalPendiente > 0 && <span style={{ marginLeft: 8, color: '#d97706', fontWeight: 600 }}>· Pendiente: {fmt$(totalPendiente)}</span>}
        </span>
      </div>

      {/* Vista agrupada por socio */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}><Loader size={18} className="animate-spin" /></div>
      ) : grupos.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#94a3b8' }}>
          <CreditCard size={32} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.3 }} />
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin cuotas</div>
          <div style={{ fontSize: 12 }}>No hay registros con los filtros actuales</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.map(g => {
            const exp = isExpanded(g.socioId)
            return (
              <div key={g.socioId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Cabecera de grupo */}
                <button
                  onClick={() => toggleGrupo(g.socioId)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', border: 'none', borderBottom: exp ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {exp ? <ChevronDown size={14} style={{ color: '#94a3b8' }} /> : <ChevronRight size={14} style={{ color: '#94a3b8' }} />}
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{g.nombre}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#e2e8f0', borderRadius: 20, padding: '1px 8px' }}>
                      {g.cuotas.length} cuota{g.cuotas.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12 }}>
                    {g.totalPendiente > 0 && (
                      <span style={{ color: '#d97706', fontWeight: 600 }}>Pendiente: {fmt$(g.totalPendiente)}</span>
                    )}
                    <span style={{ color: '#64748b' }}>Total: {fmt$(g.totalTotal)}</span>
                  </div>
                </button>

                {/* Tabla de cuotas del socio */}
                {exp && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        {['Concepto', 'Tipo', 'Período', 'Vencimiento', 'Monto', 'Status', ...(esSuperAdmin ? [''] : [])].map(h => (
                          <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.cuotas.map(c => {
                        const venc = vencida(c.fecha_vencimiento) && c.status === 'PENDIENTE'
                        const stKey = venc ? 'VENCIDA' : c.status
                        const st = STATUS_STYLE[stKey] ?? STATUS_STYLE.PENDIENTE
                        return (
                          <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafffe'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                            <td style={{ padding: '8px 14px', color: '#475569', maxWidth: 220 }}>{c.concepto}</td>
                            <td style={{ padding: '8px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
                                {TIPOS_LABEL[c.tipo] ?? c.tipo}
                              </span>
                            </td>
                            <td style={{ padding: '8px 14px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{c.periodo ?? '—'}</td>
                            <td style={{ padding: '8px 14px', color: venc ? '#dc2626' : '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {c.fecha_vencimiento ? new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                              {fmt$(c.monto_final)}
                              {c.descuento > 0 && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4, textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</span>}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: st.bg, color: st.color }}>
                                {venc ? 'Vencida' : c.status === 'PENDIENTE' ? 'Pendiente' : c.status === 'PAGADO' ? 'Pagado' : 'Cancelado'}
                              </span>
                            </td>
                            {esSuperAdmin && (
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                <button
                                  onClick={() => deleteCuota(c.id)}
                                  title="Eliminar cuota"
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 7px', fontSize: 11, border: '1px solid #fecaca', borderRadius: 6, background: '#fff', color: '#dc2626', cursor: 'pointer' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}>
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showNueva && <NuevaCuotaModal authUser={authUser} onClose={() => setShowNueva(false)} onSaved={() => { setShowNueva(false); fetchCuotas() }} />}
      {showMasivo && <GenerarMasivoModal authUser={authUser} onClose={() => setShowMasivo(false)} onSaved={() => { setShowMasivo(false); fetchCuotas() }} />}
    </div>
  )
}
