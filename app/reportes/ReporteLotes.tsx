'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { dbCat, dbCfg } from '@/lib/supabase'
import { RefreshCw, Edit2, Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { PrintBar } from './utils'

const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export default function ReporteLotes({ editable = false }: { editable?: boolean }) {
  const [lotes, setLotes]       = useState<any[]>([])
  const [secciones, setSecciones] = useState<any[]>([])
  const [seccionMap, setSeccionMap] = useState<Record<number, string>>({})
  const [clasifMap, setClasifMap] = useState<Record<number, string>>({})
  const [filterSec, setFilterSec] = useState('')
  const [filterMz, setFilterMz]   = useState('')
  const [manzanas, setManzanas]   = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<any | null>(null)
  const [reload, setReload]     = useState(0)

  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setSecciones(data ?? [])
        const map: Record<number, string> = {}
        ;(data ?? []).forEach((s: any) => { map[s.id] = s.nombre })
        setSeccionMap(map)
      })
  }, [])

  useEffect(() => {
    dbCfg.from('clasificacion').select('id, nombre').then(({ data }) => {
      const map: Record<number, string> = {}
      ;(data ?? []).forEach((c: any) => { map[c.id] = c.nombre })
      setClasifMap(map)
    })
  }, [])

  useEffect(() => {
    setFilterMz('')
    let q = dbCat.from('lotes').select('manzana').not('manzana', 'is', null)
    if (filterSec) q = q.eq('id_seccion_fk', Number(filterSec))
    q.then(({ data }) => {
      const set = new Set<string>((data ?? []).map((r: any) => String(r.manzana).trim()).filter(Boolean))
      ROMANOS.forEach(r => set.add(r))
      const rv = (m: string) => { const i = ROMANOS.indexOf(m.toUpperCase()); return i < 0 ? 999 : i }
      setManzanas(Array.from(set).sort((a, b) => rv(a) - rv(b) || a.localeCompare(b, 'es', { numeric: true })))
    })
  }, [filterSec])

  useEffect(() => {
    setLoading(true)
    let q = dbCat.from('lotes').select('*').order('cve_lote')
    if (filterSec) q = q.eq('id_seccion_fk', Number(filterSec))
    if (filterMz) q = q.eq('manzana', filterMz)
    q.then(({ data }) => {
      setLotes(data ?? []); setLoading(false)
    })
  }, [filterSec, filterMz, reload])

  // Agrupa por sección (nombre) y luego por No. Lote (orden numérico natural)
  const lotesOrd = useMemo(() => [...lotes].sort((a, b) =>
    (seccionMap[a.id_seccion_fk] ?? '\uffff').localeCompare(seccionMap[b.id_seccion_fk] ?? '\uffff', 'es', { numeric: true }) ||
    String(a.lote ?? '').localeCompare(String(b.lote ?? ''), 'es', { numeric: true })
  ), [lotes, seccionMap])

  const subt = useMemo(() => {
    const m: Record<number, { n: number; sup: number }> = {}
    lotesOrd.forEach(l => {
      const k = l.id_seccion_fk ?? 0
      const e = m[k] ?? (m[k] = { n: 0, sup: 0 })
      e.n++; e.sup += Number(l.superficie) || 0
    })
    return m
  }, [lotesOrd])
  const totalSup = lotesOrd.reduce((a, l) => a + (Number(l.superficie) || 0), 0)

  const STATUS_COLOR: Record<string, string> = {
    'Vendido': '#15803d', 'Libre': '#1d4ed8', 'Bloqueado': '#dc2626',
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <select className="select" style={{ width: 220 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 180 }} value={filterMz} onChange={e => setFilterMz(e.target.value)}>
          <option value="">Todas las manzanas</option>
          {manzanas.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      <style>{`@media print { .col-acciones { display: none !important } }`}</style>
      <PrintBar title="Lotes_por_Seccion" count={lotes.length} reportTitle="Lotes por Sección" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Clave Lote</th>
              <th>Sección</th>
              <th>No. Lote</th>
              <th>Manzana</th>
              <th>Número</th>
              <th>Calle</th>
              <th style={{ textAlign: 'right' }}>Superficie m²</th>
              <th>Status</th>
              <th>Clasificación</th>
              {editable && <th className="col-acciones" style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {lotes.length === 0 ? (
              <tr><td colSpan={editable ? 10 : 9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : (<>
              {lotesOrd.map((l, i) => {
                const sec = l.id_seccion_fk ? (seccionMap[l.id_seccion_fk] ?? '—') : 'Sin sección'
                const sig = lotesOrd[i + 1]
                const finGrupo = !sig || sig.id_seccion_fk !== l.id_seccion_fk
                const st = subt[l.id_seccion_fk ?? 0]
                return (
                  <Fragment key={l.id}>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{l.cve_lote ?? `#${l.lote}`}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.id_seccion_fk ? (seccionMap[l.id_seccion_fk] ?? '—') : '—'}</td>
                <td style={{ fontWeight: 600 }}>{l.lote ?? '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.manzana ?? '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.numero ?? '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.calle ?? '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.superficie ? l.superficie.toLocaleString('es-MX') : '—'}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[l.status_lote ?? ''] ?? 'var(--text-muted)' }}>
                    {l.status_lote ?? '—'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.id_clasificacion_fk ? (clasifMap[l.id_clasificacion_fk] ?? '—') : '—'}</td>
                {editable && (
                  <td className="col-acciones">
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} title="Edición rápida" onClick={() => setEditing(l)}>
                      <Edit2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
                    {finGrupo && st && (
                      <tr style={{ background: 'var(--bg-secondary)', fontWeight: 700 }}>
                        <td colSpan={6}>Subtotal {sec} — {st.n} lote{st.n === 1 ? '' : 's'}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{st.sup.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>
                        <td colSpan={editable ? 3 : 2}></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              <tr style={{ background: 'var(--bg-secondary)', fontWeight: 800 }}>
                <td colSpan={6}>TOTAL — {lotesOrd.length} lotes</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{totalSup.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>
                <td colSpan={editable ? 3 : 2}></td>
              </tr>
            </>)}
          </tbody>
        </table>
      </div>
      {editing && (
        <EdicionRapida lote={editing} secciones={secciones} clasifs={clasifMap}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload(r => r + 1) }} />
      )}
    </div>
  )
}

const STATUS_LOTE = ['Libre', 'Vendido', 'Bloqueado']

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function EdicionRapida({ lote, secciones, clasifs, onClose, onSaved }: {
  lote: any; secciones: any[]; clasifs: Record<number, string>; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    cve_lote:            lote.cve_lote ?? '',
    lote:                lote.lote ?? '',
    manzana:             lote.manzana ?? '',
    numero:              lote.numero ?? '',
    calle:               lote.calle ?? '',
    superficie:          lote.superficie ?? '',
    status_lote:         lote.status_lote ?? 'Libre',
    id_clasificacion_fk: lote.id_clasificacion_fk ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const guardar = async () => {
    setSaving(true); setError('')
    const { error: err } = await dbCat.from('lotes').update({
      cve_lote:            String(form.cve_lote).trim() || null,
      lote:                form.lote !== '' ? Number(form.lote) : null,
      manzana:             String(form.manzana).trim() || null,
      numero:              String(form.numero).trim() || null,
      calle:               String(form.calle).trim() || null,
      superficie:          form.superficie !== '' ? Number(form.superficie) : null,
      status_lote:         form.status_lote || null,
      id_clasificacion_fk: form.id_clasificacion_fk !== '' ? Number(form.id_clasificacion_fk) : null,
    }).eq('id', lote.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const sec = secciones.find(x => x.id === lote.id_seccion_fk)?.nombre

  return (
    <ModalShell modulo="lotes" titulo={`Edición rápida · ${lote.cve_lote ?? '#' + lote.lote}`}
      subtitulo={sec ? `Sección ${sec}` : undefined} size="md" onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={saving}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </>}>
      {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <F label="Clave Lote"><input className="input" value={form.cve_lote} onChange={set('cve_lote')} /></F>
          <F label="No. Lote"><input className="input" type="number" value={form.lote} onChange={set('lote')} /></F>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <F label="Manzana"><input className="input" value={form.manzana} onChange={set('manzana')} /></F>
          <F label="Número"><input className="input" value={form.numero} onChange={set('numero')} /></F>
        </div>
        <F label="Calle"><input className="input" value={form.calle} onChange={set('calle')} /></F>
        <div style={{ display: 'flex', gap: 12 }}>
          <F label="Superficie m²"><input className="input" type="number" step="any" value={form.superficie} onChange={set('superficie')} /></F>
          <F label="Status">
            <select className="select" value={form.status_lote} onChange={set('status_lote')}>
              {STATUS_LOTE.map(x => <option key={x}>{x}</option>)}
            </select>
          </F>
        </div>
        <F label="Clasificación">
          <select className="select" value={form.id_clasificacion_fk} onChange={set('id_clasificacion_fk')}>
            <option value="">— Sin clasificación —</option>
            {Object.entries(clasifs).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </F>
      </div>
    </ModalShell>
  )
}
