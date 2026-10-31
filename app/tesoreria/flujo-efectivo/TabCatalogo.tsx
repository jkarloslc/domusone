'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { Concepto, Regla, Layout, aplanarArbol, rutaConcepto } from '@/lib/flujoEfectivo'
import { inputStyle, lbl, th, td } from './ui'

type Cuenta = { id: number; banco: string; numero_cuenta?: string | null; alias?: string | null }
const nombreCuenta = (c: Cuenta) => [c.banco, c.alias ?? c.numero_cuenta].filter(Boolean).join(' · ')

const SUBS = [
  { id: 'conceptos', label: 'Conceptos de flujo' },
  { id: 'reglas',    label: 'Reglas de clasificación' },
  { id: 'layouts',   label: 'Layouts de estado de cuenta' },
] as const

export default function TabCatalogo() {
  const [sub, setSub] = useState<typeof SUBS[number]['id']>('conceptos')
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [reglas, setReglas] = useState<Regla[]>([])
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ tipo: typeof SUBS[number]['id']; row: any | null } | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [c, r, l, cu] = await Promise.all([
      dbComp.from('flujo_conceptos').select('*').order('orden'),
      dbComp.from('flujo_reglas').select('*').order('prioridad'),
      dbComp.from('flujo_layouts').select('*').order('nombre'),
      dbCfg.from('cuentas_bancarias').select('*').order('banco'),
    ])
    if (c.error) alert('Error al cargar conceptos: ' + c.error.message)
    setConceptos((c.data ?? []) as Concepto[])
    setReglas((r.data ?? []) as Regla[])
    setLayouts((l.data ?? []) as Layout[])
    setCuentas((cu.data ?? []) as Cuenta[])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const porId = useMemo(() => new Map(conceptos.map(c => [c.id, c])), [conceptos])
  const arbol = useMemo(() => aplanarArbol(conceptos), [conceptos])
  const cuentaNombre = (id: number | null) => { const c = cuentas.find(x => x.id === id); return c ? nombreCuenta(c) : 'Todas' }

  async function eliminar(tabla: string, id: number, aviso: string) {
    if (!confirm(aviso)) return
    const { error } = await dbComp.from(tabla).delete().eq('id', id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    cargar()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {SUBS.map(s => (
          <button key={s.id} onClick={() => setSub(s.id)} className={sub === s.id ? 'btn-primary' : 'btn-secondary'}>{s.label}</button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-primary" onClick={() => setModal({ tipo: sub, row: null })}><Plus size={14} /> Nuevo</button>
        </div>
      </div>

      {loading ? <div className="card" style={{ padding: 24 }}>Cargando…</div> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          {sub === 'conceptos' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Concepto</th><th style={th}>Ingreso</th><th style={th}>Egreso</th><th style={th}>Activo</th><th style={th}>Acciones</th></tr></thead>
              <tbody>
                {arbol.map(c => (
                  <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                    <td style={{ ...td, paddingLeft: 10 + c.nivel * 22, fontWeight: c.nivel === 0 ? 700 : 400 }}>{c.nombre}</td>
                    <td style={td}>{c.es_ingreso ? 'Sí' : '—'}</td>
                    <td style={td}>{c.es_egreso ? 'Sí' : '—'}</td>
                    <td style={td}>{c.activo ? 'Sí' : 'No'}</td>
                    <td style={td}>
                      <button className="btn-ghost" title="Editar" onClick={() => setModal({ tipo: 'conceptos', row: c })}><Edit2 size={14} /></button>
                      <button className="btn-ghost" title="Eliminar" onClick={() => eliminar('flujo_conceptos', c.id, `¿Eliminar el concepto "${c.nombre}"? Si tiene hijos, reglas o movimientos asociados no se podrá; desactívalo en su lugar.`)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'reglas' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Prior.</th><th style={th}>Regla</th><th style={th}>Descripción contiene</th><th style={th}>Tipo</th><th style={th}>Cuenta</th><th style={th}>Concepto</th><th style={th}>Activa</th><th style={th}>Acciones</th></tr></thead>
              <tbody>
                {reglas.length === 0 && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={8}>Sin reglas. Crea una para clasificar los movimientos bancarios automáticamente.</td></tr>}
                {reglas.map(r => (
                  <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.5 }}>
                    <td style={td}>{r.prioridad}</td>
                    <td style={td}>{r.nombre}</td>
                    <td style={td}><code>{r.patron}</code></td>
                    <td style={td}>{r.tipo_mov ?? 'Ambos'}</td>
                    <td style={td}>{cuentaNombre(r.id_cuenta_fk)}</td>
                    <td style={td}>{rutaConcepto(r.id_concepto_fk, porId)}</td>
                    <td style={td}>{r.activo ? 'Sí' : 'No'}</td>
                    <td style={td}>
                      <button className="btn-ghost" title="Editar" onClick={() => setModal({ tipo: 'reglas', row: r })}><Edit2 size={14} /></button>
                      <button className="btn-ghost" title="Eliminar" onClick={() => eliminar('flujo_reglas', r.id, `¿Eliminar la regla "${r.nombre}"?`)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'layouts' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Layout</th><th style={th}>Cuenta</th><th style={th}>Fila inicio</th><th style={th}>Columnas (A=1)</th><th style={th}>Fecha</th><th style={th}>Acciones</th></tr></thead>
              <tbody>
                {layouts.length === 0 && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={6}>Sin layouts. Define uno por banco para poder importar estados de cuenta.</td></tr>}
                {layouts.map(l => (
                  <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.5 }}>
                    <td style={td}>{l.nombre}</td>
                    <td style={td}>{cuentaNombre(l.id_cuenta_fk)}</td>
                    <td style={td}>{l.fila_inicio}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      fecha {l.col_fecha}, desc {l.col_descripcion}
                      {l.col_monto ? `, monto ${l.col_monto}` : `, cargo ${l.col_cargo ?? '—'}, abono ${l.col_abono ?? '—'}`}
                      {l.col_saldo ? `, saldo ${l.col_saldo}` : ''}
                    </td>
                    <td style={td}>{l.formato_fecha}</td>
                    <td style={td}>
                      <button className="btn-ghost" title="Editar" onClick={() => setModal({ tipo: 'layouts', row: l })}><Edit2 size={14} /></button>
                      <button className="btn-ghost" title="Eliminar" onClick={() => eliminar('flujo_layouts', l.id, `¿Eliminar el layout "${l.nombre}"?`)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modal?.tipo === 'conceptos' && <ModalConcepto row={modal.row} arbol={arbol} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
      {modal?.tipo === 'reglas' && <ModalRegla row={modal.row} arbol={arbol} cuentas={cuentas} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
      {modal?.tipo === 'layouts' && <ModalLayout row={modal.row} cuentas={cuentas} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
    </div>
  )
}

// ── Modales ───────────────────────────────────────────────────
function Pie({ onClose, onGuardar, guardando }: { onClose: () => void; onGuardar: () => void; guardando: boolean }) {
  return <>
    <button className="btn-ghost" onClick={onClose}>Cancelar</button>
    <button className="btn-primary" onClick={onGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
  </>
}
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s))

function ModalConcepto({ row, arbol, onClose, onSaved }: { row: Concepto | null; arbol: (Concepto & { nivel: number })[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nombre: row?.nombre ?? '', id_padre_fk: row?.id_padre_fk ? String(row.id_padre_fk) : '',
    es_ingreso: row?.es_ingreso ?? true, es_egreso: row?.es_egreso ?? true, orden: String(row?.orden ?? 0), activo: row?.activo ?? true,
  })
  const [guardando, setGuardando] = useState(false)
  // un concepto no puede colgar de sí mismo ni de sus descendientes
  const descendientes = useMemo(() => {
    const s = new Set<number>()
    if (!row) return s
    s.add(row.id)
    let cambio = true
    while (cambio) { cambio = false; arbol.forEach(c => { if (c.id_padre_fk && s.has(c.id_padre_fk) && !s.has(c.id)) { s.add(c.id); cambio = true } }) }
    return s
  }, [row, arbol])

  async function guardar() {
    if (!f.nombre.trim()) { alert('El nombre es obligatorio'); return }
    setGuardando(true)
    const payload = {
      nombre: f.nombre.trim(), id_padre_fk: f.id_padre_fk ? Number(f.id_padre_fk) : null,
      es_ingreso: f.es_ingreso, es_egreso: f.es_egreso, orden: Number(f.orden) || 0, activo: f.activo,
    }
    const { error } = row ? await dbComp.from('flujo_conceptos').update(payload).eq('id', row.id) : await dbComp.from('flujo_conceptos').insert(payload)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    onSaved()
  }
  return (
    <ModalShell modulo="tesoreria" titulo={row ? 'Editar concepto de flujo' : 'Nuevo concepto de flujo'} onClose={onClose} footer={<Pie onClose={onClose} onGuardar={guardar} guardando={guardando} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={lbl}>Nombre</label><input style={inputStyle} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label style={lbl}>Concepto padre</label>
          <select style={inputStyle} value={f.id_padre_fk} onChange={e => setF({ ...f, id_padre_fk: e.target.value })}>
            <option value="">— Raíz —</option>
            {arbol.filter(c => !descendientes.has(c.id)).map(c => <option key={c.id} value={c.id}>{'  '.repeat(c.nivel)}{c.nombre}</option>)}
          </select></div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <label><input type="checkbox" checked={f.es_ingreso} onChange={e => setF({ ...f, es_ingreso: e.target.checked })} /> Es ingreso</label>
          <label><input type="checkbox" checked={f.es_egreso} onChange={e => setF({ ...f, es_egreso: e.target.checked })} /> Es egreso</label>
          <label><input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} /> Activo</label>
        </div>
        <div style={{ maxWidth: 140 }}><label style={lbl}>Orden</label><input style={inputStyle} type="number" value={f.orden} onChange={e => setF({ ...f, orden: e.target.value })} /></div>
      </div>
    </ModalShell>
  )
}

function ModalRegla({ row, arbol, cuentas, onClose, onSaved }: { row: Regla | null; arbol: (Concepto & { nivel: number })[]; cuentas: Cuenta[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nombre: row?.nombre ?? '', patron: row?.patron ?? '', tipo_mov: row?.tipo_mov ?? '',
    id_cuenta_fk: row?.id_cuenta_fk ? String(row.id_cuenta_fk) : '', monto_min: row?.monto_min != null ? String(row.monto_min) : '',
    monto_max: row?.monto_max != null ? String(row.monto_max) : '', id_concepto_fk: row ? String(row.id_concepto_fk) : '',
    prioridad: String(row?.prioridad ?? 100), activo: row?.activo ?? true,
  })
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    if (!f.nombre.trim() || !f.patron.trim()) { alert('Nombre y texto a buscar son obligatorios'); return }
    if (!f.id_concepto_fk) { alert('Elige el concepto destino'); return }
    setGuardando(true)
    const payload = {
      nombre: f.nombre.trim(), patron: f.patron.trim(), tipo_mov: f.tipo_mov || null,
      id_cuenta_fk: f.id_cuenta_fk ? Number(f.id_cuenta_fk) : null,
      monto_min: numOrNull(f.monto_min), monto_max: numOrNull(f.monto_max),
      id_concepto_fk: Number(f.id_concepto_fk), prioridad: Number(f.prioridad) || 100, activo: f.activo,
    }
    const { error } = row ? await dbComp.from('flujo_reglas').update(payload).eq('id', row.id) : await dbComp.from('flujo_reglas').insert(payload)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    onSaved()
  }
  return (
    <ModalShell modulo="tesoreria" titulo={row ? 'Editar regla' : 'Nueva regla de clasificación'} onClose={onClose} footer={<Pie onClose={onClose} onGuardar={guardar} guardando={guardando} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={lbl}>Nombre</label><input style={inputStyle} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label style={lbl}>Si la descripción contiene</label><input style={inputStyle} value={f.patron} placeholder="Ej. SAT, IMSS, CFE (sin importar mayúsculas ni acentos)" onChange={e => setF({ ...f, patron: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Tipo de movimiento</label>
            <select style={inputStyle} value={f.tipo_mov} onChange={e => setF({ ...f, tipo_mov: e.target.value as any })}>
              <option value="">Cargo y abono</option><option value="Cargo">Solo cargos (egreso)</option><option value="Abono">Solo abonos (ingreso)</option>
            </select></div>
          <div><label style={lbl}>Cuenta</label>
            <select style={inputStyle} value={f.id_cuenta_fk} onChange={e => setF({ ...f, id_cuenta_fk: e.target.value })}>
              <option value="">Todas</option>{cuentas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
            </select></div>
          <div><label style={lbl}>Monto mínimo (opcional)</label><input style={inputStyle} type="number" value={f.monto_min} onChange={e => setF({ ...f, monto_min: e.target.value })} /></div>
          <div><label style={lbl}>Monto máximo (opcional)</label><input style={inputStyle} type="number" value={f.monto_max} onChange={e => setF({ ...f, monto_max: e.target.value })} /></div>
        </div>
        <div><label style={lbl}>Concepto destino</label>
          <select style={inputStyle} value={f.id_concepto_fk} onChange={e => setF({ ...f, id_concepto_fk: e.target.value })}>
            <option value="">— Elegir —</option>
            {arbol.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{'  '.repeat(c.nivel)}{c.nombre}</option>)}
          </select></div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
          <div style={{ maxWidth: 140 }}><label style={lbl}>Prioridad (menor primero)</label><input style={inputStyle} type="number" value={f.prioridad} onChange={e => setF({ ...f, prioridad: e.target.value })} /></div>
          <label><input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} /> Activa</label>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalLayout({ row, cuentas, onClose, onSaved }: { row: Layout | null; cuentas: Cuenta[]; onClose: () => void; onSaved: () => void }) {
  const s = (v: number | null | undefined) => (v ? String(v) : '')
  const [f, setF] = useState({
    nombre: row?.nombre ?? '', id_cuenta_fk: s(row?.id_cuenta_fk), fila_inicio: String(row?.fila_inicio ?? 2),
    col_fecha: s(row?.col_fecha), col_descripcion: s(row?.col_descripcion), col_referencia: s(row?.col_referencia),
    modo: row?.col_monto ? 'monto' : 'cargo_abono', col_cargo: s(row?.col_cargo), col_abono: s(row?.col_abono),
    col_monto: s(row?.col_monto), col_saldo: s(row?.col_saldo), formato_fecha: row?.formato_fecha ?? 'DD/MM/YYYY', activo: row?.activo ?? true,
  })
  const [guardando, setGuardando] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const col = (k: keyof typeof f, etiqueta: string) => (
    <div><label style={lbl}>{etiqueta}</label><input style={inputStyle} type="number" min={1} value={f[k] as string} onChange={set(k)} /></div>
  )
  async function guardar() {
    if (!f.nombre.trim() || !f.col_fecha || !f.col_descripcion) { alert('Nombre, columna de fecha y de descripción son obligatorios'); return }
    if (f.modo === 'monto' ? !f.col_monto : (!f.col_cargo && !f.col_abono)) { alert('Indica la(s) columna(s) de importe'); return }
    setGuardando(true)
    const n = (v: string) => (v ? Number(v) : null)
    const payload = {
      nombre: f.nombre.trim(), id_cuenta_fk: n(f.id_cuenta_fk), fila_inicio: Number(f.fila_inicio) || 1,
      col_fecha: Number(f.col_fecha), col_descripcion: Number(f.col_descripcion), col_referencia: n(f.col_referencia),
      col_cargo: f.modo === 'cargo_abono' ? n(f.col_cargo) : null, col_abono: f.modo === 'cargo_abono' ? n(f.col_abono) : null,
      col_monto: f.modo === 'monto' ? n(f.col_monto) : null, col_saldo: n(f.col_saldo),
      formato_fecha: f.formato_fecha, activo: f.activo,
    }
    const { error } = row ? await dbComp.from('flujo_layouts').update(payload).eq('id', row.id) : await dbComp.from('flujo_layouts').insert(payload)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    onSaved()
  }
  return (
    <ModalShell modulo="tesoreria" titulo={row ? 'Editar layout' : 'Nuevo layout de estado de cuenta'} onClose={onClose} footer={<Pie onClose={onClose} onGuardar={guardar} guardando={guardando} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Nombre</label><input style={inputStyle} value={f.nombre} placeholder="Ej. BBVA Excel" onChange={set('nombre')} /></div>
          <div><label style={lbl}>Cuenta por defecto</label>
            <select style={inputStyle} value={f.id_cuenta_fk} onChange={set('id_cuenta_fk')}>
              <option value="">Ninguna</option>{cuentas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
            </select></div>
        </div>
        <p style={{ fontSize: 11.5, color: '#7a8aa3', margin: 0 }}>Las columnas se numeran desde 1 (A=1, B=2, …) y la fila de inicio es la primera con datos (sin encabezados).</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {col('fila_inicio', 'Fila de inicio')}
          {col('col_fecha', 'Col. fecha')}
          {col('col_descripcion', 'Col. descripción')}
          {col('col_referencia', 'Col. referencia (opc.)')}
          {col('col_saldo', 'Col. saldo (opc.)')}
          <div><label style={lbl}>Formato de fecha</label>
            <select style={inputStyle} value={f.formato_fecha} onChange={set('formato_fecha')}>
              <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
            </select></div>
        </div>
        <div><label style={lbl}>Importes</label>
          <select style={inputStyle} value={f.modo} onChange={set('modo')}>
            <option value="cargo_abono">Columnas separadas de cargo y abono</option>
            <option value="monto">Una columna con signo (negativo = cargo)</option>
          </select></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {f.modo === 'monto' ? col('col_monto', 'Col. monto') : <>{col('col_cargo', 'Col. cargo')}{col('col_abono', 'Col. abono')}</>}
        </div>
        <label><input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} /> Activo</label>
      </div>
    </ModalShell>
  )
}
