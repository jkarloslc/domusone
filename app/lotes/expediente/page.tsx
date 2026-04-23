'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
import ModalShell from '@/components/ui/ModalShell'
  Search, Home, Users, Shield, FileText, Building2,
  AlertTriangle, Wrench, Zap, ChevronDown, ChevronRight,
  X, Clock, MapPin, Phone, Mail, Car,
  User, Calendar, DollarSign, Loader, MessageSquare, MapPinned, List
} from 'lucide-react'

// ── Tabs compartidos ─────────────────────────────────────────
function LotesTabs() {
  const pathname = usePathname()
  const tabs = [
    { href: '/lotes', label: 'Catálogo', icon: List },
    { href: '/lotes/expediente', label: 'Expediente de Lote', icon: MapPinned },
  ]
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
      {tabs.map(t => {
        const active = pathname === t.href || (t.href !== '/lotes' && pathname.startsWith(t.href))
        const Icon = t.icon
        return (
          <Link key={t.href} href={t.href}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px',
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -2, textDecoration: 'none', transition: 'all 0.15s',
              background: 'none',
            }}>
            <Icon size={14} />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

// ── Tipos ─────────────────────────────────────────────────────
type Lote = Record<string, any>

const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_COLOR: Record<string, string> = {
  'Libre': '#15803d', 'Vendido': '#2563eb', 'Bloqueado': '#dc2626',
  'Abierta': '#dc2626', 'En Proceso': '#d97706', 'Cerrada': '#15803d',
  'Vigente': '#15803d', 'Vencido': '#dc2626', 'Cancelado': '#94a3b8',
  'Pendiente': '#dc2626', 'Parcial': '#d97706', 'Pagado': '#15803d',
}
const statusBadge = (s: string | null | undefined) => {
  if (!s) return null
  const color = STATUS_COLOR[s] ?? '#64748b'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: color + '18', color, border: `1px solid ${color}40` }}>
      {s}
    </span>
  )
}

function Section({ icon: Icon, title, count, color = '#2563eb', children, defaultOpen = false }:
  { icon: any; title: string; count?: number; color?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: open ? '1px solid #e2e8f0' : 'none' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: '#1e293b', flex: 1, textAlign: 'left' }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 10, background: count > 0 ? color + '18' : '#f1f5f9', color: count > 0 ? color : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
            {count}
          </span>
        )}
        {open ? <ChevronDown size={14} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />}
      </button>
      {open && <div style={{ padding: '14px 16px' }}>{children}</div>}
    </div>
  )
}

function DataRow({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#1e293b', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}

function PropietarioModal({ propietario, onClose }: { propietario: any; onClose: () => void }) {
  const [tels, setTels]     = useState<any[]>([])
  const [emails, setEmails] = useState<any[]>([])
  const p = propietario

  useEffect(() => {
    dbCat.from('propietarios_telefonos').select('*').eq('id_propietario_fk', p.id).eq('activo', true)
      .then(({ data }) => setTels(data ?? []))
    dbCat.from('propietarios_correos').select('*').eq('id_propietario_fk', p.id).eq('activo', true)
      .then(({ data }) => setEmails(data ?? []))
  }, [p.id])

  const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')
  return (
    <ModalShell modulo="lotes" titulo={nombre || p.razon_social} onClose={onClose} maxWidth={540}
    >
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Datos Personales</div>
            <DataRow label="RFC"              value={p.rfc} mono />
            <DataRow label="CURP"             value={p.curp} mono />
            <DataRow label="Fecha nacimiento" value={fmtFecha(p.fecha_nacimiento)} />
            <DataRow label="Estado civil"     value={p.estado_civil} />
            <DataRow label="Asoc. Condóminos" value={p.pertenece_asociacion ? 'Sí' : 'No'} />
          </div>
          {(p.calle || p.ciudad) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Domicilio</div>
              <DataRow label="Calle"   value={p.calle} />
              <DataRow label="Colonia" value={p.colonia} />
              <DataRow label="C.P."   value={p.cp} />
              <DataRow label="Ciudad"  value={p.ciudad} />
            </div>
          )}
          {(tels.length > 0 || emails.length > 0) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Contacto</div>
              {tels.map((t, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><Phone size={12} style={{ color: '#64748b' }} /><span style={{ fontSize: 12 }}>{t.numero}</span></div>)}
              {emails.map((e, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><Mail size={12} style={{ color: '#64748b' }} /><span style={{ fontSize: 12, color: '#2563eb' }}>{e.correo}</span></div>)}
            </div>
          )}
    </ModalShell>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
export default function ExpedientePage({ embedded }: { embedded?: boolean }) {
  const [search, setSearch]       = useState('')
  const [results, setResults]     = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [lote, setLote]           = useState<Lote | null>(null)
  const [loading, setLoading]     = useState(false)
  const [propModal, setPropModal] = useState<any>(null)
  const [propietarios, setPropietarios] = useState<any[]>([])
  const [accesos, setAccesos]           = useState<any[]>([])
  const [visitantes, setVisitantes]     = useState<any[]>([])
  const [vehiculos, setVehiculos]       = useState<any[]>([])
  const [contratos, setContratos]       = useState<any[]>([])
  const [escrituras, setEscrituras]     = useState<any[]>([])
  const [incidencias, setIncidencias]   = useState<any[]>([])
  const [proyectos, setProyectos]       = useState<any[]>([])
  const [cargos, setCargos]             = useState<any[]>([])
  const [cfe, setCfe]                   = useState<any[]>([])
  const [agua, setAgua]                 = useState<any[]>([])
  const [comunicados, setComunicados]   = useState<any[]>([])

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const timer = setTimeout(() => {
      setSearching(true)
      dbCat.from('lotes').select('*').ilike('cve_lote', `%${search}%`).limit(10)
        .then(({ data, error }) => { if (!error) setResults(data ?? []); setSearching(false) })
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const cargarLote = useCallback(async (id: number) => {
    setLoading(true); setResults([]); setSearch('')
    setLote(null)
    setPropietarios([]); setAccesos([]); setVisitantes([]); setVehiculos([])
    setContratos([]); setEscrituras([]); setIncidencias([])
    setProyectos([]); setCargos([]); setCfe([]); setAgua([])
    setComunicados([])

    const [
      { data: loteData }, { data: plRows }, { data: acs }, { data: vists }, { data: vehs },
      { data: conts }, { data: escs }, { data: incs },
      { data: projs }, { data: cars }, { data: cfes }, { data: aguas }
    ] = await Promise.all([
      dbCat.from('lotes').select('*').eq('id', id).single(),
      dbCtrl.from('propietarios_lotes').select('*').eq('id_lote_fk', id).eq('activo', true).order('es_principal', { ascending: false }),
      dbCtrl.from('accesos').select('*').eq('id_lote_fk', id).order('fecha_entrada', { ascending: false }).limit(20),
      dbCat.from('visitantes').select('*').eq('id_lote_fk', id).eq('activo', true).order('created_at', { ascending: false }),
      dbCat.from('vehiculos').select('*').eq('id_lote_fk', id).eq('activo', true).order('created_at', { ascending: false }),
      dbCtrl.from('contratos').select('*').eq('id_lote_fk', id).order('fecha', { ascending: false }),
      dbCtrl.from('escrituras').select('*').eq('id_lote_fk', id).order('fecha', { ascending: false }),
      dbCtrl.from('incidencias').select('*').eq('id_lote_fk', id).order('fecha', { ascending: false }),
      dbCtrl.from('proyectos').select('*').eq('id_lote_fk', id).order('created_at', { ascending: false }),
      dbCtrl.from('cargos').select('*').eq('id_lote_fk', id).in('status', ['Pendiente', 'Parcial']).order('fecha_cargo', { ascending: false }),
      dbCtrl.from('servicios_cfe').select('*').eq('id_lote_fk', id),
      dbCtrl.from('servicios_agua').select('*').eq('id_lote_fk', id),
    ])

    const propIds = Array.from(new Set((plRows ?? []).map((r: any) => r.id_propietario_fk).filter(Boolean)))
    const [clasifRes, seccionRes, propsRes, enviosRes] = await Promise.all([
      loteData?.id_clasificacion_fk ? dbCfg.from('clasificacion').select('nombre').eq('id', loteData.id_clasificacion_fk).single() : Promise.resolve({ data: null }),
      loteData?.id_seccion_fk ? dbCfg.from('secciones').select('nombre').eq('id', loteData.id_seccion_fk).single() : Promise.resolve({ data: null }),
      propIds.length ? dbCat.from('propietarios').select('id, nombre, apellido_paterno, apellido_materno, tipo_persona, rfc, curp, fecha_nacimiento, estado_civil, regimen, razon_social, calle, colonia, ciudad, estado, cp, pais, pertenece_asociacion').in('id', propIds) : Promise.resolve({ data: [] }),
      propIds.length ? dbCtrl.from('comunicados_envios').select('id, id_comunicado_fk, correo_destino, fecha_envio, nombre_destino, status').in('id_propietario_fk', propIds).order('fecha_envio', { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    ])

    if (clasifRes.data) loteData.clasificacion = clasifRes.data
    if (seccionRes.data) loteData.secciones    = seccionRes.data
    setLote(loteData)

    const propsMap: Record<number, any> = {}
    ;(propsRes.data ?? []).forEach((p: any) => { propsMap[p.id] = p })
    setPropietarios((plRows ?? []).map((r: any) => ({ ...r, propietarios: propsMap[r.id_propietario_fk] ?? null })))
    setAccesos(acs ?? []); setVisitantes(vists ?? []); setVehiculos(vehs ?? [])
    setContratos(conts ?? []); setEscrituras(escs ?? []); setIncidencias(incs ?? [])
    setProyectos(projs ?? []); setCargos(cars ?? []); setCfe(cfes ?? []); setAgua(aguas ?? [])

    const envios = enviosRes.data ?? []
    if (envios.length > 0) {
      const comIds = Array.from(new Set(envios.map((e: any) => e.id_comunicado_fk).filter(Boolean)))
      const { data: coms } = await dbCtrl.from('comunicados').select('id, titulo, tipo, created_at').in('id', comIds)
      const comMap: Record<number, any> = {}
      ;(coms ?? []).forEach((c: any) => { comMap[c.id] = c })
      setComunicados(envios.map((e: any) => ({ ...e, comunicado: comMap[e.id_comunicado_fk] ?? null })))
    }
    setLoading(false)
  }, [])

  const saldoTotal = cargos.reduce((a, c) => a + (c.saldo ?? 0), 0)

  return (
    <div className="page-pad" style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Tabs (solo en ruta directa /lotes/expediente, no cuando está embebido) */}
      {!embedded && <LotesTabs />}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MapPinned size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Consulta</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em' }}>Expediente de Lote</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Busca un lote para ver su expediente completo</p>
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', maxWidth: 460, marginBottom: 28 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        {searching && <Loader size={13} className="animate-spin" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />}
        <input className="input" style={{ paddingLeft: 36, paddingRight: 36, fontSize: 15, height: 44 }}
          placeholder="Escribe la clave del lote…" value={search}
          onChange={e => setSearch(e.target.value)} autoFocus />
        {results.length > 0 && (
          <div className="card" style={{ position: 'absolute', top: 50, left: 0, right: 0, zIndex: 50, padding: '4px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
            {results.map(r => (
              <button key={r.id} onClick={() => cargarLote(r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <MapPin size={13} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--blue)' }}>{r.cve_lote ?? `#${r.lote}`}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.status_lote}</span>
                {statusBadge(r.status_lote)}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <Loader size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13 }}>Cargando expediente…</div>
        </div>
      )}

      {!lote && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <Home size={48} style={{ margin: '0 auto 16px', opacity: 0.15 }} />
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Selecciona un lote</div>
          <div style={{ fontSize: 13 }}>Escribe la clave para ver el expediente completo</div>
        </div>
      )}

      {lote && !loading && (
        <div className="inicio-grid" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Columna izquierda */}
          <div>
            <div style={{ background: 'linear-gradient(135deg, #0D4F80 0%, #1A6FAD 100%)', borderRadius: 12, padding: '20px', marginBottom: 12, color: '#fff' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, marginBottom: 2 }}>{lote.cve_lote ?? `#${lote.lote}`}</div>
              <div style={{ fontSize: 13, color: '#bfdbfe', marginBottom: 12 }}>{lote.secciones?.nombre ?? '—'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {lote.status_lote && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: lote.status_lote === 'Libre' ? '#dcfce7' : lote.status_lote === 'Vendido' ? '#dbeafe' : '#fee2e2', color: lote.status_lote === 'Libre' ? '#15803d' : lote.status_lote === 'Vendido' ? '#1d4ed8' : '#dc2626' }}>{lote.status_lote}</span>}
                {saldoTotal > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fee2e2', color: '#dc2626' }}>Adeudo: {fmt(saldoTotal)}</span>}
              </div>
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Datos del Lote</div>
              <DataRow label="Clasificación"   value={lote.clasificacion?.nombre} />
              <DataRow label="Dirección"       value={[lote.calle, lote.numero, lote.Diferenciador, lote.manzana].filter(Boolean).join(' ') || null} />
              <DataRow label="Superficie"      value={lote.superficie ? `${lote.superficie} m²` : null} />
              <DataRow label="Paga cuotas"     value={lote.paga_cuotas} />
              <DataRow label="Clave catastral" value={lote.clave_catastral} mono />
            </div>
          </div>

          {/* Columna derecha */}
          <div>
            <Section icon={Users} title="Propietarios" count={propietarios.length} color="#2563eb" defaultOpen>
              {propietarios.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Sin propietarios</div>
                : propietarios.map(item => {
                  const p = item.propietarios
                  const nombre = p ? [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') : '—'
                  return (
                    <button key={item.id} onClick={() => setPropModal(item.propietarios)}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: item.es_principal ? '#eff6ff' : '#f8fafc', border: `1px solid ${item.es_principal ? '#bfdbfe' : '#e2e8f0'}`, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}
                      onMouseEnter={e => (e.currentTarget.style.background = item.es_principal ? '#dbeafe' : '#f1f5f9')}
                      onMouseLeave={e => (e.currentTarget.style.background = item.es_principal ? '#eff6ff' : '#f8fafc')}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: item.es_principal ? '#dbeafe' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <User size={14} style={{ color: item.es_principal ? '#2563eb' : '#64748b' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: item.es_principal ? '#1d4ed8' : '#334155' }}>{nombre}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{item.fecha_desde && `Desde: ${fmtFecha(item.fecha_desde)}`}</div>
                      </div>
                      {item.es_principal && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#dbeafe', color: '#1d4ed8' }}>ACTUAL</span>}
                    </button>
                  )
                })
              }
            </Section>

            {cargos.length > 0 && (
              <Section icon={DollarSign} title="Adeudos Pendientes" count={cargos.length} color="#dc2626" defaultOpen>
                <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 7, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Saldo Total</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(saldoTotal)}</span>
                </div>
                {cargos.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#f8fafc', borderRadius: 6, marginBottom: 5, border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{c.concepto}</div>
                      {c.periodo_mes && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.periodo_mes} {c.periodo_anio}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.saldo)}</div>
                      {statusBadge(c.status)}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            <Section icon={FileText} title="Contratos" count={contratos.length} color="#7c3aed">
              {contratos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin contratos</div>
                : contratos.map(c => (
                  <div key={c.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 7, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.tipo_contrato ?? 'Contrato'}</span>
                      {statusBadge(c.status)}
                    </div>
                    {c.fecha_contrato && <span style={{ fontSize: 11, color: '#64748b' }}>Fecha: {fmtFecha(c.fecha_contrato)}</span>}
                    {c.pdf_contrato && <a href={c.pdf_contrato} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', display: 'block', marginTop: 4 }}>📄 Ver PDF</a>}
                  </div>
                ))
              }
            </Section>

            <Section icon={Building2} title="Escrituras" count={escrituras.length} color="#0e7490">
              {escrituras.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin escrituras</div>
                : escrituras.map(e => (
                  <div key={e.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 7, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{e.notaria ?? 'Escritura'}</span>
                      {statusBadge(e.status)}
                    </div>
                    {e.numero_escritura && <span style={{ fontSize: 11, color: '#64748b' }}>No. {e.numero_escritura}</span>}
                    {e.pdf_escritura && <a href={e.pdf_escritura} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', display: 'block', marginTop: 4 }}>📄 Ver PDF</a>}
                  </div>
                ))
              }
            </Section>

            <Section icon={AlertTriangle} title="Incidencias" count={incidencias.length} color="#d97706">
              {incidencias.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin incidencias</div>
                : incidencias.slice(0, 8).map(inc => (
                  <div key={inc.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 7, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{inc.tipo ?? 'Incidencia'}</span>
                      {statusBadge(inc.status)}
                    </div>
                    {inc.descripcion && <div style={{ fontSize: 12, color: '#64748b' }}>{inc.descripcion}</div>}
                  </div>
                ))
              }
            </Section>

            <Section icon={Wrench} title="Proyectos" count={proyectos.length} color="#059669">
              {proyectos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin proyectos</div>
                : proyectos.map(pr => (
                  <div key={pr.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 7, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pr.nombre ?? pr.tipo ?? 'Proyecto'}</span>
                      {statusBadge(pr.status)}
                    </div>
                  </div>
                ))
              }
            </Section>

            <Section icon={Users} title="Visitantes Autorizados" count={visitantes.length} color="#0891b2">
              {visitantes.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin visitantes</div>
                : visitantes.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#f8fafc', borderRadius: 7, marginBottom: 5 }}>
                    <User size={13} style={{ color: '#0891b2' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{[v.nombre, v.apellido].filter(Boolean).join(' ')}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{v.tipo_visita}</div>
                    </div>
                  </div>
                ))
              }
            </Section>

            <Section icon={Car} title="Vehículos" count={vehiculos.length} color="#7c3aed">
              {vehiculos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin vehículos</div>
                : vehiculos.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#f8fafc', borderRadius: 7, marginBottom: 5 }}>
                    <Car size={13} style={{ color: '#7c3aed' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{[v.marca, v.modelo, v.color].filter(Boolean).join(' · ')}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Placas: {v.placas ?? '—'}</div>
                    </div>
                  </div>
                ))
              }
            </Section>

            <Section icon={Shield} title="Accesos Recientes" count={accesos.length} color="#0f766e">
              {accesos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin accesos</div>
                : accesos.slice(0, 10).map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{a.tipo_acceso ?? 'Acceso'}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{fmtFecha(a.fecha_entrada)}</span>
                  </div>
                ))
              }
            </Section>

            {(cfe.length > 0 || agua.length > 0) && (
              <Section icon={Zap} title="Servicios" count={cfe.length + agua.length} color="#ca8a04">
                {cfe.map(c => <div key={c.id} style={{ padding: '8px 12px', background: '#fefce8', borderRadius: 7, marginBottom: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>⚡ CFE</div><DataRow label="No. Servicio" value={c.no_servicio} mono /></div>)}
                {agua.map(a => <div key={a.id} style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 7, marginBottom: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af' }}>💧 Agua</div><DataRow label="No. Contrato" value={a.no_contrato} mono /></div>)}
              </Section>
            )}

            {comunicados.length > 0 && (
              <Section icon={MessageSquare} title="Comunicados" count={comunicados.length} color="#7c3aed">
                {comunicados.map(e => {
                  const c = e.comunicado
                  return (
                    <div key={e.id} style={{ padding: '8px 12px', background: '#faf5ff', borderRadius: 7, marginBottom: 6, border: '1px solid #e9d5ff' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c?.titulo ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>📧 {e.correo_destino}</div>
                    </div>
                  )
                })}
              </Section>
            )}
          </div>
        </div>
      )}

      {propModal && <PropietarioModal propietario={propModal} onClose={() => setPropModal(null)} />}
    </div>
  )
}
