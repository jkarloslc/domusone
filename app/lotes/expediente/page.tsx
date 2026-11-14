'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Search, Home, Users, Shield, FileText, Building2,
  AlertTriangle, HardHat, Zap, ChevronDown, ChevronRight,
  X, Clock, MapPin, Phone, Mail, Car,
  User, Calendar, DollarSign, Loader, MessageSquare, MapPinned, List
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import PageHeader from '@/components/layout/PageHeader'
import LotesTabs from '../LotesTabs'

// ── Tipos ─────────────────────────────────────────────────────
type Lote = Record<string, any>

const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_COLOR: Record<string, string> = {
  'Libre': '#1F7A50', 'Vendido': '#1C1D21', 'Bloqueado': '#C23B3B',
  'Abierta': '#C23B3B', 'En Proceso': '#B5761A', 'Cerrada': '#1F7A50',
  'Vigente': '#1F7A50', 'Vencido': '#C23B3B', 'Cancelado': '#7A7E87',
  'Pendiente': '#C23B3B', 'Parcial': '#B5761A', 'Pagado': '#1F7A50',
}
const statusBadge = (s: string | null | undefined) => {
  if (!s) return null
  const color = STATUS_COLOR[s] ?? '#62666E'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: color, color: '#fff', border: `1px solid ${color}` }}>
      {s}
    </span>
  )
}

function Section({ icon: Icon, title, count, color = '#1C1D21', children, defaultOpen = false }:
  { icon: any; title: string; count?: number; color?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E6E8EB', overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: open ? '1px solid #E6E8EB' : 'none' }}>
        <div className="icon-chip" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} style={{ color: '#1C1D21' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: '#26282D', flex: 1, textAlign: 'left' }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 10, background: count > 0 ? '#E6E8EB' : '#F4F5F7', color: count > 0 ? color : '#7A7E87', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
            {count}
          </span>
        )}
        {open ? <ChevronDown size={14} style={{ color: '#7A7E87', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: '#7A7E87', flexShrink: 0 }} />}
      </button>
      {open && <div style={{ padding: '14px 16px' }}>{children}</div>}
    </div>
  )
}

function DataRow({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #F8F9FA' }}>
      <span style={{ fontSize: 11, color: '#7A7E87', minWidth: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#26282D', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
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
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(85vh - 80px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1C1D21', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Datos Personales</div>
            <DataRow label="RFC"              value={p.rfc} mono />
            <DataRow label="CURP"             value={p.curp} mono />
            <DataRow label="Fecha nacimiento" value={fmtFecha(p.fecha_nacimiento)} />
            <DataRow label="Estado civil"     value={p.estado_civil} />
          </div>
          {(p.calle || p.ciudad) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1C1D21', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Domicilio</div>
              <DataRow label="Calle"   value={p.calle} />
              <DataRow label="Colonia" value={p.colonia} />
              <DataRow label="C.P."   value={p.cp} />
              <DataRow label="Ciudad"  value={p.ciudad} />
            </div>
          )}
          {(tels.length > 0 || emails.length > 0) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1C1D21', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Contacto</div>
              {tels.map((t, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><Phone size={12} style={{ color: '#62666E' }} /><span style={{ fontSize: 12 }}>{t.numero}</span></div>)}
              {emails.map((e, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><Mail size={12} style={{ color: '#62666E' }} /><span style={{ fontSize: 12, color: '#1C1D21' }}>{e.correo}</span></div>)}
            </div>
          )}
        </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════
function ExpedienteContent({ embedded }: { embedded?: boolean }) {
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
  const [construcciones, setConstrucciones] = useState<any[]>([])
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
    setConstrucciones([]); setCargos([]); setCfe([]); setAgua([])
    setComunicados([])

    const [
      { data: loteData }, { data: plRows }, { data: acs }, { data: vists }, { data: vehs },
      { data: conts }, { data: escs }, { data: incs },
      { data: constrs }, { data: cars }, { data: cfes }, { data: aguas }
    ] = await Promise.all([
      dbCat.from('lotes').select('*').eq('id', id).single(),
      dbCtrl.from('propietarios_lotes').select('*').eq('id_lote_fk', id).eq('activo', true).order('es_principal', { ascending: false }),
      dbCtrl.from('accesos').select('*').eq('id_lote_fk', id).order('fecha_entrada', { ascending: false }).limit(20),
      dbCat.from('visitantes').select('*').eq('id_lote_fk', id).eq('activo', true).order('created_at', { ascending: false }),
      dbCat.from('vehiculos').select('*').eq('id_lote_fk', id).eq('activo', true).order('created_at', { ascending: false }),
      dbCtrl.from('contratos').select('*').eq('id_lote_fk', id).order('fecha', { ascending: false }),
      dbCtrl.from('escrituras').select('*').eq('id_lote_fk', id).order('fecha', { ascending: false }),
      dbCtrl.from('incidencias').select('*').eq('id_lote_fk', id).order('fecha', { ascending: false }),
      dbCtrl.from('construcciones').select('*').eq('id_lote_fk', id).order('created_at', { ascending: false }),
      dbCtrl.from('cargos').select('*').eq('id_lote_fk', id).in('status', ['Pendiente', 'Parcial']).order('fecha_cargo', { ascending: false }),
      dbCtrl.from('servicios_cfe').select('*').eq('id_lote_fk', id),
      dbCtrl.from('servicios_agua').select('*').eq('id_lote_fk', id),
    ])

    const propIds = Array.from(new Set((plRows ?? []).map((r: any) => r.id_propietario_fk).filter(Boolean)))
    const [clasifRes, seccionRes, propsRes, enviosRes] = await Promise.all([
      loteData?.id_clasificacion_fk ? dbCfg.from('clasificacion').select('nombre').eq('id', loteData.id_clasificacion_fk).single() : Promise.resolve({ data: null }),
      loteData?.id_seccion_fk ? dbCfg.from('secciones').select('nombre').eq('id', loteData.id_seccion_fk).single() : Promise.resolve({ data: null }),
      propIds.length ? dbCat.from('propietarios').select('id, nombre, apellido_paterno, apellido_materno, tipo_persona, rfc, curp, fecha_nacimiento, estado_civil, regimen, razon_social, calle, colonia, ciudad, estado, cp, pais').in('id', propIds) : Promise.resolve({ data: [] }),
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
    setConstrucciones(constrs ?? []); setCargos(cars ?? []); setCfe(cfes ?? []); setAgua(aguas ?? [])

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

      <PageHeader backHref="/residencial"
        variant="xl"
        icon={MapPinned}
        eyebrowLabel="Consulta"
        title="Expediente de Lote"
        subtitle="Busca un lote para ver su expediente completo"
      />

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
                onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FA')}
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
            <div style={{ background: '#1C1D21', borderRadius: 12, padding: '20px', marginBottom: 12, color: '#fff' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, marginBottom: 2 }}>{lote.cve_lote ?? `#${lote.lote}`}</div>
              <div style={{ fontSize: 13, color: '#C9CCD3', marginBottom: 12 }}>{lote.secciones?.nombre ?? '—'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {lote.status_lote && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: lote.status_lote === 'Libre' ? '#1F7A50' : lote.status_lote === 'Vendido' ? '#E6E8EB' : '#C23B3B', color: lote.status_lote === 'Libre' ? '#fff' : lote.status_lote === 'Vendido' ? '#26282D' : '#fff' }}>{lote.status_lote}</span>}
                {saldoTotal > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#C23B3B', color: '#fff' }}>Adeudo: {fmt(saldoTotal)}</span>}
              </div>
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Datos del Lote</div>
              <DataRow label="Clasificación"   value={lote.clasificacion?.nombre} />
              <DataRow label="Dirección"       value={[lote.calle, lote.numero, lote.Diferenciador, lote.manzana].filter(Boolean).join(' ') || null} />
              <DataRow label="Superficie"      value={lote.superficie ? `${lote.superficie} m²` : null} />
              <DataRow label="Paga cuotas"     value={lote.paga_cuotas} />
              <DataRow label="Asoc. Condóminos" value={lote.pertenece_asociacion ? 'Sí' : 'No'} />
              <DataRow label="Clave catastral" value={lote.clave_catastral} mono />
            </div>
          </div>

          {/* Columna derecha */}
          <div>
            <Section icon={Users} title="Propietarios" count={propietarios.length} color="#1C1D21" defaultOpen>
              {propietarios.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Sin propietarios</div>
                : propietarios.map(item => {
                  const p = item.propietarios
                  const nombre = p ? [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') : '—'
                  return (
                    <button key={item.id} onClick={() => setPropModal(item.propietarios)}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: item.es_principal ? '#F4F5F7' : '#F8F9FA', border: `1px solid ${item.es_principal ? '#C9CCD3' : '#E6E8EB'}`, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}
                      onMouseEnter={e => (e.currentTarget.style.background = item.es_principal ? '#E6E8EB' : '#F4F5F7')}
                      onMouseLeave={e => (e.currentTarget.style.background = item.es_principal ? '#F4F5F7' : '#F8F9FA')}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E6E8EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <User size={14} style={{ color: item.es_principal ? '#1C1D21' : '#62666E' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: item.es_principal ? '#26282D' : '#33363C' }}>{nombre}</div>
                        <div style={{ fontSize: 11, color: '#62666E', marginTop: 1 }}>{item.fecha_desde && `Desde: ${fmtFecha(item.fecha_desde)}`}</div>
                      </div>
                      {item.es_principal && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#E6E8EB', color: '#26282D' }}>ACTUAL</span>}
                    </button>
                  )
                })
              }
            </Section>

            {cargos.length > 0 && (
              <Section icon={DollarSign} title="Adeudos Pendientes" count={cargos.length} color="#C23B3B" defaultOpen>
                <div style={{ padding: '8px 12px', background: '#F4F5F7', borderRadius: 7, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#C23B3B', fontWeight: 600 }}>Saldo Total</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#C23B3B', fontVariantNumeric: 'tabular-nums' }}>{fmt(saldoTotal)}</span>
                </div>
                {cargos.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#F8F9FA', borderRadius: 6, marginBottom: 5, border: '1px solid #E6E8EB' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{c.concepto}</div>
                      {c.periodo_mes && <div style={{ fontSize: 11, color: '#7A7E87' }}>{c.periodo_mes} {c.periodo_anio}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#C23B3B', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.saldo)}</div>
                      {statusBadge(c.status)}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            <Section icon={FileText} title="Contratos" count={contratos.length} color="#6B4E79">
              {contratos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin contratos</div>
                : contratos.map(c => (
                  <div key={c.id} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 7, marginBottom: 6, border: '1px solid #E6E8EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.tipo_contrato ?? 'Contrato'}</span>
                      {statusBadge(c.status)}
                    </div>
                    {c.fecha_contrato && <span style={{ fontSize: 11, color: '#62666E' }}>Fecha: {fmtFecha(c.fecha_contrato)}</span>}
                    {c.pdf_contrato && <a href={c.pdf_contrato} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#1C1D21', display: 'block', marginTop: 4 }}>Ver PDF</a>}
                  </div>
                ))
              }
            </Section>

            <Section icon={Building2} title="Escrituras" count={escrituras.length} color="#2A6582">
              {escrituras.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin escrituras</div>
                : escrituras.map(e => (
                  <div key={e.id} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 7, marginBottom: 6, border: '1px solid #E6E8EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{e.notaria ?? 'Escritura'}</span>
                      {statusBadge(e.status)}
                    </div>
                    {e.numero_escritura && <span style={{ fontSize: 11, color: '#62666E' }}>No. {e.numero_escritura}</span>}
                    {e.pdf_escritura && <a href={e.pdf_escritura} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#1C1D21', display: 'block', marginTop: 4 }}>Ver PDF</a>}
                  </div>
                ))
              }
            </Section>

            <Section icon={AlertTriangle} title="Incidencias" count={incidencias.length} color="#B5761A">
              {incidencias.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin incidencias</div>
                : incidencias.slice(0, 8).map(inc => (
                  <div key={inc.id} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 7, marginBottom: 6, border: '1px solid #E6E8EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{inc.tipo ?? 'Incidencia'}</span>
                      {statusBadge(inc.status)}
                    </div>
                    {inc.descripcion && <div style={{ fontSize: 12, color: '#62666E' }}>{inc.descripcion}</div>}
                  </div>
                ))
              }
            </Section>

            <Section icon={HardHat} title="Construcciones" count={construcciones.length} color="#B5761A">
              {construcciones.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin expedientes de construcción</div>
                : construcciones.map(c => (
                  <div key={c.id} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 7, marginBottom: 6, border: '1px solid #E6E8EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.motivo ?? 'Construcción'}</span>
                      {statusBadge(c.status)}
                    </div>
                  </div>
                ))
              }
            </Section>

            <Section icon={Users} title="Visitantes Autorizados" count={visitantes.length} color="#32789A">
              {visitantes.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin visitantes</div>
                : visitantes.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#F8F9FA', borderRadius: 7, marginBottom: 5 }}>
                    <User size={13} style={{ color: '#62666E' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{[v.nombre, v.apellido].filter(Boolean).join(' ')}</div>
                      <div style={{ fontSize: 11, color: '#7A7E87' }}>{v.tipo_visita}</div>
                    </div>
                  </div>
                ))
              }
            </Section>

            <Section icon={Car} title="Vehículos" count={vehiculos.length} color="#6B4E79">
              {vehiculos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin vehículos</div>
                : vehiculos.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#F8F9FA', borderRadius: 7, marginBottom: 5 }}>
                    <Car size={13} style={{ color: '#62666E' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{[v.marca, v.modelo, v.color].filter(Boolean).join(' · ')}</div>
                      <div style={{ fontSize: 11, color: '#7A7E87' }}>Placas: {v.placas ?? '—'}</div>
                    </div>
                  </div>
                ))
              }
            </Section>

            <Section icon={Shield} title="Accesos Recientes" count={accesos.length} color="#126B63">
              {accesos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Sin accesos</div>
                : accesos.slice(0, 10).map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8F9FA', borderRadius: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{a.tipo_acceso ?? 'Acceso'}</span>
                    <span style={{ fontSize: 11, color: '#62666E' }}>{fmtFecha(a.fecha_entrada)}</span>
                  </div>
                ))
              }
            </Section>

            {(cfe.length > 0 || agua.length > 0) && (
              <Section icon={Zap} title="Servicios" count={cfe.length + agua.length} color="#A8821A">
                {cfe.map(c => <div key={c.id} style={{ padding: '8px 12px', background: '#F4F5F7', borderRadius: 7, marginBottom: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#7A4B0C' }}>CFE</div><DataRow label="No. Servicio" value={c.no_servicio} mono /></div>)}
                {agua.map(a => <div key={a.id} style={{ padding: '8px 12px', background: '#F4F5F7', borderRadius: 7, marginBottom: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#1C1D21' }}>Agua</div><DataRow label="No. Contrato" value={a.no_contrato} mono /></div>)}
              </Section>
            )}

            {comunicados.length > 0 && (
              <Section icon={MessageSquare} title="Comunicados" count={comunicados.length} color="#6B4E79">
                {comunicados.map(e => {
                  const c = e.comunicado
                  return (
                    <div key={e.id} style={{ padding: '8px 12px', background: '#F4F5F7', borderRadius: 7, marginBottom: 6, border: '1px solid #E6E8EB' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c?.titulo ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#7A7E87' }}>{e.correo_destino}</div>
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

export default function ExpedientePage() { return <ExpedienteContent /> }
