'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/lib/useDebounce'
import { ClipboardList, Plus, Search, RefreshCw, Eye, Edit2, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Paginador from '@/components/ui/Paginador'
import ParteModal from '@/components/vigilancia/ParteModal'
import NovedadModal from '@/components/vigilancia/NovedadModal'
import {
  Parte, Novedad, Tipo, Ubicacion, CRIT_COLOR, STATUS_NOV_COLOR, STATUS_NOV, CRITICIDADES, Pill,
  fmtFecha, fmtHora,
} from '@/components/vigilancia/tipos'

type Tab = 'partes' | 'novedades' | 'pendientes'

export default function VigilanciaNovedadesPage() {
  const { canWrite } = useAuth()
  const [tab, setTab] = useState<Tab>('partes')
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [parteModal, setParteModal] = useState<{ parte: Parte | null } | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    dbCfg.from('vig_tipos_novedad').select('id, nombre, clase, genera_incidencia').eq('activo', true).order('nombre')
      .then(({ data }) => setTipos((data ?? []) as Tipo[]))
    dbCfg.from('vig_ubicaciones').select('id, nombre, tipo').eq('activo', true).order('nombre')
      .then(({ data }) => setUbicaciones((data ?? []) as Ubicacion[]))
  }, [])

  const bump = () => setRefresh(r => r + 1)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl" icon={ClipboardList} color="#475569" eyebrowLabel="Vigilancia"
        title="Parte de Novedades"
        subtitle="Parte diario de vigilancia: novedades por lote y ubicación"
        actions={canWrite('vigilancia-novedades') && (
          <button className="btn-primary" onClick={() => setParteModal({ parte: null })}>
            <Plus size={14} /> Nuevo Parte
          </button>
        )}
      />

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {([['partes', 'Partes'], ['novedades', 'Novedades'], ['pendientes', 'Pendientes']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 600 : 400,
              color: tab === k ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === k ? '#475569' : 'transparent'}`, marginBottom: -1 }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'partes'
        ? <PartesTab refresh={refresh} onOpen={p => setParteModal({ parte: p })} />
        : <NovedadesTab key={tab} soloPendientes={tab === 'pendientes'} refresh={refresh} tipos={tipos} ubicaciones={ubicaciones} onChanged={bump} />}

      {parteModal && (
        <ParteModal parte={parteModal.parte} tipos={tipos} ubicaciones={ubicaciones}
          onClose={() => setParteModal(null)} onChanged={bump} />
      )}
    </div>
  )
}

// ── Partes ───────────────────────────────────────────────────────────────────
function PartesTab({ refresh, onOpen }: { refresh: number; onOpen: (p: Parte) => void }) {
  const { canWrite } = useAuth()
  const [partes, setPartes] = useState<Parte[]>([])
  const [conteo, setConteo] = useState<Record<number, { total: number; abiertas: number }>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(31)
  const [mes, setMes] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('vig_partes').select('*', { count: 'exact' }).order('fecha', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    if (mes) {
      const [y, m] = mes.split('-').map(Number)
      const fin = new Date(y, m, 0).getDate()
      q = q.gte('fecha', `${mes}-01`).lte('fecha', `${mes}-${String(fin).padStart(2, '0')}`)
    }
    if (status) q = q.eq('status', status)
    const { data, count, error } = await q
    if (error) { setLoading(false); return }
    const lista = (data ?? []) as Parte[]
    setPartes(lista); setTotal(count ?? 0)
    if (lista.length) {
      const { data: nov } = await dbCtrl.from('vig_novedades').select('id_parte_fk, status').in('id_parte_fk', lista.map(p => p.id))
      const c: Record<number, { total: number; abiertas: number }> = {}
      ;(nov ?? []).forEach((n: any) => {
        const x = (c[n.id_parte_fk] ??= { total: 0, abiertas: 0 })
        x.total++; if (n.status !== 'Cerrado') x.abiertas++
      })
      setConteo(c)
    } else setConteo({})
    setLoading(false)
  }, [page, pageSize, mes, status, refresh])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="month" className="input" style={{ width: 170 }} value={mes} onChange={e => { setMes(e.target.value); setPage(0) }} />
        <select className="select" style={{ width: 170 }} value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}>
          <option value="">Todos los status</option>
          <option>Borrador</option><option>Enviado/Cerrado</option>
        </select>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Fecha</th><th>Responsable</th><th>Supervisor</th><th style={{ textAlign: 'right' }}>Novedades</th><th style={{ textAlign: 'right' }}>Sin cerrar</th><th>Status</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              ) : partes.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin partes registrados</td></tr>
              ) : partes.map(p => {
                const c = conteo[p.id] ?? { total: 0, abiertas: 0 }
                return (
                  <tr key={p.id}>
                    <td style={{ fontSize: 13, textTransform: 'capitalize' }}>{fmtFecha(p.fecha)}</td>
                    <td style={{ fontSize: 12 }}>{p.responsable ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{p.supervisor ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{c.total}</td>
                    <td style={{ textAlign: 'right', fontSize: 13, color: c.abiertas ? '#dc2626' : 'var(--text-muted)', fontWeight: c.abiertas ? 600 : 400 }}>{c.abiertas}</td>
                    <td><Pill txt={p.status} c={p.status === 'Borrador' ? { bg: '#fffbeb', color: '#d97706' } : { bg: '#f0fdf4', color: '#15803d' }} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-ghost" style={{ padding: 5 }} title="Ver" onClick={() => onOpen(p)}><Eye size={13} /></button>
                        {canWrite('vigilancia-novedades') && p.status === 'Borrador' &&
                          <button className="btn-ghost" style={{ padding: 5 }} title="Editar" onClick={() => onOpen(p)}><Edit2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Paginador page={page} pageSize={pageSize} totalItems={total} onChange={setPage}
          onPageSizeChange={n => { setPageSize(n); setPage(0) }} />
      </div>
    </>
  )
}

// ── Novedades / Pendientes ───────────────────────────────────────────────────
function NovedadesTab({ soloPendientes, refresh, tipos, ubicaciones, onChanged }:
  { soloPendientes: boolean; refresh: number; tipos: Tipo[]; ubicaciones: Ubicacion[]; onChanged: () => void }) {
  const { canWrite } = useAuth()
  const [rows, setRows] = useState<Novedad[]>([])
  const [ubicPorNov, setUbicPorNov] = useState<Record<number, string[]>>({})
  const [lotes, setLotes] = useState<Record<number, string>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const dSearch = useDebounce(search, 300)
  const [fTipo, setFTipo] = useState('')
  const [fClase, setFClase] = useState(soloPendientes ? 'Incidencia' : '')
  const [fCrit, setFCrit] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fUbic, setFUbic] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Novedad | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('vig_novedades').select('*, vig_partes!inner(fecha)', { count: 'exact' })
      .order('vig_partes(fecha)', { ascending: false })  // ordena por la fecha del parte (relación a uno)
      .order('hora', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)

    if (dSearch) q = q.or(`titulo.ilike.%${dSearch}%,descripcion.ilike.%${dSearch}%`)
    if (fTipo)   q = q.eq('id_tipo_fk', Number(fTipo))
    if (fCrit)   q = q.eq('criticidad', fCrit)
    if (soloPendientes) q = q.neq('status', 'Cerrado')
    else if (fStatus)   q = q.eq('status', fStatus)
    if (fClase) {
      const ids = tipos.filter(t => t.clase === fClase).map(t => t.id)
      q = q.in('id_tipo_fk', ids.length ? ids : [-1])
    }
    if (desde) q = q.gte('vig_partes.fecha', desde)
    if (hasta) q = q.lte('vig_partes.fecha', hasta)
    if (fUbic) {
      const { data: nu } = await dbCtrl.from('vig_novedad_ubicaciones').select('id_novedad_fk').eq('id_ubicacion_fk', Number(fUbic)).limit(5000)
      const ids = (nu ?? []).map((r: any) => r.id_novedad_fk)
      q = q.in('id', ids.length ? ids : [-1])
    }

    const { data, count, error } = await q
    if (error) { setLoading(false); return }
    const lista = (data ?? []) as Novedad[]
    setRows(lista); setTotal(count ?? 0)

    if (lista.length) {
      const { data: nu } = await dbCtrl.from('vig_novedad_ubicaciones').select('id_novedad_fk, id_ubicacion_fk').in('id_novedad_fk', lista.map(n => n.id))
      const map: Record<number, string[]> = {}
      ;(nu ?? []).forEach((r: any) => {
        const nombre = ubicaciones.find(u => u.id === r.id_ubicacion_fk)?.nombre
        if (nombre) (map[r.id_novedad_fk] ??= []).push(nombre)
      })
      setUbicPorNov(map)
      const loteIds = Array.from(new Set(lista.filter(n => n.id_lote_fk).map(n => n.id_lote_fk as number)))
      if (loteIds.length) {
        const { data: ls } = await dbCat.from('lotes').select('id, cve_lote, lote').in('id', loteIds)
        setLotes(Object.fromEntries((ls ?? []).map((l: any) => [l.id, l.cve_lote ?? `#${l.lote}`])))
      }
    } else setUbicPorNov({})
    setLoading(false)
  }, [page, pageSize, dSearch, fTipo, fClase, fCrit, fStatus, fUbic, desde, hasta, soloPendientes, tipos, ubicaciones, refresh])

  useEffect(() => { fetchData() }, [fetchData])
  const reset = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(0) }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar título o descripción…" value={search} onChange={e => reset(setSearch)(e.target.value)} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>}
        </div>
        <select className="select" style={{ width: 130 }} value={fClase} onChange={e => reset(setFClase)(e.target.value)}>
          <option value="">Toda clase</option><option>Incidencia</option><option>Acceso</option><option>Rutina</option>
        </select>
        <select className="select" style={{ width: 180 }} value={fTipo} onChange={e => reset(setFTipo)(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 180 }} value={fUbic} onChange={e => reset(setFUbic)(e.target.value)}>
          <option value="">Todas las ubicaciones</option>
          {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 130 }} value={fCrit} onChange={e => reset(setFCrit)(e.target.value)}>
          <option value="">Criticidad</option>{CRITICIDADES.map(c => <option key={c}>{c}</option>)}
        </select>
        {!soloPendientes && (
          <select className="select" style={{ width: 130 }} value={fStatus} onChange={e => reset(setFStatus)(e.target.value)}>
            <option value="">Status</option>{STATUS_NOV.map(s => <option key={s}>{s}</option>)}
          </select>
        )}
        <input type="date" className="input" style={{ width: 150 }} value={desde} onChange={e => reset(setDesde)(e.target.value)} title="Desde" />
        <input type="date" className="input" style={{ width: 150 }} value={hasta} onChange={e => reset(setHasta)(e.target.value)} title="Hasta" />
        <button className="btn-ghost" onClick={fetchData} title="Actualizar"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Novedad</th><th>Lote</th><th>Ubicación</th><th>Crit.</th><th>Status</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>{soloPendientes ? 'Sin pendientes' : 'Sin novedades'}</td></tr>
              ) : rows.map(n => (
                <tr key={n.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{n.vig_partes?.fecha ? new Date(n.vig_partes.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtHora(n.hora)}</td>
                  <td style={{ fontSize: 12 }}>{tipos.find(t => t.id === n.id_tipo_fk)?.nombre ?? '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.descripcion ?? ''}>{n.titulo}</td>
                  <td style={{ fontSize: 13, color: 'var(--gold-light)', fontFamily: 'var(--font-display)' }}>{n.id_lote_fk ? (lotes[n.id_lote_fk] ?? `#${n.id_lote_fk}`) : '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(ubicPorNov[n.id] ?? []).join(', ') || '—'}</td>
                  <td><Pill txt={n.criticidad} c={CRIT_COLOR[n.criticidad] ?? CRIT_COLOR['Baja']} /></td>
                  <td><Pill txt={n.status} c={STATUS_NOV_COLOR[n.status] ?? STATUS_NOV_COLOR['Abierto']} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-ghost" style={{ padding: 5 }} title="Ver" onClick={() => setSel(n)}><Eye size={13} /></button>
                      {canWrite('vigilancia-novedades') && <button className="btn-ghost" style={{ padding: 5 }} title="Editar" onClick={() => setSel(n)}><Edit2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginador page={page} pageSize={pageSize} totalItems={total} onChange={setPage}
          onPageSizeChange={n => { setPageSize(n); setPage(0) }} />
      </div>

      {sel && (
        <NovedadModal novedad={sel} idParte={sel.id_parte_fk} fechaParte={sel.vig_partes?.fecha ?? ''}
          tipos={tipos} ubicaciones={ubicaciones} soloLectura={!canWrite('vigilancia-novedades')}
          onClose={() => setSel(null)} onSaved={() => { setSel(null); fetchData(); onChanged() }} />
      )}
    </>
  )
}
