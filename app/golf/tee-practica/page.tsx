'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Target, Plus, RefreshCw, Search, X, Loader, CheckCircle,
  Printer, ChevronLeft, AlertTriangle, Circle,
} from 'lucide-react'
import Link from 'next/link'

// ── Tipos ────────────────────────────────────────────────────
type Socio = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  numero_socio: string | null
  activo: boolean
  cat_categorias_socios?: { nombre: string } | null
}

type Entrada = {
  id: number
  fecha: string
  num_bolas: number
  usuario: string | null
  notas: string | null
  cat_socios: Socio | null
}

type AdeudoRow = { id: number; concepto: string; monto_final: number; fecha_vencimiento: string | null }

// ── Helpers ──────────────────────────────────────────────────
const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const nombreCompleto = (s: Socio | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const fmtHora  = (d: string) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const fmtFecha = (d: string) =>
  new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
const fmt$ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

// ── Ticket ───────────────────────────────────────────────────
async function abrirTicket(entrada: Entrada, autoPrint = true) {
  const { data: cfg } = await dbGolf.from('cfg_pos').select('*').single()
  const ticketData = {
    id:           entrada.id,
    fecha:        entrada.fecha,
    num_bolas:    entrada.num_bolas,
    socio:        nombreCompleto(entrada.cat_socios),
    numero_socio: entrada.cat_socios?.numero_socio ?? null,
    categoria:    entrada.cat_socios?.cat_categorias_socios?.nombre ?? null,
    notas:        entrada.notas ?? null,
    razon_social: cfg?.razon_social ?? 'Balvanera Golf, Polo & Country Club',
    municipio:    cfg?.municipio ?? '',
    direccion:    cfg?.direccion ?? '',
    rfc:          cfg?.rfc ?? '',
    telefono:     cfg?.telefono ?? '',
    leyenda:      cfg?.leyenda_ticket ?? '¡Buena práctica!',
  }
  const encoded = encodeURIComponent(JSON.stringify(ticketData))
  window.open(`/ticket-tee-practica.html?data=${encoded}${autoPrint ? '&print=1' : ''}`, '_blank', 'width=400,height=700')
}

// ── Modal Nueva Entrada ───────────────────────────────────────
function ModalNuevaEntrada({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Socio[]>([])
  const [buscando, setBuscando] = useState(false)
  const [socioSelec, setSocioSelec] = useState<Socio | null>(null)

  // Validación de adeudos
  const [adeudos, setAdeudos] = useState<AdeudoRow[]>([])
  const [verificandoAdeudo, setVerificandoAdeudo] = useState(false)

  const [numBolas, setNumBolas] = useState(50)
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<Entrada | null>(null)
  const busquedaRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Búsqueda de socio con debounce
  useEffect(() => {
    if (busqueda.length < 2) { setResultados([]); return }
    if (busquedaRef.current) clearTimeout(busquedaRef.current)
    busquedaRef.current = setTimeout(async () => {
      setBuscando(true)
      const { data } = await dbGolf
        .from('cat_socios')
        .select('id, nombre, apellido_paterno, apellido_materno, numero_socio, activo, cat_categorias_socios(nombre)')
        .eq('activo', true)
        .or(`nombre.ilike.%${busqueda}%,apellido_paterno.ilike.%${busqueda}%,numero_socio.ilike.%${busqueda}%`)
        .order('nombre')
        .limit(8)
      setResultados((data as unknown as Socio[]) ?? [])
      setBuscando(false)
    }, 280)
  }, [busqueda])

  // Verificar adeudos al seleccionar socio
  useEffect(() => {
    if (!socioSelec) { setAdeudos([]); return }
    const hoy = localToday()
    setVerificandoAdeudo(true)
    dbGolf
      .from('cxc_golf')
      .select('id, concepto, monto_final, fecha_vencimiento')
      .eq('id_socio_fk', socioSelec.id)
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .lt('fecha_vencimiento', hoy)
      .limit(5)
      .then(({ data }) => {
        setAdeudos((data as AdeudoRow[]) ?? [])
        setVerificandoAdeudo(false)
      })
  }, [socioSelec])

  const handleSeleccionarSocio = (s: Socio) => {
    setSocioSelec(s)
    setBusqueda('')
    setResultados([])
    setError('')
  }

  const handleGuardar = async () => {
    if (!socioSelec) { setError('Selecciona un socio'); return }
    if (adeudos.length > 0) { setError('El socio tiene cuotas vencidas — no puede obtener ticket'); return }
    if (numBolas < 1 || numBolas > 999) { setError('Número de bolas inválido (1-999)'); return }
    setSaving(true); setError('')

    const { data, error: err } = await dbGolf
      .from('ctrl_tee_practica')
      .insert({
        id_socio_fk: socioSelec.id,
        fecha:       new Date().toISOString(),
        num_bolas:   numBolas,
        usuario:     (authUser as any)?.nombre ?? null,
        notas:       notas.trim() || null,
      })
      .select(`
        id, fecha, num_bolas, usuario, notas,
        cat_socios(id, nombre, apellido_paterno, apellido_materno, numero_socio, activo, cat_categorias_socios(nombre))
      `)
      .single()

    if (err || !data) { setError(err?.message ?? 'Error al guardar'); setSaving(false); return }
    setSuccess(data as unknown as Entrada)
    setSaving(false)
  }

  // ── Vista de éxito ──
  if (success) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '36px 32px', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <CheckCircle size={52} color="#059669" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>¡Entrada registrada!</div>
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{nombreCompleto(success.cat_socios)}</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', margin: '12px 0 4px' }}>{success.num_bolas}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>bolas asignadas</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-primary"
              onClick={() => abrirTicket(success, true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={14} /> Imprimir Ticket
            </button>
            <button className="btn-ghost"
              onClick={() => abrirTicket(success, false)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={14} /> Ver Ticket
            </button>
          </div>
          <button className="btn-secondary"
            onClick={() => { onSaved(); onClose() }}
            style={{ marginTop: 12, width: '100%' }}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  const tieneSocio = !!socioSelec
  const tieneAdeudo = adeudos.length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #065f46 0%, #059669 100%)', borderRadius: '16px 16px 0 0', padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={18} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Nueva Entrada</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Tee de Práctica</div>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Búsqueda de socio */}
          {!tieneSocio ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>
                Buscar Socio *
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  autoFocus
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Nombre o número de socio…"
                  style={{ width: '100%', padding: '9px 12px 9px 32px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }}
                />
                {buscando && <Loader size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', animation: 'spin 1s linear infinite' }} />}
              </div>
              {resultados.length > 0 && (
                <div style={{ marginTop: 4, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {resultados.map(s => (
                    <button key={s.id} onClick={() => handleSeleccionarSocio(s)}
                      style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#0369a1' }}>
                        {s.nombre.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombreCompleto(s)}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 6 }}>
                          {s.numero_socio && <span>#{s.numero_socio}</span>}
                          {s.cat_categorias_socios?.nombre && <span>· {s.cat_categorias_socios.nombre}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Socio seleccionado */
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>Socio</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>
                  {socioSelec.nombre.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{nombreCompleto(socioSelec)}</div>
                  <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    {socioSelec.numero_socio && <span>#{socioSelec.numero_socio}</span>}
                    {socioSelec.cat_categorias_socios?.nombre && <span>· {socioSelec.cat_categorias_socios.nombre}</span>}
                  </div>
                </div>
                <button onClick={() => { setSocioSelec(null); setAdeudos([]) }}
                  style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={12} style={{ color: '#64748b' }} />
                </button>
              </div>

              {/* Estado de adeudos */}
              {verificandoAdeudo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                  <Loader size={13} className="animate-spin" /> Verificando cuotas…
                </div>
              ) : tieneAdeudo ? (
                <div style={{ marginTop: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                    <AlertTriangle size={13} /> Socio con adeudo — no puede obtener ticket
                  </div>
                  {adeudos.map(a => (
                    <div key={a.id} style={{ fontSize: 11, color: '#991b1b', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{a.concepto}</span>
                      <span style={{ fontWeight: 600 }}>{fmt$(a.monto_final ?? 0)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                  <Circle size={8} style={{ fill: '#15803d', color: '#15803d' }} /> Sin adeudos — puede obtener ticket
                </div>
              )}
            </div>
          )}

          {/* Número de bolas */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>
              Número de Bolas *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setNumBolas(v => Math.max(1, v - 25))}
                style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <input
                type="number"
                min={1}
                max={999}
                value={numBolas}
                onChange={e => setNumBolas(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
                style={{ width: 90, padding: '8px 12px', fontSize: 20, fontWeight: 700, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={() => setNumBolas(v => Math.min(999, v + 25))}
                style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[50, 100, 150, 200].map(n => (
                  <button key={n} onClick={() => setNumBolas(n)}
                    style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid', cursor: 'pointer',
                      background: numBolas === n ? '#059669' : '#f8fafc',
                      color:      numBolas === n ? '#fff' : '#64748b',
                      borderColor: numBolas === n ? '#059669' : '#e2e8f0' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notas opcionales */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>
              Notas <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
            </label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones adicionales…"
              style={{ width: '100%', padding: '8px 12px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={handleGuardar}
            disabled={saving || !tieneSocio || tieneAdeudo || verificandoAdeudo}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669', border: 'none' }}>
            {saving
              ? <><Loader size={14} className="animate-spin" /> Guardando…</>
              : <><Printer size={14} /> Registrar y Emitir Ticket</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────
export default function TeePracticaPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-tee-practica')

  const [fecha, setFecha]           = useState(localToday)
  const [entradas, setEntradas]     = useState<Entrada[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal]   = useState(false)

  const fetchEntradas = useCallback(async () => {
    setRefreshing(true)
    const { data } = await dbGolf
      .from('ctrl_tee_practica')
      .select(`
        id, fecha, num_bolas, usuario, notas,
        cat_socios(id, nombre, apellido_paterno, apellido_materno, numero_socio, activo, cat_categorias_socios(nombre))
      `)
      .gte('fecha', `${fecha}T00:00:00`)
      .lte('fecha', `${fecha}T23:59:59.999`)
      .order('fecha', { ascending: false })
    setEntradas((data as unknown as Entrada[]) ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [fecha])

  useEffect(() => { fetchEntradas() }, [fetchEntradas])

  const totalBolas = entradas.reduce((a, e) => a + e.num_bolas, 0)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Link href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>
              <ChevronLeft size={14} /> Golf
            </Link>
          </div>
          <div className="page-eyebrow">
            <Target size={16} style={{ color: '#059669' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Tee de Práctica</h1>
          <p className="page-subtitle">Registro de entradas y emisión de tickets — concesionado</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={fetchEntradas} title="Actualizar">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setShowModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669', border: 'none' }}>
              <Plus size={14} /> Nueva Entrada
            </button>
          )}
        </div>
      </div>

      {/* Filtro de fecha + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', fontFamily: 'inherit', background: '#fff' }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ padding: '7px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
            {loading ? '—' : entradas.length} entradas
          </div>
          <div style={{ padding: '7px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, fontSize: 12, color: '#065f46', fontWeight: 600 }}>
            {loading ? '—' : totalBolas.toLocaleString('es-MX')} bolas
          </div>
        </div>
      </div>

      {/* Tabla de entradas */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <Loader size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13 }}>Cargando…</div>
          </div>
        ) : entradas.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Target size={32} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Sin entradas registradas</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {fecha === localToday() ? 'No hay entradas hoy' : `No hay entradas el ${fecha}`}
            </div>
            {puedeEscribir && (
              <button className="btn-primary" onClick={() => setShowModal(true)}
                style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#059669', border: 'none' }}>
                <Plus size={14} /> Registrar entrada
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Folio</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Socio</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Categoría</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Bolas</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Hora</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((e, idx) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = '#f0fdf4')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#64748b' }}>
                      #{String(e.id).padStart(6, '0')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombreCompleto(e.cat_socios)}</div>
                    {e.cat_socios?.numero_socio && (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>#{e.cat_socios.numero_socio}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#475569' }}>
                    {e.cat_socios?.cat_categorias_socios?.nombre ?? '—'}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{e.num_bolas}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#64748b' }}>
                    {fmtHora(e.fecha)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => abrirTicket(e, false)}
                      title="Reimprimir ticket"
                      style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}
                      onMouseEnter={ev => { ev.currentTarget.style.background = '#f0fdf4'; ev.currentTarget.style.color = '#059669' }}
                      onMouseLeave={ev => { ev.currentTarget.style.background = '#fff'; ev.currentTarget.style.color = '#64748b' }}>
                      <Printer size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ModalNuevaEntrada
          onClose={() => setShowModal(false)}
          onSaved={fetchEntradas}
        />
      )}
    </div>
  )
}
