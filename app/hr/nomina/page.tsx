'use client'
// HR › Nómina — carga del Excel de nómina BPCC (semanal / quincenal) y
// generación automática de las Órdenes de Pago de Nómina del mes: una OP por
// Área (su CC se deriva del Área), monto = neto a pagar, fecha_op = último día
// del mes del periodo (no la fecha de captura). Ver lib/nominaExcel.ts.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { dbCtrl, dbCfg, dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Receipt, Upload, Loader, Trash2, AlertTriangle, Plus, Copy, Link2, RefreshCw, CheckCircle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import PageHeader from '@/components/layout/PageHeader'
import { nextFolio } from '@/app/compras/types'
import { cargarTiposGasto, armarCatalogo } from '@/lib/tiposGasto'
import { leerNominaExcel, finDeMes, normNoEmpleado, NominaLeida, TipoNomina } from '@/lib/nominaExcel'

type Area = { id: number; nombre: string; id_centro_costo_fk: number | null }
type Carga = {
  id: number; tipo: TipoNomina; anio: number; periodo: number; fecha_inicio: string | null; fecha_fin: string | null
  mes: string; archivo: string | null; total_percepciones: number; total_neto: number; hc: number; created_by: string | null
}
type Det = { id_carga_fk: number; id_area_fk: number | null; percepciones: number; neto: number; es_ajuste: boolean }
type OpMes = { id: number; mes: string; id_area_fk: number; id_op_fk: number; monto: number }
type OpInfo = { id: number; folio: string; status: string; monto: number; fecha_op: string | null; id_area_fk: number | null; monto_pagado: number | null }

const fmt = (v: number | null | undefined) =>
  v != null ? '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
const r2 = (n: number) => Math.round(n * 100) / 100
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const mesLabel = (mes: string) => { const [y, m] = mes.split('-').map(Number); return `${MESES[m - 1]} ${y}` }
const etiquetaCarga = (c: { tipo: TipoNomina; periodo: number }) => (c.tipo === 'Semanal' ? `S${c.periodo}` : `Q${c.periodo}`)
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const STATUS_EDITABLE = ['Pendiente Auth']
// Las OPs de nómina capturadas a mano se redondean a pesos: diferencias < $1 no se marcan
const TOLERANCIA = 1
const normNombre = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

export default function NominaPage() {
  const { canWrite, authUser } = useAuth()
  const puedeCapturar = canWrite('hr')

  const [areas, setAreas] = useState<Area[]>([])
  const [ccNom, setCcNom] = useState<Record<number, string>>({})
  const [meses, setMeses] = useState<string[]>([])
  const [mes, setMes] = useState<string>('')
  const [cargas, setCargas] = useState<Carga[]>([])
  const [det, setDet] = useState<Det[]>([])
  const [opMes, setOpMes] = useState<OpMes[]>([])
  const [ops, setOps] = useState<Record<number, OpInfo>>({})
  const [opsManuales, setOpsManuales] = useState<OpInfo[]>([])
  const [idTipoNomina, setIdTipoNomina] = useState<number | null>(null)
  const [proveedores, setProveedores] = useState<{ id: number; nombre: string }[]>([])
  const [idProveedor, setIdProveedor] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [leida, setLeida] = useState<{ data: NominaLeida; archivo: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const areaById = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a])), [areas])

  // Catálogos
  useEffect(() => {
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').order('nombre').then(({ data }) => setAreas((data ?? []) as Area[]))
    dbCfg.from('centros_costo').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}; (data ?? []).forEach((c: any) => { m[c.id] = c.nombre }); setCcNom(m)
    })
    cargarTiposGasto().then(t => setIdTipoNomina(armarCatalogo(t).idPorClave('nomina')))
    dbComp.from('proveedores').select('id, nombre').order('nombre').then(({ data }) => setProveedores((data ?? []) as any))
  }, [])

  // Proveedor por defecto: el de la última OP de nómina
  useEffect(() => {
    if (!idTipoNomina || idProveedor) return
    dbComp.from('ordenes_pago').select('id_proveedor_fk').eq('id_tipo_gasto_fk', idTipoNomina)
      .not('id_proveedor_fk', 'is', null).order('id', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.id_proveedor_fk) setIdProveedor(String(data[0].id_proveedor_fk)) })
  }, [idTipoNomina, idProveedor])

  const cargarMeses = useCallback(async () => {
    const { data } = await dbCtrl.from('nomina_cargas').select('mes')
    const set = new Set<string>((data ?? []).map((r: any) => r.mes))
    set.add(mesActual())
    const lista = Array.from(set).sort().reverse()
    setMeses(lista)
    setMes(prev => prev || (data && data.length ? lista.find(m => (data as any[]).some(d => d.mes === m)) ?? lista[0] : lista[0]))
  }, [])
  useEffect(() => { cargarMeses() }, [cargarMeses])

  const fetchMes = useCallback(async () => {
    if (!mes) return
    setLoading(true); setError('')
    const { data: cg, error: e1 } = await dbCtrl.from('nomina_cargas').select('*').eq('mes', mes).order('tipo').order('periodo')
    if (e1) { setError(e1.message); setLoading(false); return }
    const ids = (cg ?? []).map((c: any) => c.id)
    const { data: dt } = ids.length
      ? await dbCtrl.from('nomina_cargas_det').select('id_carga_fk, id_area_fk, percepciones, neto, es_ajuste').in('id_carga_fk', ids)
      : { data: [] as any[] }
    const { data: om } = await dbCtrl.from('nomina_op_mes').select('*').eq('mes', mes)
    const opIds = (om ?? []).map((o: any) => o.id_op_fk)
    const { data: opsData } = opIds.length
      ? await dbComp.from('ordenes_pago').select('id, folio, status, monto, fecha_op, id_area_fk, monto_pagado').in('id', opIds)
      : { data: [] as any[] }
    // OPs de nómina capturadas a mano en el mes (sin vínculo) — para no duplicar
    let manuales: OpInfo[] = []
    if (idTipoNomina) {
      const { data: man } = await dbComp.from('ordenes_pago').select('id, folio, status, monto, fecha_op, id_area_fk, monto_pagado')
        .eq('id_tipo_gasto_fk', idTipoNomina).gte('fecha_op', mes).lte('fecha_op', finDeMes(mes)).neq('status', 'Cancelada')
      manuales = ((man ?? []) as OpInfo[]).filter(o => !opIds.includes(o.id) && Number(o.monto) > 1)
    }
    setCargas((cg ?? []) as Carga[])
    setDet(((dt ?? []) as any[]).map(d => ({ ...d, percepciones: Number(d.percepciones), neto: Number(d.neto) })))
    setOpMes(((om ?? []) as any[]).map(o => ({ ...o, monto: Number(o.monto) })))
    setOps(Object.fromEntries(((opsData ?? []) as OpInfo[]).map(o => [o.id, { ...o, monto: Number(o.monto) }])))
    setOpsManuales(manuales.map(o => ({ ...o, monto: Number(o.monto) })))
    setLoading(false)
  }, [mes, idTipoNomina])
  useEffect(() => { fetchMes() }, [fetchMes])

  // ── Resumen por Área ────────────────────────────────────────────────────
  const resumen = useMemo(() => {
    const porArea = new Map<number | null, { neto: number; perc: number; porCarga: Record<number, number> }>()
    for (const d of det) {
      const k = d.id_area_fk ?? null
      const a = porArea.get(k) ?? { neto: 0, perc: 0, porCarga: {} }
      a.neto += d.neto; a.perc += d.percepciones
      a.porCarga[d.id_carga_fk] = (a.porCarga[d.id_carga_fk] ?? 0) + d.neto
      porArea.set(k, a)
    }
    return Array.from(porArea.entries())
      .map(([id_area, v]) => {
        const vinc = opMes.filter(o => o.id_area_fk === id_area)
        const opsArea = vinc.map(o => ops[o.id_op_fk]).filter(Boolean) as OpInfo[]
        const montoOps = r2(opsArea.reduce((a, o) => a + o.monto, 0))
        return {
          id_area, area: id_area != null ? areaById[id_area] : undefined,
          neto: r2(v.neto), perc: r2(v.perc), porCarga: v.porCarga,
          opsArea, montoOps, diferencia: r2(v.neto - montoOps),
          manuales: opsManuales.filter(o => o.id_area_fk === id_area),
        }
      })
      .sort((a, b) => (a.area?.nombre ?? 'zzz').localeCompare(b.area?.nombre ?? 'zzz'))
  }, [det, opMes, ops, opsManuales, areaById])

  const sinArea = resumen.find(r => r.id_area == null)
  const pendientes = resumen.filter(r => r.id_area != null && r.opsArea.length === 0 && r.manuales.length === 0 && r.neto > 0)
  const totNeto = r2(resumen.reduce((a, r) => a + r.neto, 0))
  const totPerc = r2(resumen.reduce((a, r) => a + r.perc, 0))
  const totOps = r2(resumen.reduce((a, r) => a + r.montoOps, 0))

  // ── Acciones ────────────────────────────────────────────────────────────
  const onArchivo = async (f: File | undefined) => {
    if (!f) return
    setError(''); setAviso('')
    try {
      const buf = await f.arrayBuffer()
      setLeida({ data: leerNominaExcel(buf, f.name, new Date().getFullYear()), archivo: f.name })
    } catch (e: any) {
      setError(`${f.name}: ${e?.message ?? 'no se pudo leer el archivo'}`)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const conceptoOP = (id_area: number, area: Area) => {
    const per = cargas.filter(c => det.some(d => d.id_carga_fk === c.id && d.id_area_fk === id_area)).map(etiquetaCarga).join(', ')
    return `Nómina ${mesLabel(mes)} · ${area.nombre}${per ? ` (${per})` : ''}`
  }

  const crearOP = async (id_area: number, monto: number, perc: number, sufijo = '') => {
    const area = areaById[id_area]
    if (!area) throw new Error(`Área ${id_area} no encontrada`)
    if (!area.id_centro_costo_fk) throw new Error(`El área ${area.nombre} no tiene Centro de Costo`)
    if (!idTipoNomina) throw new Error('No se encontró el tipo de gasto Nómina (clave "nomina") en cfg.tipos_gasto')
    const folio = await nextFolio(dbComp, 'OP')
    const fecha = finDeMes(mes)
    const { data: op, error: e } = await dbComp.from('ordenes_pago').insert({
      folio,
      id_proveedor_fk: idProveedor ? Number(idProveedor) : null,
      id_centro_costo_fk: area.id_centro_costo_fk,
      id_area_fk: id_area,
      id_frente_fk: null,
      concepto: conceptoOP(id_area, area) + sufijo,
      id_tipo_gasto_fk: idTipoNomina,
      forma_pago: 'Transferencia electrónica de fondos',
      urgencia: 'Media',
      fecha_op: fecha,
      fecha_vencimiento: fecha,
      subtotal: monto, iva: 0, monto,
      status: 'Pendiente Auth',
      notas: `Generada automáticamente desde HR › Nómina (${mesLabel(mes)}). Neto a pagar; percepciones ${fmt(perc)}.`,
      created_by: authUser?.nombre ?? null,
      created_by_id: authUser?.user.id ?? null,
    }).select('id').single()
    if (e) throw new Error(e.message)
    const { error: e2 } = await dbCtrl.from('nomina_op_mes').insert({
      mes, id_area_fk: id_area, id_op_fk: op.id, monto, percepciones: perc, created_by: authUser?.nombre ?? null,
    })
    if (e2) throw new Error(e2.message)
    return folio
  }

  const generarPendientes = async () => {
    if (!pendientes.length) return
    if (!idProveedor) { setError('Selecciona el proveedor de las OPs de nómina'); return }
    if (sinArea) { setError('Hay colaboradores sin Área en las cargas del mes; corrígelos antes de generar'); return }
    if (!confirm(`Se generarán ${pendientes.length} OP(s) de Nómina con fecha ${finDeMes(mes)} por ${fmt(pendientes.reduce((a, r) => a + r.neto, 0))}. ¿Continuar?`)) return
    setBusy(true); setError(''); setAviso('')
    const hechas: string[] = []
    try {
      for (const r of pendientes) hechas.push(await crearOP(r.id_area as number, r.neto, r.perc))
      setAviso(`OPs generadas: ${hechas.join(', ')} (status Pendiente Auth)`)
    } catch (e: any) {
      setError(`${hechas.length ? `Generadas ${hechas.join(', ')}. ` : ''}Error: ${e?.message}`)
    } finally { setBusy(false); fetchMes() }
  }

  const actualizarOP = async (r: typeof resumen[number]) => {
    const op = r.opsArea.find(o => STATUS_EDITABLE.includes(o.status) && !(o.monto_pagado ?? 0))
    if (!op) return
    const nuevo = r2(op.monto + r.diferencia)
    if (nuevo <= 0) { setError('El monto resultante sería ≤ 0'); return }
    if (!confirm(`Actualizar ${op.folio} de ${fmt(op.monto)} a ${fmt(nuevo)}?`)) return
    setBusy(true); setError('')
    const area = areaById[r.id_area as number]
    const { error: e } = await dbComp.from('ordenes_pago')
      .update({ monto: nuevo, subtotal: nuevo, iva: 0, saldo: nuevo, concepto: conceptoOP(r.id_area as number, area) })
      .eq('id', op.id)
    if (!e) await dbCtrl.from('nomina_op_mes').update({ monto: nuevo, percepciones: r.perc }).eq('id_op_fk', op.id)
    if (e) setError(e.message); else setAviso(`${op.folio} actualizada a ${fmt(nuevo)}`)
    setBusy(false); fetchMes()
  }

  const complementaria = async (r: typeof resumen[number]) => {
    if (r.diferencia <= 0 || r.id_area == null) return
    if (!idProveedor) { setError('Selecciona el proveedor de las OPs de nómina'); return }
    if (!confirm(`Generar OP complementaria de ${fmt(r.diferencia)} para ${r.area?.nombre}?`)) return
    setBusy(true); setError('')
    try {
      const folio = await crearOP(r.id_area, r.diferencia, 0, ' · complementaria')
      setAviso(`OP complementaria ${folio} generada`)
    } catch (e: any) { setError(e?.message) } finally { setBusy(false); fetchMes() }
  }

  const vincular = async (r: typeof resumen[number]) => {
    if (r.id_area == null || !r.manuales.length) return
    if (!confirm(`Vincular ${r.manuales.map(o => o.folio).join(', ')} como la nómina de ${r.area?.nombre} en ${mesLabel(mes)}? (no se modifica la OP)`)) return
    setBusy(true)
    const { error: e } = await dbCtrl.from('nomina_op_mes').insert(r.manuales.map(o => ({
      mes, id_area_fk: r.id_area, id_op_fk: o.id, monto: o.monto, percepciones: 0, created_by: authUser?.nombre ?? null,
    })))
    if (e) setError(e.message)
    setBusy(false); fetchMes()
  }

  const borrarCarga = async (c: Carga) => {
    const msgOps = opMes.length ? '\n\nOjo: el mes ya tiene OPs vinculadas; no se modifican, revisa diferencias después.' : ''
    if (!confirm(`¿Eliminar la carga ${c.tipo} ${c.periodo} (${c.archivo ?? ''})?${msgOps}`)) return
    setBusy(true)
    const { error: e } = await dbCtrl.from('nomina_cargas').delete().eq('id', c.id)
    if (e) setError(e.message)
    setBusy(false); fetchMes(); cargarMeses()
  }

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        backHref="/hr"
        icon={Receipt}
        color="#b45309"
        eyebrowLabel="HR"
        title="Nómina"
        subtitle="Carga del Excel de nómina y OPs del mes por Área, con fecha del periodo"
        actions={puedeCapturar ? (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => onArchivo(e.target.files?.[0])} />
            <button className="btn-primary" onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Upload size={14} /> Cargar Excel de nómina
            </button>
          </>
        ) : undefined}
      />

      <div className="card" style={{ padding: '14px 16px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Mes</div>
          <select className="input" value={mes} onChange={e => setMes(e.target.value)} style={{ minWidth: 180 }}>
            {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Proveedor de las OPs</div>
          <select className="input" value={idProveedor} onChange={e => setIdProveedor(e.target.value)} style={{ minWidth: 280 }}>
            <option value="">— Selecciona —</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, minWidth: 240 }}>
          Semana → mes de su jueves (S40–S44 = octubre); quincena n → mes ⌈n/2⌉. Las OPs se generan con fecha {mes ? finDeMes(mes) : '—'}.
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, display: 'flex', gap: 8 }}><AlertTriangle size={15} /> {error}</div>}
      {aviso && <div style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, display: 'flex', gap: 8 }}><CheckCircle size={15} /> {aviso}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={18} className="animate-spin" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            {[
              { l: 'Neto a pagar del mes', v: fmt(totNeto) },
              { l: 'Total percepciones', v: fmt(totPerc) },
              { l: 'En OPs vinculadas', v: fmt(totOps) },
              { l: 'Cargas del mes', v: `${cargas.filter(c => c.tipo === 'Semanal').length} sem · ${cargas.filter(c => c.tipo === 'Quincenal').length} quinc` },
            ].map(k => (
              <div key={k.l} className="card" style={{ padding: '12px 16px', flex: '1 1 180px', maxWidth: 260 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* OPs por Área */}
          <div className="card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>OPs de Nómina por Área · {mes && mesLabel(mes)}</div>
              {puedeCapturar && pendientes.length > 0 && (
                <button className="btn-primary" disabled={busy} onClick={generarPendientes} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {busy ? <Loader size={14} className="animate-spin" /> : <Receipt size={14} />} Generar {pendientes.length} OP(s)
                </button>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>CC / Área</th>
                    {cargas.map(c => <th key={c.id} style={th}>{etiquetaCarga(c)}</th>)}
                    <th style={th}>Neto mes</th>
                    <th style={th}>Percepciones</th>
                    <th style={{ ...th, textAlign: 'left' }}>OP</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.length === 0 && (
                    <tr><td colSpan={cargas.length + 5} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Sin cargas de nómina en este mes</td></tr>
                  )}
                  {resumen.map(r => (
                    <tr key={String(r.id_area)}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        {r.area ? (<><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ccNom[r.area.id_centro_costo_fk ?? -1] ?? '—'}</div>{r.area.nombre}</>) : <span style={{ color: '#dc2626', fontWeight: 600 }}>Sin Área</span>}
                      </td>
                      {cargas.map(c => <td key={c.id} style={td}>{r.porCarga[c.id] ? fmt(r.porCarga[c.id]) : '—'}</td>)}
                      <td style={{ ...td, fontWeight: 600 }}>{fmt(r.neto)}</td>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>{fmt(r.perc)}</td>
                      <td style={{ ...td, textAlign: 'left' }}>
                        {r.opsArea.map(o => (
                          <div key={o.id} style={{ fontSize: 12 }}>
                            <a href="/compras/ordenes-pago" style={{ color: '#2563eb', fontWeight: 600 }}>{o.folio}</a> · {o.status} · {fmt(o.monto)}
                          </div>
                        ))}
                        {r.opsArea.length === 0 && r.manuales.length > 0 && (
                          <div style={{ fontSize: 12, color: '#b45309' }}>
                            Capturada a mano: {r.manuales.map(o => `${o.folio} (${fmt(o.monto)})`).join(', ')}
                          </div>
                        )}
                        {r.opsArea.length === 0 && r.manuales.length === 0 && r.id_area != null && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pendiente</span>}
                        {r.opsArea.length > 0 && Math.abs(r.diferencia) >= TOLERANCIA && (
                          <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Diferencia {fmt(r.diferencia)}</div>
                        )}
                      </td>
                      <td style={td}>
                        {puedeCapturar && r.opsArea.length === 0 && r.manuales.length > 0 && (
                          <button className="btn-ghost" disabled={busy} onClick={() => vincular(r)} title="Vincular OP capturada a mano" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Link2 size={13} /> Vincular</button>
                        )}
                        {puedeCapturar && r.opsArea.length > 0 && Math.abs(r.diferencia) >= TOLERANCIA && (
                          r.opsArea.some(o => STATUS_EDITABLE.includes(o.status) && !(o.monto_pagado ?? 0))
                            ? <button className="btn-ghost" disabled={busy} onClick={() => actualizarOP(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><RefreshCw size={13} /> Actualizar OP</button>
                            : r.diferencia > 0 && <button className="btn-ghost" disabled={busy} onClick={() => complementaria(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Plus size={13} /> Complementaria</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {resumen.length > 0 && (
                    <tr>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>Total</td>
                      {cargas.map(c => <td key={c.id} style={{ ...td, fontWeight: 700 }}>{fmt(det.filter(d => d.id_carga_fk === c.id).reduce((a, d) => a + d.neto, 0))}</td>)}
                      <td style={{ ...td, fontWeight: 700 }}>{fmt(totNeto)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{fmt(totPerc)}</td>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{fmt(totOps)}</td>
                      <td style={td}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cargas del mes */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 14 }}>Cargas del mes</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>Periodo</th>
                    <th style={{ ...th, textAlign: 'left' }}>Fechas</th>
                    <th style={{ ...th, textAlign: 'left' }}>Archivo</th>
                    <th style={th}>HC</th>
                    <th style={th}>Percepciones</th>
                    <th style={th}>Neto archivo</th>
                    <th style={th}>Ajustes</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {cargas.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin cargas</td></tr>}
                  {cargas.map(c => {
                    const aj = det.filter(d => d.id_carga_fk === c.id && d.es_ajuste).reduce((a, d) => a + d.neto, 0)
                    return (
                      <tr key={c.id}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{c.tipo} {c.periodo}</td>
                        <td style={{ ...td, textAlign: 'left' }}>{c.fecha_inicio} – {c.fecha_fin}</td>
                        <td style={{ ...td, textAlign: 'left', color: 'var(--text-muted)' }}>{c.archivo}</td>
                        <td style={td}>{c.hc}</td>
                        <td style={td}>{fmt(c.total_percepciones)}</td>
                        <td style={td}>{fmt(c.total_neto)}</td>
                        <td style={td}>{aj ? fmt(aj) : '—'}</td>
                        <td style={td}>
                          {puedeCapturar && <button className="btn-ghost" disabled={busy} onClick={() => borrarCarga(c)} title="Eliminar carga"><Trash2 size={14} /></button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {leida && (
        <CargaModal
          leida={leida.data}
          archivo={leida.archivo}
          areas={areas}
          ccNom={ccNom}
          authUser={authUser}
          onClose={() => setLeida(null)}
          onSaved={(m) => { setLeida(null); setMes(m); cargarMeses(); fetchMes(); setAviso('Carga guardada') }}
        />
      )}
    </div>
  )
}

// ── Modal de carga ──────────────────────────────────────────────────────────
type Ajuste = { concepto: string; id_area_fk: string; percepciones: string; neto: string }

function CargaModal({ leida, archivo, areas, ccNom, authUser, onClose, onSaved }: {
  leida: NominaLeida; archivo: string; areas: Area[]; ccNom: Record<number, string>; authUser: any
  onClose: () => void; onSaved: (mes: string) => void
}) {
  const [colabs, setColabs] = useState<{ id: number; no: string; id_area_fk: number | null }[] | null>(null)
  // Colaboradores sin número de empleado: se empatan por nombre completo para no duplicarlos
  const [sinNumero, setSinNumero] = useState<Map<string, { id: number; id_area_fk: number | null }>>(new Map())
  const [asignar, setAsignar] = useState<Record<string, string>>({})   // no_empleado → id_area
  const [mes, setMes] = useState(leida.mes)
  const [ajustes, setAjustes] = useState<Ajuste[]>([])
  const [yaExiste, setYaExiste] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const areaById = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a])), [areas])

  useEffect(() => {
    dbCfg.from('colaboradores').select('id, no_empleado, id_area_fk').eq('tipo_nomina', leida.tipo).not('no_empleado', 'is', null)
      .then(({ data }) => setColabs(((data ?? []) as any[]).map(c => ({ id: c.id, no: normNoEmpleado(c.no_empleado), id_area_fk: c.id_area_fk }))))
    dbCfg.from('colaboradores').select('id, nombre, apellido_paterno, apellido_materno, id_area_fk').is('no_empleado', null).eq('tipo', 'Interno')
      .then(({ data }) => {
        const m = new Map<string, { id: number; id_area_fk: number | null }>()
        ;((data ?? []) as any[]).forEach(c => {
          m.set(normNombre([c.apellido_paterno, c.apellido_materno, c.nombre].filter(Boolean).join(' ')), { id: c.id, id_area_fk: c.id_area_fk })
          m.set(normNombre(c.nombre ?? ''), { id: c.id, id_area_fk: c.id_area_fk })
        })
        setSinNumero(m)
      })
    dbCtrl.from('nomina_cargas').select('id').eq('tipo', leida.tipo).eq('anio', leida.anio).eq('periodo', leida.periodo)
      .then(({ data }) => setYaExiste(!!data?.length))
  }, [leida])

  const colabPorNo = useMemo(() => new Map((colabs ?? []).map(c => [c.no, c])), [colabs])

  // Sugerencia de Área para los no resueltos: el Área más común entre los
  // colaboradores resueltos con el mismo texto de CENTRO DE COSTOS del archivo.
  const sugerida = useMemo(() => {
    const cuenta = new Map<string, Map<number, number>>()
    for (const r of leida.renglones) {
      const a = colabPorNo.get(r.no_empleado)?.id_area_fk
      if (!a) continue
      const m = cuenta.get(r.cc_archivo) ?? new Map(); m.set(a, (m.get(a) ?? 0) + 1); cuenta.set(r.cc_archivo, m)
    }
    const out: Record<string, number> = {}
    cuenta.forEach((m, cc) => { out[cc] = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0] })
    return out
  }, [leida, colabPorNo])

  const sinArea = useMemo(() => leida.renglones.filter(r => !colabPorNo.get(r.no_empleado)?.id_area_fk), [leida, colabPorNo])
  useEffect(() => {
    setAsignar(prev => {
      const n = { ...prev }
      for (const r of sinArea) {
        if (n[r.no_empleado]) continue
        const porNombre = !colabPorNo.get(r.no_empleado) ? sinNumero.get(normNombre(r.nombre)) : undefined
        const sug = porNombre?.id_area_fk ?? sugerida[r.cc_archivo]
        if (sug) n[r.no_empleado] = String(sug)
      }
      return n
    })
  }, [sinArea, sugerida, sinNumero, colabPorNo])

  const areaDe = (no: string) => colabPorNo.get(no)?.id_area_fk ?? (asignar[no] ? Number(asignar[no]) : null)

  const resumen = useMemo(() => {
    const m = new Map<number | null, { neto: number; perc: number; hc: number }>()
    const add = (k: number | null, perc: number, neto: number, hc: number) => {
      const a = m.get(k) ?? { neto: 0, perc: 0, hc: 0 }; a.neto += neto; a.perc += perc; a.hc += hc; m.set(k, a)
    }
    leida.renglones.forEach(r => add(areaDe(r.no_empleado), r.percepciones, r.neto, 1))
    ajustes.forEach(a => add(a.id_area_fk ? Number(a.id_area_fk) : null, Number(a.percepciones) || 0, Number(a.neto) || 0, 0))
    return Array.from(m.entries()).sort((a, b) => (areaById[a[0] ?? -1]?.nombre ?? 'zzz').localeCompare(areaById[b[0] ?? -1]?.nombre ?? 'zzz'))
  }, [leida, ajustes, colabPorNo, asignar, areaById]) // eslint-disable-line react-hooks/exhaustive-deps

  const copiarAjustesAnteriores = async () => {
    const { data: prev } = await dbCtrl.from('nomina_cargas').select('id, periodo').eq('tipo', leida.tipo)
      .or(`anio.lt.${leida.anio},and(anio.eq.${leida.anio},periodo.lt.${leida.periodo})`)
      .order('anio', { ascending: false }).order('periodo', { ascending: false }).limit(1)
    if (!prev?.length) { setError('No hay una carga anterior del mismo tipo'); return }
    const { data: aj } = await dbCtrl.from('nomina_cargas_det').select('concepto_ajuste, nombre, id_area_fk, percepciones, neto')
      .eq('id_carga_fk', prev[0].id).eq('es_ajuste', true)
    if (!aj?.length) { setError(`La carga ${leida.tipo} ${prev[0].periodo} no tiene ajustes`); return }
    setError('')
    setAjustes(aj.map((a: any) => ({ concepto: a.concepto_ajuste ?? a.nombre ?? '', id_area_fk: a.id_area_fk ? String(a.id_area_fk) : '', percepciones: String(a.percepciones ?? 0), neto: String(a.neto ?? 0) })))
  }

  const guardar = async () => {
    setError('')
    if (yaExiste) { setError(`${leida.tipo} ${leida.periodo} de ${leida.anio} ya fue cargada; elimínala primero para reemplazarla`); return }
    const faltan = leida.renglones.filter(r => !areaDe(r.no_empleado))
    if (faltan.length) { setError(`Asigna Área a ${faltan.length} colaborador(es)`); return }
    if (ajustes.some(a => !a.id_area_fk || !(Number(a.neto) > 0) || !a.concepto.trim())) { setError('Cada ajuste requiere concepto, Área y neto > 0'); return }
    setSaving(true)
    try {
      // 1) Guardar el Área en cfg.colaboradores (actualiza o da de alta)
      for (const r of sinArea) {
        const idArea = Number(asignar[r.no_empleado]); const area = areaById[idArea]
        const campos = { id_area_fk: idArea, id_centro_costo_fk: area?.id_centro_costo_fk ?? null, updated_at: new Date().toISOString() }
        const c = colabPorNo.get(r.no_empleado)
        const porNombre = !c ? sinNumero.get(normNombre(r.nombre)) : undefined
        const { error: e } = c
          ? await dbCfg.from('colaboradores').update(campos).eq('id', c.id)
          : porNombre
          ? await dbCfg.from('colaboradores').update({ ...campos, no_empleado: r.no_empleado, tipo_nomina: leida.tipo }).eq('id', porNombre.id)
          : await dbCfg.from('colaboradores').insert({ ...campos, nombre: r.nombre || `Empleado ${r.no_empleado}`, no_empleado: r.no_empleado, tipo_nomina: leida.tipo, tipo: 'Interno', activo: true })
        if (e) throw new Error(`Colaborador ${r.no_empleado}: ${e.message}`)
      }
      const { data: cs } = await dbCfg.from('colaboradores').select('id, no_empleado').eq('tipo_nomina', leida.tipo).not('no_empleado', 'is', null)
      const idPorNo = new Map(((cs ?? []) as any[]).map(c => [normNoEmpleado(c.no_empleado), c.id]))

      // 2) Encabezado + detalle
      const { data: carga, error: e1 } = await dbCtrl.from('nomina_cargas').insert({
        tipo: leida.tipo, anio: leida.anio, periodo: leida.periodo,
        fecha_inicio: leida.fecha_inicio, fecha_fin: leida.fecha_fin, mes, archivo,
        total_percepciones: leida.total_percepciones, total_neto: leida.total_neto, hc: leida.renglones.length,
        created_by: authUser?.nombre ?? null, created_by_id: authUser?.user?.id ?? null,
      }).select('id').single()
      if (e1) throw new Error(e1.message)
      const rows = [
        ...leida.renglones.map(r => ({
          id_carga_fk: carga.id, no_empleado: r.no_empleado, nombre: r.nombre, cc_archivo: r.cc_archivo,
          id_colaborador_fk: idPorNo.get(r.no_empleado) ?? null, id_area_fk: areaDe(r.no_empleado),
          percepciones: r.percepciones, neto: r.neto, es_ajuste: false,
        })),
        ...ajustes.map(a => ({
          id_carga_fk: carga.id, nombre: a.concepto.trim(), concepto_ajuste: a.concepto.trim(), id_area_fk: Number(a.id_area_fk),
          percepciones: r2(Number(a.percepciones) || 0), neto: r2(Number(a.neto) || 0), es_ajuste: true,
        })),
      ]
      const { error: e2 } = await dbCtrl.from('nomina_cargas_det').insert(rows)
      if (e2) { await dbCtrl.from('nomina_cargas').delete().eq('id', carga.id); throw new Error(e2.message) }
      onSaved(mes)
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar'); setSaving(false)
    }
  }

  const opcionesMes = useMemo(() => {
    const [y, m] = leida.mes.split('-').map(Number)
    return [-1, 0, 1].map(d => { const dt = new Date(Date.UTC(y, m - 1 + d, 1)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01` })
  }, [leida])
  const selArea = (value: string, onChange: (v: string) => void) => (
    <select className="input" value={value} onChange={e => onChange(e.target.value)} style={{ minWidth: 220, fontSize: 12 }}>
      <option value="">— Área —</option>
      {areas.map(a => <option key={a.id} value={a.id}>{(ccNom[a.id_centro_costo_fk ?? -1] ?? '') + ' · ' + a.nombre}</option>)}
    </select>
  )
  const tdm: React.CSSProperties = { padding: '6px 8px', fontSize: 12, borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const totAj = ajustes.reduce((a, x) => a + (Number(x.neto) || 0), 0)

  return (
    <ModalShell
      modulo="hr"
      titulo={`Cargar ${leida.tipo} ${leida.periodo} · ${leida.anio}`}
      subtitulo={`HR · Nómina · ${archivo}`}
      icono={Upload}
      size="xxl"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={saving || !colabs || yaExiste} onClick={guardar} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />} Guardar carga
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', fontSize: 13 }}>
          <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Periodo</div><b>{leida.fecha_inicio} – {leida.fecha_fin}</b></div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Se imputa al mes</div>
            <select className="input" value={mes} onChange={e => setMes(e.target.value)}>{opcionesMes.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}</select>
          </div>
          <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Colaboradores</div><b>{leida.renglones.length}</b></div>
          <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Percepciones</div><b>{fmt(leida.total_percepciones)}</b></div>
          <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Neto a pagar</div><b>{fmt(leida.total_neto)}</b></div>
        </div>

        {yaExiste && <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12 }}>Este periodo ya está cargado. Elimina la carga existente para reemplazarla.</div>}
        {leida.avisos.map(a => <div key={a} style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>{a}</div>)}

        {!colabs ? <Loader size={16} className="animate-spin" /> : sinArea.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Colaboradores sin Área ({sinArea.length}) — se guardará en Colaboradores</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {sinArea.map(r => (
                  <tr key={r.no_empleado}>
                    <td style={{ ...tdm, textAlign: 'left' }}>{r.no_empleado}</td>
                    <td style={{ ...tdm, textAlign: 'left' }}>{r.nombre}{!colabPorNo.get(r.no_empleado) && (sinNumero.get(normNombre(r.nombre))
                      ? <span style={{ marginLeft: 6, fontSize: 10, color: '#2563eb' }}>EMPATE POR NOMBRE</span>
                      : <span style={{ marginLeft: 6, fontSize: 10, color: '#b45309' }}>ALTA</span>)}</td>
                    <td style={{ ...tdm, textAlign: 'left', color: 'var(--text-muted)' }}>{r.cc_archivo}</td>
                    <td style={tdm}>{fmt(r.neto)}</td>
                    <td style={tdm}>{selArea(asignar[r.no_empleado] ?? '', v => setAsignar(p => ({ ...p, [r.no_empleado]: v })))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Ajustes (personal pagado por otra razón social, etc.){totAj ? ` · ${fmt(totAj)}` : ''}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost" onClick={copiarAjustesAnteriores} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Copy size={13} /> Copiar de la carga anterior</button>
              <button className="btn-ghost" onClick={() => setAjustes(a => [...a, { concepto: '', id_area_fk: '', percepciones: '', neto: '' }])} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Plus size={13} /> Agregar</button>
            </div>
          </div>
          {ajustes.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <input className="input" placeholder="Concepto" value={a.concepto} onChange={e => setAjustes(p => p.map((x, j) => j === i ? { ...x, concepto: e.target.value } : x))} style={{ flex: '1 1 200px', fontSize: 12 }} />
              {selArea(a.id_area_fk, v => setAjustes(p => p.map((x, j) => j === i ? { ...x, id_area_fk: v } : x)))}
              <input className="input" type="number" placeholder="Percepciones" value={a.percepciones} onChange={e => setAjustes(p => p.map((x, j) => j === i ? { ...x, percepciones: e.target.value } : x))} style={{ width: 130, fontSize: 12 }} />
              <input className="input" type="number" placeholder="Neto" value={a.neto} onChange={e => setAjustes(p => p.map((x, j) => j === i ? { ...x, neto: e.target.value } : x))} style={{ width: 130, fontSize: 12 }} />
              <button className="btn-ghost" onClick={() => setAjustes(p => p.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Resumen por Área</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...tdm, textAlign: 'left', color: 'var(--text-muted)' }}>CC / Área</th>
              <th style={{ ...tdm, color: 'var(--text-muted)' }}>HC</th>
              <th style={{ ...tdm, color: 'var(--text-muted)' }}>Percepciones</th>
              <th style={{ ...tdm, color: 'var(--text-muted)' }}>Neto</th>
            </tr></thead>
            <tbody>
              {resumen.map(([k, v]) => (
                <tr key={String(k)}>
                  <td style={{ ...tdm, textAlign: 'left' }}>{k != null ? `${ccNom[areaById[k]?.id_centro_costo_fk ?? -1] ?? ''} · ${areaById[k]?.nombre ?? k}` : <span style={{ color: '#dc2626' }}>Sin Área</span>}</td>
                  <td style={tdm}>{v.hc}</td>
                  <td style={tdm}>{fmt(v.perc)}</td>
                  <td style={{ ...tdm, fontWeight: 600 }}>{fmt(v.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12 }}>{error}</div>}
      </div>
    </ModalShell>
  )
}
