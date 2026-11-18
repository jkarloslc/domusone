'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Landmark, Scale, FileCheck2, X } from 'lucide-react'
import KpiCard from '@/components/ui/KpiCard'
import ModalShell from '@/components/ui/ModalShell'
import { dbComp } from '@/lib/supabase'
import { mxn, nombreCuenta } from '@/lib/flujoBanco'
import {
  MovFlujo, Portada, MesCuenta, FilaEstado,
  clasesDeConceptos, claseDe, resumenMensual, estadoFlujo, filaDeMov, totalesPeriodo,
  cuadraPortada, mesDe, etiquetaMes, MESES_CORTO,
} from '@/lib/flujoCuenta'
import { Aviso, CatalogosBanco, Etiqueta, leerTodo, num, td, th } from './comun'

const SIN_SEG = 'sin'
const pad = (n: number) => String(n).padStart(2, '0')
const monto0 = (n: number | null | undefined) => n == null ? '—' : mxn(n)
const celdaNum = (n: number | null | undefined) => n == null ? '' : Math.abs(n) < 0.005 ? '—' : mxn(n)

export default function TabFlujoCuenta({ cat, puedeEditar, puedeBorrar, usuario, recarga }: {
  cat: CatalogosBanco; puedeEditar: boolean; puedeBorrar: boolean; usuario: string | null; recarga: number
}) {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [desde, setDesde] = useState(1)
  const [hasta, setHasta] = useState(hoy.getMonth() + 1)
  const [idCuenta, setIdCuenta] = useState('')          // '' = consolidado
  const [segmento, setSegmento] = useState('')          // '' = todos, 'sin', id
  const [porTipoGasto, setPorTipoGasto] = useState(true)
  const [movs, setMovs] = useState<MovFlujo[]>([])
  const [portadas, setPortadas] = useState<Portada[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [truncado, setTruncado] = useState(false)
  const [sel, setSel] = useState<{ clave: string; etiqueta: string; mes: string | null } | null>(null)
  const [editPortada, setEditPortada] = useState<MesCuenta | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const ini = `${anio - 1}-12-01`, fin = `${anio}-12-31`
    const [mv, po] = await Promise.all([
      leerTodo<MovFlujo>((a, b) => dbComp.from('flujo_mov_banco')
        .select('id, id_cuenta_fk, fecha, descripcion, cargo, abono, saldo, id_concepto_fk, id_centro_costo_fk, id_tipo_gasto_fk')
        .gte('fecha', ini).lte('fecha', fin).order('id').range(a, b), 60000),
      dbComp.from('flujo_portadas').select('*').gte('periodo', `${anio}-01-01`).lte('periodo', fin),
    ])
    if (mv.error || po.error) setError(mv.error ?? po.error?.message ?? '')
    setTruncado(mv.truncado)
    setMovs(mv.rows.map(m => ({ ...m, cargo: Number(m.cargo), abono: Number(m.abono), saldo: m.saldo == null ? null : Number(m.saldo) })))
    setPortadas(((po.data ?? []) as Portada[]).map(p => ({
      ...p, saldo_inicial: Number(p.saldo_inicial), depositos: Number(p.depositos), retiros: Number(p.retiros), saldo_final: Number(p.saldo_final),
    })))
    setCargando(false)
  }, [anio])
  useEffect(() => { cargar() }, [cargar, recarga])
  useEffect(() => { setSel(null) }, [anio, desde, hasta, idCuenta, segmento, porTipoGasto])

  const clases = useMemo(() => clasesDeConceptos(cat.conceptos), [cat.conceptos])
  const ordenCategorias = useMemo(() => [...cat.conceptos].sort((a, b) => a.orden - b.orden).map(c => c.nombre), [cat.conceptos])
  const nombreTG = useCallback((id: number) => cat.tiposGasto.find(t => t.id === id)?.nombre, [cat.tiposGasto])
  const nombreCC = (id: number | null) => id == null ? 'Sin segmento' : cat.centros.find(c => c.id === id)?.nombre ?? `CC ${id}`
  const cuentasActivas = useMemo(() => cat.cuentas.filter(c => c.activo !== false), [cat.cuentas])

  const mesesAnio = useMemo(() => Array.from({ length: 12 }, (_, i) => `${anio}-${pad(i + 1)}`), [anio])
  const meses = useMemo(() => mesesAnio.slice(desde - 1, Math.max(desde, hasta)), [mesesAnio, desde, hasta])

  // Resumen mensual de TODAS las cuentas, todo el año (para saldos, control y tabla de cuentas)
  const resumen = useMemo(() => resumenMensual(movs, portadas, cuentasActivas, mesesAnio), [movs, portadas, cuentasActivas, mesesAnio])

  const cuentaSel = idCuenta ? Number(idCuenta) : null
  const conSegmento = segmento !== ''
  const enPeriodo = useCallback((m: MovFlujo) => meses.includes(mesDe(m.fecha)), [meses])
  const visibles = useMemo(() => movs.filter(m => {
    if (!enPeriodo(m)) return false
    if (cuentaSel && m.id_cuenta_fk !== cuentaSel) return false
    if (conSegmento) {
      if (claseDe(m, clases).grupo === 'traspaso') return false       // un traspaso no es de ningún segmento
      if (segmento === SIN_SEG ? m.id_centro_costo_fk != null : m.id_centro_costo_fk !== Number(segmento)) return false
    }
    return true
  }), [movs, enPeriodo, cuentaSel, conSegmento, segmento, clases])

  // Saldos por mes: de la cuenta elegida o suma de las cuentas (un segmento no tiene saldo)
  const saldos = useMemo(() => {
    if (conSegmento) return null
    const out: Record<string, { apertura: number | null; cierre: number | null }> = {}
    for (const mes of meses) {
      const rs = resumen.filter(r => r.mes === mes && (!cuentaSel || r.id_cuenta_fk === cuentaSel))
      const ap = rs.filter(r => r.apertura != null), ci = rs.filter(r => r.cierre != null)
      out[mes] = {
        apertura: ap.length ? ap.reduce((s, r) => s + r.apertura!, 0) : null,
        cierre: ci.length ? ci.reduce((s, r) => s + r.cierre!, 0) : null,
      }
    }
    return out
  }, [conSegmento, meses, resumen, cuentaSel])

  const filas = useMemo(() => estadoFlujo(visibles, clases, { meses, saldos, ordenCategorias, nombreTipoGasto: nombreTG, porTipoGasto }),
    [visibles, clases, meses, saldos, ordenCategorias, nombreTG, porTipoGasto])
  const tot = useMemo(() => totalesPeriodo(visibles, clases, cuentaSel != null), [visibles, clases, cuentaSel])
  const saldoIni = saldos?.[meses[0]]?.apertura ?? null
  const saldoFin = saldos?.[meses[meses.length - 1]]?.cierre ?? null

  // Diferencia que no explican los movimientos (consolidado sin todas las cuentas, huecos, etc.)
  const flujoNeto = filas.find(f => f.clave === 'flujo_neto')?.total ?? null
  const difSaldos = saldoIni != null && saldoFin != null && flujoNeto != null ? saldoFin - saldoIni - flujoNeto : null

  const detalle = useMemo(() => {
    if (!sel) return []
    const o = { nombreTipoGasto: nombreTG, porTipoGasto }
    return visibles.filter(m => filaDeMov(m, clases, o) === sel.clave && (!sel.mes || mesDe(m.fecha) === sel.mes))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  }, [sel, visibles, clases, nombreTG, porTipoGasto])

  const porSegmento = useMemo(() => {
    const m = new Map<string, { id: number | null; entOp: number; salOp: number; interco: number; otros: number }>()
    for (const x of movs) {
      if (!enPeriodo(x) || (cuentaSel && x.id_cuenta_fk !== cuentaSel)) continue
      const g = claseDe(x, clases).grupo
      if (g === 'traspaso') continue
      const k = String(x.id_centro_costo_fk ?? SIN_SEG)
      const o = m.get(k) ?? { id: x.id_centro_costo_fk, entOp: 0, salOp: 0, interco: 0, otros: 0 }
      if (g === 'operacion') { o.entOp += x.abono; o.salOp += x.cargo }
      else if (g === 'interco') o.interco += x.abono - x.cargo
      else o.otros += x.abono - x.cargo
      m.set(k, o)
    }
    return Array.from(m.entries()).map(([k, v]) => ({ k, ...v })).sort((a, b) => (b.entOp + b.salOp) - (a.entOp + a.salOp))
  }, [movs, enPeriodo, cuentaSel, clases])

  const porCuenta = useMemo(() => cuentasActivas.map(c => {
    const rs = resumen.filter(r => r.id_cuenta_fk === c.id && meses.includes(r.mes))
    const conMov = rs.filter(r => r.movimientos > 0)
    let ing = 0, egr = 0
    for (const x of movs) {
      if (x.id_cuenta_fk !== c.id || !enPeriodo(x) || claseDe(x, clases).grupo !== 'operacion') continue
      if (conSegmento && (segmento === SIN_SEG ? x.id_centro_costo_fk != null : x.id_centro_costo_fk !== Number(segmento))) continue
      ing += x.abono; egr += x.cargo
    }
    const ult = [...rs].reverse().find(r => r.cierre != null) ?? null
    const revisar = conMov.filter(r => r.cuadraInterno === false || cuadraPortada(r) === false).length
    return { c, meses: conMov.length, ing, egr, saldo: ult?.cierre ?? null, ultimoDia: [...conMov].reverse()[0]?.ultimoDia ?? null, revisar }
  }), [cuentasActivas, resumen, meses, movs, enPeriodo, clases, conSegmento, segmento])

  const hayDatos = movs.some(m => mesDe(m.fecha) >= mesesAnio[0])
  const mesActual = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtros */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Campo label="Año">
          <select className="select" value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {[hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Campo>
        <Campo label="Desde">
          <select className="select" value={desde} onChange={e => { const v = Number(e.target.value); setDesde(v); if (hasta < v) setHasta(v) }}>
            {MESES_CORTO.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Campo>
        <Campo label="Hasta">
          <select className="select" value={hasta} onChange={e => { const v = Number(e.target.value); setHasta(v); if (desde > v) setDesde(v) }}>
            {MESES_CORTO.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Campo>
        <Campo label="Cuenta">
          <select className="select" value={idCuenta} onChange={e => setIdCuenta(e.target.value)} style={{ minWidth: 190 }}>
            <option value="">Consolidado (todas)</option>
            {cuentasActivas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
          </select>
        </Campo>
        <Campo label="Segmento">
          <select className="select" value={segmento} onChange={e => setSegmento(e.target.value)} style={{ minWidth: 170 }}>
            <option value="">Todos</option>
            {cat.centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            <option value={SIN_SEG}>Sin segmento</option>
          </select>
        </Campo>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: '#33363C', paddingBottom: 8 }}>
          <input type="checkbox" checked={porTipoGasto} onChange={e => setPorTipoGasto(e.target.checked)} />
          Egresos por tipo de gasto
        </label>
      </div>

      {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}
      {truncado && <Aviso color="#B5761A"><AlertTriangle size={14} /> Hay más de 60,000 movimientos en el año; el flujo puede estar incompleto.</Aviso>}
      {cargando && <div style={{ color: '#62666E', fontSize: 13 }}>Cargando movimientos…</div>}
      {!cargando && !hayDatos && (
        <Aviso color="#62666E"><Landmark size={14} /> No hay estados de cuenta cargados en {anio}. Cárgalos con «Cargar estado de cuenta».</Aviso>
      )}

      {!cargando && hayDatos && (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {!conSegmento && <div style={{ flex: '1 1 200px' }}><KpiCard label={`Saldo inicial · ${etiquetaMes(meses[0])}`} value={monto0(saldoIni)} icon={Landmark} /></div>}
            <div style={{ flex: '1 1 200px' }}>
              <KpiCard label="Entradas" value={<Desglose total={tot.entOp + tot.entOtras} op={tot.entOp} otras={tot.entOtras} />} icon={ArrowDownCircle} tone="success" />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <KpiCard label="Salidas" value={<Desglose total={tot.salOp + tot.salOtras} op={tot.salOp} otras={tot.salOtras} />} icon={ArrowUpCircle} tone="danger" />
            </div>
            {conSegmento
              ? <div style={{ flex: '1 1 200px' }}><KpiCard label="Flujo neto del segmento" value={mxn(tot.entOp + tot.entOtras - tot.salOp - tot.salOtras)} icon={Scale} /></div>
              : <div style={{ flex: '1 1 200px' }}><KpiCard label={`Saldo final · ${etiquetaMes(meses[meses.length - 1])}`} value={monto0(saldoFin)} icon={Landmark} /></div>}
          </div>
          {conSegmento && (
            <Aviso color="#62666E">Un segmento no tiene saldo bancario: su flujo es la suma de sus movimientos. Los traspasos entre cuentas propias no cuentan.</Aviso>
          )}
          {difSaldos != null && Math.abs(difSaldos) >= 1 && (
            <Aviso color="#B5761A"><AlertTriangle size={14} />
              <span>Saldo final − saldo inicial − flujo neto = <b style={{ fontVariantNumeric: 'tabular-nums' }}>{mxn(difSaldos)}</b>.
              {cuentaSel ? ' Faltan movimientos en algún mes de la cuenta (revisa el control de carga).'
                : ' En el consolidado suele ser un traspaso a una cuenta sin estados cargados, o meses que faltan por cargar.'}</span>
            </Aviso>
          )}

          {/* Estado de flujo de efectivo */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <Encabezado titulo="Estado de flujo de efectivo"
              nota="Saldo inicial + ingresos − egresos ± otros movimientos = saldo final. Los egresos van en positivo. Haz clic en una cifra para ver sus movimientos." />
            <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead><tr>
                  <th style={{ ...th, position: 'sticky', left: 0, top: 0, zIndex: 3, minWidth: 260 }}>Concepto</th>
                  {meses.map(m => <th key={m} style={{ ...th, textAlign: 'right', position: 'sticky', top: 0, zIndex: 2 }}>{etiquetaMes(m)}{m === mesActual ? ' *' : ''}</th>)}
                  <th style={{ ...th, textAlign: 'right', position: 'sticky', top: 0, zIndex: 2 }}>Total</th>
                </tr></thead>
                <tbody>
                  {filas.map(f => <FilaTabla key={f.clave} f={f} meses={meses} sel={sel} onSel={setSel} />)}
                </tbody>
              </table>
            </div>
            {meses.includes(mesActual) && <div style={{ padding: '8px 14px', fontSize: 11.5, color: '#7A7E87' }}>* Mes en curso: parcial, hasta el último estado cargado.</div>}
          </div>

          {sel && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E6E8EB' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1D21' }}>
                  {sel.etiqueta} · {sel.mes ? etiquetaMes(sel.mes) : 'todo el periodo'}
                  <span style={{ fontWeight: 400, color: '#62666E', fontSize: 12.5 }}> — {detalle.length} movimientos</span>
                </div>
                <button className="btn-ghost" onClick={() => setSel(null)} title="Cerrar"><X size={14} /></button>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 420 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Fecha</th><th style={th}>Cuenta</th><th style={th}>Segmento</th><th style={th}>Tipo de gasto</th>
                    <th style={th}>Descripción</th><th style={{ ...th, textAlign: 'right' }}>Depósito</th><th style={{ ...th, textAlign: 'right' }}>Retiro</th>
                  </tr></thead>
                  <tbody>
                    {detalle.slice(0, 500).map(m => (
                      <tr key={m.id}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{m.fecha}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{nombreCuenta(cat.cuentas.find(c => c.id === m.id_cuenta_fk))}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{nombreCC(m.id_centro_costo_fk)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.id_tipo_gasto_fk ? nombreTG(m.id_tipo_gasto_fk) : '—'}</td>
                        <td style={{ ...td, maxWidth: 460 }}>{m.descripcion}</td>
                        <td style={{ ...td, ...num, color: '#1F7A50' }}>{m.abono ? mxn(m.abono) : ''}</td>
                        <td style={{ ...td, ...num, color: '#C23B3B' }}>{m.cargo ? mxn(m.cargo) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detalle.length > 500 && <div style={{ padding: '8px 14px', fontSize: 11.5, color: '#7A7E87' }}>Se muestran los primeros 500; acota con un mes o usa la pestaña Movimientos bancarios.</div>}
            </div>
          )}

          {/* Por segmento y por cuenta */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <Encabezado titulo="Por segmento" nota="Operación del periodo por segmento (el de cada movimiento). Clic para filtrar." />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Segmento</th><th style={{ ...th, textAlign: 'right' }}>Ingresos op.</th>
                    <th style={{ ...th, textAlign: 'right' }}>Egresos op.</th><th style={{ ...th, textAlign: 'right' }}>Flujo op.</th>
                    <th style={{ ...th, textAlign: 'right' }}>Interco. / otros</th>
                  </tr></thead>
                  <tbody>
                    {porSegmento.map(s => {
                      const activo = segmento === s.k
                      return (
                        <tr key={s.k} onClick={() => setSegmento(activo ? '' : s.k)} style={{ cursor: 'pointer', background: activo ? '#E6E8EB' : undefined }}>
                          <td style={{ ...td, fontWeight: 600 }}>{nombreCC(s.id)}</td>
                          <td style={{ ...td, ...num }}>{celdaNum(s.entOp)}</td>
                          <td style={{ ...td, ...num }}>{celdaNum(s.salOp)}</td>
                          <td style={{ ...td, ...num, color: s.entOp - s.salOp < 0 ? '#C23B3B' : '#1C1D21' }}>{celdaNum(s.entOp - s.salOp)}</td>
                          <td style={{ ...td, ...num, fontWeight: 400 }}>{celdaNum(s.interco + s.otros)}</td>
                        </tr>
                      )
                    })}
                    {!porSegmento.length && <tr><td style={{ ...td, color: '#62666E' }} colSpan={5}>Sin movimientos en el periodo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <Encabezado titulo="Por cuenta" nota="Operación del periodo y último saldo de cada cuenta. Clic para ver solo esa cuenta." />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Cuenta</th><th style={th}>Segmento</th><th style={{ ...th, textAlign: 'right' }}>Flujo op.</th>
                    <th style={{ ...th, textAlign: 'right' }}>Saldo último corte</th><th style={th}>Cuadre</th>
                  </tr></thead>
                  <tbody>
                    {porCuenta.map(r => {
                      const activo = cuentaSel === r.c.id
                      return (
                        <tr key={r.c.id} onClick={() => setIdCuenta(activo ? '' : String(r.c.id))} style={{ cursor: 'pointer', background: activo ? '#E6E8EB' : undefined }}>
                          <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{nombreCuenta(r.c)}</td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.c.id_centro_costo_fk ? nombreCC(r.c.id_centro_costo_fk) : '—'}</td>
                          <td style={{ ...td, ...num, color: r.ing - r.egr < 0 ? '#C23B3B' : '#1C1D21' }}>{r.meses ? mxn(r.ing - r.egr) : '—'}</td>
                          <td style={{ ...td, ...num }}>
                            {monto0(r.saldo)}
                            {r.ultimoDia && <div style={{ fontWeight: 400, fontSize: 11, color: '#7A7E87' }}>al {r.ultimoDia}</div>}
                          </td>
                          <td style={td}>
                            {!r.meses ? <span style={{ color: '#7A7E87' }}>Sin estados</span>
                              : r.revisar ? <Etiqueta color="#C23B3B">{r.revisar} {r.revisar === 1 ? 'mes' : 'meses'} por revisar</Etiqueta>
                              : <Etiqueta color="#1F7A50">Cuadra</Etiqueta>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Control de carga mensual */}
      {!cargando && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <Encabezado titulo={`Control de carga mensual ${anio}`}
            nota={`Cada celda es un estado de cuenta. Cuadra: los movimientos coinciden con la portada del banco; ≠: hay diferencia o faltan movimientos; Sin portada: los movimientos encadenan sus saldos pero falta capturar la portada; 0: estado en ceros; –: sin cargar.${puedeEditar ? ' Haz clic en una celda para capturar la portada.' : ''}`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <th style={th}>Cuenta</th>
                {mesesAnio.map(m => <th key={m} style={{ ...th, textAlign: 'center' }}>{MESES_CORTO[Number(m.slice(5)) - 1]}</th>)}
              </tr></thead>
              <tbody>
                {cuentasActivas.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{nombreCuenta(c)}</td>
                    {mesesAnio.map(m => {
                      const r = resumen.find(x => x.id_cuenta_fk === c.id && x.mes === m)!
                      return (
                        <td key={m} style={{ ...td, textAlign: 'center', cursor: puedeEditar && m <= mesActual ? 'pointer' : 'default' }}
                          onClick={() => { if (puedeEditar && m <= mesActual) setEditPortada(r) }}
                          title={tituloCelda(r)}>
                          <CeldaControl r={r} enCurso={m === mesActual} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editPortada && (
        <ModalPortada r={editPortada} cuenta={nombreCuenta(cat.cuentas.find(c => c.id === editPortada.id_cuenta_fk))}
          usuario={usuario} puedeBorrar={puedeBorrar}
          onClose={() => setEditPortada(null)} onGuardado={() => { setEditPortada(null); cargar() }} />
      )}
    </div>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: '#7A7E87', fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

function Encabezado({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #E6E8EB' }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1D21' }}>{titulo}</div>
      <div style={{ fontSize: 12, color: '#62666E', marginTop: 2 }}>{nota}</div>
    </div>
  )
}

function Desglose({ total, op, otras }: { total: number; op: number; otras: number }) {
  return (
    <span>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mxn(total)}</span>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: '#62666E', fontVariantNumeric: 'tabular-nums' }}>
        Operativas {mxn(op)} · otras {mxn(otras)}
      </span>
    </span>
  )
}

function FilaTabla({ f, meses, sel, onSel }: {
  f: FilaEstado; meses: string[]
  sel: { clave: string; mes: string | null } | null
  onSel: (s: { clave: string; etiqueta: string; mes: string | null } | null) => void
}) {
  const oscuro = f.nivel === 'saldo' || f.nivel === 'neto'
  const base: React.CSSProperties = {
    ...td,
    background: oscuro ? (f.nivel === 'saldo' ? '#1C1D21' : '#33363C') : f.nivel === 'total' ? '#F4F5F7' : f.nivel === 'sec' ? '#E6E8EB' : '#fff',
    color: oscuro ? '#fff' : '#1C1D21',
    fontWeight: f.nivel === 'sec' || f.nivel === 'total' || oscuro ? 700 : 400,
  }
  const colorNum = (v: number | null) => {
    if (v == null || !(f.nivel === 'neto' || f.nivel === 'otro' || f.nivel === 'total')) return undefined
    if (oscuro) return v < 0 ? '#EBB5B5' : '#FFFFFF'
    return v < 0 ? '#C23B3B' : undefined
  }
  const pulsa = (mes: string | null) => { if (f.detalle) onSel({ clave: f.clave, etiqueta: f.etiqueta, mes }) }
  const marcado = (mes: string | null) => sel && sel.clave === f.clave && sel.mes === mes
  return (
    <tr>
      <td style={{ ...base, position: 'sticky', left: 0, zIndex: 1, paddingLeft: f.nivel === 'ing' || f.nivel === 'egr' || f.nivel === 'ic' ? 24 : 10, whiteSpace: 'nowrap',
        fontSize: f.nivel === 'sec' ? 11 : 12.5, textTransform: f.nivel === 'sec' ? 'uppercase' : undefined, letterSpacing: f.nivel === 'sec' ? '.04em' : undefined }}>
        {f.etiqueta}
      </td>
      {meses.map(m => {
        const v = f.valores[m]
        return (
          <td key={m} onClick={() => pulsa(m)}
            style={{ ...base, ...num, fontWeight: base.fontWeight, color: colorNum(v) ?? base.color,
              cursor: f.detalle ? 'pointer' : 'default', outline: marcado(m) ? '2px solid #19D3C5' : undefined, outlineOffset: -2 }}>
            {f.nivel === 'sec' ? '' : celdaNum(v)}
          </td>
        )
      })}
      <td onClick={() => pulsa(null)}
        style={{ ...base, ...num, color: colorNum(f.total) ?? base.color, cursor: f.detalle ? 'pointer' : 'default',
          outline: marcado(null) ? '2px solid #19D3C5' : undefined, outlineOffset: -2 }}>
        {f.nivel === 'sec' ? '' : celdaNum(f.total)}
      </td>
    </tr>
  )
}

function tituloCelda(r: MesCuenta): string {
  const partes: string[] = []
  if (r.movimientos) partes.push(`${r.movimientos} movimientos · inicial ${monto0(r.apertura)} · depósitos ${mxn(r.abonos)} · retiros ${mxn(r.cargos)} · final ${monto0(r.cierre)}`)
  if (r.huecos) partes.push(`${r.huecos} día(s) no abren con el saldo del día anterior: faltan movimientos`)
  if (r.difPortada) {
    const d = r.difPortada
    const difs = ([['inicial', d.inicial], ['depósitos', d.depositos], ['retiros', d.retiros], ['final', d.final]] as [string, number][])
      .filter(([, v]) => Math.abs(v) >= 0.05).map(([k, v]) => `${k} ${mxn(v)}`)
    partes.push(difs.length ? `Diferencia vs portada: ${difs.join(', ')}` : 'Coincide con la portada del banco')
  }
  return partes.join('\n')
}

function CeldaControl({ r, enCurso }: { r: MesCuenta; enCurso: boolean }) {
  const chico: React.CSSProperties = { fontSize: 10.5, color: '#7A7E87', marginTop: 2 }
  if (!r.movimientos) {
    if (r.portada?.sin_movimientos) return <span style={{ color: '#62666E', fontWeight: 700 }}>0</span>
    if (r.portada) return <Etiqueta color="#B5761A">Sin movs.</Etiqueta>
    return <span style={{ color: '#C9CCD3' }}>–</span>
  }
  const pp = cuadraPortada(r)
  const contenido = pp === true && r.cuadraInterno !== false ? <Etiqueta color="#1F7A50">Cuadra</Etiqueta>
    : pp === false || r.cuadraInterno === false ? <Etiqueta color="#C23B3B">≠</Etiqueta>
    : <Etiqueta color="#62666E">Sin portada</Etiqueta>
  return <div>{contenido}{enCurso && <div style={chico}>al {r.ultimoDia?.slice(8)}</div>}</div>
}

function ModalPortada({ r, cuenta, usuario, puedeBorrar, onClose, onGuardado }: {
  r: MesCuenta; cuenta: string; usuario: string | null; puedeBorrar: boolean; onClose: () => void; onGuardado: () => void
}) {
  const p = r.portada
  const ini = (v: number | null | undefined) => v == null ? '' : String(v)
  const [f, setF] = useState({
    saldo_inicial: ini(p?.saldo_inicial), depositos: ini(p?.depositos), retiros: ini(p?.retiros), saldo_final: ini(p?.saldo_final),
    sin_movimientos: p?.sin_movimientos ?? false, notas: p?.notas ?? '',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const n = (s: string) => { const x = Number(String(s).replace(/[$,\s]/g, '')); return isFinite(x) ? x : NaN }
  const calc: Record<string, number | null> = { saldo_inicial: r.apertura, depositos: r.abonos, retiros: r.cargos, saldo_final: r.cierre }
  const campos: [keyof typeof calc, string][] = [['saldo_inicial', 'Saldo inicial'], ['depositos', 'Depósitos'], ['retiros', 'Retiros'], ['saldo_final', 'Saldo final']]

  function usarCalculado() {
    setF(v => ({ ...v, saldo_inicial: ini(r.apertura), depositos: ini(r.abonos), retiros: ini(r.cargos), saldo_final: ini(r.cierre) }))
  }
  async function guardar() {
    const vals = { saldo_inicial: n(f.saldo_inicial), depositos: n(f.depositos || '0'), retiros: n(f.retiros || '0'), saldo_final: n(f.saldo_final) }
    if (Object.values(vals).some(v => isNaN(v))) { setError('Captura los cuatro importes de la portada.'); return }
    if (Math.abs(vals.saldo_inicial + vals.depositos - vals.retiros - vals.saldo_final) >= 0.05) {
      setError(`La portada no cuadra consigo misma: ${mxn(vals.saldo_inicial)} + ${mxn(vals.depositos)} − ${mxn(vals.retiros)} ≠ ${mxn(vals.saldo_final)}.`); return
    }
    setGuardando(true); setError('')
    const { error: e } = await dbComp.from('flujo_portadas').upsert({
      id_cuenta_fk: r.id_cuenta_fk, periodo: `${r.mes}-01`, ...vals,
      sin_movimientos: f.sin_movimientos, notas: f.notas.trim() || null, created_by: usuario, updated_at: new Date().toISOString(),
    }, { onConflict: 'id_cuenta_fk,periodo' })
    setGuardando(false)
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    onGuardado()
  }
  async function borrar() {
    if (!p || !window.confirm('¿Eliminar la portada capturada de este mes? Los movimientos no se tocan.')) return
    const { error: e } = await dbComp.from('flujo_portadas').delete().eq('id', p.id)
    if (e) { setError('No se pudo eliminar: ' + e.message); return }
    onGuardado()
  }

  return (
    <ModalShell modulo="tesoreria" titulo={`Portada · ${etiquetaMes(r.mes)}`} subtitulo={cuenta} icono={FileCheck2} size="lg" onClose={onClose}
      footer={<>
        {p && puedeBorrar && <button className="btn-ghost" onClick={borrar} style={{ marginRight: 'auto', color: '#C23B3B' }}>Eliminar portada</button>}
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12.5, color: '#62666E' }}>
          Captura las cifras de la portada del estado de cuenta del banco. Se comparan contra los {r.movimientos} movimientos cargados del mes.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}></th><th style={{ ...th, textAlign: 'right' }}>Según movimientos</th><th style={th}>Según portada del banco</th><th style={{ ...th, textAlign: 'right' }}>Diferencia</th>
          </tr></thead>
          <tbody>
            {campos.map(([k, lbl]) => {
              const v = n(f[k as 'saldo_inicial'])
              const c = calc[k]
              const dif = f[k as 'saldo_inicial'] !== '' && !isNaN(v) && c != null ? c - v : null
              return (
                <tr key={k}>
                  <td style={{ ...td, fontWeight: 600 }}>{lbl}</td>
                  <td style={{ ...td, ...num }}>{r.movimientos ? monto0(c) : '—'}</td>
                  <td style={td}>
                    <input className="input" inputMode="decimal" value={f[k as 'saldo_inicial']} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} />
                  </td>
                  <td style={{ ...td, ...num, color: dif != null && Math.abs(dif) >= 0.05 ? '#C23B3B' : '#1F7A50' }}>
                    {dif == null || !r.movimientos ? '' : Math.abs(dif) < 0.05 ? 'Cuadra' : mxn(dif)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {r.movimientos > 0 && <button className="btn-ghost" onClick={usarCalculado}>Copiar cifras de los movimientos</button>}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
            <input type="checkbox" checked={f.sin_movimientos} onChange={e => setF(x => ({ ...x, sin_movimientos: e.target.checked }))} />
            Estado en ceros (la cuenta no tuvo movimientos)
          </label>
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: '#7A7E87', fontWeight: 700, marginBottom: 5 }}>Notas</div>
          <input className="input" value={f.notas} onChange={e => setF(x => ({ ...x, notas: e.target.value }))} style={{ width: '100%' }} />
        </div>
        {r.huecos > 0 && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {r.huecos} día(s) del mes no abren con el saldo del día anterior: faltan movimientos por cargar.</Aviso>}
        {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}
      </div>
    </ModalShell>
  )
}
