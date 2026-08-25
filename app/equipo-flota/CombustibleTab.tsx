'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, dbCtrl, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { recomputeValeCombustible } from '@/lib/combustible'
import ModalShell from '@/components/ui/ModalShell'
import {
  Plus, X, Save, Loader, RefreshCw, Eye, Edit2, Printer,
  Fuel, Droplets, FileText, Search, Upload, CheckCircle, AlertTriangle
} from 'lucide-react'

const TIPOS_SUMINISTRO = ['Gasolinería', 'Garrafa']
const TIPOS_CARGA      = ['Gasolinería', 'Entrega Garrafa', 'Consumo Garrafa']

// El status ya no se elige manualmente: avanza solo con el proceso.
// Solicitado (área usuaria pide) → Emitido (Tesorería autoriza) →
// Parcial/Completado (según cargas registradas) — o Cancelado en cualquier punto.
const STATUS_VALE      = ['Solicitado', 'Emitido', 'Parcial', 'Completado', 'Cancelado']
const ROLES_EMITE_VALE = ['superadmin', 'admin', 'usuariomantto', 'mantenimiento', 'tesoreria']

const VALE_STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Solicitado': { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  'Emitido':    { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Parcial':    { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Completado': { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Cancelado':  { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}
const CARGA_TIPO_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Gasolinería':       { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  'Entrega Garrafa':   { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  'Consumo Garrafa':   { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
}

const Badge = ({ text, map }: { text: string; map: Record<string, any> }) => {
  const s = map[text] ?? { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

const fmt$ = (n: number | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'
const fmtL = (n: number | null | undefined) =>
  n != null ? `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 })} L` : '—'
const fmtF = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Imprimir vale de combustible (compartido por modal y detalle) ──
async function imprimirVale(
  vale: any,
  areaMap: Record<number, string>,
  areaCCMap: Record<number, string>,
  equipoMap: Record<number, string>,
) {
  const { data: cargas } = await dbCtrl.from('cargas_combustible')
    .select('*')
    .eq('id_vale_fk', vale.id).eq('activo', true)
    .order('fecha', { ascending: false })

  let orgNombre = 'Organización'
  let orgSubtitulo = ''
  let orgLogo = ''
  const { data: cfgRows } = await dbCfg.from('configuracion')
    .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
  ;(cfgRows ?? []).forEach((r: any) => {
    if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
    if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
    if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
  })
  const logoHtml = orgLogo
    ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
    : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`

  const pct = vale.litros_autorizados > 0 ? (vale.litros_usados / vale.litros_autorizados) * 100 : 0

  const filasCargas = (cargas ?? []).map((c: any) => `
    <tr>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px">${fmtF(c.fecha)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px">${c.tipo_carga ?? ''}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px">${c.id_equipo_fk ? (equipoMap[c.id_equipo_fk] ?? '—') : '—'}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:600">${fmtL(c.litros)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;font-size:12px">${c.precio_unitario ? `$${Number(c.precio_unitario).toFixed(4)}` : '—'}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:700;color:#059669">${fmt$(c.monto_total)}</td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><head><title>Vale ${vale.folio ?? ''}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
      .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #7c3aed; margin-bottom: 18px; }
      .org-nombre { font-size: 18px; font-weight: 700; color: #4c1d95; margin: 0 0 2px; }
      .org-sub { font-size: 11px; color: #64748b; }
      .doc-title { font-size: 14px; font-weight: 600; color: #4c1d95; margin-bottom: 2px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 18px; }
      .info-item label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
      .info-item span { font-size: 13px; color: #1e293b; }
      .progreso { margin: 14px 0 18px; }
      .progreso-bar { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; }
      .progreso-fill { height: 100%; background: ${pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#10b981'}; width: ${Math.min(pct, 100)}%; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      thead th { background: #f1f5f9; padding: 8px 10px; font-size: 10px; text-transform: uppercase;
        letter-spacing: 0.05em; text-align: left; border: 1px solid #e2e8f0; color: #64748b; }
      .firmas { display: flex; gap: 40px; margin-top: 64px; justify-content: space-around; }
      .firma { text-align: center; min-width: 160px; }
      .firma-linea { border-top: 1px solid #1e293b; padding-top: 8px; margin-top: 48px; font-size: 11px; color: #64748b; }
      .firma-nombre { font-size: 12px; font-weight: 600; color: #1e293b; margin-bottom: 2px; }
      .nota { font-size: 11px; color: #94a3b8; font-style: italic; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 8px; }
      @page { margin: 1.2cm; }
    </style></head><body>
    <div class="org-header">
      ${logoHtml}
      <div>
        <div class="org-nombre">${orgNombre}</div>
        ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
      </div>
      <div style="margin-left:auto;text-align:right">
        <div class="doc-title">Vale de Combustible</div>
        <div style="font-size:16px;font-weight:700;color:#4c1d95;font-family:monospace">${vale.folio ?? 'Borrador'}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Status: <strong>${vale.status ?? '—'}</strong> &nbsp;·&nbsp; ${vale.tipo_suministro ?? ''}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item"><label>Solicitante</label><span>${vale.solicitante ?? '—'}</span></div>
      <div class="info-item"><label>Área</label><span>${areaMap[vale.id_area_fk] ?? '—'}</span></div>
      <div class="info-item"><label>Centro de Costo</label><span>${areaCCMap[vale.id_area_fk] ?? '—'}</span></div>
      <div class="info-item"><label>Periodo</label><span>${vale.periodo ?? '—'}</span></div>
      <div class="info-item"><label>Vigencia</label><span>${fmtF(vale.vigencia)}</span></div>
      <div class="info-item"><label>Litros Autorizados</label><span>${fmtL(vale.litros_autorizados)}</span></div>
      <div class="info-item"><label>Litros Usados</label><span>${fmtL(vale.litros_usados)}</span></div>
      <div class="info-item"><label>Monto Autorizado</label><span>${fmt$(vale.monto_autorizado)}</span></div>
      <div class="info-item"><label>Emitido por</label><span>${vale.emitido_por ?? '—'}</span></div>
      ${vale.id_op_fk ? `<div class="info-item"><label>OP Vinculada</label><span>OP #${vale.id_op_fk}</span></div>` : ''}
      ${vale.notas ? `<div class="info-item" style="grid-column:span 2"><label>Notas</label><span>${vale.notas}</span></div>` : ''}
    </div>

    <div class="progreso">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px">
        <span>Consumo del vale</span><span>${pct.toFixed(1)}%</span>
      </div>
      <div class="progreso-bar"><div class="progreso-fill"></div></div>
    </div>

    <table>
      <thead>
        <tr><th>Fecha</th><th>Tipo</th><th>Equipo</th><th style="text-align:right">Litros</th><th style="text-align:right">Precio/L</th><th style="text-align:right">Total</th></tr>
      </thead>
      <tbody>${filasCargas || '<tr><td colspan="6" style="padding:14px;text-align:center;color:#94a3b8;border:1px solid #e2e8f0;font-size:12px">Sin cargas registradas</td></tr>'}</tbody>
    </table>

    <div class="firmas">
      <div class="firma">
        <div class="firma-nombre">${vale.solicitante ?? ''}</div>
        <div class="firma-linea">Solicitó</div>
      </div>
      <div class="firma">
        <div class="firma-nombre">${vale.emitido_por ?? ''}</div>
        <div class="firma-linea">Emitió (Tesorería)</div>
      </div>
      <div class="firma">
        <div class="firma-nombre"></div>
        <div class="firma-linea">Recibió</div>
      </div>
    </div>
    <div class="nota">Este documento es un formato de control interno de vale de combustible.</div>
    </body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
  document.body.appendChild(iframe)
  iframe.contentDocument!.open()
  iframe.contentDocument!.write(html)
  iframe.contentDocument!.close()
  setTimeout(() => {
    iframe.contentWindow!.focus()
    iframe.contentWindow!.print()
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }, 300)
}

// ══════════════════════════════════════════════════════════════
export default function CombustibleTab() {
  const { canWrite, authUser } = useAuth()
  const [subTab, setSubTab] = useState<'vales' | 'cargas'>('vales')

  // ── Vales ────────────────────────────────────────────────────
  const [vales,      setVales]      = useState<any[]>([])
  const [loadingV,   setLoadingV]   = useState(true)
  const [filterTipoV, setFilterTipoV] = useState('')
  const [filterStatV, setFilterStatV] = useState('')
  const [searchV,    setSearchV]    = useState('')
  const [modalV,     setModalV]     = useState<{ open: boolean; vale?: any }>({ open: false })
  const [detailV,    setDetailV]    = useState<any | null>(null)

  // ── Cargas ───────────────────────────────────────────────────
  const [cargas,     setCargas]     = useState<any[]>([])
  const [loadingC,   setLoadingC]   = useState(true)
  const [filterTipoC,setFilterTipoC]= useState('')
  const [filterAreaC,setFilterAreaC]= useState('')
  const [searchC,    setSearchC]    = useState('')
  const [modalC,     setModalC]     = useState<{ open: boolean; carga?: any }>({ open: false })

  // ── Catálogos compartidos ─────────────────────────────────────
  const [equipos,  setEquipos]  = useState<any[]>([])
  const [areas,    setAreas]    = useState<any[]>([])
  const [areaMap,  setAreaMap]  = useState<Record<number, string>>({})
  const [equipoMap,setEquipoMap]= useState<Record<number, string>>({})
  const [areaCCMap,setAreaCCMap]= useState<Record<number, string>>({})

  const fetchCatalogos = useCallback(async () => {
    const [{ data: eqs }, { data: ars }, { data: ccs }] = await Promise.all([
      dbCfg.from('equipos').select('id, nombre, placa, unidad_odometro').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setEquipos(eqs ?? [])
    setAreas(ars ?? [])
    const am: Record<number, string> = {}; (ars ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    const em: Record<number, string> = {}; (eqs ?? []).forEach((e: any) => { em[e.id] = e.nombre })
    const ccm: Record<number, string> = {}; (ccs ?? []).forEach((c: any) => { ccm[c.id] = c.nombre })
    const acm: Record<number, string> = {}; (ars ?? []).forEach((a: any) => { if (a.id_centro_costo_fk) acm[a.id] = ccm[a.id_centro_costo_fk] ?? '' })
    setAreaMap(am)
    setEquipoMap(em)
    setAreaCCMap(acm)
  }, [])

  const fetchVales = useCallback(async () => {
    setLoadingV(true)
    // Nota: sin embed de `areas` — PostgREST no resuelve relaciones cross-schema
    // (ctrl → cfg) por FK; el nombre del área se resuelve con areaMap.
    let q = dbCtrl.from('vales_combustible')
      .select('*')
      .eq('activo', true).order('created_at', { ascending: false })
    if (filterTipoV) q = q.eq('tipo_suministro', filterTipoV)
    if (filterStatV) q = q.eq('status', filterStatV)
    const { data, error } = await q
    if (error) console.error('fetchVales:', error.message)
    setVales(data ?? [])
    setLoadingV(false)
  }, [filterTipoV, filterStatV])

  const fetchCargas = useCallback(async () => {
    setLoadingC(true)
    // `vales:id_vale_fk(folio)` es un embed dentro del mismo schema (ctrl) y sí
    // funciona; área/equipo se resuelven con areaMap/equipoMap (ver nota arriba).
    let q = dbCtrl.from('cargas_combustible')
      .select('*, vales:id_vale_fk(folio)')
      .eq('activo', true).order('fecha', { ascending: false })
    if (filterTipoC) q = q.eq('tipo_carga', filterTipoC)
    if (filterAreaC) q = q.eq('id_area_fk', Number(filterAreaC))
    const { data, error } = await q
    if (error) console.error('fetchCargas:', error.message)
    setCargas(data ?? [])
    setLoadingC(false)
  }, [filterTipoC, filterAreaC])

  useEffect(() => { fetchCatalogos() }, [fetchCatalogos])
  useEffect(() => { fetchVales()    }, [fetchVales])
  useEffect(() => { fetchCargas()   }, [fetchCargas])

  // KPIs
  const mesActual = new Date().toISOString().slice(0, 7)
  const cargasMes = cargas.filter(c => c.fecha?.startsWith(mesActual))
  const kpiLitrosMes  = cargasMes.reduce((a, c) => a + (c.litros ?? 0), 0)
  const kpiCostoMes   = cargasMes.reduce((a, c) => a + (c.monto_total ?? 0), 0)
  const kpiValesAbiertos = vales.filter(v => ['Solicitado', 'Emitido', 'Parcial'].includes(v.status)).length
  const kpiValesPorVencer = vales.filter(v => {
    if (!v.vigencia || !['Emitido', 'Parcial'].includes(v.status)) return false
    const diff = (new Date(v.vigencia).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 5
  }).length

  const filteredVales = vales.filter(v => {
    if (!searchV) return true
    const q = searchV.toLowerCase()
    return (v.folio ?? '').toLowerCase().includes(q)
      || (areaMap[v.id_area_fk] ?? '').toLowerCase().includes(q)
      || (v.periodo ?? '').toLowerCase().includes(q)
  })
  const filteredCargas = cargas.filter(c => {
    if (!searchC) return true
    const q = searchC.toLowerCase()
    return (equipoMap[c.id_equipo_fk] ?? '').toLowerCase().includes(q)
      || (areaMap[c.id_area_fk] ?? '').toLowerCase().includes(q)
      || (c.vales?.folio ?? '').toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '16px 0' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Litros este mes',    value: fmtL(kpiLitrosMes),      color: '#0891b2', icon: <Droplets size={16} /> },
          { label: 'Costo este mes',     value: fmt$(kpiCostoMes),       color: '#ea580c', icon: <Fuel size={16} /> },
          { label: 'Vales abiertos',     value: kpiValesAbiertos,        color: '#2563eb', icon: <FileText size={16} /> },
          { label: 'Vales por vencer',   value: kpiValesPorVencer,       color: kpiValesPorVencer > 0 ? '#dc2626' : '#15803d', icon: <AlertTriangle size={16} /> },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: k.color, marginBottom: 4 }}>
              {k.icon}<span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        <button onClick={() => setSubTab('vales')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: subTab === 'vales' ? 600 : 400,
            color: subTab === 'vales' ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: subTab === 'vales' ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
          <FileText size={12} /> Vales
        </button>
        <button onClick={() => setSubTab('cargas')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: subTab === 'cargas' ? 600 : 400,
            color: subTab === 'cargas' ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: subTab === 'cargas' ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
          <Fuel size={12} /> Cargas
        </button>
      </div>

      {/* ── VALES ── */}
      {subTab === 'vales' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 28, fontSize: 12 }} placeholder="Folio, área, equipo…" value={searchV} onChange={e => setSearchV(e.target.value)} />
            </div>
            <select className="select" style={{ fontSize: 12, width: 140 }} value={filterTipoV} onChange={e => setFilterTipoV(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS_SUMINISTRO.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ fontSize: 12, width: 130 }} value={filterStatV} onChange={e => setFilterStatV(e.target.value)}>
              <option value="">Todos los status</option>
              {STATUS_VALE.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn-ghost" onClick={fetchVales} style={{ padding: '6px 8px' }}><RefreshCw size={13} /></button>
            {canWrite('mantenimiento') && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setModalV({ open: true })}>
                <Plus size={12} /> Nuevo Vale
              </button>
            )}
          </div>

          {loadingV ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader size={18} className="animate-spin" style={{ color: 'var(--blue)' }} /></div>
          ) : filteredVales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Sin vales registrados</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Folio', 'Tipo', 'Área', 'Periodo', 'Litros Auth.', 'Litros Usados', 'Monto Auth.', 'Vigencia', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredVales.map((v, i) => {
                    const pct = v.litros_autorizados > 0 ? (v.litros_usados / v.litros_autorizados) * 100 : 0
                    return (
                      <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{v.folio}</td>
                        <td style={{ padding: '8px 10px' }}><Badge text={v.tipo_suministro} map={CARGA_TIPO_STYLE} /></td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{areaMap[v.id_area_fk] ?? '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.periodo ?? '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{fmtL(v.litros_autorizados)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, minWidth: 50 }}>
                              <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(pct, 100)}%`,
                                background: pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#10b981' }} />
                            </div>
                            <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtL(v.litros_usados)}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{fmt$(v.monto_autorizado)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(v.vigencia)}</td>
                        <td style={{ padding: '8px 10px' }}><Badge text={v.status} map={VALE_STATUS_STYLE} /></td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-ghost" style={{ padding: '3px 6px' }} onClick={() => setDetailV(v)}><Eye size={12} /></button>
                            {canWrite('mantenimiento') && !['Completado', 'Cancelado'].includes(v.status) && (
                              <button className="btn-ghost" style={{ padding: '3px 6px' }} onClick={() => setModalV({ open: true, vale: v })}><Edit2 size={12} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CARGAS ── */}
      {subTab === 'cargas' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 28, fontSize: 12 }} placeholder="Equipo, área, folio vale…" value={searchC} onChange={e => setSearchC(e.target.value)} />
            </div>
            <select className="select" style={{ fontSize: 12, width: 160 }} value={filterTipoC} onChange={e => setFilterTipoC(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS_CARGA.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ fontSize: 12, width: 150 }} value={filterAreaC} onChange={e => setFilterAreaC(e.target.value)}>
              <option value="">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <button className="btn-ghost" onClick={fetchCargas} style={{ padding: '6px 8px' }}><RefreshCw size={13} /></button>
            {canWrite('mantenimiento') && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setModalC({ open: true })}>
                <Plus size={12} /> Nueva Carga
              </button>
            )}
          </div>

          {loadingC ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader size={18} className="animate-spin" style={{ color: 'var(--blue)' }} /></div>
          ) : filteredCargas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Sin cargas registradas</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Fecha', 'Tipo', 'Vale', 'Área', 'Equipo', 'Litros', 'Precio/L', 'Total', 'Odómetro', 'Ticket', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCargas.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(c.fecha)}</td>
                      <td style={{ padding: '8px 10px' }}><Badge text={c.tipo_carga} map={CARGA_TIPO_STYLE} /></td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)' }}>{c.vales?.folio ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{areaMap[c.id_area_fk] ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{c.id_equipo_fk ? (equipoMap[c.id_equipo_fk] ?? '—') : '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{fmtL(c.litros)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{c.precio_unitario ? `$${Number(c.precio_unitario).toFixed(4)}` : '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, textAlign: 'right', color: '#059669' }}>{fmt$(c.monto_total)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, textAlign: 'right' }}>{c.odometro != null ? Number(c.odometro).toLocaleString('es-MX') : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {c.comprobante_url
                          ? <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontSize: 11 }}>Ver</a>
                          : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {canWrite('mantenimiento') && (
                          <button className="btn-ghost" style={{ padding: '3px 6px' }} onClick={() => setModalC({ open: true, carga: c })}><Edit2 size={12} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modales */}
      {modalV.open && (
        <ValeModal
          vale={modalV.vale} areas={areas} areaMap={areaMap} areaCCMap={areaCCMap} equipoMap={equipoMap}
          onClose={() => setModalV({ open: false })}
          onSaved={() => { setModalV({ open: false }); fetchVales() }}
        />
      )}
      {modalC.open && (
        <CargaModal
          carga={modalC.carga} equipos={equipos} areas={areas} vales={vales.filter(v => ['Emitido', 'Parcial'].includes(v.status))}
          onClose={() => setModalC({ open: false })}
          onSaved={() => { setModalC({ open: false }); fetchCargas(); fetchVales() }}
        />
      )}
      {detailV && (
        <ValeDetail vale={detailV} areaMap={areaMap} areaCCMap={areaCCMap} equipoMap={equipoMap} onClose={() => setDetailV(null)} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Crear / Editar Vale
// ══════════════════════════════════════════════════════════════
function ValeModal({ vale, areas, areaMap, areaCCMap, equipoMap, onClose, onSaved }: {
  vale?: any; areas: any[]; areaMap: Record<number, string>; areaCCMap: Record<number, string>; equipoMap: Record<number, string>
  onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [uploading, setUploading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isNew = !vale?.folio
  const puedeEmitir = ROLES_EMITE_VALE.includes(authUser?.rol as any)

  const [form, setForm] = useState({
    tipo_suministro:    vale?.tipo_suministro    ?? 'Gasolinería',
    solicitante:        vale?.solicitante         ?? (authUser?.nombre ?? ''),
    id_area_fk:         vale?.id_area_fk?.toString()   ?? '',
    periodo:            vale?.periodo            ?? '',
    litros_autorizados: vale?.litros_autorizados?.toString() ?? '',
    monto_autorizado:   vale?.monto_autorizado?.toString()   ?? '',
    vigencia:           vale?.vigencia           ?? '',
    comprobante_url:    vale?.comprobante_url    ?? '',
    notas:              vale?.notas              ?? '',
  })
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `vales/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('mantenimiento').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('mantenimiento').getPublicUrl(path)
    setForm(f => ({ ...f, comprobante_url: publicUrl }))
    setUploading(false)
  }

  const buildPayload = () => ({
    tipo_suministro:   form.tipo_suministro,
    solicitante:       form.solicitante.trim() || null,
    id_area_fk:        Number(form.id_area_fk),
    periodo:           form.periodo.trim() || null,
    litros_autorizados:Number(form.litros_autorizados),
    monto_autorizado:  form.monto_autorizado ? Number(form.monto_autorizado) : null,
    vigencia:          form.vigencia || null,
    comprobante_url:   form.comprobante_url || null,
    notas:             form.notas.trim() || null,
    updated_at:        new Date().toISOString(),
  })

  const validar = () => {
    if (!form.solicitante.trim())  { setError('El solicitante es obligatorio'); return false }
    if (!form.id_area_fk)          { setError('El área es obligatoria'); return false }
    if (!form.litros_autorizados)  { setError('Los litros son obligatorios'); return false }
    return true
  }

  // Basado en el máximo folio del año en curso (no en un conteo de filas): un
  // conteo se desincroniza si se borran/cancelan vales y genera folios repetidos.
  // Aun así puede chocar si dos personas guardan al mismo tiempo, por eso
  // handleSave reintenta ante un 23505 (unique_violation) en vez de fallar.
  const generarFolioVale = async () => {
    const anio = new Date().getFullYear()
    const prefijo = `VAL-${anio}-`
    const { data } = await dbCtrl.from('vales_combustible')
      .select('folio').ilike('folio', `${prefijo}%`)
      .order('folio', { ascending: false }).limit(1)
    const ultimo = data?.[0]?.folio ? Number(data[0].folio.slice(prefijo.length)) : 0
    return `${prefijo}${String((ultimo || 0) + 1).padStart(4, '0')}`
  }

  const handleSave = async () => {
    if (!validar()) return
    setSaving(true); setError('')

    const payload: any = { ...buildPayload() }
    if (isNew) payload.status = 'Solicitado'

    for (let intento = 0; intento < 3; intento++) {
      if (isNew) payload.folio = await generarFolioVale()

      const { error: err } = isNew
        ? await dbCtrl.from('vales_combustible').insert(payload)
        : await dbCtrl.from('vales_combustible').update(payload).eq('id', vale.id)

      if (!err) { onSaved(); return }
      if (isNew && err.code === '23505' && intento < 2) continue
      setError(err.message); setSaving(false); return
    }
  }

  const handleEmitir = async () => {
    if (!validar()) return
    setSaving(true); setError('')
    const payload = { ...buildPayload(), status: 'Emitido', emitido_por: authUser?.nombre ?? null }
    const { error: err } = await dbCtrl.from('vales_combustible').update(payload).eq('id', vale.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const handleCancelar = async () => {
    if (!confirm('¿Cancelar este vale? Ya no podrá usarse para registrar cargas.')) return
    setSaving(true); setError('')
    const { error: err } = await dbCtrl.from('vales_combustible')
      .update({ status: 'Cancelado', updated_at: new Date().toISOString() }).eq('id', vale.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const status = vale?.status ?? 'Solicitado'
  const soloLectura = ['Completado', 'Cancelado'].includes(status)

  const handleImprimir = async () => {
    setPrinting(true)
    try { await imprimirVale(vale, areaMap, areaCCMap, equipoMap) }
    finally { setPrinting(false) }
  }

  return (
    <ModalShell modulo="mantenimiento" icono={Fuel}
      titulo={isNew ? 'Solicitar Vale de Combustible' : `Editar Vale ${vale?.folio ?? ''}`}
      subtitulo={!isNew ? status : undefined}
      onClose={onClose} maxWidth={560}
      footer={<>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
          {!isNew && !soloLectura && (
            <button className="btn-ghost" onClick={handleCancelar} disabled={saving}
              style={{ fontSize: 12, color: '#dc2626' }}>
              Cancelar Vale
            </button>
          )}
          {!isNew && (
            <button className="btn-secondary" onClick={handleImprimir} disabled={printing} style={{ fontSize: 12 }}>
              {printing ? <Loader size={12} className="animate-spin" /> : <Printer size={12} />} Imprimir
            </button>
          )}
        </div>
        <button className="btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cerrar</button>
        {!soloLectura && (
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        {!isNew && status === 'Solicitado' && puedeEmitir && (
          <button className="btn-primary" onClick={handleEmitir} disabled={saving}
            style={{ fontSize: 12, background: '#15803d' }}>
            {saving ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            {saving ? 'Emitiendo…' : 'Emitir Vale'}
          </button>
        )}
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}
        {soloLectura && (
          <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, color: 'var(--text-muted)', fontSize: 12 }}>
            Este vale está {status.toLowerCase()} y ya no se puede modificar.
          </div>
        )}

        <fieldset disabled={soloLectura} style={{ border: 'none', padding: 0, margin: 0, display: 'contents' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Tipo de Suministro *</label>
            <select className="select" style={{ fontSize: 12 }} value={form.tipo_suministro} onChange={setF('tipo_suministro')}>
              {TIPOS_SUMINISTRO.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Solicitante *</label>
            <input className="input" style={{ fontSize: 12 }} value={form.solicitante} onChange={setF('solicitante')} placeholder="Nombre de quien solicita" />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Área *</label>
            <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk} onChange={setF('id_area_fk')}>
              <option value="">— Seleccionar —</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Periodo</label>
            <input className="input" style={{ fontSize: 12 }} placeholder="ej. Abril 2026" value={form.periodo} onChange={setF('periodo')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Vigencia</label>
            <input className="input" type="date" style={{ fontSize: 12 }} value={form.vigencia} onChange={setF('vigencia')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>{status === 'Solicitado' ? 'Litros Solicitados *' : 'Litros Autorizados *'}</label>
            <input className="input" type="number" step="0.01" style={{ fontSize: 12 }} value={form.litros_autorizados} onChange={setF('litros_autorizados')} placeholder="0.00" />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Monto Autorizado ($)</label>
            <input className="input" type="number" step="0.01" style={{ fontSize: 12 }} value={form.monto_autorizado} onChange={setF('monto_autorizado')} placeholder="0.00" />
          </div>
        </div>

        {!isNew && vale?.id_op_fk && (
          <div style={{ padding: '6px 10px', background: '#eff6ff', borderRadius: 6, fontSize: 11, color: 'var(--blue)' }}>
            Vinculado a la OP #{vale.id_op_fk} — se emitirá automáticamente cuando esa OP se pague.
          </div>
        )}

        {/* Documento del vale */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <label className="label" style={{ fontSize: 11 }}>Documento del Vale (PDF / imagen)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {form.comprobante_url && (
              <a href={form.comprobante_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'underline' }}>Ver documento actual</a>
            )}
            <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
              {uploading ? 'Subiendo…' : form.comprobante_url ? 'Reemplazar' : 'Subir documento'}
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleUpload} />
          </div>
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Notas</label>
          <textarea className="input" rows={2} style={{ fontSize: 12, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
        </div>
        </fieldset>
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Nueva / Editar Carga
// ══════════════════════════════════════════════════════════════
function CargaModal({ carga, equipos, areas, vales, onClose, onSaved }: {
  carga?: any; equipos: any[]; areas: any[]; vales: any[]
  onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    tipo_carga:      carga?.tipo_carga     ?? 'Gasolinería',
    id_vale_fk:      carga?.id_vale_fk?.toString()   ?? '',
    id_equipo_fk:    carga?.id_equipo_fk?.toString() ?? '',
    id_area_fk:      carga?.id_area_fk?.toString()   ?? '',
    fecha:           carga?.fecha          ?? new Date().toISOString().slice(0, 10),
    litros:          carga?.litros?.toString()              ?? '',
    precio_unitario: carga?.precio_unitario?.toString()     ?? '',
    monto_total:     carga?.monto_total?.toString()         ?? '',
    odometro:        carga?.odometro?.toString()            ?? '',
    comprobante_url: carga?.comprobante_url ?? '',
    notas:           carga?.notas           ?? '',
  })
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value
    setForm(f => {
      const next = { ...f, [k]: val }
      // Auto-calcular monto_total
      if (k === 'litros' || k === 'precio_unitario') {
        const l = k === 'litros' ? Number(val) : Number(f.litros)
        const p = k === 'precio_unitario' ? Number(val) : Number(f.precio_unitario)
        if (l > 0 && p > 0) next.monto_total = (l * p).toFixed(2)
      }
      // Auto-completar área desde vale seleccionado
      if (k === 'id_vale_fk' && val) {
        const v = vales.find(v => v.id === Number(val))
        if (v) {
          next.id_area_fk   = v.id_area_fk?.toString() ?? f.id_area_fk
          next.id_equipo_fk = v.id_equipo_fk?.toString() ?? f.id_equipo_fk
        }
      }
      return next
    })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `tickets/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('mantenimiento').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('mantenimiento').getPublicUrl(path)
    setForm(f => ({ ...f, comprobante_url: publicUrl }))
    setUploading(false)
  }

  const handleSave = async () => {
    if (!form.id_area_fk)  { setError('El área es obligatoria'); return }
    if (!form.litros)      { setError('Los litros son obligatorios'); return }
    if (form.tipo_carga === 'Gasolinería' && !form.id_equipo_fk) {
      setError('Para Gasolinería el equipo es obligatorio'); return
    }
    if (form.tipo_carga === 'Gasolinería' && !form.comprobante_url) {
      setError('El comprobante de carga es obligatorio para Gasolinería'); return
    }
    setSaving(true); setError('')

    const payload: any = {
      tipo_carga:      form.tipo_carga,
      id_vale_fk:      form.id_vale_fk      ? Number(form.id_vale_fk)      : null,
      id_equipo_fk:    form.id_equipo_fk    ? Number(form.id_equipo_fk)    : null,
      id_area_fk:      Number(form.id_area_fk),
      fecha:           form.fecha,
      litros:          Number(form.litros),
      precio_unitario: form.precio_unitario ? Number(form.precio_unitario) : null,
      monto_total:     form.monto_total     ? Number(form.monto_total)     : null,
      odometro:        form.odometro        ? Number(form.odometro)        : null,
      comprobante_url: form.comprobante_url || null,
      notas:           form.notas.trim()    || null,
      registrado_por:  authUser?.nombre     ?? null,
    }

    const { error: err } = carga
      ? await dbCtrl.from('cargas_combustible').update(payload).eq('id', carga.id)
      : await dbCtrl.from('cargas_combustible').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }

    // El status del vale se deriva solo: suma cargas + bitácora de uso vinculadas.
    if (payload.id_vale_fk) await recomputeValeCombustible(payload.id_vale_fk)

    onSaved()
  }

  const esGasolineria = form.tipo_carga === 'Gasolinería'
  const esConsumoGarrafa = form.tipo_carga === 'Consumo Garrafa'
  const valesFiltrados = vales.filter(v =>
    form.tipo_carga === 'Gasolinería' ? v.tipo_suministro === 'Gasolinería' : v.tipo_suministro === 'Garrafa'
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
            {carga ? 'Editar Carga' : 'Registrar Carga'}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Tipo de Carga *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo_carga} onChange={setF('tipo_carga')}>
                {TIPOS_CARGA.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Fecha *</label>
              <input className="input" type="date" style={{ fontSize: 12 }} value={form.fecha} onChange={setF('fecha')} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label className="label" style={{ fontSize: 11 }}>Vale vinculado (opcional)</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_vale_fk} onChange={setF('id_vale_fk')}>
                <option value="">— Sin vale / Emergencia —</option>
                {valesFiltrados.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.folio} · {areas.find(a => a.id === v.id_area_fk)?.nombre ?? ''}{v.periodo ? ` · ${v.periodo}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" style={{ fontSize: 11 }}>Área *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk} onChange={setF('id_area_fk')}>
                <option value="">— Seleccionar —</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>

            {(esGasolineria || esConsumoGarrafa) && (
              <div>
                <label className="label" style={{ fontSize: 11 }}>Equipo *</label>
                <select className="select" style={{ fontSize: 12 }} value={form.id_equipo_fk} onChange={setF('id_equipo_fk')}>
                  <option value="">— Seleccionar —</option>
                  {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.placa ? ` (${e.placa})` : ''}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="label" style={{ fontSize: 11 }}>Litros *</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 12 }} value={form.litros} onChange={setF('litros')} placeholder="0.00" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Precio por litro ($)</label>
              <input className="input" type="number" step="0.0001" style={{ fontSize: 12 }} value={form.precio_unitario} onChange={setF('precio_unitario')} placeholder="0.0000" />
            </div>
            <div>
              <label className="label" style={{ fontSize: 11 }}>Total ($)</label>
              <input className="input" type="number" step="0.01" style={{ fontSize: 12, fontWeight: 600 }} value={form.monto_total} onChange={setF('monto_total')} placeholder="Auto-calculado" />
            </div>
            {esGasolineria && (
              <div>
                <label className="label" style={{ fontSize: 11 }}>Odómetro al cargar</label>
                <input className="input" type="number" step="0.1" style={{ fontSize: 12 }} value={form.odometro} onChange={setF('odometro')} placeholder="km / hrs" />
              </div>
            )}
          </div>

          {/* Ticket */}
          {esGasolineria && (
            <div>
              <label className="label" style={{ fontSize: 11 }}>Ticket / Comprobante *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                {form.comprobante_url && (
                  <a href={form.comprobante_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'underline' }}>Ver ticket actual</a>
                )}
                <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                  {uploading ? 'Subiendo…' : form.comprobante_url ? 'Reemplazar' : 'Subir ticket'}
                </button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleUpload} />
              </div>
            </div>
          )}

          <div>
            <label className="label" style={{ fontSize: 11 }}>Notas</label>
            <textarea className="input" rows={2} style={{ fontSize: 12, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" onClick={onClose} style={{ fontSize: 12 }}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Detail: Vale
// ══════════════════════════════════════════════════════════════
function ValeDetail({ vale, areaMap, areaCCMap, equipoMap, onClose }: {
  vale: any; areaMap: Record<number, string>; areaCCMap: Record<number, string>; equipoMap: Record<number, string>; onClose: () => void
}) {
  const [cargas, setCargas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    // Sin embed de `equipos` — cross-schema (ctrl → cfg), se resuelve con equipoMap.
    dbCtrl.from('cargas_combustible')
      .select('*')
      .eq('id_vale_fk', vale.id).eq('activo', true)
      .order('fecha', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('ValeDetail cargas:', error.message)
        setCargas(data ?? [])
        setLoading(false)
      })
  }, [vale.id])

  const pct = vale.litros_autorizados > 0 ? (vale.litros_usados / vale.litros_autorizados) * 100 : 0

  const handleImprimir = async () => {
    setPrinting(true)
    try { await imprimirVale(vale, areaMap, areaCCMap, equipoMap) }
    finally { setPrinting(false) }
  }

  return (
    <ModalShell modulo="mantenimiento" icono={FileText}
      titulo={vale.folio}
      subtitulo={`${vale.tipo_suministro}${vale.periodo ? ` · ${vale.periodo}` : ''}`}
      onClose={onClose} maxWidth={540}
      footer={<>
        <button className="btn-secondary" onClick={handleImprimir} disabled={printing} style={{ fontSize: 12 }}>
          {printing ? <Loader size={12} className="animate-spin" /> : <Printer size={12} />} Imprimir
        </button>
        <button className="btn-primary" onClick={onClose} style={{ fontSize: 12 }}>Cerrar</button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Badge text={vale.status} map={VALE_STATUS_STYLE} />
        </div>
        {/* Progreso litros */}
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Litros usados</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtL(vale.litros_usados)} / {fmtL(vale.litros_autorizados)}</span>
          </div>
          <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5 }}>
            <div style={{ height: '100%', borderRadius: 5, width: `${Math.min(pct, 100)}%`,
              background: pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#10b981',
              transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{pct.toFixed(1)}%</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Solicitante', value: vale.solicitante },
            { label: 'Área',       value: areaMap[vale.id_area_fk] },
            { label: 'Centro de Costo', value: areaCCMap[vale.id_area_fk] },
            { label: 'Monto auth.', value: fmt$(vale.monto_autorizado) },
            { label: 'Vigencia',   value: fmtF(vale.vigencia) },
            { label: 'Emitido por',value: vale.emitido_por },
            { label: 'OP vinculada',value: vale.id_op_fk ? `OP #${vale.id_op_fk}` : null },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
              <div style={{ fontSize: 13 }}>{value ?? '—'}</div>
            </div>
          ))}
        </div>
        {vale.notas && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>{vale.notas}</div>}
        {vale.comprobante_url && (
          <a href={vale.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--blue)' }}>
            Ver documento del vale
          </a>
        )}

        {/* Cargas del vale */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Cargas registradas ({cargas.length})
          </div>
          {loading ? <Loader size={14} className="animate-spin" style={{ color: 'var(--blue)' }} />
          : cargas.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>Sin cargas</div>
          : cargas.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
              background: '#f8fafc', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{fmtF(c.fecha)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.id_equipo_fk ? (equipoMap[c.id_equipo_fk] ?? c.tipo_carga) : c.tipo_carga}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{fmtL(c.litros)}</div>
                <div style={{ fontSize: 11, color: '#059669' }}>{fmt$(c.monto_total)}</div>
              </div>
              {c.comprobante_url && (
                <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--blue)' }}>Ticket</a>
              )}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  )
}
