'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  RefreshCw, CreditCard, Search, X, ChevronLeft,
  ChevronDown, ChevronRight, Receipt,
} from 'lucide-react'
import Link from 'next/link'
import CobrarCuotaModal from '../carritos/CobrarCuotaModal'

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
  forma_pago: string | null
  tipo: string
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; id_categoria_fk: number | null } | null
}

type SocioGroup = {
  id: number
  nombre: string
  cuotas: Cuota[]
  totalPendiente: number
  totalVencido: number
}

const hoy  = new Date().toISOString().split('T')[0]
const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc   = (s: Cuota['cat_socios']) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const vencida = (f: string | null) => !!f && f < hoy

const TIPOS_LABEL: Record<string, string> = {
  INSCRIPCION: 'Inscripción', MENSUALIDAD: 'Mensualidad', PENSION_CARRITO: 'Pensión Carrito',
}

// Agrupa cuotas por socio
function agrupar(cuotas: Cuota[]): SocioGroup[] {
  const map = new Map<number, SocioGroup>()
  for (const c of cuotas) {
    if (!map.has(c.id_socio_fk)) {
      map.set(c.id_socio_fk, {
        id: c.id_socio_fk,
        nombre: nc(c.cat_socios),
        cuotas: [],
        totalPendiente: 0,
        totalVencido: 0,
      })
    }
    const g = map.get(c.id_socio_fk)!
    g.cuotas.push(c)
    if (c.status === 'PENDIENTE') {
      g.totalPendiente += c.monto_final
      if (vencida(c.fecha_vencimiento)) g.totalVencido += c.monto_final
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalPendiente - a.totalPendiente)
}

export default function CXCGolfPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-cxc')

  const [cuotas, setCuotas]     = useState<Cuota[]>([])
  const [loading, setLoading]   = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showCobrar, setShowCobrar] = useState<{ cuotas: Cuota[]; nombreSocio: string; idSocio: number } | null>(null)
  const [stats, setStats] = useState({ socios: 0, pendiente: 0, vencidas: 0, montoPendiente: 0 })

  const fetchCuotas = useCallback(async () => {
    setLoading(true)
    // Solo cuotas PENDIENTE para la vista de cobro
    const { data } = await dbGolf.from('cxc_golf')
      .select(`id, id_socio_fk, concepto, periodo, monto_original, descuento, monto_final,
        status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo,
        cat_socios(nombre, apellido_paterno, apellido_materno, id_categoria_fk)`)
      .eq('status', 'PENDIENTE')
      .order('fecha_vencimiento', { ascending: true })
    const rows = (data as unknown as Cuota[]) ?? []
    setCuotas(rows)

    const pend  = rows.filter(r => r.status === 'PENDIENTE')
    const venc  = pend.filter(r => vencida(r.fecha_vencimiento))
    const sociosUniq = new Set(pend.map(r => r.id_socio_fk))
    setStats({
      socios:         sociosUniq.size,
      pendiente:      pend.length,
      vencidas:       venc.length,
      montoPendiente: pend.reduce((a, r) => a + r.monto_final, 0),
    })
    setLoading(false)
  }, [])

  useEffect(() => { fetchCuotas() }, [fetchCuotas])

  const grupos = agrupar(cuotas)

  const gruposF = busqueda.trim()
    ? grupos.filter(g => g.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : grupos

  const toggleExpand = (id: number) => {
    setExpanded(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const expandAll   = () => setExpanded(new Set(gruposF.map(g => g.id)))
  const collapseAll = () => setExpanded(new Set())

  const abrirCobro = (g: SocioGroup) => {
    setShowCobrar({
      cuotas: g.cuotas.filter(c => c.status === 'PENDIENTE'),
      nombreSocio: g.nombre,
      idSocio: g.id,
    })
  }

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
            <CreditCard size={13} style={{ color: '#059669' }} />
            <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cobro</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)' }}>
            Cobro de Cuotas
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Socios con saldo pendiente · <Link href="/golf/cuotas" style={{ color: '#7c3aed', textDecoration: 'none' }}>Administrar asignaciones →</Link>
          </p>
        </div>
        <button className="btn-ghost" onClick={fetchCuotas} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Socios con saldo',  value: stats.socios,                   color: '#2563eb', bg: '#eff6ff' },
          { label: 'Cuotas pendientes', value: stats.pendiente,                color: '#d97706', bg: '#fffbeb' },
          { label: 'Por cobrar',        value: fmt$(stats.montoPendiente),     color: '#059669', bg: '#ecfdf5' },
          { label: 'Cuotas vencidas',   value: stats.vencidas,                 color: '#dc2626', bg: '#fef2f2' },
        ].map(k => (
          <div key={k.label} className="card" style={{ flex: '1 1 130px', maxWidth: 200, padding: '12px 16px', background: k.bg, border: `1px solid ${k.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Barra de búsqueda + controles */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
            placeholder="Buscar socio…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{gruposF.length} socio{gruposF.length !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button onClick={expandAll} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b', cursor: 'pointer' }}>
            Expandir todo
          </button>
          <button onClick={collapseAll} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b', cursor: 'pointer' }}>
            Colapsar todo
          </button>
        </div>
      </div>

      {/* Lista agrupada por socio */}
      {loading ? (
        <div style={{ padding: '56px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
      ) : gruposF.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#94a3b8' }}>
          <CreditCard size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin cuotas pendientes</div>
          <div style={{ fontSize: 12 }}>Todos los socios están al corriente</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gruposF.map(g => {
            const open    = expanded.has(g.id)
            const hasVenc = g.totalVencido > 0
            return (
              <div key={g.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>

                {/* Fila del socio — cabecera del grupo */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer', background: hasVenc ? '#fef2f2' : '#fff', transition: 'background 0.1s' }}
                  onClick={() => toggleExpand(g.id)}
                  onMouseEnter={e => !hasVenc && ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                  onMouseLeave={e => !hasVenc && ((e.currentTarget as HTMLElement).style.background = '#fff')}
                >
                  {/* Chevron */}
                  <div style={{ color: '#94a3b8', flexShrink: 0 }}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>

                  {/* Avatar inicial */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: hasVenc ? '#fecaca' : '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: hasVenc ? '#dc2626' : '#0369a1' }}>
                      {g.nombre.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Nombre + conteo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{g.nombre}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                      {g.cuotas.length} cuota{g.cuotas.length !== 1 ? 's' : ''} pendiente{g.cuotas.length !== 1 ? 's' : ''}
                      {hasVenc && <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 600 }}>· {fmt$(g.totalVencido)} vencido</span>}
                    </div>
                  </div>

                  {/* Total + botón cobrar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Total pendiente</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: hasVenc ? '#dc2626' : '#059669' }}>{fmt$(g.totalPendiente)}</div>
                    </div>
                    {puedeEscribir && (
                      <button
                        onClick={e => { e.stopPropagation(); abrirCobro(g) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                        <Receipt size={13} /> Cobrar
                      </button>
                    )}
                  </div>
                </div>

                {/* Cuotas expandidas */}
                {open && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {g.cuotas.map((c, i) => {
                      const venc = vencida(c.fecha_vencimiento)
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px 10px 68px', borderBottom: i < g.cuotas.length - 1 ? '1px solid #f8fafc' : 'none', background: venc ? '#fff5f5' : '#fafafa' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{c.concepto}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {c.periodo && <span>{c.periodo}</span>}
                              {c.fecha_vencimiento && (
                                <span style={{ color: venc ? '#dc2626' : '#94a3b8' }}>
                                  {venc ? '⚠ Vencida' : 'Vence'} {new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#475569', flexShrink: 0 }}>
                            {TIPOS_LABEL[c.tipo] ?? c.tipo}
                          </span>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {c.descuento > 0 && <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</div>}
                            <div style={{ fontSize: 14, fontWeight: 700, color: venc ? '#dc2626' : '#1e293b' }}>{fmt$(c.monto_final)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCobrar && (
        <CobrarCuotaModal
          cuotas={showCobrar.cuotas}
          nombreSocio={showCobrar.nombreSocio}
          idSocio={showCobrar.idSocio}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { setShowCobrar(null); fetchCuotas() }}
        />
      )}
    </div>
  )
}
