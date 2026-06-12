'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { Search, RefreshCw, ClipboardCheck } from 'lucide-react'

// Auditoría de cajones: lo que el sistema reporta como ocupado/disponible,
// con columnas en blanco para el levantamiento físico en motor lobby.

type PensionSlot = {
  id: number
  id_slot_fk: number | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_familiares: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null } | null
  cat_carritos: { tipo: string | null; marca: string | null; modelo: string | null; placa: string | null } | null
}

type SlotRow = {
  id: number
  numero: string
  pension: PensionSlot | null
}

const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'

export default function ReporteGolfAuditoriaSlots() {
  const [rows, setRows]       = useState<SlotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filtro, setFiltro]   = useState<'todos' | 'ocupados' | 'disponibles'>('todos')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: slots }, { data: pensiones }] = await Promise.all([
      dbGolf.from('cat_slots').select('id, numero').eq('activo', true),
      dbGolf.from('ctrl_pensiones')
        .select(`id, id_slot_fk,
          cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
          cat_familiares(nombre, apellido_paterno, apellido_materno, parentesco),
          cat_carritos(tipo, marca, modelo, placa)`)
        .eq('activo', true)
        .not('id_slot_fk', 'is', null),
    ])
    const porSlot: Record<number, PensionSlot> = {}
    for (const p of ((pensiones ?? []) as unknown as PensionSlot[])) {
      if (p.id_slot_fk != null) porSlot[p.id_slot_fk] = p
    }
    const result: SlotRow[] = (((slots ?? []) as { id: number; numero: string }[]))
      .map(s => ({ id: s.id, numero: s.numero, pension: porSlot[s.id] ?? null }))
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))
    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = rows.filter(r => {
    if (filtro === 'ocupados'    && !r.pension) return false
    if (filtro === 'disponibles' &&  r.pension) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const txt = [
      r.numero,
      r.pension ? nc(r.pension.cat_socios) : '',
      r.pension?.cat_carritos?.marca, r.pension?.cat_carritos?.modelo, r.pension?.cat_carritos?.placa,
    ].filter(Boolean).join(' ').toLowerCase()
    return txt.includes(q)
  })

  const ocupados = rows.filter(r => r.pension).length
  const fechaHoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cajón, socio, carrito o placa…"
            style={{ width: '100%', padding: '8px 12px 8px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {([
            { key: 'todos',       label: 'Todos',       color: '#0d9488' },
            { key: 'ocupados',    label: 'Ocupados',    color: '#dc2626' },
            { key: 'disponibles', label: 'Disponibles', color: '#15803d' },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)} style={{
              padding: '8px 14px', fontSize: 12, fontWeight: filtro === f.key ? 600 : 400,
              background: filtro === f.key ? f.color : '#fff',
              color: filtro === f.key ? '#fff' : '#94a3b8',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={fetchData}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'Cajones activos',        value: rows.length,            color: '#0d9488', bg: '#f0fdfa' },
          { label: 'Ocupados (sistema)',     value: ocupados,               color: '#dc2626', bg: '#fef2f2' },
          { label: 'Disponibles (sistema)',  value: rows.length - ocupados, color: '#15803d', bg: '#f0fdf4' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', background: k.bg, border: `1px solid ${k.color}22`, minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <ClipboardCheck size={14} style={{ color: k.color }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: k.color, lineHeight: 1 }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <PrintBar title="Auditoría de Slots — Sistema vs Físico" count={filtered.length} />

      <div id="reporte-print-area">
        {/* Header impresión */}
        <div className="print-only" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Auditoría de Slots / Cajones — Sistema vs Físico</div>
          <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{fechaHoy} · {filtered.length} cajones · Marcar en campo lo encontrado físicamente</div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>Sin cajones para los filtros seleccionados</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Cajón</th>
                    <th style={thStyle}>Sistema</th>
                    <th style={thStyle}>Socio (sistema)</th>
                    <th style={thStyle}>Carrito (sistema)</th>
                    <th style={{ ...thStyle, textAlign: 'center', background: '#fffbeb' }}>Físico: Ocupado</th>
                    <th style={{ ...thStyle, textAlign: 'center', background: '#fffbeb' }}>Físico: Vacío</th>
                    <th style={{ ...thStyle, textAlign: 'center', background: '#fffbeb' }}>¿Coincide?</th>
                    <th style={{ ...thStyle, background: '#fffbeb', minWidth: 160 }}>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const ocupado = !!r.pension
                    const car = r.pension?.cat_carritos
                    const carDesc = car ? [car.marca, car.modelo].filter(Boolean).join(' ') : ''
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 12px', color: '#94a3b8', fontSize: 11 }}>{idx + 1}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>Cajón {r.numero}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: ocupado ? '#fee2e2' : '#dcfce7', color: ocupado ? '#dc2626' : '#15803d' }}>
                            {ocupado ? 'Ocupado' : 'Disponible'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {ocupado ? (
                            <>
                              <div style={{ fontWeight: 500, color: '#1e293b' }}>{nc(r.pension!.cat_socios)}</div>
                              {r.pension!.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: '#94a3b8' }}>#{r.pension!.cat_socios.numero_socio}</div>}
                            </>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: '#475569' }}>
                          {ocupado ? (
                            <>
                              <div>{carDesc || '—'}</div>
                              {car?.placa && <div style={{ fontSize: 11, color: '#94a3b8' }}>Placa {car.placa}</div>}
                            </>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 16, color: '#94a3b8' }}>☐</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 16, color: '#94a3b8' }}>☐</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>Sí ☐ &nbsp; No ☐</td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ borderBottom: '1px solid #cbd5e1', height: 16, minWidth: 150 }} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Firmas — solo impresión */}
        <div className="print-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, marginTop: 56, pageBreakInside: 'avoid' }}>
          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 6, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
            Realizó (nombre y firma)
          </div>
          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 6, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
            Supervisó (nombre y firma)
          </div>
        </div>
      </div>
    </div>
  )
}
