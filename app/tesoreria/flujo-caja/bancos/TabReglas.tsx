'use client'
import { useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, Wand2, FileSpreadsheet, AlertTriangle } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { dbComp } from '@/lib/supabase'
import { Layout, Regla, arbolConceptos, mxn, nombreCuenta, normalizar, rutaConcepto } from '@/lib/flujoBanco'
import { Aviso, CatalogosBanco, Etiqueta, td, th } from './comun'

type Props = { cat: CatalogosBanco; puedeEditar: boolean; puedeBorrar: boolean }

export default function TabReglas({ cat, puedeEditar, puedeBorrar }: Props) {
  const { reglas, layouts, conceptos, centros, tiposGasto, cuentas, recargar } = cat
  const [editRegla, setEditRegla] = useState<Partial<Regla> | null>(null)
  const [editLayout, setEditLayout] = useState<Partial<Layout> | null>(null)
  const [busca, setBusca] = useState('')
  const [error, setError] = useState('')

  const visibles = useMemo(() => {
    const b = normalizar(busca)
    return b ? reglas.filter(r => normalizar(r.nombre + ' ' + r.patron + ' ' + (r.nota ?? '')).includes(b)) : reglas
  }, [reglas, busca])

  async function borrarRegla(r: Regla) {
    if (!window.confirm(`¿Eliminar la regla «${r.nombre}»? Los movimientos ya clasificados conservan su clasificación.`)) return
    const { error: e } = await dbComp.from('flujo_reglas').delete().eq('id', r.id)
    if (e) { setError('No se pudo eliminar: ' + e.message); return }
    recargar()
  }
  async function alternar(r: Regla) {
    const { error: e } = await dbComp.from('flujo_reglas').update({ activo: !r.activo }).eq('id', r.id)
    if (e) { setError('No se pudo actualizar: ' + e.message); return }
    recargar()
  }
  async function borrarLayout(l: Layout) {
    if (!window.confirm(`¿Eliminar el layout «${l.nombre}»?`)) return
    const { error: e } = await dbComp.from('flujo_layouts').delete().eq('id', l.id)
    if (e) { setError('No se pudo eliminar: ' + e.message); return }
    recargar()
  }

  const destino = (r: Regla) => [
    r.id_concepto_fk ? rutaConcepto(r.id_concepto_fk, conceptos) : null,
    r.id_centro_costo_fk ? 'Segmento: ' + (centros.find(c => c.id === r.id_centro_costo_fk)?.nombre ?? r.id_centro_costo_fk) : null,
    r.id_tipo_gasto_fk ? 'Tipo de gasto: ' + (tiposGasto.find(c => c.id === r.id_tipo_gasto_fk)?.nombre ?? r.id_tipo_gasto_fk) : null,
  ].filter(Boolean).join(' · ')
  const condicion = (r: Regla) => [
    `contiene «${r.patron}»`,
    r.tipo_mov === 'Cargo' ? 'retiro' : r.tipo_mov === 'Abono' ? 'depósito' : null,
    r.id_cuenta_fk ? nombreCuenta(cuentas.find(c => c.id === r.id_cuenta_fk)) : null,
    r.monto_min != null && r.monto_min === r.monto_max ? `monto ${mxn(r.monto_min)}`
      : [r.monto_min != null ? `desde ${mxn(r.monto_min)}` : null, r.monto_max != null ? `hasta ${mxn(r.monto_max)}` : null].filter(Boolean).join(' '),
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexWrap: 'wrap' }}>
          <FileSpreadsheet size={16} color="#62666E" />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Layouts de Excel</div>
          <div style={{ fontSize: 12, color: '#62666E' }}>Qué columna del archivo del banco es cada dato (A = 1)</div>
          {puedeEditar && <button className="btn-secondary" style={{ marginLeft: 'auto' }}
            onClick={() => setEditLayout({ fila_inicio: 2, formato_fecha: 'DD/MM/YYYY', activo: true })}><Plus size={14} /> Nuevo layout</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Nombre</th><th style={th}>Banco / cuenta</th><th style={th}>Fila inicio</th>
              <th style={th}>Columnas</th><th style={th}>Fecha</th><th style={th}>Estado</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {layouts.length === 0 && <tr><td style={{ ...td, color: '#62666E' }} colSpan={7}>Sin layouts. Da de alta uno por banco con un archivo de ejemplo.</td></tr>}
              {layouts.map(l => (
                <tr key={l.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{l.nombre}</td>
                  <td style={td}>{[l.banco, l.id_cuenta_fk ? nombreCuenta(cuentas.find(c => c.id === l.id_cuenta_fk)) : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={td}>{l.fila_inicio}</td>
                  <td style={{ ...td, fontSize: 12 }}>
                    Fecha {l.col_fecha} · Desc. {l.col_descripcion}
                    {l.col_referencia ? ` · Ref. ${l.col_referencia}` : ''}
                    {l.col_monto ? ` · Monto ±${l.col_monto}` : ` · Abono ${l.col_abono ?? '—'} · Cargo ${l.col_cargo ?? '—'}`}
                    {l.col_saldo ? ` · Saldo ${l.col_saldo}` : ''}
                  </td>
                  <td style={td}>{l.formato_fecha}</td>
                  <td style={td}>{l.activo ? <Etiqueta color="#1F7A50">Activo</Etiqueta> : <Etiqueta color="#62666E">Inactivo</Etiqueta>}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn-ghost" title="Editar" onClick={() => setEditLayout(l)}><Edit2 size={14} /></button>}
                    {puedeBorrar && <button className="btn-ghost" title="Eliminar" onClick={() => borrarLayout(l)}><Trash2 size={14} color="#C23B3B" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexWrap: 'wrap' }}>
          <Wand2 size={16} color="#62666E" />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Reglas de clasificación</div>
          <div style={{ fontSize: 12, color: '#62666E' }}>Se revisan por prioridad; cada campo lo pone la primera regla que lo trae. Lo capturado a mano no se toca.</div>
          <input className="input" style={{ maxWidth: 220, marginLeft: 'auto' }} placeholder="Buscar regla" value={busca} onChange={e => setBusca(e.target.value)} />
          {puedeEditar && <button className="btn-secondary" onClick={() => setEditRegla({ prioridad: 500, activo: true })}><Plus size={14} /> Nueva regla</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'right' }}>Prior.</th><th style={th}>Regla</th><th style={th}>Condición</th>
              <th style={th}>Asigna</th><th style={th}>Estado</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {visibles.map(r => (
                <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.55 }}>
                  <td style={{ ...td, fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{r.prioridad}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.nombre}{r.nota && r.nota !== r.nombre && <div style={{ fontWeight: 400, fontSize: 11.5, color: '#62666E' }}>{r.nota}</div>}</td>
                  <td style={{ ...td, fontSize: 12 }}>{condicion(r)}</td>
                  <td style={{ ...td, fontSize: 12 }}>{destino(r)}</td>
                  <td style={td}>
                    <button className="btn-ghost" style={{ padding: 0 }} disabled={!puedeEditar} onClick={() => alternar(r)} title="Activar / pausar">
                      {r.activo ? <Etiqueta color="#1F7A50">Activa</Etiqueta> : <Etiqueta color="#62666E">Pausada</Etiqueta>}
                    </button>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn-ghost" title="Editar" onClick={() => setEditRegla(r)}><Edit2 size={14} /></button>}
                    {puedeBorrar && <button className="btn-ghost" title="Eliminar" onClick={() => borrarRegla(r)}><Trash2 size={14} color="#C23B3B" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editRegla && <ModalRegla cat={cat} inicial={editRegla} onClose={() => setEditRegla(null)} onGuardado={() => { setEditRegla(null); recargar() }} />}
      {editLayout && <ModalLayout cat={cat} inicial={editLayout} onClose={() => setEditLayout(null)} onGuardado={() => { setEditLayout(null); recargar() }} />}
    </div>
  )
}

// ── Modal de regla (también se abre desde un movimiento) ──────
export function ModalRegla({ cat, inicial, muestra, onClose, onGuardado }: {
  cat: CatalogosBanco; inicial: Partial<Regla>
  /** Movimientos para contar cuántos tocaría la regla */
  muestra?: { id_cuenta_fk: number; descripcion: string; cargo: number; abono: number }[]
  onClose: () => void; onGuardado: (r: Regla) => void
}) {
  const { conceptos, centros, tiposGasto, cuentas } = cat
  const [f, setF] = useState({
    nombre: inicial.nombre ?? '', patron: inicial.patron ?? '', tipo_mov: inicial.tipo_mov ?? '',
    id_cuenta_fk: inicial.id_cuenta_fk ? String(inicial.id_cuenta_fk) : '',
    monto_min: inicial.monto_min != null ? String(inicial.monto_min) : '', monto_max: inicial.monto_max != null ? String(inicial.monto_max) : '',
    id_concepto_fk: inicial.id_concepto_fk ? String(inicial.id_concepto_fk) : '',
    id_centro_costo_fk: inicial.id_centro_costo_fk ? String(inicial.id_centro_costo_fk) : '',
    id_tipo_gasto_fk: inicial.id_tipo_gasto_fk ? String(inicial.id_tipo_gasto_fk) : '',
    prioridad: String(inicial.prioridad ?? 500), nota: inicial.nota ?? '', activo: inicial.activo ?? true,
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF(p => ({ ...p, [k]: v }))
  const arbol = arbolConceptos(conceptos)
  const numOrNull = (s: string) => { const t = s.replace(/[$,\s]/g, ''); return t === '' || !Number.isFinite(Number(t)) ? null : Number(t) }

  const coinciden = useMemo(() => {
    if (!muestra || !normalizar(f.patron)) return null
    const p = normalizar(f.patron), cu = f.id_cuenta_fk ? Number(f.id_cuenta_fk) : null
    const mn = numOrNull(f.monto_min), mx = numOrNull(f.monto_max)
    return muestra.filter(m => {
      const tipo = m.cargo > 0 ? 'Cargo' : 'Abono', monto = m.cargo > 0 ? m.cargo : m.abono
      return (!f.tipo_mov || f.tipo_mov === tipo) && (!cu || cu === m.id_cuenta_fk)
        && (mn == null || monto >= mn - 0.005) && (mx == null || monto <= mx + 0.005) && normalizar(m.descripcion).includes(p)
    }).length
  }, [muestra, f.patron, f.tipo_mov, f.id_cuenta_fk, f.monto_min, f.monto_max])

  async function guardar() {
    if (!normalizar(f.patron)) { setError('Escribe el texto que debe contener la descripción.'); return }
    if (!f.id_concepto_fk && !f.id_centro_costo_fk && !f.id_tipo_gasto_fk) { setError('Elige al menos un concepto, segmento o tipo de gasto.'); return }
    setGuardando(true); setError('')
    const row = {
      nombre: f.nombre.trim() || f.patron.trim(), patron: f.patron.trim().toLowerCase(),
      tipo_mov: f.tipo_mov || null, id_cuenta_fk: f.id_cuenta_fk ? Number(f.id_cuenta_fk) : null,
      monto_min: numOrNull(f.monto_min), monto_max: numOrNull(f.monto_max),
      id_concepto_fk: f.id_concepto_fk ? Number(f.id_concepto_fk) : null,
      id_centro_costo_fk: f.id_centro_costo_fk ? Number(f.id_centro_costo_fk) : null,
      id_tipo_gasto_fk: f.id_tipo_gasto_fk ? Number(f.id_tipo_gasto_fk) : null,
      prioridad: Number(f.prioridad) || 500, nota: f.nota.trim() || null, activo: f.activo,
    }
    const q = inicial.id
      ? dbComp.from('flujo_reglas').update(row).eq('id', inicial.id).select('*').single()
      : dbComp.from('flujo_reglas').insert(row).select('*').single()
    const { data, error: e } = await q
    setGuardando(false)
    if (e || !data) { setError('No se pudo guardar: ' + (e?.message ?? '')); return }
    onGuardado(data as Regla)
  }

  return (
    <ModalShell modulo="tesoreria" titulo={inicial.id ? 'Editar regla' : 'Nueva regla'} icono={Wand2} size="lg" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}><label className="label">La descripción contiene</label>
          <input className="input" value={f.patron} onChange={e => set('patron', e.target.value)} placeholder="p. ej. servicios gasolineros" />
          <div style={{ fontSize: 11.5, color: '#62666E', marginTop: 4 }}>
            Sin distinguir mayúsculas, acentos ni signos.{coinciden != null && <> Coincide con <b>{coinciden}</b> de los movimientos mostrados.</>}
          </div></div>
        <div><label className="label">Nombre</label><input className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="(el texto)" /></div>
        <div><label className="label">Prioridad (menor = primero)</label><input className="input" inputMode="numeric" value={f.prioridad} onChange={e => set('prioridad', e.target.value)} /></div>
        <div><label className="label">Tipo</label>
          <select className="select" value={f.tipo_mov} onChange={e => set('tipo_mov', e.target.value)}>
            <option value="">Depósitos y retiros</option><option value="Abono">Solo depósitos</option><option value="Cargo">Solo retiros</option>
          </select></div>
        <div><label className="label">Cuenta</label>
          <select className="select" value={f.id_cuenta_fk} onChange={e => set('id_cuenta_fk', e.target.value)}>
            <option value="">Todas</option>{cuentas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
          </select></div>
        <div><label className="label">Monto desde</label><input className="input" inputMode="decimal" value={f.monto_min} onChange={e => set('monto_min', e.target.value)} /></div>
        <div><label className="label">Monto hasta</label><input className="input" inputMode="decimal" value={f.monto_max} onChange={e => set('monto_max', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #E6E8EB', paddingTop: 10, fontSize: 12, fontWeight: 700, color: '#4A4D54' }}>Asigna (deja vacío lo que no quieras tocar)</div>
        <div><label className="label">Concepto de flujo</label>
          <select className="select" value={f.id_concepto_fk} onChange={e => set('id_concepto_fk', e.target.value)}>
            <option value="">(no cambiar)</option>
            {arbol.map(g => <optgroup key={g.grupo.id} label={g.grupo.nombre}>{g.hijos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</optgroup>)}
          </select></div>
        <div><label className="label">Segmento</label>
          <select className="select" value={f.id_centro_costo_fk} onChange={e => set('id_centro_costo_fk', e.target.value)}>
            <option value="">(no cambiar)</option>{centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></div>
        <div><label className="label">Tipo de gasto</label>
          <select className="select" value={f.id_tipo_gasto_fk} onChange={e => set('id_tipo_gasto_fk', e.target.value)}>
            <option value="">(no cambiar)</option>{tiposGasto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></div>
        <div style={{ gridColumn: '1 / -1' }}><label className="label">Nota</label><input className="input" value={f.nota} onChange={e => set('nota', e.target.value)} /></div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={f.activo} onChange={e => set('activo', e.target.checked)} /> Activa
        </label>
      </div>
      {error && <div style={{ marginTop: 12 }}><Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso></div>}
    </ModalShell>
  )
}

// ── Modal de layout ───────────────────────────────────────────
function ModalLayout({ cat, inicial, onClose, onGuardado }: {
  cat: CatalogosBanco; inicial: Partial<Layout>; onClose: () => void; onGuardado: () => void
}) {
  const [f, setF] = useState({
    nombre: inicial.nombre ?? '', banco: inicial.banco ?? '', hoja: inicial.hoja ?? '',
    id_cuenta_fk: inicial.id_cuenta_fk ? String(inicial.id_cuenta_fk) : '',
    fila_inicio: String(inicial.fila_inicio ?? 2), col_fecha: String(inicial.col_fecha ?? ''), col_descripcion: String(inicial.col_descripcion ?? ''),
    col_referencia: String(inicial.col_referencia ?? ''), col_abono: String(inicial.col_abono ?? ''), col_cargo: String(inicial.col_cargo ?? ''),
    col_monto: String(inicial.col_monto ?? ''), col_saldo: String(inicial.col_saldo ?? ''),
    formato_fecha: inicial.formato_fecha ?? 'DD/MM/YYYY', activo: inicial.activo ?? true,
  })
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, v: string | boolean) => setF(p => ({ ...p, [k]: v }))
  const col = (s: string) => {
    const t = s.trim().toUpperCase()
    if (!t) return null
    if (/^[A-Z]{1,2}$/.test(t)) return t.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0)  // letra de Excel
    const n = parseInt(t, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  async function guardar() {
    const row = {
      nombre: f.nombre.trim(), banco: f.banco.trim() || null, hoja: f.hoja.trim() || null,
      id_cuenta_fk: f.id_cuenta_fk ? Number(f.id_cuenta_fk) : null, fila_inicio: Number(f.fila_inicio) || 1,
      col_fecha: col(f.col_fecha), col_descripcion: col(f.col_descripcion), col_referencia: col(f.col_referencia),
      col_abono: col(f.col_abono), col_cargo: col(f.col_cargo), col_monto: col(f.col_monto), col_saldo: col(f.col_saldo),
      formato_fecha: f.formato_fecha, activo: f.activo,
    }
    if (!row.nombre || !row.col_fecha || !row.col_descripcion) { setError('Nombre, columna de fecha y de descripción son obligatorios.'); return }
    if (!row.col_monto && !row.col_abono && !row.col_cargo) { setError('Indica columnas de abono y cargo, o una sola columna de monto con signo.'); return }
    const { error: e } = inicial.id
      ? await dbComp.from('flujo_layouts').update(row).eq('id', inicial.id)
      : await dbComp.from('flujo_layouts').insert(row)
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    onGuardado()
  }

  const campo = (k: keyof typeof f, label: string, ph = '') => (
    <div><label className="label">{label}</label><input className="input" value={String(f[k])} placeholder={ph} onChange={e => set(k, e.target.value)} /></div>
  )
  return (
    <ModalShell modulo="tesoreria" titulo={inicial.id ? 'Editar layout' : 'Nuevo layout'} icono={FileSpreadsheet} size="lg" onClose={onClose}
      subtitulo="Columnas por letra (A, B, C…) o número (1 = A)"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={guardar}>Guardar</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: 'span 2' }}>{campo('nombre', 'Nombre', 'BanBajío Excel')}</div>
        {campo('banco', 'Banco', 'BanBajío')}
        <div><label className="label">Cuenta (opcional)</label>
          <select className="select" value={f.id_cuenta_fk} onChange={e => set('id_cuenta_fk', e.target.value)}>
            <option value="">Cualquiera del banco</option>{cat.cuentas.map(c => <option key={c.id} value={c.id}>{nombreCuenta(c)}</option>)}
          </select></div>
        {campo('hoja', 'Hoja', '(la primera)')}
        {campo('fila_inicio', 'Primera fila con datos')}
        {campo('col_fecha', 'Fecha')}
        {campo('col_descripcion', 'Descripción')}
        {campo('col_referencia', 'Referencia')}
        {campo('col_abono', 'Abono / depósito')}
        {campo('col_cargo', 'Cargo / retiro')}
        {campo('col_monto', 'Monto con signo', 'si no hay abono/cargo')}
        {campo('col_saldo', 'Saldo')}
        <div><label className="label">Formato de fecha</label>
          <select className="select" value={f.formato_fecha} onChange={e => set('formato_fecha', e.target.value)}>
            <option value="DD/MM/YYYY">DD/MM/AAAA</option><option value="MM/DD/YYYY">MM/DD/AAAA</option><option value="YYYY-MM-DD">AAAA-MM-DD</option>
          </select></div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={f.activo} onChange={e => set('activo', e.target.checked)} /> Activo
        </label>
      </div>
      {error && <div style={{ marginTop: 12 }}><Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso></div>}
    </ModalShell>
  )
}
