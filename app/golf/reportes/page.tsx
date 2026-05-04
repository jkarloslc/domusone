'use client'
import { useState } from 'react'
import { ChevronLeft, MapPin, CreditCard, FileText, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import ReporteGolfAccesos      from '@/app/reportes/ReporteGolfAccesos'
import ReporteGolfEstadoCuenta from '@/app/reportes/ReporteGolfEstadoCuenta'
import ReporteGolfCobranza     from '@/app/reportes/ReporteGolfCobranza'

const REPORTES = [
  {
    key:   'accesos',
    label: 'Salidas al Campo',
    desc:  'Registro de rondas por socio y categoría, con detalle de acompañantes',
    icon:  MapPin,
    color: '#16a34a',
    bg:    '#f0fdf4',
  },
  {
    key:   'cobranza',
    label: 'Cobranza / CXC',
    desc:  'Cuotas por categoría, tipo y status con resumen y detalle',
    icon:  CreditCard,
    color: '#2563eb',
    bg:    '#eff6ff',
  },
  {
    key:   'estado-cuenta',
    label: 'Estado de Cuenta',
    desc:  'Cuotas y recibos por socio en un período',
    icon:  FileText,
    color: '#7c3aed',
    bg:    '#f5f3ff',
  },
]

export default function GolfReportesPage() {
  const [activo, setActivo] = useState<string | null>(null)

  const reporte = REPORTES.find(r => r.key === activo)

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
            <Link href="/golf" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span>/</span>
            {activo ? (
              <>
                <button onClick={() => setActivo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: 12 }}>
                  Reportes
                </button>
                <span>/</span>
                <span style={{ color: '#475569', fontWeight: 500 }}>{reporte?.label}</span>
              </>
            ) : (
              <span style={{ color: '#475569', fontWeight: 500 }}>Reportes</span>
            )}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            {activo ? reporte?.label : 'Reportes Club Golf'}
          </h1>
          {!activo && (
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              Selecciona un reporte para consultar
            </p>
          )}
        </div>
        {activo && (
          <button className="btn-ghost" onClick={() => setActivo(null)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart2 size={13} /> Todos los reportes
          </button>
        )}
      </div>

      {/* Índice de reportes */}
      {!activo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {REPORTES.map(r => {
            const Icon = r.icon
            return (
              <button
                key={r.key}
                onClick={() => setActivo(r.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '20px 22px', borderRadius: 14, cursor: 'pointer',
                  background: r.bg, border: `1.5px solid ${r.color}22`,
                  textAlign: 'left', outline: 'none', transition: 'all 0.15s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${r.color}22`
                  ;(e.currentTarget as HTMLElement).style.borderColor = r.color + '55'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = r.color + '22'
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={20} style={{ color: r.color }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{r.desc}</div>
                <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: r.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Consultar →
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Reporte activo */}
      {activo === 'accesos'       && <ReporteGolfAccesos />}
      {activo === 'cobranza'      && <ReporteGolfCobranza />}
      {activo === 'estado-cuenta' && <ReporteGolfEstadoCuenta />}
    </div>
  )
}
