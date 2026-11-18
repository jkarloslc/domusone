'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Wand2, ArrowDownCircle, ArrowUpCircle, Scale, HelpCircle, AlertTriangle, X } from 'lucide-react'
import KpiCard from '@/components/ui/KpiCard'
import Paginador from '@/components/ui/Paginador'
import { dbComp } from '@/lib/supabase'
import { Regla, arbolConceptos, clasificar, mxn, nombreCuenta, normalizar } from '@/lib/flujoBanco'
import { Aviso, CatalogosBanco, ORIGEN_LABEL, leerTodo, num, selChico, td, th } from './comun'
import { ModalRegla } from './TabReglas'

type Mov = {
  id: number; id_cuenta_fk: number; fecha: string; descripcion: string; referencia: string | null
  cargo: number; abono: number; saldo: number | null
  id_concepto_fk: number | null; id_regla_fk: number | null; clasificado_por: 'regla' | 'manual' | null
  id_centro_costo_fk: number | null; origen_segmento: 'cuenta' | 'regla' | 'manual' | null
  id_tipo_gasto_fk: number | null; origen_tipo_gasto: 'regla' | 'manual' | null
}
type Campo = 'concepto' | 'segmento' | 'tipo_gasto'

const hoy = () => new Date().toISOString().slice(0, 10)
const inicioMes = (mesesAtras: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - mesesAtras); return d.toISOString().slice(0, 10) }

/** Patch de un campo capturado a mano. */
function patchManual(campo: Campo, valor: number | null) {
  if (campo === 'concepto') return { id_concepto_fk: valor, clasificado_por: valor ? 'manual' : null, id_regla_fk: null }
  if (campo === 'segmento') return { id_centro_costo_fk: valor, origen_segmento: valor ? 'manual' : null }
  return { id_tipo_gasto_fk: valor, origen_tipo_gasto: valor ? 'manual' : null }
}

export default function TabMovimientos({ cat, puedeEditar, recarga }: { cat: CatalogosBanco; puedeEditar: boolean; recarga: number }) {
  const { cuentas, conceptos, centros, tiposGasto, reglas } = cat
  const [movs, setMovs] = useState<Mov[]>([])
  const [cargando, setCargando] = useState(true)
  const [truncado, setTruncado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [fCuenta, setFCuenta] = useState('')
  const [desde, setDesde] = useState(inicioMes(2))
  const [hasta, setHasta] = useState(hoy())
  const [fSegmento, setFSegmento] = useState('')
  const [fConcepto, setFConcepto] = useState('')      // 'g:<id>' grupo · '<id>' categoría · 'sin'
  const [fTipo, setFTipo] = useState('')               // Abono | Cargo
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [reglaDesde, setReglaDesde] = useState<Partial<Regla> | null>(null)
  const [aplicando, setAplicando] = useState(false)

  const arbol = useMemo(() => arbolConceptos(conceptos), [conceptos])
  const excluidos = useMemo(() => new Set(conceptos.filter(c => c.excluir_consolidado).map(c => c.id)), [conceptos])

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const r = await leerTodo<Mov>((a, b) => {
      let q = dbComp.from('flujo_mov_banco').select('id, id_cuenta_fk, fecha, descripcion, referencia, cargo, abono, saldo, id_concepto_fk, id_regla_fk, clasificado_por, id_centro_costo_fk, origen_segmento, id_tipo_gasto_fk, origen_tipo_gasto')
        .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).order('id', { ascending: false })
      if (fCuenta) q = q.eq('id_cuenta_fk', Number(fCuenta))
      return q.range(a, b)
    })
    if (r.error) setError('Error al cargar movimientos: ' + r.error)
    setMovs(r.rows.map(m => ({ ...m, cargo: Number(m.cargo), abono: Number(m.abono), saldo: m.saldo == null ? null : Number(m.saldo) })))
    setTruncado(r.truncado)
    setSel(new Set())
    setCargando(false)
  }, [desde, hasta, fCuenta])
  useEffect(() => { cargar() }, [cargar, recarga])
  useEffect(() => { setPage(0) }, [fSegmento, fConcepto, fTipo, busca, desde, hasta, fCuenta])

  const visibles = useMemo(() => {
    const b = normalizar(busca)
    const grupo = fConcepto.startsWith('g:') ? Number(fConcepto.slice(2)) : null
    const hijosGrupo = grupo ? new Set(conceptos.filter(c => c.id_padre_fk === grupo).map(c => c.id)) : null
    return movs.filter(m =>
      (!fSegmento || (fSegmento === 'sin' ? !m.id_centro_costo_fk : m.id_centro_costo_fk === Number(fSegmento)))
      && (!fConcepto || (fConcepto === 'sin' ? !m.id_concepto_fk : hijosGrupo ? hijosGrupo.has(m.id_concepto_fk ?? -1) : m.id_concepto_fk === Number(fConcepto)))
      && (!fTipo || (fTipo === 'Cargo' ? m.cargo > 0 : m.abono > 0))
      && (!b || normalizar(m.descripcion + ' ' + (m.referencia ?? '')).includes(b)))
  }, [movs, fSegmento, fConcepto, fTipo, busca, conceptos])

  // Totales: sin traspasos entre cuentas propias cuando se ven todas las cuentas
  const tot = useMemo(() => {
    const cuenta = (m: Mov) => fCuenta !== '' || !m.id_concepto_fk || !excluidos.has(m.id_concepto_fk)
    const base = visibles.filter(cuenta)
    const ent = base.reduce((a, m) => a + m.abono, 0), sal = base.reduce((a, m) => a + m.cargo, 0)
    return { ent, sal, neto: ent - sal, sin: visibles.filter(m => !m.id_concepto_fk).length, traspasos: visibles.length - base.length }
  }, [visibles, excluidos, fCuenta])

  const pagina = visibles.slice(page * pageSize, (page + 1) * pageSize)

  async function guardarCampo(ids: number[], campo: Campo, valor: number | null) {
    const patch = patchManual(campo, valor)
    for (let i = 0; i < ids.length; i += 200) {
      const { error: e } = await dbComp.from('flujo_mov_banco').update(patch).in('id', ids.slice(i, i + 200))
      if (e) { setError('No se pudo guardar: ' + e.message); return false }
    }
    const set = new Set(ids)
    setMovs(prev => prev.map(m => set.has(m.id) ? { ...m, ...patch } as Mov : m))
    return true
  }

  /** Vuelve a pasar las reglas por los movimientos cargados; no toca lo capturado a mano. */
  async function reaplicarReglas() {
    setAplicando(true); setError(''); setAviso('')
    const grupos = new Map<string, { patch: Record<string, unknown>; ids: number[] }>()
    for (const m of visibles) {
      const c = clasificar(m, reglas, cuentas)
      const patch: Record<string, unknown> = {}
      if (m.clasificado_por !== 'manual' && (m.id_concepto_fk !== c.id_concepto_fk || m.id_regla_fk !== c.id_regla_fk)) {
        patch.id_concepto_fk = c.id_concepto_fk; patch.id_regla_fk = c.id_regla_fk; patch.clasificado_por = c.clasificado_por
      }
      if (m.origen_segmento !== 'manual' && (m.id_centro_costo_fk !== c.id_centro_costo_fk || m.origen_segmento !== c.origen_segmento)) {
        patch.id_centro_costo_fk = c.id_centro_costo_fk; patch.origen_segmento = c.origen_segmento
      }
      if (m.origen_tipo_gasto !== 'manual' && (m.id_tipo_gasto_fk !== c.id_tipo_gasto_fk || m.origen_tipo_gasto !== c.origen_tipo_gasto)) {
        patch.id_tipo_gasto_fk = c.id_tipo_gasto_fk; patch.origen_tipo_gasto = c.origen_tipo_gasto
      }
      if (!Object.keys(patch).length) continue
      const k = JSON.stringify(patch)
      const g = grupos.get(k) ?? { patch, ids: [] }
      g.ids.push(m.id); grupos.set(k, g)
    }
    let n = 0
    for (const g of Array.from(grupos.values())) {
      for (let i = 0; i < g.ids.length; i += 200) {
        const { error: e } = await dbComp.from('flujo_mov_banco').update(g.patch).in('id', g.ids.slice(i, i + 200))
        if (e) { setError('Error al reclasificar: ' + e.message); setAplicando(false); cargar(); return }
        n += Math.min(200, g.ids.length - i)
      }
    }
    setAplicando(false)
    setAviso(n ? `${n} movimientos reclasificados con las reglas vigentes.` : 'Las reglas no cambian nada en los movimientos mostrados.')
    if (n) cargar()
  }

  function nuevaReglaDesde(m: Mov) {
    const palabras = normalizar(m.descripcion.split('|')[0]).split(' ').slice(0, 4).join(' ')
    setReglaDesde({
      patron: palabras, tipo_mov: m.cargo > 0 ? 'Cargo' : 'Abono', prioridad: 50, activo: true,
      id_concepto_fk: m.id_concepto_fk, id_centro_costo_fk: m.origen_segmento === 'manual' ? m.id_centro_costo_fk : null,
      id_tipo_gasto_fk: m.id_tipo_gasto_fk,
    })
  }

  const todosPagina = pagina.length > 0 && pagina.every(m => sel.has(m.id))
  const opcionesConcepto = (
    <>{arbol.map(g => <optgroup key={g.grupo.id} label={g.grupo.nombre}>{g.hijos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</optgroup>)}</>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
        <div><label className="label">Cuenta</label>
          <select className="select" value={fCuenta} onChange={e => setFCuenta(e.target.value)}>
            <option value="">Todas</option>{cuentas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
          </select></div>
        <div><label className="label">Desde</label><input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
        <div><label className="label">Hasta</label><input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
        <div><label className="label">Segmento</label>
          <select className="select" value={fSegmento} onChange={e => setFSegmento(e.target.value)}>
            <option value="">Todos</option><option value="sin">Sin segmento</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></div>
        <div><label className="label">Concepto</label>
          <select className="select" value={fConcepto} onChange={e => setFConcepto(e.target.value)}>
            <option value="">Todos</option><option value="sin">Sin concepto</option>
            {arbol.map(g => <optgroup key={g.grupo.id} label={g.grupo.nombre}>
              <option value={'g:' + g.grupo.id}>Todo {g.grupo.nombre}</option>
              {g.hijos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </optgroup>)}
          </select></div>
        <div><label className="label">Tipo</label>
          <select className="select" value={fTipo} onChange={e => setFTipo(e.target.value)}>
            <option value="">Depósitos y retiros</option><option value="Abono">Depósitos</option><option value="Cargo">Retiros</option>
          </select></div>
        <div style={{ gridColumn: 'span 2', position: 'relative' }}><label className="label">Buscar</label>
          <Search size={13} style={{ position: 'absolute', left: 10, bottom: 11, color: '#9A9EA7' }} />
          <input className="input" style={{ paddingLeft: 28 }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Descripción o referencia" /></div>
        {puedeEditar && <button className="btn-secondary" onClick={reaplicarReglas} disabled={aplicando || cargando || !visibles.length}>
          <Wand2 size={14} /> {aplicando ? 'Aplicando…' : 'Reaplicar reglas'}</button>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: '1 1 180px' }}><KpiCard label="Depósitos" value={mxn(tot.ent)} icon={ArrowDownCircle} tone="success" /></div>
        <div style={{ flex: '1 1 180px' }}><KpiCard label="Retiros" value={mxn(tot.sal)} icon={ArrowUpCircle} tone="danger" /></div>
        <div style={{ flex: '1 1 180px' }}><KpiCard label="Neto" value={mxn(tot.neto)} icon={Scale} /></div>
        <div style={{ flex: '1 1 180px' }}><KpiCard label="Sin concepto" value={tot.sin.toLocaleString('es-MX')} icon={HelpCircle} tone={tot.sin ? 'warning' : 'success'}
          onClick={() => setFConcepto('sin')} /></div>
      </div>
      {tot.traspasos > 0 && fCuenta === '' && (
        <div style={{ fontSize: 12, color: '#62666E', marginTop: -6 }}>
          Los totales no incluyen {tot.traspasos} traspasos entre cuentas propias; filtra una cuenta para verlos sumados.
        </div>
      )}
      {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}
      {aviso && <Aviso color="#1F7A50">{aviso}</Aviso>}
      {truncado && <Aviso color="#B5761A"><AlertTriangle size={14} /> Se cargaron los primeros 20,000 movimientos; acota las fechas.</Aviso>}

      {puedeEditar && sel.size > 0 && (
        <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#F4F5F7' }}>
          <b style={{ fontSize: 13 }}>{sel.size} seleccionados</b>
          <select className="select" style={selChico} value="" onChange={async e => { if (e.target.value === '') return; await guardarCampo(Array.from(sel), 'concepto', e.target.value === 'x' ? null : Number(e.target.value)) }}>
            <option value="">Asignar concepto…</option><option value="x">(quitar)</option>{opcionesConcepto}
          </select>
          <select className="select" style={selChico} value="" onChange={async e => { if (e.target.value === '') return; await guardarCampo(Array.from(sel), 'segmento', e.target.value === 'x' ? null : Number(e.target.value)) }}>
            <option value="">Asignar segmento…</option><option value="x">(quitar)</option>{centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="select" style={selChico} value="" onChange={async e => { if (e.target.value === '') return; await guardarCampo(Array.from(sel), 'tipo_gasto', e.target.value === 'x' ? null : Number(e.target.value)) }}>
            <option value="">Asignar tipo de gasto…</option><option value="x">(quitar)</option>{tiposGasto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button className="btn-ghost" onClick={() => setSel(new Set())}><X size={14} /> Quitar selección</button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {puedeEditar && <th style={{ ...th, width: 28 }}>
                <input type="checkbox" checked={todosPagina} onChange={e => setSel(prev => {
                  const n = new Set(prev); pagina.forEach(m => e.target.checked ? n.add(m.id) : n.delete(m.id)); return n
                })} aria-label="Seleccionar la página" /></th>}
              <th style={th}>Fecha</th><th style={th}>Cuenta</th><th style={th}>Descripción</th>
              <th style={{ ...th, textAlign: 'right' }}>Depósito</th><th style={{ ...th, textAlign: 'right' }}>Retiro</th>
              <th style={th}>Concepto</th><th style={th}>Segmento</th><th style={th}>Tipo de gasto</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {cargando && <tr><td style={td} colSpan={10}>Cargando…</td></tr>}
              {!cargando && visibles.length === 0 && (
                <tr><td style={{ ...td, color: '#62666E' }} colSpan={10}>Sin movimientos en el filtro. Usa «Cargar estado de cuenta» para subir el Excel del banco.</td></tr>
              )}
              {!cargando && pagina.map(m => (
                <tr key={m.id} style={{ background: sel.has(m.id) ? '#E6E8EB' : undefined }}>
                  {puedeEditar && <td style={td}><input type="checkbox" checked={sel.has(m.id)} onChange={e => setSel(prev => {
                    const n = new Set(prev); e.target.checked ? n.add(m.id) : n.delete(m.id); return n
                  })} /></td>}
                  <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{m.fecha}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12 }}>{nombreCuenta(cuentas.find(c => c.id === m.id_cuenta_fk))}</td>
                  <td style={{ ...td, minWidth: 260, maxWidth: 440 }}>
                    {m.descripcion}{m.referencia && <span style={{ color: '#7A7E87', fontSize: 11 }}> · {m.referencia}</span>}
                  </td>
                  <td style={{ ...td, ...num, color: '#1F7A50' }}>{m.abono ? mxn(m.abono) : ''}</td>
                  <td style={{ ...td, ...num, color: '#C23B3B' }}>{m.cargo ? mxn(m.cargo) : ''}</td>
                  <td style={td}>
                    <select className="select" style={{ ...selChico, borderColor: m.id_concepto_fk ? undefined : '#B5761A' }} disabled={!puedeEditar}
                      value={m.id_concepto_fk ?? ''} onChange={e => guardarCampo([m.id], 'concepto', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Sin concepto</option>{opcionesConcepto}
                    </select>
                    <Origen o={m.clasificado_por} />
                  </td>
                  <td style={td}>
                    <select className="select" style={{ ...selChico, minWidth: 130 }} disabled={!puedeEditar}
                      value={m.id_centro_costo_fk ?? ''} onChange={e => guardarCampo([m.id], 'segmento', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Sin segmento</option>{centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <Origen o={m.origen_segmento} />
                  </td>
                  <td style={td}>
                    <select className="select" style={selChico} disabled={!puedeEditar}
                      value={m.id_tipo_gasto_fk ?? ''} onChange={e => guardarCampo([m.id], 'tipo_gasto', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">—</option>{tiposGasto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <Origen o={m.origen_tipo_gasto} />
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {puedeEditar && <button className="btn-ghost" title="Crear regla con este movimiento" onClick={() => nuevaReglaDesde(m)}><Wand2 size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginador page={page} pageSize={pageSize} totalItems={visibles.length} onChange={setPage}
          onPageSizeChange={n => { setPageSize(n); setPage(0) }} pageSizeOptions={[50, 100, 200]} />
      </div>

      {reglaDesde && (
        <ModalRegla cat={cat} inicial={reglaDesde} muestra={movs} onClose={() => setReglaDesde(null)}
          onGuardado={async () => { setReglaDesde(null); await cat.recargar(); setAviso('Regla guardada. Usa «Reaplicar reglas» para aplicarla a los movimientos mostrados.') }} />
      )}
    </div>
  )
}

function Origen({ o }: { o: string | null }) {
  if (!o) return null
  return <div style={{ fontSize: 10.5, color: o === 'manual' ? '#1C1D21' : '#7A7E87', marginTop: 2, fontWeight: o === 'manual' ? 600 : 400 }}>{ORIGEN_LABEL[o] ?? o}</div>
}
