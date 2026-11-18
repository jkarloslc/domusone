'use client'
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { dbComp } from '@/lib/supabase'
import {
  MovParseado, claveBanco, clasificar, cuadra, cuentaDelArchivo, huellas, mxn, nombreCuenta, parsearFilas, rutaConcepto, saldosDelArchivo,
} from '@/lib/flujoBanco'
import { Aviso, CatalogosBanco, leerTodo, num, td, th } from './comun'

type Props = { cat: CatalogosBanco; usuario: string | null; onClose: () => void; onCargado: () => void }

export default function ModalCarga({ cat, usuario, onClose, onCargado }: Props) {
  const { cuentas, layouts, reglas, conceptos, centros, tiposGasto } = cat
  const [idCuenta, setIdCuenta] = useState('')
  const [idLayout, setIdLayout] = useState('')
  const [archivo, setArchivo] = useState<{ nombre: string; libro: XLSX.WorkBook } | null>(null)
  const [saldoIni, setSaldoIni] = useState('')
  const [saldoFin, setSaldoFin] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const layoutsActivos = layouts.filter(l => l.activo)
  const cuenta = cuentas.find(c => c.id === Number(idCuenta)) ?? null
  const layout = layoutsActivos.find(l => l.id === Number(idLayout)) ?? null

  function elegirCuenta(v: string) {
    setIdCuenta(v)
    const c = cuentas.find(x => x.id === Number(v))
    if (!c) return
    const propio = layoutsActivos.find(l => l.id_cuenta_fk === c.id)
      ?? layoutsActivos.find(l => !l.id_cuenta_fk && l.banco && claveBanco(l.banco) === claveBanco(c.banco))
    if (propio) setIdLayout(String(propio.id))
  }

  async function leerArchivo(file: File) {
    setError('')
    try {
      const buf = await file.arrayBuffer()
      const libro = XLSX.read(buf, { type: 'array', cellDates: true, codepage: 65001 })
      setArchivo({ nombre: file.name, libro })
      if (!idCuenta) {
        const hoja = libro.Sheets[libro.SheetNames[0]]
        const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: null })
        const c = cuentaDelArchivo(file.name, filas, cuentas)
        if (c) elegirCuenta(String(c.id))
      }
    } catch (e: unknown) {
      setError('No se pudo leer el archivo: ' + (e instanceof Error ? e.message : String(e))); setArchivo(null)
    }
  }

  const parseo = useMemo(() => {
    if (!layout || !archivo) return null
    const nombreHoja = layout.hoja && archivo.libro.SheetNames.includes(layout.hoja) ? layout.hoja : archivo.libro.SheetNames[0]
    const filas = XLSX.utils.sheet_to_json<unknown[]>(archivo.libro.Sheets[nombreHoja], { header: 1, raw: true, defval: null })
    return { ...parsearFilas(filas, layout), hoja: nombreHoja }
  }, [layout, archivo])

  const resumen = useMemo(() => {
    if (!parseo || !cuenta) return null
    const movs = parseo.movs
    const abonos = movs.reduce((a, m) => a + m.abono, 0)
    const cargos = movs.reduce((a, m) => a + m.cargo, 0)
    const fechas = movs.map(m => m.fecha).sort()
    const clas = movs.map(m => clasificar({ id_cuenta_fk: cuenta.id, ...m }, reglas, cuentas))
    const sinConcepto = clas.filter(c => !c.id_concepto_fk).length
    const delArchivo = saldosDelArchivo(movs)
    return { movs, clas, abonos, cargos, desde: fechas[0], hasta: fechas[fechas.length - 1], sinConcepto, delArchivo }
  }, [parseo, cuenta, reglas, cuentas])

  // Saldos del banco: lo capturado manda; si no, lo que dice la columna de saldo
  const sIni = aMonto(saldoIni) ?? resumen?.delArchivo.inicial ?? null
  const sFin = aMonto(saldoFin) ?? resumen?.delArchivo.final ?? null
  const okCuadre = resumen ? cuadra(sIni, sFin, resumen.abonos, resumen.cargos) : null

  async function guardar() {
    if (!cuenta || !layout || !resumen || !archivo) return
    if (resumen.movs.length === 0) { setError('El layout no produjo movimientos; revisa columnas y fila de inicio.'); return }
    setGuardando(true); setError('')
    const hs = huellas(cuenta.id, resumen.movs)

    // Huellas ya cargadas en el rango (para contar duplicados antes de insertar)
    const prev = await leerTodo<{ huella: string }>((a, b) => dbComp.from('flujo_mov_banco').select('huella')
      .eq('id_cuenta_fk', cuenta.id).gte('fecha', resumen.desde).lte('fecha', resumen.hasta).range(a, b))
    if (prev.error) { setError('Error al revisar duplicados: ' + prev.error); setGuardando(false); return }
    const existentes = new Set(prev.rows.map(r => r.huella))
    const nuevos = resumen.movs.map((m, i) => ({ m, i })).filter(x => !existentes.has(hs[x.i]))

    const { data: carga, error: eCarga } = await dbComp.from('flujo_cargas').insert({
      id_cuenta_fk: cuenta.id, id_layout_fk: layout.id, archivo: archivo.nombre.slice(0, 200),
      fecha_desde: resumen.desde, fecha_hasta: resumen.hasta,
      saldo_inicial: sIni, saldo_final: sFin,
      total_abonos: Math.round(resumen.abonos * 100) / 100, total_cargos: Math.round(resumen.cargos * 100) / 100,
      movimientos: resumen.movs.length, nuevos: nuevos.length, duplicados: resumen.movs.length - nuevos.length,
      cuadra: okCuadre, created_by: usuario,
    }).select('id').single()
    if (eCarga || !carga) { setError('No se pudo registrar la carga: ' + (eCarga?.message ?? '')); setGuardando(false); return }

    const filas = nuevos.map(({ m, i }: { m: MovParseado; i: number }) => ({
      id_cuenta_fk: cuenta.id, fecha: m.fecha, descripcion: m.descripcion, referencia: m.referencia,
      cargo: m.cargo, abono: m.abono, saldo: m.saldo, huella: hs[i],
      id_layout_fk: layout.id, id_carga_fk: (carga as { id: number }).id, created_by: usuario,
      ...resumen.clas[i],
    }))
    for (let i = 0; i < filas.length; i += 500) {
      const { error: e } = await dbComp.from('flujo_mov_banco')
        .upsert(filas.slice(i, i + 500), { onConflict: 'id_cuenta_fk,huella', ignoreDuplicates: true })
      if (e) {
        // Se deshace la carga completa para no dejar un archivo a medias
        await dbComp.from('flujo_cargas').delete().eq('id', (carga as { id: number }).id)
        setError('Error al guardar movimientos (no se guardó nada): ' + e.message); setGuardando(false); return
      }
    }
    setGuardando(false)
    onCargado()
  }

  const nombreCC = (id: number | null) => centros.find(c => c.id === id)?.nombre ?? '—'
  const nombreTG = (id: number | null) => tiposGasto.find(c => c.id === id)?.nombre ?? ''

  return (
    <ModalShell modulo="tesoreria" titulo="Cargar estado de cuenta" icono={Upload} size="xxl" onClose={onClose}
      subtitulo="Excel o CSV del banco · los movimientos ya cargados se omiten"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={guardar}
          disabled={guardando || !resumen || resumen.movs.length === 0}>
          {guardando ? 'Guardando…' : `Guardar${resumen ? ` ${resumen.movs.length} movimientos` : ''}`}
        </button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {layoutsActivos.length === 0 && (
          <Aviso color="#B5761A"><AlertTriangle size={14} /> No hay layouts activos. Da de alta el del banco en la pestaña «Reglas y layouts».</Aviso>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div><label className="label">Cuenta bancaria</label>
            <select className="select" value={idCuenta} onChange={e => elegirCuenta(e.target.value)}>
              <option value="">— Elegir —</option>
              {cuentas.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
            </select></div>
          <div><label className="label">Layout</label>
            <select className="select" value={idLayout} onChange={e => setIdLayout(e.target.value)}>
              <option value="">— Elegir —</option>
              {layoutsActivos.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select></div>
          <div><label className="label">Archivo</label>
            <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])} /></div>
        </div>

        {resumen && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <div><label className="label">Saldo inicial (banco)</label>
                <input className="input" inputMode="decimal" value={saldoIni} onChange={e => setSaldoIni(e.target.value)}
                  placeholder={resumen.delArchivo.inicial != null ? mxn(resumen.delArchivo.inicial) + ' (del archivo)' : 'Portada del estado'} /></div>
              <div><label className="label">Saldo final (banco)</label>
                <input className="input" inputMode="decimal" value={saldoFin} onChange={e => setSaldoFin(e.target.value)}
                  placeholder={resumen.delArchivo.final != null ? mxn(resumen.delArchivo.final) + ' (del archivo)' : 'Portada del estado'} /></div>
              <Dato label="Depósitos leídos" valor={mxn(resumen.abonos)} />
              <Dato label="Retiros leídos" valor={mxn(resumen.cargos)} />
            </div>

            <div style={{ fontSize: 12.5, color: '#4A4D54' }}>
              {resumen.movs.length} movimientos del {resumen.desde} al {resumen.hasta} · hoja «{parseo?.hoja}»
              {parseo && parseo.omitidas > 0 && <> · {parseo.omitidas} filas sin fecha o importe omitidas</>}
              {' · '}{resumen.movs.length - resumen.sinConcepto} clasificados por reglas, {resumen.sinConcepto} sin concepto
            </div>
            {okCuadre === true && <Aviso color="#1F7A50"><CheckCircle2 size={14} /> Cuadra: saldo inicial + depósitos − retiros = saldo final.</Aviso>}
            {okCuadre === false && sIni != null && sFin != null && (
              <Aviso color="#C23B3B"><AlertTriangle size={14} />
                No cuadra por {mxn(sIni + resumen.abonos - resumen.cargos - sFin)}. Revisa que el archivo tenga el periodo completo y que el layout lea bien cargos y abonos. Se puede guardar de todos modos.
              </Aviso>
            )}
            {okCuadre === null && <Aviso color="#B5761A"><AlertTriangle size={14} /> Sin saldos para validar el cuadre: captura los de la portada del estado de cuenta.</Aviso>}

            <div style={{ overflow: 'auto', maxHeight: 340, border: '1px solid #E6E8EB', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Fecha</th><th style={th}>Descripción</th>
                  <th style={{ ...th, textAlign: 'right' }}>Abono</th><th style={{ ...th, textAlign: 'right' }}>Cargo</th>
                  <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                  <th style={th}>Concepto</th><th style={th}>Segmento</th><th style={th}>Tipo de gasto</th>
                </tr></thead>
                <tbody>
                  {resumen.movs.slice(0, 50).map((m, i) => {
                    const c = resumen.clas[i]
                    return (
                      <tr key={i}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.fecha}</td>
                        <td style={{ ...td, maxWidth: 360 }}>{m.descripcion}</td>
                        <td style={{ ...td, ...num }}>{m.abono ? mxn(m.abono) : ''}</td>
                        <td style={{ ...td, ...num }}>{m.cargo ? mxn(m.cargo) : ''}</td>
                        <td style={{ ...td, ...num, fontWeight: 400 }}>{m.saldo != null ? mxn(m.saldo) : ''}</td>
                        <td style={{ ...td, color: c.id_concepto_fk ? '#1C1D21' : '#B5761A' }}>{rutaConcepto(c.id_concepto_fk, conceptos) || 'Sin concepto'}</td>
                        <td style={td}>{nombreCC(c.id_centro_costo_fk)}</td>
                        <td style={td}>{nombreTG(c.id_tipo_gasto_fk)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {resumen.movs.length > 50 && <div style={{ fontSize: 11.5, color: '#62666E' }}>Vista previa de los primeros 50.</div>}
          </>
        )}
        {archivo && layout && resumen && resumen.movs.length === 0 && (
          <Aviso color="#C23B3B"><AlertTriangle size={14} /> El layout no leyó ningún movimiento. Revisa la fila de inicio y las columnas en «Reglas y layouts».</Aviso>
        )}
        {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}
      </div>
    </ModalShell>
  )
}

function aMonto(s: string): number | null {
  const t = s.replace(/[$,\s]/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div style={{ padding: '9px 0', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1C1D21' }}>{valor}</div>
    </div>
  )
}
