'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { cargarPartidasPresupuesto } from '@/lib/pptoPartidasPresupuesto'
import { Plus, Copy, ShieldCheck, Lock, Ban, Download, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { Concepto, mesesEntre, etiquetaMes, mxn, mesISO, rutaConcepto } from '@/lib/flujoEfectivo'
import { inputStyle, lbl, th, td, num } from './ui'

type Presupuesto = { id: number; anio: number; nombre: string; status: string; modulo: string }
type Version = {
  id: number; nombre: string; id_presupuesto_fk: number; mes_inicio: string; mes_fin: string; saldo_inicial: number
  escenario: 'Optimista' | 'Esperada' | 'Pesimista'; pct_ingresos: number; pct_egresos: number
  status: 'Borrador' | 'Autorizado' | 'Blindado' | 'Cancelado'; autorizado_por: string | null; created_by: string | null
}
type Linea = {
  id: number; id_version_fk: number; id_partida_fk: number; mes: string; tipo: 'ingreso' | 'egreso'
  id_centro_costo_fk: number | null; id_area_fk: number | null; id_centro_ingreso_fk: number | null; id_seccion_fk: number | null
  id_concepto_flujo_fk: number | null; monto_ppto: number; monto: number
}
type Nombre = { id: number; nombre: string }
type RealMes = { abonos: number; cargos: number }

const STATUS_COLOR: Record<Version['status'], string> = { Borrador: '#d97706', Autorizado: '#15803d', Blindado: '#0369a1', Cancelado: '#64748b' }
const ESCENARIO_PCT = { Optimista: [105, 95], Esperada: [100, 100], Pesimista: [85, 110] } as const
const ultimoDia = (mesIni: string) => { const y = +mesIni.slice(0, 4), m = +mesIni.slice(5, 7); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
const r2 = (n: number) => Math.round(n * 100) / 100

export default function TabVersiones() {
  const { authUser } = useAuth()
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [versiones, setVersiones] = useState<Version[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [cc, setCC] = useState<Nombre[]>([])
  const [areas, setAreas] = useState<Nombre[]>([])
  const [centrosIng, setCentrosIng] = useState<Nombre[]>([])
  const [secciones, setSecciones] = useState<Nombre[]>([])
  const [partidas, setPartidas] = useState<Map<number, string>>(new Map())
  const [real, setReal] = useState<Record<string, RealMes>>({})
  const [realConcepto, setRealConcepto] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [loadingDet, setLoadingDet] = useState(false)
  const [modal, setModal] = useState<{ row: Version | null } | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const version = versiones.find(v => v.id === selId) ?? null
  const editable = version?.status === 'Borrador'

  const cargarVersiones = useCallback(async (seleccionar?: number) => {
    const { data, error } = await dbComp.from('flujo_versiones').select('*').eq('activo', true).order('id', { ascending: false })
    if (error) { alert('Error al cargar versiones: ' + error.message); setLoading(false); return }
    const list = (data ?? []) as Version[]
    setVersiones(list)
    setSelId(prev => seleccionar ?? (prev && list.some(v => v.id === prev) ? prev : list[0]?.id ?? null))
    setLoading(false)
  }, [])

  useEffect(() => {
    cargarVersiones()
    dbCtrl.from('ppto_presupuestos').select('id, anio, nombre, status, modulo').order('anio', { ascending: false }).order('nombre')
      .then(({ data }) => setPresupuestos((data ?? []) as Presupuesto[]))
    dbComp.from('flujo_conceptos').select('*').order('orden').then(({ data }) => setConceptos((data ?? []) as Concepto[]))
    dbCfg.from('centros_costo').select('id, nombre').then(({ data }) => setCC((data ?? []) as Nombre[]))
    dbCfg.from('areas').select('id, nombre').then(({ data }) => setAreas((data ?? []) as Nombre[]))
    dbCfg.from('centros_ingreso').select('id, nombre').then(({ data }) => setCentrosIng((data ?? []) as Nombre[]))
    dbCfg.from('secciones').select('id, nombre').then(({ data }) => setSecciones((data ?? []) as Nombre[]))
  }, [cargarVersiones])

  // Detalle de la versión elegida: líneas proyectadas + real del banco en el mismo rango
  const cargarDetalle = useCallback(async (v: Version) => {
    setLoadingDet(true)
    const ls: Linea[] = []
    for (let i = 0; ; i += 1000) {
      const { data, error } = await dbComp.from('flujo_version_lineas').select('*').eq('id_version_fk', v.id).order('id').range(i, i + 999)
      if (error) { alert('Error al cargar líneas: ' + error.message); break }
      ls.push(...((data ?? []) as Linea[]))
      if ((data ?? []).length < 1000) break
    }
    setLineas(ls)

    const ids = Array.from(new Set(ls.map(l => l.id_partida_fk)))
    if (ids.length > 0) {
      const { data } = await dbCtrl.from('ppto_partidas').select('id, nombre').in('id', ids)
      setPartidas(new Map(((data ?? []) as Nombre[]).map(p => [p.id, p.nombre])))
    } else setPartidas(new Map())

    const rm: Record<string, RealMes> = {}
    const rc: Record<number, number> = {}
    for (let i = 0; ; i += 1000) {
      const { data, error } = await dbComp.from('flujo_mov_banco').select('fecha, cargo, abono, id_concepto_fk')
        .gte('fecha', v.mes_inicio).lte('fecha', ultimoDia(v.mes_fin)).order('id').range(i, i + 999)
      if (error) break
      ;(data ?? []).forEach((m: any) => {
        const k = m.fecha.slice(0, 7) + '-01'
        rm[k] = rm[k] ?? { abonos: 0, cargos: 0 }
        rm[k].abonos += Number(m.abono); rm[k].cargos += Number(m.cargo)
        const c = m.id_concepto_fk ?? 0
        rc[c] = (rc[c] ?? 0) + Number(m.abono) - Number(m.cargo)
      })
      if ((data ?? []).length < 1000) break
    }
    setReal(rm); setRealConcepto(rc)
    setLoadingDet(false)
  }, [])
  useEffect(() => { if (version) cargarDetalle(version); else { setLineas([]); setReal({}) } }, [version?.id, cargarDetalle]) // eslint-disable-line react-hooks/exhaustive-deps

  const meses = useMemo(() => (version ? mesesEntre(version.mes_inicio, version.mes_fin) : []), [version])
  const factor = (tipo: 'ingreso' | 'egreso') => (version ? Number(tipo === 'ingreso' ? version.pct_ingresos : version.pct_egresos) / 100 : 1)
  const nombreDe = (lista: Nombre[], id: number | null, vacio: string) => (id ? lista.find(x => x.id === id)?.nombre ?? `#${id}` : vacio)

  // ── Agrupación: ingresos Centro ingreso → Sección; egresos CC → Área; hoja = partida
  type Hoja = { id: number; nombre: string; porMes: Record<string, number> }
  type G2 = { key: string; nombre: string; hojas: Map<number, Hoja>; porMes: Record<string, number> }
  type G1 = { key: string; nombre: string; g2: Map<string, G2>; porMes: Record<string, number> }
  const arbol = useMemo(() => {
    const build = (tipo: 'ingreso' | 'egreso') => {
      const f = factor(tipo)
      const g1s = new Map<string, G1>()
      lineas.filter(l => l.tipo === tipo).forEach(l => {
        const id1 = tipo === 'ingreso' ? l.id_centro_ingreso_fk : l.id_centro_costo_fk
        const id2 = tipo === 'ingreso' ? l.id_seccion_fk : l.id_area_fk
        const k1 = `${tipo}-${id1 ?? 0}`, k2 = `${k1}-${id2 ?? 0}`
        const g1: G1 = g1s.get(k1) ?? { key: k1, nombre: tipo === 'ingreso' ? nombreDe(centrosIng, id1, 'Sin centro de ingreso') : nombreDe(cc, id1, 'Sin centro de costo'), g2: new Map(), porMes: {} }
        g1s.set(k1, g1)
        const g2: G2 = g1.g2.get(k2) ?? { key: k2, nombre: tipo === 'ingreso' ? nombreDe(secciones, id2, 'Sin sección') : nombreDe(areas, id2, 'Sin área'), hojas: new Map(), porMes: {} }
        g1.g2.set(k2, g2)
        const h: Hoja = g2.hojas.get(l.id_partida_fk) ?? { id: l.id_partida_fk, nombre: partidas.get(l.id_partida_fk) ?? `Partida ${l.id_partida_fk}`, porMes: {} }
        g2.hojas.set(l.id_partida_fk, h)
        const v = Number(l.monto) * f
        h.porMes[l.mes] = (h.porMes[l.mes] ?? 0) + v
        g2.porMes[l.mes] = (g2.porMes[l.mes] ?? 0) + v
        g1.porMes[l.mes] = (g1.porMes[l.mes] ?? 0) + v
      })
      return Array.from(g1s.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
    }
    return { ingreso: build('ingreso'), egreso: build('egreso') }
  }, [lineas, version, cc, areas, centrosIng, secciones, partidas]) // eslint-disable-line react-hooks/exhaustive-deps

  const totales = useMemo(() => {
    const ing: Record<string, number> = {}, egr: Record<string, number> = {}
    arbol.ingreso.forEach(g => meses.forEach(m => { ing[m] = (ing[m] ?? 0) + (g.porMes[m] ?? 0) }))
    arbol.egreso.forEach(g => meses.forEach(m => { egr[m] = (egr[m] ?? 0) + (g.porMes[m] ?? 0) }))
    let acum = Number(version?.saldo_inicial ?? 0)
    const neto: Record<string, number> = {}, saldo: Record<string, number> = {}
    meses.forEach(m => { neto[m] = (ing[m] ?? 0) - (egr[m] ?? 0); acum += neto[m]; saldo[m] = acum })
    const suma = (o: Record<string, number>) => meses.reduce((a, m) => a + (o[m] ?? 0), 0)
    return { ing, egr, neto, saldo, tIng: suma(ing), tEgr: suma(egr) }
  }, [arbol, meses, version])

  const conceptosPorId = useMemo(() => new Map(conceptos.map(c => [c.id, c])), [conceptos])
  const raizDe = (id: number | null): number => {
    let c = id ? conceptosPorId.get(id) : undefined, g = 0
    while (c?.id_padre_fk && g++ < 10) c = conceptosPorId.get(c.id_padre_fk)
    return c?.id ?? 0
  }
  const porConcepto = useMemo(() => {
    const proy: Record<number, number> = {}
    lineas.forEach(l => { const r = raizDe(l.id_concepto_flujo_fk); proy[r] = (proy[r] ?? 0) + (l.tipo === 'ingreso' ? 1 : -1) * Number(l.monto) * factor(l.tipo) })
    const rea: Record<number, number> = {}
    Object.entries(realConcepto).forEach(([id, v]) => { const r = raizDe(Number(id) || null); rea[r] = (rea[r] ?? 0) + v })
    const ids = Array.from(new Set([...Object.keys(proy), ...Object.keys(rea)].map(Number)))
    return ids.map(id => ({ id, nombre: id ? conceptosPorId.get(id)?.nombre ?? '—' : 'Sin concepto / sin clasificar', proy: proy[id] ?? 0, real: rea[id] ?? 0 }))
      .sort((a, b) => (a.id || 99999) - (b.id || 99999))
  }, [lineas, realConcepto, conceptosPorId, version]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edición de una celda de partida × mes (el valor mostrado ya trae el factor del escenario)
  async function guardarCelda(partidaId: number, tipo: 'ingreso' | 'egreso', mes: string, texto: string, actual: number) {
    if (!version || !editable) return
    const f = factor(tipo)
    if (f === 0) { alert('El porcentaje del escenario es 0; no se puede capturar.'); return }
    const nuevo = Number(texto.replace(/[$,\s]/g, ''))
    if (isNaN(nuevo)) return
    if (Math.abs(nuevo - actual) < 0.005) return
    const base = r2(nuevo / f)
    const existente = lineas.find(l => l.id_partida_fk === partidaId && l.mes === mes)
    if (existente) {
      const { error } = await dbComp.from('flujo_version_lineas').update({ monto: base }).eq('id', existente.id)
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setLineas(prev => prev.map(l => l.id === existente.id ? { ...l, monto: base } : l))
    } else {
      const molde = lineas.find(l => l.id_partida_fk === partidaId)!
      const { data, error } = await dbComp.from('flujo_version_lineas').insert({
        id_version_fk: version.id, id_partida_fk: partidaId, mes, tipo,
        id_centro_costo_fk: molde.id_centro_costo_fk, id_area_fk: molde.id_area_fk,
        id_centro_ingreso_fk: molde.id_centro_ingreso_fk, id_seccion_fk: molde.id_seccion_fk,
        id_concepto_flujo_fk: molde.id_concepto_flujo_fk, monto_ppto: 0, monto: base,
      }).select('*').single()
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setLineas(prev => [...prev, data as Linea])
    }
  }

  async function cambiarStatus(nuevo: Version['status']) {
    if (!version) return
    const aviso = {
      Autorizado: `¿Autorizar "${version.nombre}"? Dejará de poder editarse (podrás blindarla o clonarla).`,
      Blindado: `¿Blindar "${version.nombre}"? Quedará congelada como versión de referencia y no se podrá modificar.`,
      Cancelado: `¿Cancelar "${version.nombre}"?`, Borrador: '',
    }[nuevo]
    if (!confirm(aviso)) return
    const extra = nuevo === 'Autorizado' ? { autorizado_por: authUser?.nombre ?? null, autorizado_at: new Date().toISOString() } : {}
    const { error } = await dbComp.from('flujo_versiones').update({ status: nuevo, ...extra }).eq('id', version.id)
    if (error) { alert('No se pudo cambiar el estado: ' + error.message); return }
    cargarVersiones(version.id)
  }

  async function clonar() {
    if (!version) return
    const nombre = prompt('Nombre de la copia:', `${version.nombre} (copia)`)
    if (!nombre?.trim()) return
    const { data, error } = await dbComp.from('flujo_versiones').insert({
      nombre: nombre.trim(), id_presupuesto_fk: version.id_presupuesto_fk, mes_inicio: version.mes_inicio, mes_fin: version.mes_fin,
      saldo_inicial: version.saldo_inicial, escenario: version.escenario, pct_ingresos: version.pct_ingresos, pct_egresos: version.pct_egresos,
      status: 'Borrador', created_by: authUser?.nombre ?? null,
    }).select('*').single()
    if (error || !data) { alert('No se pudo clonar: ' + error?.message); return }
    const nuevas = lineas.map(({ id, id_version_fk, ...resto }) => ({ ...resto, id_version_fk: (data as Version).id }))
    for (let i = 0; i < nuevas.length; i += 500) {
      const { error: e2 } = await dbComp.from('flujo_version_lineas').insert(nuevas.slice(i, i + 500))
      if (e2) { alert('La copia se creó pero falló al copiar líneas: ' + e2.message); break }
    }
    cargarVersiones((data as Version).id)
  }

  function exportarExcel() {
    if (!version) return
    const fila = (n: string, o: Record<string, number>) => [n, ...meses.map(m => o[m] ?? 0), meses.reduce((a, m) => a + (o[m] ?? 0), 0)]
    const filas: any[][] = [[`Flujo de efectivo — ${version.nombre} (${version.escenario}, ${version.status})`], ['Concepto', ...meses.map(etiquetaMes), 'Total'], ['Saldo inicial', Number(version.saldo_inicial)]]
    ;(['ingreso', 'egreso'] as const).forEach(t => {
      filas.push([t === 'ingreso' ? 'INGRESOS (Centro de ingreso / Sección)' : 'EGRESOS (Centro de costo / Área)'])
      arbol[t].forEach(g => { filas.push(fila(g.nombre, g.porMes)); g.g2.forEach(a => filas.push(fila('   ' + a.nombre, a.porMes))) })
      filas.push(fila(t === 'ingreso' ? 'Total ingresos' : 'Total egresos', t === 'ingreso' ? totales.ing : totales.egr))
    })
    filas.push(fila('Flujo neto', totales.neto), ['Saldo final', ...meses.map(m => totales.saldo[m])])
    filas.push(['Real banco — abonos', ...meses.map(m => real[m]?.abonos ?? 0)], ['Real banco — cargos', ...meses.map(m => real[m]?.cargos ?? 0)])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Flujo')
    XLSX.writeFile(wb, `Flujo-Efectivo_${version.nombre.replace(/[^\w\-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const toggle = (k: string) => setAbiertos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const celda = (v: number | undefined, color?: string) => (
    <td style={{ ...td, ...num, color: color ?? (v && v < 0 ? '#dc2626' : undefined) }}>{v ? mxn(v) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
  )

  if (loading) return <div className="card" style={{ padding: 24 }}>Cargando…</div>

  const bloque = (tipo: 'ingreso' | 'egreso') => {
    const color = tipo === 'ingreso' ? '#15803d' : '#dc2626'
    return <>
      <tr><td colSpan={meses.length + 2} style={{ ...td, fontWeight: 800, background: tipo === 'ingreso' ? '#f0fdf4' : '#fef2f2', color }}>
        {tipo === 'ingreso' ? 'INGRESOS · Centro de ingreso / Sección' : 'EGRESOS · Centro de costo / Área'}
      </td></tr>
      {arbol[tipo].map(g1 => <React.Fragment key={g1.key}>
        <tr style={{ background: '#f8fafc' }}>
          <td style={{ ...td, fontWeight: 700 }}>{g1.nombre}</td>
          {meses.map(m => celda(g1.porMes[m]))}
          {celda(meses.reduce((a, m) => a + (g1.porMes[m] ?? 0), 0))}
        </tr>
        {Array.from(g1.g2.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(g2 => <React.Fragment key={g2.key}>
          <tr>
            <td style={{ ...td, paddingLeft: 24, cursor: 'pointer' }} onClick={() => toggle(g2.key)}>
              {abiertos.has(g2.key) ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {g2.nombre}
            </td>
            {meses.map(m => celda(g2.porMes[m]))}
            {celda(meses.reduce((a, m) => a + (g2.porMes[m] ?? 0), 0))}
          </tr>
          {abiertos.has(g2.key) && Array.from(g2.hojas.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(h => (
            <tr key={g2.key + '-' + h.id}>
              <td style={{ ...td, paddingLeft: 48, fontSize: 12, color: '#475569' }}>{h.nombre}</td>
              {meses.map(m => (
                <td key={m} style={{ ...td, padding: '3px 6px' }}>
                  {editable ? (
                    <input key={`${h.id}-${m}-${Math.round(h.porMes[m] ?? 0)}`} style={{ ...inputStyle, padding: '3px 6px', fontSize: 12, textAlign: 'right', width: 96 }}
                      defaultValue={Math.round(h.porMes[m] ?? 0)}
                      onBlur={e => guardarCelda(h.id, tipo, m, e.target.value, h.porMes[m] ?? 0)} />
                  ) : <div style={{ ...num, fontSize: 12 }}>{h.porMes[m] ? mxn(h.porMes[m]) : '—'}</div>}
                </td>
              ))}
              {celda(meses.reduce((a, m) => a + (h.porMes[m] ?? 0), 0))}
            </tr>
          ))}
        </React.Fragment>)}
      </React.Fragment>)}
      <tr style={{ fontWeight: 800 }}>
        <td style={td}>{tipo === 'ingreso' ? 'Total ingresos' : 'Total egresos'}</td>
        {meses.map(m => celda(tipo === 'ingreso' ? totales.ing[m] : totales.egr[m], color))}
        {celda(tipo === 'ingreso' ? totales.tIng : totales.tEgr, color)}
      </tr>
    </>
  }

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 260, fontWeight: 600 }} value={selId ?? ''} onChange={e => setSelId(Number(e.target.value))}>
          {versiones.length === 0 && <option value="">Sin versiones</option>}
          {versiones.map(v => <option key={v.id} value={v.id}>{v.nombre} — {v.escenario} [{v.status}]</option>)}
        </select>
        {version && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, color: '#fff', background: STATUS_COLOR[version.status] }}>{version.status}</span>}
        {version && <span style={{ fontSize: 12, color: '#64748b' }}>
          {etiquetaMes(version.mes_inicio)} – {etiquetaMes(version.mes_fin)} · ingresos al {version.pct_ingresos}% · egresos al {version.pct_egresos}%
          {version.autorizado_por && ` · autorizó ${version.autorizado_por}`}
        </span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {editable && <button className="btn-secondary" onClick={() => setModal({ row: version })}><Pencil size={14} /> Parámetros</button>}
          {version && <button className="btn-secondary" onClick={clonar}><Copy size={14} /> Clonar</button>}
          {version?.status === 'Borrador' && <button className="btn-secondary" onClick={() => cambiarStatus('Autorizado')}><ShieldCheck size={14} /> Autorizar</button>}
          {version?.status === 'Autorizado' && <button className="btn-secondary" onClick={() => cambiarStatus('Blindado')}><Lock size={14} /> Blindar</button>}
          {version && version.status !== 'Cancelado' && version.status !== 'Blindado' && <button className="btn-ghost" onClick={() => cambiarStatus('Cancelado')}><Ban size={14} /> Cancelar</button>}
          {version && <button className="btn-secondary" onClick={exportarExcel}><Download size={14} /> Excel</button>}
          <button className="btn-primary" onClick={() => setModal({ row: null })}><Plus size={14} /> Nueva versión</button>
        </div>
      </div>

      {!version ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
          Aún no hay versiones. Crea una a partir de un presupuesto para proyectar el flujo por centro de costo/área y centro de ingreso/sección.
        </div>
      ) : loadingDet ? <div className="card" style={{ padding: 24 }}>Cargando…</div> : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              ['Saldo inicial', Number(version.saldo_inicial), '#334155'], ['Ingresos proyectados', totales.tIng, '#15803d'],
              ['Egresos proyectados', totales.tEgr, '#dc2626'], ['Flujo neto', totales.tIng - totales.tEgr, totales.tIng - totales.tEgr >= 0 ? '#15803d' : '#dc2626'],
              ['Saldo final', totales.saldo[meses[meses.length - 1]] ?? Number(version.saldo_inicial), (totales.saldo[meses[meses.length - 1]] ?? 0) >= 0 ? '#0369a1' : '#dc2626'],
            ].map(([t, v, c]) => (
              <div key={t as string} className="card" style={{ flex: '1 1 170px', maxWidth: 260, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: '#7a8aa3', textTransform: 'uppercase', fontWeight: 700 }}>{t as string}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c as string }}>{mxn(v as number)}</div>
              </div>
            ))}
          </div>

          {lineas.length === 0 && <div className="card" style={{ padding: 16, marginBottom: 14, color: '#d97706' }}>
            Esta versión no tiene líneas: el presupuesto elegido no tiene partidas con "incluir en flujo" y monto capturado en esos meses.
          </div>}

          <div className="card" style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...th, position: 'sticky', left: 0, minWidth: 240 }}>Concepto</th>
                {meses.map(m => <th key={m} style={{ ...th, textAlign: 'right' }}>{etiquetaMes(m)}</th>)}
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
              </tr></thead>
              <tbody>
                {bloque('ingreso')}
                {bloque('egreso')}
                <tr style={{ fontWeight: 800, background: '#f1f5f9' }}>
                  <td style={td}>Flujo neto</td>{meses.map(m => celda(totales.neto[m]))}{celda(totales.tIng - totales.tEgr)}
                </tr>
                <tr style={{ fontWeight: 800 }}>
                  <td style={td}>Saldo de caja proyectado</td>{meses.map(m => celda(totales.saldo[m], '#0369a1'))}<td style={td} />
                </tr>
                <tr><td colSpan={meses.length + 2} style={{ ...td, fontWeight: 800, background: '#eff6ff', color: '#1d4ed8' }}>REAL BANCO (movimientos importados)</td></tr>
                <tr><td style={td}>Abonos</td>{meses.map(m => celda(real[m]?.abonos))}{celda(meses.reduce((a, m) => a + (real[m]?.abonos ?? 0), 0))}</tr>
                <tr><td style={td}>Cargos</td>{meses.map(m => celda(real[m]?.cargos))}{celda(meses.reduce((a, m) => a + (real[m]?.cargos ?? 0), 0))}</tr>
                <tr style={{ fontWeight: 800 }}>
                  <td style={td}>Variación del neto (real − proyectado)</td>
                  {meses.map(m => real[m] ? celda((real[m].abonos - real[m].cargos) - totales.neto[m]) : <td key={m} style={{ ...td, ...num, color: '#cbd5e1' }}>—</td>)}
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13 }}>Por concepto de flujo (neto del rango: ingresos − egresos)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Concepto</th><th style={{ ...th, textAlign: 'right' }}>Proyectado</th><th style={{ ...th, textAlign: 'right' }}>Real banco</th><th style={{ ...th, textAlign: 'right' }}>Variación</th></tr></thead>
              <tbody>
                {porConcepto.map(c => (
                  <tr key={c.id}><td style={td}>{c.nombre}</td>
                    <td style={{ ...td, ...num }}>{mxn(c.proy)}</td><td style={{ ...td, ...num }}>{mxn(c.real)}</td>
                    <td style={{ ...td, ...num, color: c.real - c.proy >= 0 ? '#15803d' : '#dc2626' }}>{mxn(c.real - c.proy)}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: '#7a8aa3', padding: '0 14px 10px', margin: 0 }}>
              Las partidas se asignan al concepto por su clasificación en Presupuestos (operativo, financiero, intercompañías); el real viene del concepto con que se clasificó cada movimiento bancario.
            </p>
          </div>
        </>
      )}

      {modal && (
        <ModalVersion row={modal.row} presupuestos={presupuestos} conceptos={conceptos} usuario={authUser?.nombre ?? null}
          onClose={() => setModal(null)} onSaved={(id) => { setModal(null); cargarVersiones(id); if (id === selId && version) cargarDetalle(version) }} />
      )}
    </div>
  )
}

// ── Modal crear/editar versión ────────────────────────────────
function ModalVersion({ row, presupuestos, conceptos, usuario, onClose, onSaved }: {
  row: Version | null; presupuestos: Presupuesto[]; conceptos: Concepto[]; usuario: string | null
  onClose: () => void; onSaved: (id: number) => void
}) {
  const hoy = new Date()
  const [f, setF] = useState({
    nombre: row?.nombre ?? '', id_presupuesto_fk: row ? String(row.id_presupuesto_fk) : (presupuestos[0] ? String(presupuestos[0].id) : ''),
    mes_ini: (row?.mes_inicio ?? mesISO(hoy.getFullYear(), hoy.getMonth() + 1)).slice(0, 7),
    mes_fin: (row?.mes_fin ?? mesISO(hoy.getFullYear(), 12)).slice(0, 7),
    saldo_inicial: String(row?.saldo_inicial ?? 0), escenario: row?.escenario ?? 'Esperada',
    pct_ingresos: String(row?.pct_ingresos ?? 100), pct_egresos: String(row?.pct_egresos ?? 100),
  })
  const [guardando, setGuardando] = useState(false)

  // saldo inicial sugerido: suma de saldos de cuentas bancarias activas
  useEffect(() => {
    if (row) return
    dbCfg.from('cuentas_bancarias').select('saldo, activo').then(({ data }) => {
      const total = (data ?? []).filter((c: any) => c.activo !== false).reduce((a: number, c: any) => a + Number(c.saldo ?? 0), 0)
      if (total) setF(prev => ({ ...prev, saldo_inicial: String(Math.round(total * 100) / 100) }))
    })
  }, [row])

  function elegirEscenario(e: Version['escenario']) {
    const [i, g] = ESCENARIO_PCT[e]
    setF(prev => ({ ...prev, escenario: e, pct_ingresos: String(i), pct_egresos: String(g) }))
  }

  async function guardar() {
    if (!f.nombre.trim()) { alert('El nombre es obligatorio'); return }
    const params = {
      nombre: f.nombre.trim(), saldo_inicial: Number(f.saldo_inicial) || 0, escenario: f.escenario,
      pct_ingresos: Number(f.pct_ingresos), pct_egresos: Number(f.pct_egresos),
    }
    if (isNaN(params.pct_ingresos) || isNaN(params.pct_egresos)) { alert('Los porcentajes deben ser numéricos'); return }
    setGuardando(true)
    if (row) {
      const { error } = await dbComp.from('flujo_versiones').update(params).eq('id', row.id)
      setGuardando(false)
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      onSaved(row.id); return
    }

    const ppto = presupuestos.find(p => p.id === Number(f.id_presupuesto_fk))
    if (!ppto) { setGuardando(false); alert('Elige un presupuesto'); return }
    const ini = f.mes_ini + '-01', fin = f.mes_fin + '-01'
    if (fin < ini) { setGuardando(false); alert('El mes final no puede ser anterior al inicial'); return }
    if (Number(ini.slice(0, 4)) !== ppto.anio || Number(fin.slice(0, 4)) !== ppto.anio) {
      setGuardando(false); alert(`El presupuesto "${ppto.nombre}" es del ${ppto.anio}; el rango debe quedar dentro de ese año.`); return
    }

    const [partidas, { data: det, error: eDet }] = await Promise.all([
      cargarPartidasPresupuesto<any>(
        'id, tipo, id_centro_costo_fk, id_area_fk, id_centro_ingreso_fk, id_seccion_fk, clasificacion, iva_pct',
        ppto.id, ppto.modulo, q => q.eq('incluir_flujo', true)),
      dbCtrl.from('ppto_presupuesto_det').select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', ppto.id),
    ])
    if (eDet) { setGuardando(false); alert('Error al leer el presupuesto: ' + eDet.message); return }

    const conc = (nombre: string) => conceptos.find(c => c.nombre === nombre)?.id ?? null
    const conceptoDe = (p: any) =>
      p.clasificacion === 'financiero' ? conc('Financieros')
        : p.clasificacion === 'intercompanias' ? conc('Otros')
          : conc(p.tipo === 'ingreso' ? 'Cobranza e ingresos operativos' : 'Proveedores y gasto operativo')

    const porPartida = new Map<number, any>(partidas.map(p => [p.id, p]))
    const lineas: any[] = []
    ;(det ?? []).forEach((d: any) => {
      const p = porPartida.get(d.id_partida_fk)
      const mesIso = mesISO(ppto.anio, d.mes)
      if (!p || mesIso < ini || mesIso > fin || !Number(d.monto)) return
      // Presupuestado sin IVA → con IVA (flujo de caja), igual que /presupuestos/flujo
      const monto = r2(Number(d.monto) * (1 + Number(p.iva_pct ?? 16) / 100))
      lineas.push({
        id_partida_fk: p.id, mes: mesIso, tipo: p.tipo,
        id_centro_costo_fk: p.id_centro_costo_fk, id_area_fk: p.id_area_fk,
        id_centro_ingreso_fk: p.id_centro_ingreso_fk, id_seccion_fk: p.id_seccion_fk,
        id_concepto_flujo_fk: conceptoDe(p), monto_ppto: monto, monto,
      })
    })

    const { data: ver, error } = await dbComp.from('flujo_versiones').insert({
      ...params, id_presupuesto_fk: ppto.id, mes_inicio: ini, mes_fin: fin, status: 'Borrador', created_by: usuario,
    }).select('id').single()
    if (error || !ver) { setGuardando(false); alert('No se pudo crear: ' + error?.message); return }
    const idVer = (ver as any).id as number
    for (let i = 0; i < lineas.length; i += 500) {
      const { error: e2 } = await dbComp.from('flujo_version_lineas').insert(lineas.slice(i, i + 500).map(l => ({ ...l, id_version_fk: idVer })))
      if (e2) { alert('La versión se creó pero falló al generar líneas: ' + e2.message); break }
    }
    setGuardando(false)
    onSaved(idVer)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <ModalShell modulo="tesoreria" titulo={row ? 'Parámetros de la versión' : 'Nueva versión de flujo'} onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : row ? 'Guardar' : 'Crear y generar'}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={lbl}>Nombre</label><input style={inputStyle} value={f.nombre} placeholder="Ej. Flujo 2027 esperado" onChange={set('nombre')} /></div>
        {!row && <>
          <div><label style={lbl}>Presupuesto base</label>
            <select style={inputStyle} value={f.id_presupuesto_fk} onChange={set('id_presupuesto_fk')}>
              {presupuestos.map(p => <option key={p.id} value={p.id}>{p.anio} · {p.nombre} ({p.status})</option>)}
            </select>
            <p style={{ fontSize: 11.5, color: '#7a8aa3', margin: '5px 0 0' }}>Se toman las partidas con "incluir en flujo": egresos por Centro de costo/Área e ingresos por Centro de ingreso/Sección, con IVA.</p></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Mes inicial</label><input type="month" style={inputStyle} value={f.mes_ini} onChange={set('mes_ini')} /></div>
            <div><label style={lbl}>Mes final</label><input type="month" style={inputStyle} value={f.mes_fin} onChange={set('mes_fin')} /></div>
          </div>
        </>}
        <div><label style={lbl}>Saldo inicial de caja</label><input type="number" style={inputStyle} value={f.saldo_inicial} onChange={set('saldo_inicial')} />
          {!row && <p style={{ fontSize: 11.5, color: '#7a8aa3', margin: '5px 0 0' }}>Sugerido: suma de saldos de las cuentas bancarias activas.</p>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Escenario</label>
            <select style={inputStyle} value={f.escenario} onChange={e => elegirEscenario(e.target.value as Version['escenario'])}>
              <option>Optimista</option><option>Esperada</option><option>Pesimista</option>
            </select></div>
          <div><label style={lbl}>Ingresos al %</label><input type="number" style={inputStyle} value={f.pct_ingresos} onChange={set('pct_ingresos')} /></div>
          <div><label style={lbl}>Egresos al %</label><input type="number" style={inputStyle} value={f.pct_egresos} onChange={set('pct_egresos')} /></div>
        </div>
      </div>
    </ModalShell>
  )
}
