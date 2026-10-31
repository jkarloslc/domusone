'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Upload, Wand2, Search } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import {
  Concepto, Regla, Layout, MovParseado, aplanarArbol, clasificar, huellas, parsearFilas, mxn,
} from '@/lib/flujoEfectivo'
import { inputStyle, lbl, th, td, num } from './ui'

type Cuenta = { id: number; banco: string; numero_cuenta?: string | null; alias?: string | null }
type MovBanco = {
  id: number; id_cuenta_fk: number; fecha: string; descripcion: string; referencia: string | null
  cargo: number; abono: number; id_concepto_fk: number | null; clasificado_por: 'regla' | 'manual' | null
}
const nombreCuenta = (c: Cuenta) => [c.banco, c.alias ?? c.numero_cuenta].filter(Boolean).join(' · ')
const hoyISO = () => new Date().toISOString().slice(0, 10)
const haceMeses = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10) }
const LIMITE = 1000

export default function TabBanco() {
  const { authUser } = useAuth()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [reglas, setReglas] = useState<Regla[]>([])
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [movs, setMovs] = useState<MovBanco[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCuenta, setFiltroCuenta] = useState('')
  const [desde, setDesde] = useState(haceMeses(3))
  const [hasta, setHasta] = useState(hoyISO())
  const [soloSinClasificar, setSoloSinClasificar] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [modalImportar, setModalImportar] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => {
    Promise.all([
      dbCfg.from('cuentas_bancarias').select('*').order('banco'),
      dbComp.from('flujo_conceptos').select('*').eq('activo', true).order('orden'),
      dbComp.from('flujo_reglas').select('*').eq('activo', true).order('prioridad'),
      dbComp.from('flujo_layouts').select('*').eq('activo', true).order('nombre'),
    ]).then(([cu, c, r, l]) => {
      setCuentas((cu.data ?? []) as Cuenta[]); setConceptos((c.data ?? []) as Concepto[])
      setReglas((r.data ?? []) as Regla[]); setLayouts((l.data ?? []) as Layout[])
    })
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('flujo_mov_banco').select('*').gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(LIMITE)
    if (filtroCuenta) q = q.eq('id_cuenta_fk', Number(filtroCuenta))
    if (soloSinClasificar) q = q.is('id_concepto_fk', null)
    const { data, error } = await q
    if (error) alert('Error al cargar movimientos: ' + error.message)
    setMovs((data ?? []) as MovBanco[])
    setLoading(false)
  }, [desde, hasta, filtroCuenta, soloSinClasificar])
  useEffect(() => { cargar() }, [cargar])

  const arbol = useMemo(() => aplanarArbol(conceptos), [conceptos])
  const visibles = useMemo(() => {
    const b = busqueda.trim().toLowerCase()
    return b ? movs.filter(m => m.descripcion.toLowerCase().includes(b) || (m.referencia ?? '').toLowerCase().includes(b)) : movs
  }, [movs, busqueda])
  const totCargos = visibles.reduce((a, m) => a + Number(m.cargo), 0)
  const totAbonos = visibles.reduce((a, m) => a + Number(m.abono), 0)
  const sinClasificar = movs.filter(m => !m.id_concepto_fk).length

  async function cambiarConcepto(m: MovBanco, valor: string) {
    const id = valor ? Number(valor) : null
    const { error } = await dbComp.from('flujo_mov_banco')
      .update({ id_concepto_fk: id, clasificado_por: id ? 'manual' : null, id_regla_fk: null }).eq('id', m.id)
    if (error) { alert('No se pudo clasificar: ' + error.message); return }
    setMovs(prev => prev.map(x => x.id === m.id ? { ...x, id_concepto_fk: id, clasificado_por: id ? 'manual' : null } : x))
  }

  // Clasifica con reglas todos los movimientos sin concepto (los manuales nunca se tocan)
  async function aplicarReglas() {
    if (reglas.length === 0) { alert('No hay reglas activas. Créalas en "Conceptos, reglas y layouts".'); return }
    setAplicando(true)
    const pendientes: MovBanco[] = []
    for (let desdeIdx = 0; ; desdeIdx += 1000) {
      const { data, error } = await dbComp.from('flujo_mov_banco').select('*').is('id_concepto_fk', null)
        .order('id').range(desdeIdx, desdeIdx + 999)
      if (error) { alert('Error: ' + error.message); setAplicando(false); return }
      pendientes.push(...((data ?? []) as MovBanco[]))
      if ((data ?? []).length < 1000) break
    }
    const porRegla = new Map<number, number[]>()
    pendientes.forEach(m => {
      const r = clasificar({ ...m, cargo: Number(m.cargo), abono: Number(m.abono) }, reglas)
      if (r) porRegla.set(r.id, [...(porRegla.get(r.id) ?? []), m.id])
    })
    let n = 0
    for (const [idRegla, ids] of Array.from(porRegla.entries())) {
      const regla = reglas.find(r => r.id === idRegla)!
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200)
        const { error } = await dbComp.from('flujo_mov_banco')
          .update({ id_concepto_fk: regla.id_concepto_fk, id_regla_fk: regla.id, clasificado_por: 'regla' }).in('id', lote)
        if (error) { alert('Error al clasificar: ' + error.message); setAplicando(false); cargar(); return }
        n += lote.length
      }
    }
    setAplicando(false)
    alert(`${n} de ${pendientes.length} movimientos sin clasificar quedaron clasificados por reglas.`)
    cargar()
  }

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200 }}><label style={lbl}>Cuenta</label>
          <select style={inputStyle} value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)}>
            <option value="">Todas</option>{cuentas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
          </select></div>
        <div><label style={lbl}>Desde</label><input type="date" style={inputStyle} value={desde} onChange={e => setDesde(e.target.value)} /></div>
        <div><label style={lbl}>Hasta</label><input type="date" style={inputStyle} value={hasta} onChange={e => setHasta(e.target.value)} /></div>
        <div style={{ minWidth: 180 }}><label style={lbl}>Buscar</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: '#94a3b8' }} />
            <input style={{ ...inputStyle, paddingLeft: 28 }} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Descripción o referencia" />
          </div></div>
        <label style={{ fontSize: 13, paddingBottom: 8 }}><input type="checkbox" checked={soloSinClasificar} onChange={e => setSoloSinClasificar(e.target.checked)} /> Solo sin clasificar</label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={aplicarReglas} disabled={aplicando}><Wand2 size={14} /> {aplicando ? 'Aplicando…' : 'Aplicar reglas'}</button>
          <button className="btn-primary" onClick={() => setModalImportar(true)}><Upload size={14} /> Importar estado de cuenta</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, marginBottom: 10, fontSize: 13, flexWrap: 'wrap' }}>
        <span>Abonos: <strong style={{ color: '#15803d' }}>{mxn(totAbonos)}</strong></span>
        <span>Cargos: <strong style={{ color: '#dc2626' }}>{mxn(totCargos)}</strong></span>
        <span>Neto: <strong>{mxn(totAbonos - totCargos)}</strong></span>
        <span>Sin clasificar: <strong style={{ color: sinClasificar ? '#d97706' : '#15803d' }}>{sinClasificar}</strong></span>
        {movs.length >= LIMITE && <span style={{ color: '#d97706' }}>Se muestran los {LIMITE} más recientes; acota las fechas para ver el resto.</span>}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Fecha</th><th style={th}>Cuenta</th><th style={th}>Descripción</th>
            <th style={{ ...th, textAlign: 'right' }}>Cargo</th><th style={{ ...th, textAlign: 'right' }}>Abono</th>
            <th style={th}>Concepto de flujo</th><th style={th}>Origen</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td style={td} colSpan={7}>Cargando…</td></tr>}
            {!loading && visibles.length === 0 && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={7}>Sin movimientos en el rango. Importa un estado de cuenta con un layout configurado.</td></tr>}
            {visibles.map(m => (
              <tr key={m.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.fecha}</td>
                <td style={{ ...td, fontSize: 12 }}>{nombreCuenta(cuentas.find(c => c.id === m.id_cuenta_fk) ?? { id: 0, banco: String(m.id_cuenta_fk) })}</td>
                <td style={td}>{m.descripcion}{m.referencia && <span style={{ color: '#94a3b8', fontSize: 11 }}> · {m.referencia}</span>}</td>
                <td style={{ ...td, ...num, color: '#dc2626' }}>{Number(m.cargo) ? mxn(Number(m.cargo)) : ''}</td>
                <td style={{ ...td, ...num, color: '#15803d' }}>{Number(m.abono) ? mxn(Number(m.abono)) : ''}</td>
                <td style={{ ...td, minWidth: 220 }}>
                  <select style={{ ...inputStyle, padding: '4px 8px', background: m.id_concepto_fk ? '#fff' : '#fffbeb' }}
                    value={m.id_concepto_fk ?? ''} onChange={e => cambiarConcepto(m, e.target.value)}>
                    <option value="">Sin clasificar</option>
                    {arbol.filter(c => Number(m.cargo) > 0 ? c.es_egreso : c.es_ingreso).map(c =>
                      <option key={c.id} value={c.id}>{'  '.repeat(c.nivel)}{c.nombre}</option>)}
                  </select>
                </td>
                <td style={{ ...td, fontSize: 11, color: '#64748b' }}>{m.clasificado_por === 'regla' ? 'Regla' : m.clasificado_por === 'manual' ? 'Manual' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalImportar && (
        <ModalImportar cuentas={cuentas} layouts={layouts} reglas={reglas} usuario={authUser?.nombre ?? null}
          onClose={() => setModalImportar(false)} onImportado={() => { setModalImportar(false); cargar() }} />
      )}
    </div>
  )
}

function ModalImportar({ cuentas, layouts, reglas, usuario, onClose, onImportado }: {
  cuentas: Cuenta[]; layouts: Layout[]; reglas: Regla[]; usuario: string | null; onClose: () => void; onImportado: () => void
}) {
  const [idLayout, setIdLayout] = useState('')
  const [idCuenta, setIdCuenta] = useState('')
  const [archivo, setArchivo] = useState<{ nombre: string; filas: any[][] } | null>(null)
  const [error, setError] = useState('')
  const [importando, setImportando] = useState(false)

  const layout = layouts.find(l => l.id === Number(idLayout)) ?? null
  const parseo = useMemo(() => (layout && archivo ? parsearFilas(archivo.filas, layout) : null), [layout, archivo])

  function elegirLayout(v: string) {
    setIdLayout(v)
    const l = layouts.find(x => x.id === Number(v))
    if (l?.id_cuenta_fk) setIdCuenta(String(l.id_cuenta_fk))
  }

  async function leerArchivo(file: File) {
    setError('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, codepage: 65001 })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null })
      setArchivo({ nombre: file.name, filas })
    } catch (e: any) { setError('No se pudo leer el archivo: ' + (e?.message ?? e)); setArchivo(null) }
  }

  async function importar() {
    if (!layout || !parseo || !idCuenta) return
    if (parseo.movs.length === 0) { setError('El layout no produjo movimientos; revisa columnas y fila de inicio.'); return }
    setImportando(true); setError('')
    const cuentaId = Number(idCuenta)
    const hs = huellas(cuentaId, parseo.movs)
    const lote = `${new Date().toISOString().slice(0, 16)} ${archivo!.nombre}`.slice(0, 120)
    const rows = parseo.movs.map((m: MovParseado, i) => {
      const r = clasificar({ id_cuenta_fk: cuentaId, descripcion: m.descripcion, cargo: m.cargo, abono: m.abono }, reglas)
      return {
        id_cuenta_fk: cuentaId, fecha: m.fecha, descripcion: m.descripcion, referencia: m.referencia,
        cargo: m.cargo, abono: m.abono, saldo: m.saldo,
        id_concepto_fk: r?.id_concepto_fk ?? null, id_regla_fk: r?.id ?? null, clasificado_por: r ? 'regla' : null,
        id_layout_fk: layout.id, lote, huella: hs[i], created_by: usuario,
      }
    })
    let insertados = 0
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error: err } = await dbComp.from('flujo_mov_banco')
        .upsert(rows.slice(i, i + 500), { onConflict: 'id_cuenta_fk,huella', ignoreDuplicates: true }).select('id')
      if (err) { setError('Error al importar: ' + err.message + (insertados ? ` (ya se habían importado ${insertados})` : '')); setImportando(false); return }
      insertados += (data ?? []).length
    }
    setImportando(false)
    const dup = rows.length - insertados
    alert(`Importación terminada: ${insertados} movimientos nuevos${dup ? `, ${dup} ya existían (omitidos)` : ''}${parseo.omitidas ? `, ${parseo.omitidas} filas sin fecha/importe omitidas` : ''}.`)
    onImportado()
  }

  const sumCargos = parseo?.movs.reduce((a, m) => a + m.cargo, 0) ?? 0
  const sumAbonos = parseo?.movs.reduce((a, m) => a + m.abono, 0) ?? 0

  return (
    <ModalShell modulo="tesoreria" titulo="Importar estado de cuenta" onClose={onClose} maxWidth={760}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={importar} disabled={importando || !parseo || parseo.movs.length === 0 || !idCuenta}>
          {importando ? 'Importando…' : `Importar${parseo ? ` ${parseo.movs.length} movimientos` : ''}`}
        </button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {layouts.length === 0 && <div style={{ color: '#b23a48', fontSize: 13 }}>No hay layouts activos. Define uno en "Conceptos, reglas y layouts".</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Layout</label>
            <select style={inputStyle} value={idLayout} onChange={e => elegirLayout(e.target.value)}>
              <option value="">— Elegir —</option>{layouts.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select></div>
          <div><label style={lbl}>Cuenta bancaria</label>
            <select style={inputStyle} value={idCuenta} onChange={e => setIdCuenta(e.target.value)}>
              <option value="">— Elegir —</option>{cuentas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
            </select></div>
        </div>
        <div><label style={lbl}>Archivo (CSV o Excel)</label>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])} /></div>

        {parseo && (
          <div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              {parseo.movs.length} movimientos leídos · Abonos <strong style={{ color: '#15803d' }}>{mxn(sumAbonos)}</strong> · Cargos <strong style={{ color: '#dc2626' }}>{mxn(sumCargos)}</strong>
              {parseo.omitidas > 0 && <span style={{ color: '#d97706' }}> · {parseo.omitidas} filas omitidas (sin fecha o importe)</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Fecha</th><th style={th}>Descripción</th><th style={{ ...th, textAlign: 'right' }}>Cargo</th><th style={{ ...th, textAlign: 'right' }}>Abono</th></tr></thead>
              <tbody>
                {parseo.movs.slice(0, 5).map((m, i) => (
                  <tr key={i}><td style={td}>{m.fecha}</td><td style={td}>{m.descripcion}</td>
                    <td style={{ ...td, ...num }}>{m.cargo ? mxn(m.cargo) : ''}</td><td style={{ ...td, ...num }}>{m.abono ? mxn(m.abono) : ''}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: '#7a8aa3', marginTop: 6 }}>Vista previa de las primeras 5 filas. Los movimientos ya importados antes (misma cuenta, fecha, descripción e importe) se omiten.</p>
          </div>
        )}
        {error && <div style={{ color: '#b23a48', fontSize: 12.5 }}>{error}</div>}
      </div>
    </ModalShell>
  )
}
