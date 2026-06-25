'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf, dbCtrl, dbHip } from '@/lib/supabase'
import { RefreshCw, Search, X, Calendar, AlertTriangle, ClipboardList, Download, Printer } from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────
export type AgendaModulo = 'golf' | 'residencial' | 'hipico'

type RegistroAgenda = {
  id: number
  id_entidad: number
  nombre_entidad: string
  fecha_contacto: string
  canal: string
  respuesta: string | null
  seguimiento: string
  fecha_proximo_contacto: string | null
  notas: string | null
  usuario_nombre: string | null
  created_at: string
}

const SEG_STYLE: Record<string, { bg: string; color: string }> = {
  'Contactar de nuevo': { bg: '#fffbeb', color: '#d97706' },
  'Sin respuesta':      { bg: '#f8fafc', color: '#64748b' },
  'Pago prometido':     { bg: '#f5f3ff', color: '#7c3aed' },
  'En mora':            { bg: '#fef2f2', color: '#dc2626' },
  'Gestión jurídica':   { bg: '#fff7ed', color: '#9a3412' },
}

const SEGUIMIENTOS_ABIERTOS = ['Contactar de nuevo', 'Sin respuesta', 'Pago prometido', 'En mora', 'Gestión jurídica'] as const
type SeguimientoFiltro = typeof SEGUIMIENTOS_ABIERTOS[number] | 'todos'

const hoy = new Date().toISOString().split('T')[0]
const enNDias = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Props ────────────────────────────────────────────────────
type Props = {
  modulo: AgendaModulo
  onVerEntidad?: (idEntidad: number, nombre: string) => void
}

// ── Helpers de carga ─────────────────────────────────────────
async function cargarRegistrosGolf(): Promise<RegistroAgenda[]> {
  const { data } = await dbGolf
    .from('bitacora_cobranza')
    .select('id, id_socio_fk, fecha_contacto, canal, respuesta, seguimiento, fecha_proximo_contacto, notas, usuario_nombre, created_at, cat_socios(nombre, apellido_paterno, apellido_materno)')
    .neq('seguimiento', 'Cerrado')
    .order('fecha_proximo_contacto', { ascending: true, nullsFirst: false })
  return ((data ?? []) as any[]).map(r => ({
    id:                    r.id,
    id_entidad:            r.id_socio_fk,
    nombre_entidad:        [r.cat_socios?.nombre, r.cat_socios?.apellido_paterno, r.cat_socios?.apellido_materno].filter(Boolean).join(' ') || '—',
    fecha_contacto:        r.fecha_contacto,
    canal:                 r.canal,
    respuesta:             r.respuesta,
    seguimiento:           r.seguimiento,
    fecha_proximo_contacto: r.fecha_proximo_contacto,
    notas:                 r.notas,
    usuario_nombre:        r.usuario_nombre,
    created_at:            r.created_at,
  }))
}

async function cargarRegistrosResidencial(): Promise<RegistroAgenda[]> {
  const { data } = await dbCtrl
    .from('bitacora_cobranza_res')
    .select('id, id_lote_fk, fecha_contacto, canal, respuesta, seguimiento, fecha_proximo_contacto, notas, usuario_nombre, created_at, cat_lotes(cve_lote, lote, manzana, secciones(nombre))')
    .neq('seguimiento', 'Cerrado')
    .order('fecha_proximo_contacto', { ascending: true, nullsFirst: false })
  return ((data ?? []) as any[]).map(r => {
    const l = r.cat_lotes
    const fallback = [l?.secciones?.nombre, l?.manzana ? `Mz ${l.manzana}` : null, l?.lote ? `L ${l.lote}` : null].filter(Boolean).join(' ') || `Lote #${r.id_lote_fk}`
    const nombre = l?.cve_lote ?? fallback
    return {
      id:                    r.id,
      id_entidad:            r.id_lote_fk,
      nombre_entidad:        nombre,
      fecha_contacto:        r.fecha_contacto,
      canal:                 r.canal,
      respuesta:             r.respuesta,
      seguimiento:           r.seguimiento,
      fecha_proximo_contacto: r.fecha_proximo_contacto,
      notas:                 r.notas,
      usuario_nombre:        r.usuario_nombre,
      created_at:            r.created_at,
    }
  })
}

async function cargarRegistrosHipico(): Promise<RegistroAgenda[]> {
  const { data } = await dbHip
    .from('bitacora_cobranza')
    .select('id, id_arrendatario_fk, fecha_contacto, canal, respuesta, seguimiento, fecha_proximo_contacto, notas, usuario_nombre, created_at, cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona)')
    .neq('seguimiento', 'Cerrado')
    .order('fecha_proximo_contacto', { ascending: true, nullsFirst: false })
  return ((data ?? []) as any[]).map(r => {
    const a = r.cat_arrendatarios
    const nombre = a?.tipo_persona === 'Moral' && a?.razon_social
      ? a.razon_social
      : [a?.nombre, a?.apellido_paterno].filter(Boolean).join(' ') || '—'
    return {
      id:                    r.id,
      id_entidad:            r.id_arrendatario_fk,
      nombre_entidad:        nombre,
      fecha_contacto:        r.fecha_contacto,
      canal:                 r.canal,
      respuesta:             r.respuesta,
      seguimiento:           r.seguimiento,
      fecha_proximo_contacto: r.fecha_proximo_contacto,
      notas:                 r.notas,
      usuario_nombre:        r.usuario_nombre,
      created_at:            r.created_at,
    }
  })
}

// ── Dedup: un registro por entidad (el más reciente) ─────────
function dedupPorEntidad(rows: RegistroAgenda[]): RegistroAgenda[] {
  const map = new Map<number, RegistroAgenda>()
  for (const r of rows) {
    if (!map.has(r.id_entidad)) map.set(r.id_entidad, r)
  }
  return Array.from(map.values()).sort((a, b) => {
    const fa = a.fecha_proximo_contacto ?? '9999-12-31'
    const fb = b.fecha_proximo_contacto ?? '9999-12-31'
    return fa.localeCompare(fb)
  })
}

// ── Componente ───────────────────────────────────────────────
export default function AgendaCobranza({ modulo, onVerEntidad }: Props) {
  const [rows, setRows]           = useState<RegistroAgenda[]>([])
  const [loading, setLoading]     = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroSeg, setFiltroSeg] = useState<SeguimientoFiltro>('todos')

  const load = useCallback(async () => {
    setLoading(true)
    const raw = modulo === 'golf'       ? await cargarRegistrosGolf()
              : modulo === 'residencial' ? await cargarRegistrosResidencial()
              :                            await cargarRegistrosHipico()
    setRows(dedupPorEntidad(raw))
    setLoading(false)
  }, [modulo])

  useEffect(() => { load() }, [load])

  // Filtros
  const filtrados = rows.filter(r => {
    if (filtroSeg !== 'todos' && r.seguimiento !== filtroSeg) return false
    if (busqueda && !r.nombre_entidad.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  // KPIs
  const kHoy     = rows.filter(r => r.fecha_proximo_contacto && r.fecha_proximo_contacto <= hoy).length
  const kSemana  = rows.filter(r => r.fecha_proximo_contacto && r.fecha_proximo_contacto > hoy && r.fecha_proximo_contacto <= enNDias(7)).length
  const kProm    = rows.filter(r => r.seguimiento === 'Pago prometido').length
  const kMora    = rows.filter(r => r.seguimiento === 'En mora' || r.seguimiento === 'Gestión jurídica').length
  const kTotal   = rows.length

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=900,height=600')
    if (!w) return
    const rowsHtml = filtrados.map(r => {
      const proxV  = r.fecha_proximo_contacto && r.fecha_proximo_contacto <= hoy
      const seg    = SEG_STYLE[r.seguimiento] ?? { bg: '#f8fafc', color: '#64748b' }
      return `<tr>
        <td>${r.nombre_entidad}</td>
        <td><span style="background:${seg.bg};color:${seg.color};padding:1px 6px;border-radius:10px;font-size:10px;font-weight:bold">${r.seguimiento}</span></td>
        <td style="color:${proxV ? '#dc2626' : '#334155'};font-weight:${proxV ? 'bold' : 'normal'}">${fmtFecha(r.fecha_proximo_contacto)}</td>
        <td>${r.canal}</td>
        <td>${r.respuesta ?? '—'}</td>
        <td>${fmtFecha(r.fecha_contacto)}</td>
      </tr>`
    }).join('')
    w.document.write(`<html><head><title>Agenda Cobranza</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin-bottom:4px}.sub{font-size:11px;color:#64748b;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;padding:6px 8px;border-bottom:2px solid #e2e8f0}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:11px}@media print{@page{margin:1.5cm}}</style>
    </head><body>
    <h2>Agenda de Seguimiento de Cobranza</h2>
    <div class="sub">Generado: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })} · ${filtrados.length} registros</div>
    <table><thead><tr><th>Nombre</th><th>Seguimiento</th><th>Próx. contacto</th><th>Canal</th><th>Último comentario</th><th>Último contacto</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table>
    </body></html>`)
    w.document.close(); w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  const handleExcel = async () => {
    const xlsx = await import('xlsx')
    const data = filtrados.map(r => ({
      'Nombre':             r.nombre_entidad,
      'Seguimiento':        r.seguimiento,
      'Próx. contacto':     r.fecha_proximo_contacto ?? '',
      'Canal':              r.canal,
      'Último comentario':  r.respuesta ?? '',
      'Último contacto':    r.fecha_contacto,
      'Registrado por':     r.usuario_nombre ?? '',
    }))
    const ws = xlsx.utils.json_to_sheet(data)
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'Agenda')
    xlsx.writeFile(wb, `Agenda-Cobranza_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total abiertos',    value: kTotal,  color: '#2563eb', bg: '#eff6ff' },
          { label: 'Contactar hoy',     value: kHoy,    color: '#dc2626', bg: '#fef2f2' },
          { label: 'Esta semana',       value: kSemana, color: '#d97706', bg: '#fffbeb' },
          { label: 'Pago prometido',    value: kProm,   color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'En mora / Jurídico',value: kMora,   color: '#9a3412', bg: '#fff7ed' },
        ].map(k => (
          <div key={k.label} style={{ flex: '1 1 100px', minWidth: 100, background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Búsqueda */}
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            style={{ width: '100%', padding: '7px 10px 7px 28px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={11} /></button>}
        </div>

        {/* Filtro seguimiento */}
        <select value={filtroSeg} onChange={e => setFiltroSeg(e.target.value as SeguimientoFiltro)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="todos">Todos los seguimientos</option>
          {SEGUIMIENTOS_ABIERTOS.map(s => <option key={s}>{s}</option>)}
        </select>

        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={load} style={btnGhost}><RefreshCw size={12} /></button>
          <button onClick={handlePrint} style={btnGhost}><Printer size={12} /> Imprimir</button>
          <button onClick={handleExcel} style={btnGhost}><Download size={12} /> Excel</button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', fontSize: 13 }}>Cargando agenda…</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
          <Calendar size={28} style={{ color: '#cbd5e1', margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Sin registros de seguimiento abiertos</div>
          <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>Todos los seguimientos están cerrados o aún no se han registrado</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Nombre', 'Seguimiento', 'Próx. contacto', 'Último canal', 'Comentario', 'Ult. contacto'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
                {onVerEntidad && <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(r => {
                const seg        = SEG_STYLE[r.seguimiento] ?? { bg: '#f8fafc', color: '#64748b' }
                const proxFecha  = r.fecha_proximo_contacto
                const proxVenc   = proxFecha && proxFecha <= hoy
                const proxSemana = proxFecha && proxFecha > hoy && proxFecha <= enNDias(7)
                return (
                  <tr key={r.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: '#1e293b' }}>{r.nombre_entidad}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: seg.bg, color: seg.color }}>
                        {r.seguimiento}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      {proxFecha ? (
                        <span style={{
                          fontWeight: proxVenc || proxSemana ? 700 : 400,
                          color: proxVenc ? '#dc2626' : proxSemana ? '#d97706' : '#334155',
                        }}>
                          {proxVenc && '⚠ '}{fmtFecha(proxFecha)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#64748b' }}>{r.canal}</td>
                    <td style={{ padding: '9px 10px', color: '#475569', maxWidth: 220 }}>
                      {r.respuesta
                        ? <span title={r.respuesta} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>"{r.respuesta}"</span>
                        : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#94a3b8', whiteSpace: 'nowrap', fontSize: 11 }}>{fmtFecha(r.fecha_contacto)}</td>
                    {onVerEntidad && (
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <button
                          onClick={() => onVerEntidad(r.id_entidad, r.nombre_entidad)}
                          style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#2563eb', cursor: 'pointer' }}>
                          Ver →
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const btnGhost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '5px 10px', fontSize: 11, fontWeight: 600,
  border: '1px solid #e2e8f0', borderRadius: 7,
  background: '#fff', color: '#64748b', cursor: 'pointer',
}
