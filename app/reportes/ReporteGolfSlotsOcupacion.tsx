'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { Search, RefreshCw, Warehouse } from 'lucide-react'

// Ocupación de cajones: status + socio y familiar ocupante + tipo/marca/modelo del carrito.

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

export default function ReporteGolfSlotsOcupacion() {
  const [rows, setRows]       = useState<SlotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filtro, setFiltro]   = useState<'todos' | 'ocupados' | 'disponibles'>('todos')
  const [filtroTipo, setFiltroTipo] = useState('')

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
    if (filtroTipo && r.pension?.cat_carritos?.tipo !== filtroTipo) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const txt = [
      r.numero,
      r.pension ? nc(r.pension.cat_socios) : '',
      r.pension?.cat_familiares ? nc(r.pension.cat_familiares) : '',
      r.pension?.cat_carritos?.marca, r.pension?.cat_carritos?.modelo, r.pension?.cat_carritos?.placa,
    ].filter(Boolean).join(' ').toLowerCase()
    return txt.includes(q)
  })

  const ocupados = rows.filter(r => r.pension).length
  const pctOcupacion = rows.length > 0 ? Math.round((ocupados / rows.length) * 100) : 0

  const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cajón, socio, familiar, carrito…"
            style={{ width: '100%', padding: '8px 12px 8px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {([
            { key: 'todos',       label: 'Todos',       color: '#059669' },
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
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todos los tipos</option>
          <option value="ELECTRICO">⚡ Eléctrico</option>
          <option value="COMBUSTION">⛽ Combustión</option>
        </select>
        <button onClick={fetchData}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'Cajones activos', value: String(rows.length),            color: '#059669', bg: '#ecfdf5' },
          { label: 'Ocupados',        value: String(ocupados),               color: '#dc2626', bg: '#fef2f2' },
          { label: 'Disponibles',     value: String(rows.length - ocupados), color: '#15803d', bg: '#f0fdf4' },
          { label: '% Ocupación',     value: `${pctOcupacion}%`,             color: '#2563eb', bg: '#eff6ff' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', background: k.bg, border: `1px solid ${k.color}22`, minWidth: 140 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Warehouse size={14} style={{ color: k.color }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: k.color, lineHeight: 1 }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <PrintBar title="Ocupación de Slots / Cajones" count={filtered.length} />

      <div id="reporte-print-area">
        {/* Header impresión */}
        <div className="print-only" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Ocupación de Slots / Cajones</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} · {filtered.length} cajones · {ocupados} ocupados ({pctOcupacion}%)
          </div>
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
                    {['#', 'Cajón', 'Status', 'Socio', 'Familiar', 'Tipo', 'Marca', 'Modelo', 'Placa'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const ocupado = !!r.pension
                    const car = r.pension?.cat_carritos
                    const fam = r.pension?.cat_familiares
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
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
                          {fam ? (
                            <>
                              <div>{nc(fam)}</div>
                              {fam.parentesco && <div style={{ fontSize: 11, color: '#94a3b8' }}>{fam.parentesco}</div>}
                            </>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          {car?.tipo
                            ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: car.tipo === 'ELECTRICO' ? '#eff6ff' : '#fffbeb', color: car.tipo === 'ELECTRICO' ? '#1d4ed8' : '#92400e' }}>
                                {car.tipo === 'ELECTRICO' ? '⚡ Eléctrico' : '⛽ Combustión'}
                              </span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: '#475569' }}>{car?.marca ?? '—'}</td>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: '#475569' }}>{car?.modelo ?? '—'}</td>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{car?.placa ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
