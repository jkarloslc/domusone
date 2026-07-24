'use client'
import { useState, useEffect, useCallback } from 'react'
import { Printer } from 'lucide-react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Categoria = { id: number; nombre: string }

type Socio = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  id_categoria_fk: number | null
}

type Espacio = { id: number; nombre: string }

type AccesoRaw = {
  id: number
  fecha_entrada: string
  fecha_salida: string | null
  hoyo_inicio: number | null
  observaciones: string | null
  id_socio_fk: number | null
  folio_ticket_pos: string | null
  cat_socios: {
    numero_socio: string | null
    nombre: string
    apellido_paterno: string | null
    apellido_materno: string | null
    cat_categorias_socios: { nombre: string } | null
  } | null
  cat_espacios_deportivos: { nombre: string } | null
}

type Acomp = {
  id_acceso_fk: number
  nombre: string
  es_externo: boolean
  origen_pago: 'PASE' | 'GREEN_FEE' | 'INTERCAMBIO' | null
  club_origen: string | null
}

// Venta POS (centro "Green Fees") ligada al folio capturado en la salida
type VentaGF = {
  id: number
  folio_dia: number
  fecha: string
  total: number
  nombre_cliente: string | null
  status: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNombreSocio(s: AccesoRaw['cat_socios']): string {
  if (!s) return '—'
  return [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
}

// Zona horaria fija de la operación (Balvanera, Querétaro = Ciudad de México, UTC-6
// sin horario de verano desde 2022) — no depender de la TZ del dispositivo/navegador.
const TZ_MX = 'America/Mexico_City'

function fmtFecha(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TZ_MX,
  })
}

function fmtHora(d: string): string {
  return new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: TZ_MX })
}

function tipoAcomp(a: Acomp): 'Familiar' | 'Invitado · Pase' | 'Green Fee' | 'Intercambio' {
  if (!a.es_externo) return 'Familiar'
  if (a.origen_pago === 'GREEN_FEE') return 'Green Fee'
  if (a.origen_pago === 'INTERCAMBIO') return 'Intercambio'
  return 'Invitado · Pase'
}

const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  'Familiar':       { bg: '#eff6ff', color: '#1d4ed8' },
  'Invitado · Pase':{ bg: '#fffbeb', color: '#d97706' },
  'Green Fee':      { bg: '#f0fdf4', color: '#16a34a' },
  'Intercambio':    { bg: '#fdf4ff', color: '#a21caf' },
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ReporteGolfAccesos() {
  const hoy = new Date()
  const hace30 = new Date(hoy)
  hace30.setDate(hoy.getDate() - 30)

  const [fechaDesde, setFechaDesde] = useState(hace30.toISOString().split('T')[0])
  const [fechaHasta, setFechaHasta] = useState(hoy.toISOString().split('T')[0])

  // Catálogos
  const [categorias,  setCategorias]  = useState<Categoria[]>([])
  const [espacios,    setEspacios]    = useState<Espacio[]>([])
  const [socios,      setSocios]      = useState<Socio[]>([])

  // Filtros
  const [filtroCat,     setFiltroCat]     = useState<number | ''>('')
  const [filtroEspacio, setFiltroEspacio] = useState<number | ''>('')
  const [filtroSocio,   setFiltroSocio]   = useState<number | ''>('')

  // Datos
  const [accesos,    setAccesos]    = useState<AccesoRaw[]>([])
  const [acompsMap,  setAcompsMap]  = useState<Record<number, Acomp[]>>({})
  const [ventasGFMap, setVentasGFMap] = useState<Record<string, VentaGF>>({})
  const [loading,    setLoading]    = useState(false)
  const [buscado,    setBuscado]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Cargar catálogos al montar
  useEffect(() => {
    dbGolf
      .from('cat_categorias_socios')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }: any) => setCategorias(data ?? []))

    dbGolf
      .from('cat_espacios_deportivos')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }: any) => setEspacios(data ?? []))

    dbGolf
      .from('cat_socios')
      .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, id_categoria_fk')
      .order('numero_socio')
      .then(({ data }: any) => setSocios(data ?? []))
  }, [])

  // Socios filtrados por categoría para el select individual, ordenados por nombre A-Z ascendente
  const sociosFiltrados = (
    filtroCat !== ''
      ? socios.filter(s => s.id_categoria_fk === filtroCat)
      : socios
  ).slice().sort((a, b) => {
    const nombreA = [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
    const nombreB = [b.nombre, b.apellido_paterno].filter(Boolean).join(' ')
    return nombreA.localeCompare(nombreB)
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    setBuscado(true)
    setError(null)

    try {
      // 1. Si hay filtro de categoría, obtener primero los IDs de socios
      let socioIds: number[] | null = null
      if (filtroCat !== '') {
        const { data: sociosData, error: sociosErr } = await (dbGolf as any)
          .from('cat_socios')
          .select('id')
          .eq('id_categoria_fk', filtroCat)

        if (sociosErr) throw sociosErr
        socioIds = (sociosData ?? []).map((s: any) => s.id)

        // Si no hay socios en esa categoría, resultado vacío
        if (socioIds!.length === 0) {
          setAccesos([])
          setAcompsMap({})
          setLoading(false)
          return
        }
      }

      // 2. Query principal a ctrl_accesos
      let q = (dbGolf as any)
        .from('ctrl_accesos')
        .select(
          'id, fecha_entrada, fecha_salida, hoyo_inicio, observaciones, id_socio_fk, folio_ticket_pos, ' +
          'cat_socios(numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre)), ' +
          'cat_espacios_deportivos(nombre)'
        )
        .gte('fecha_entrada', new Date(fechaDesde + 'T00:00:00').toISOString())
        .lte('fecha_entrada', new Date(fechaHasta + 'T23:59:59').toISOString())
        .order('fecha_entrada', { ascending: false })

      if (socioIds !== null) q = q.in('id_socio_fk', socioIds)
      if (filtroSocio !== '') q = q.eq('id_socio_fk', filtroSocio)
      if (filtroEspacio !== '') q = q.eq('id_espacio_fk', filtroEspacio)

      const { data: accesosData, error: accErr } = await q
      if (accErr) throw accErr

      const rows: AccesoRaw[] = accesosData ?? []

      // 3. Ordenar en cliente: por categoría (alfabético) luego fecha_entrada desc
      rows.sort((a, b) => {
        const catA = a.cat_socios?.cat_categorias_socios?.nombre ?? ''
        const catB = b.cat_socios?.cat_categorias_socios?.nombre ?? ''
        if (catA < catB) return -1
        if (catA > catB) return 1
        // misma categoría: fecha descendente
        return b.fecha_entrada.localeCompare(a.fecha_entrada)
      })

      setAccesos(rows)

      // 4. Traer acompañantes de todos los accesos resultantes
      if (rows.length > 0) {
        const ids = rows.map(r => r.id)
        const { data: acompsData, error: acompErr } = await (dbGolf as any)
          .from('ctrl_acceso_acomp')
          .select('id_acceso_fk, nombre, es_externo, origen_pago, club_origen')
          .in('id_acceso_fk', ids)

        if (acompErr) throw acompErr

        const mapa: Record<number, Acomp[]> = {}
        ;(acompsData ?? []).forEach((a: Acomp) => {
          if (!mapa[a.id_acceso_fk]) mapa[a.id_acceso_fk] = []
          mapa[a.id_acceso_fk].push(a)
        })
        setAcompsMap(mapa)
      } else {
        setAcompsMap({})
      }

      // 5. Ligar el folio de ticket POS capturado en cada salida Green Fee con la venta real —
      // el folio guardado es el folio del ticket (ctrl_ventas.id, el número grande impreso),
      // no el "folio del día" (que reinicia diario por centro), así que es una llave única directa.
      const idsFolio = Array.from(new Set(
        rows.map(r => r.folio_ticket_pos).filter(Boolean).map(f => Number(f)).filter(n => Number.isInteger(n))
      ))
      if (idsFolio.length > 0) {
        const { data: ventasData, error: ventasErr } = await (dbGolf as any)
          .from('ctrl_ventas')
          .select('id, folio_dia, fecha, total, nombre_cliente, status')
          .in('id', idsFolio)

        if (ventasErr) throw ventasErr

        const vMap: Record<string, VentaGF> = {}
        ;(ventasData ?? []).forEach((v: VentaGF) => { vMap[String(v.id)] = v })
        setVentasGFMap(vMap)
      } else {
        setVentasGFMap({})
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error al consultar')
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta, filtroCat, filtroEspacio, filtroSocio])

  // Abre el ticket POS de la venta Green Fee ligada a la salida (mismo formato que en el POS de Golf)
  const abrirTicketPOS = async (venta: VentaGF) => {
    const [{ data: det }, { data: pagos }, { data: cfg }] = await Promise.all([
      dbGolf.from('ctrl_ventas_det').select('concepto, cantidad, precio_unitario, iva, total').eq('id_venta_fk', venta.id),
      dbGolf.from('ctrl_ventas_pagos').select('forma_nombre, monto').eq('id_venta_fk', venta.id),
      dbGolf.from('cfg_pos').select('*').single(),
    ])
    const ticketData = {
      id: venta.id,
      folio_dia: venta.folio_dia,
      fecha: venta.fecha,
      cliente: venta.nombre_cliente,
      cajero: '—',
      centro: 'Green Fees',
      razon_social: (cfg as any)?.razon_social ?? 'Balvanera Golf, Polo & Country Club',
      municipio: (cfg as any)?.municipio ?? '',
      direccion: (cfg as any)?.direccion ?? '',
      rfc: (cfg as any)?.rfc ?? '',
      telefono: (cfg as any)?.telefono ?? '',
      leyenda: (cfg as any)?.leyenda_ticket ?? '¡Gracias por su visita!',
      subtotal: venta.total - (det ?? []).reduce((a: number, d: any) => a + (d.iva ?? 0), 0),
      iva: (det ?? []).reduce((a: number, d: any) => a + (d.iva ?? 0), 0),
      total: venta.total,
      pagos: (pagos ?? []).map((p: any) => ({ forma: p.forma_nombre, monto: p.monto })),
      items: det ?? [],
    }
    const url = `/ticket-golf.html?data=${encodeURIComponent(JSON.stringify(ticketData))}`
    window.open(url, '_blank', 'width=400,height=700')
  }

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------
  const totalAcomps = Object.values(acompsMap).reduce((sum, arr) => sum + arr.length, 0)

  const sociosUnicosSet = new Set(accesos.map(a => a.id_socio_fk).filter(Boolean))
  const sociosUnicos = sociosUnicosSet.size

  const diasConAcceso = new Set(accesos.map(a => a.fecha_entrada.split('T')[0])).size

  // ---------------------------------------------------------------------------
  // Resumen por categoría
  // ---------------------------------------------------------------------------
  const porCategoria: Record<string, number> = {}
  for (const a of accesos) {
    const cat = a.cat_socios?.cat_categorias_socios?.nombre ?? 'Sin categoría'
    porCategoria[cat] = (porCategoria[cat] ?? 0) + 1
  }

  // ---------------------------------------------------------------------------
  // Agrupación visual: detectar cambio de categoría
  // ---------------------------------------------------------------------------
  const COLS = 8 // número de columnas en la tabla detalle

  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Filtros                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Fecha desde
          </label>
          <input
            className="input"
            type="date"
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Fecha hasta
          </label>
          <input
            className="input"
            type="date"
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Categoría de socio
          </label>
          <select
            className="input"
            value={filtroCat}
            onChange={e => {
              setFiltroCat(e.target.value ? Number(e.target.value) : '')
              setFiltroSocio('')
            }}
            style={{ fontSize: 12, minWidth: 180 }}
          >
            <option value="">Todas</option>
            {categorias.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Espacio deportivo
          </label>
          <select
            className="input"
            value={filtroEspacio}
            onChange={e => setFiltroEspacio(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 160 }}
          >
            <option value="">Todos</option>
            {espacios.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Socio
          </label>
          <select
            className="input"
            value={filtroSocio}
            onChange={e => setFiltroSocio(e.target.value ? Number(e.target.value) : '')}
            style={{ fontSize: 12, minWidth: 220 }}
          >
            <option value="">Todos</option>
            {sociosFiltrados.map(s => (
              <option key={s.id} value={s.id}>
                {s.numero_socio ? `${s.numero_socio} — ` : ''}
                {[s.nombre, s.apellido_paterno].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Barra de acción                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {buscado && !loading && (
          <PrintBar
            title="Accesos-Golf"
            count={accesos.length}
            reportTitle="Accesos al Campo — Club Golf"
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ padding: '12px 16px', color: '#dc2626', background: '#fef2f2', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Placeholder inicial */}
      {!buscado && !error && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Aplica filtros y haz clic en Consultar
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Resultados                                                           */}
      {/* ------------------------------------------------------------------ */}
      {buscado && !loading && !error && (
        <div id="reporte-print-area">

          {/* KPIs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total rondas',       value: accesos.length,  color: '#2563eb', bg: '#eff6ff' },
              { label: 'Socios únicos',       value: sociosUnicos,    color: '#7c3aed', bg: '#f5f3ff' },
              { label: 'Total acompañantes',  value: totalAcomps,     color: '#d97706', bg: '#fffbeb' },
              { label: 'Días con accesos',    value: diasConAcceso,   color: '#0891b2', bg: '#ecfeff' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 140px', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Resumen por categoría */}
          {accesos.length > 0 && Object.keys(porCategoria).length > 0 && (
            <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                marginBottom: 10,
              }}>
                Rondas por categoría
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
                {Object.entries(porCategoria)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([cat, cnt]) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)', minWidth: 120 }}>{cat}</span>
                      <span style={{
                        fontWeight: 700,
                        color: '#2563eb',
                        fontSize: 14,
                        minWidth: 28,
                        textAlign: 'right',
                      }}>
                        {cnt}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tabla detalle */}
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
            Detalle ({accesos.length} {accesos.length === 1 ? 'registro' : 'registros'})
          </h3>

          {accesos.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Sin accesos con los filtros seleccionados
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table
                id="reporte-table"
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
              >
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    {['Fecha', 'Hora entrada', 'Hora salida', 'Categoría', 'Socio', 'Espacio', 'Hoyo', 'Status', 'Ticket POS', 'Acompañantes'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '9px 12px',
                          textAlign: 'left',
                          fontWeight: 600,
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          letterSpacing: '0.05em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accesos.map((a, i) => {
                    const catActual = a.cat_socios?.cat_categorias_socios?.nombre ?? 'Sin categoría'
                    const catAnterior = i > 0
                      ? (accesos[i - 1].cat_socios?.cat_categorias_socios?.nombre ?? 'Sin categoría')
                      : null
                    const mostrarHeaderCat = catAnterior === null || catActual !== catAnterior

                    const acomps = acompsMap[a.id] ?? []
                    const enCampo = !a.fecha_salida

                    const socioLabel = (() => {
                      const s = a.cat_socios
                      if (!s) return '—'
                      const num = s.numero_socio ? `#${s.numero_socio}` : ''
                      const nombre = [s.nombre, s.apellido_paterno].filter(Boolean).join(' ')
                      return num ? `${nombre} (${num})` : nombre
                    })()

                    return (
                      <>
                        {/* Header de categoría */}
                        {mostrarHeaderCat && (
                          <tr key={`cat-${catActual}-${i}`}>
                            <td
                              colSpan={10}
                              style={{
                                background: '#f1f5f9',
                                fontWeight: 700,
                                fontSize: 11,
                                color: '#475569',
                                textTransform: 'uppercase',
                                letterSpacing: '.06em',
                                padding: '6px 12px',
                                borderBottom: '1px solid var(--border)',
                                borderTop: i > 0 ? '2px solid #cbd5e1' : undefined,
                              }}
                            >
                              {catActual}
                            </td>
                          </tr>
                        )}

                        {/* Fila de acceso */}
                        <tr
                          key={a.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)',
                          }}
                        >
                          {/* Fecha */}
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                            {fmtFecha(a.fecha_entrada)}
                          </td>
                          {/* Hora entrada */}
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                            {fmtHora(a.fecha_entrada)}
                          </td>
                          {/* Hora salida */}
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: a.fecha_salida ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                            {a.fecha_salida ? fmtHora(a.fecha_salida) : '—'}
                          </td>
                          {/* Categoría */}
                          <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>
                            {catActual}
                          </td>
                          {/* Socio */}
                          <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>
                            {socioLabel}
                          </td>
                          {/* Espacio */}
                          <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>
                            {a.cat_espacios_deportivos?.nombre ?? '—'}
                          </td>
                          {/* Hoyo */}
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                            {a.hoyo_inicio ?? '—'}
                          </td>
                          {/* Status */}
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              display: 'inline-block',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: enCampo ? '#eff6ff' : '#f0fdf4',
                              color: enCampo ? '#1d4ed8' : '#16a34a',
                              whiteSpace: 'nowrap',
                            }}>
                              {enCampo ? 'En campo' : 'Completado'}
                            </span>
                          </td>
                          {/* Ticket POS (Green Fee) */}
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {(() => {
                              if (!a.folio_ticket_pos) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                              const venta = ventasGFMap[String(a.folio_ticket_pos)]
                              if (!venta) {
                                return (
                                  <span title="No se encontró ese ticket en las ventas del POS de Green Fees" style={{ fontSize: 11, fontWeight: 600, color: '#d97706' }}>
                                    #{String(a.folio_ticket_pos).padStart(6, '0')} ⚠
                                  </span>
                                )
                              }
                              return (
                                <button
                                  onClick={() => abrirTicketPOS(venta)}
                                  title={`Ver ticket · ${venta.nombre_cliente ?? ''} · $${venta.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 600,
                                    color: venta.status === 'CANCELADA' ? '#dc2626' : '#16a34a',
                                    background: venta.status === 'CANCELADA' ? '#fef2f2' : '#f0fdf4',
                                    border: 'none', borderRadius: 999, padding: '3px 8px', cursor: 'pointer',
                                  }}
                                >
                                  <Printer size={10} /> #{String(venta.id).padStart(6, '0')}
                                  {venta.status === 'CANCELADA' && ' (cancelado)'}
                                </button>
                              )
                            })()}
                          </td>
                          {/* Acompañantes */}
                          <td style={{ padding: '8px 12px', maxWidth: 260 }}>
                            {acomps.length === 0 ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {acomps.map((ac, ai) => {
                                  const tipo = tipoAcomp(ac)
                                  const bc = BADGE_COLORS[tipo]
                                  return (
                                    <span
                                      key={ai}
                                      title={tipo}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: 10,
                                        padding: '2px 6px',
                                        borderRadius: 999,
                                        background: bc.bg,
                                        color: bc.color,
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {ac.nombre}
                                      <span style={{
                                        fontSize: 9,
                                        opacity: 0.8,
                                        borderLeft: `1px solid ${bc.color}`,
                                        paddingLeft: 4,
                                        marginLeft: 2,
                                      }}>
                                        {tipo}
                                      </span>
                                      {tipo === 'Intercambio' && ac.club_origen && (
                                        <span style={{
                                          fontSize: 9,
                                          opacity: 0.85,
                                          borderLeft: `1px solid ${bc.color}`,
                                          paddingLeft: 4,
                                          marginLeft: 2,
                                        }}>
                                          {ac.club_origen}
                                        </span>
                                      )}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
