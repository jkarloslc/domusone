'use client'
import { useState } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { X, Search, RefreshCw, Printer } from 'lucide-react'
import { type Cargo, fmt, STATUS_CARGO_COLOR } from './types'
import ModalShell from '@/components/ui/ModalShell'

type Recibo = {
  id: number; folio: string | null; fecha_recibo: string; fecha_pago: string | null
  monto: number; activo: boolean; propietario: string | null
}

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function EstadoCuenta({ onClose }: { onClose: () => void }) {
  const [lotes, setLotes]     = useState<any[]>([])
  const [search, setSearch]   = useState('')
  const [loteId, setLoteId]   = useState<number | null>(null)
  const [loteNombre, setLoteNombre] = useState('')
  const [cargos, setCargos]   = useState<Cargo[]>([])
  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [loading, setLoading] = useState(false)

  const buscar = async () => {
    if (!search.trim()) return
    const { data } = await dbCat.from('lotes').select('id, cve_lote, lote, tipo_lote')
      .or(`cve_lote.ilike.%${search}%`).limit(10)
    setLotes(data ?? [])
  }

  const cargarEdoCuenta = async (id: number, nombre: string) => {
    setLoteId(id); setLoteNombre(nombre); setLotes([]); setSearch('')
    setLoading(true)
    const [{ data: c }, { data: r }] = await Promise.all([
      dbCtrl.from('cargos').select('*').eq('id_lote_fk', id).order('fecha_cargo', { ascending: false }),
      dbCtrl.from('recibos').select('*').eq('id_lote_fk', id).order('fecha_recibo', { ascending: false }),
    ])
    setCargos(c as Cargo[] ?? [])
    setRecibos(r as Recibo[] ?? [])
    setLoading(false)
  }

  const totalCargado  = cargos.reduce((a, c) => a + c.monto, 0)
  const totalPagado   = cargos.reduce((a, c) => a + (c.monto_pagado ?? 0), 0)
  const saldoTotal    = cargos.reduce((a, c) => a + (c.saldo ?? 0), 0)
  const totalRecibos  = recibos.filter(r => r.activo).reduce((a, r) => a + r.monto, 0)

  const pendientes = cargos.filter(c => c.status === 'Pendiente' || c.status === 'Parcial').length

  const handlePrint = () => {
    const style = document.createElement('style')
    style.id = 'print-edo'
    style.innerHTML = `
      @media print {
        body * { visibility: hidden !important; }
        #edo-print, #edo-print * { visibility: visible !important; }
        #edo-print { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; padding: 20px !important; }
        table { font-size: 11px !important; border-collapse: collapse !important; width: 100% !important; }
        th, td { padding: 5px 8px !important; border: 1px solid #e2e8f0 !important; }
        @page { size: A4; margin: 1.5cm; }
      }
    `
    document.head.appendChild(style)
    const area = document.getElementById('edo-content')
    if (area) area.id = 'edo-print'
    window.print()
    setTimeout(() => {
      document.getElementById('print-edo')?.remove()
      const a = document.getElementById('edo-print')
      if (a) a.id = 'edo-content'
    }, 1500)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '92vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>Estado de Cuenta</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {loteId && <button className="btn-secondary" onClick={handlePrint} style={{ fontSize: 12 }}><Printer size={13} /> Imprimir</button>}
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(92vh - 80px)' }}>

          {/* Buscador */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">Buscar Lote</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Escribe la clave del lote…" value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} />
              <button className="btn-secondary" onClick={buscar}><Search size={13} /> Buscar</button>
            </div>
            {lotes.length > 0 && (
              <div className="card" style={{ marginTop: 6, padding: '4px 0' }}>
                {lotes.map((l: any) => (
                  <button key={l.id} onClick={() => cargarEdoCuenta(l.id, l.cve_lote ?? `#${l.lote}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--blue)' }}>{l.cve_lote ?? `#${l.lote}`}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.tipo_lote}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contenido del estado de cuenta */}
          {loteId && (
            <div id="edo-content">
              {/* Encabezado del lote */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '14px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--blue)' }}>{loteNombre}</div>
                  {pendientes > 0 && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>⚠ {pendientes} cargo(s) pendiente(s) de pago</div>}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                  <Stat label="Total Cargado" value={fmt(totalCargado)} color="var(--text-primary)" />
                  <Stat label="Total Pagado"  value={fmt(totalPagado)}  color="#15803d" />
                  <Stat label="Saldo"         value={fmt(saldoTotal)}   color={saldoTotal > 0 ? '#dc2626' : '#15803d'} bold />
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
                </div>
              ) : (
                <>
                  {/* Tabla de cargos */}
                  <SectionTitle>Cargos / Adeudos</SectionTitle>
                  {cargos.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: '#f8fafc', borderRadius: 8, marginBottom: 20 }}>Sin cargos registrados</div>
                  ) : (
                    <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Período</th>
                            <th>Fecha</th>
                            <th style={{ textAlign: 'right' }}>Cargo</th>
                            <th style={{ textAlign: 'right' }}>Pagado</th>
                            <th style={{ textAlign: 'right' }}>Saldo</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cargos.map(c => {
                            const sc = STATUS_CARGO_COLOR[c.status] ?? STATUS_CARGO_COLOR['Pendiente']
                            return (
                              <tr key={c.id}>
                                <td style={{ fontWeight: 500 }}>{c.concepto}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                  {c.periodo_mes && c.periodo_anio ? `${c.periodo_mes} ${c.periodo_anio}` : '—'}
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                  {fmtFecha(c.fecha_cargo)}
                                </td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.monto)}</td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>
                                  {c.monto_pagado > 0 ? fmt(c.monto_pagado) : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: c.saldo > 0 ? '#dc2626' : '#15803d' }}>
                                  {fmt(c.saldo)}
                                </td>
                                <td>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                                    {c.status}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#f8fafc' }}>
                            <td colSpan={3} style={{ fontWeight: 700, padding: '10px 14px', fontSize: 13 }}>TOTALES</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCargado)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 14px', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalPagado)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 14px', color: saldoTotal > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(saldoTotal)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Tabla de recibos */}
                  <SectionTitle>Recibos / Pagos Registrados</SectionTitle>
                  {recibos.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: '#f8fafc', borderRadius: 8 }}>Sin recibos registrados</div>
                  ) : (
                    <div className="card" style={{ overflow: 'hidden' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Folio</th>
                            <th>Fecha Recibo</th>
                            <th>Fecha Pago</th>
                            <th>Propietario</th>
                            <th style={{ textAlign: 'right' }}>Monto</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recibos.map(r => (
                            <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.5 }}>
                              <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio ?? `#${r.id}`}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha_recibo)}</td>
                              <td style={{ fontSize: 12, color: r.fecha_pago ? '#15803d' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {r.fecha_pago ? fmtFecha(r.fecha_pago) : 'Pendiente'}
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.propietario ?? '—'}</td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(r.monto)}</td>
                              <td>
                                <span className={`badge ${r.activo ? 'badge-vendido' : 'badge-bloqueado'}`} style={{ fontSize: 10 }}>
                                  {r.activo ? 'Activo' : 'Cancelado'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#f8fafc' }}>
                            <td colSpan={4} style={{ fontWeight: 700, padding: '10px 14px', fontSize: 13 }}>TOTAL RECIBIDO</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 14px', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalRecibos)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '2px solid #dbeafe' }}>
    {children}
  </div>
)

const Stat = ({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) => (
  <div style={{ textAlign: 'right' }}>
    <div style={{ fontSize: bold ? 18 : 16, fontFamily: 'var(--font-display)', fontWeight: bold ? 700 : 600, color }}>{value}</div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
  </div>
)
