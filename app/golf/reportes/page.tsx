'use client'
import { useState } from 'react'
import { MapPin, CreditCard, FileText, BarChart2, Award, ClipboardCheck, Warehouse } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ReporteGolfAccesos         from '@/app/reportes/ReporteGolfAccesos'
import ReporteGolfEstadoCuenta    from '@/app/reportes/ReporteGolfEstadoCuenta'
import ReporteGolfCobranza        from '@/app/reportes/ReporteGolfCobranza'
import ReporteHipicoServicios     from '@/app/reportes/ReporteHipicoServicios'
import ReporteMiembrosFederados   from '@/app/reportes/ReporteMiembrosFederados'
import ReporteGolfAuditoriaSlots  from '@/app/reportes/ReporteGolfAuditoriaSlots'
import ReporteGolfSlotsOcupacion  from '@/app/reportes/ReporteGolfSlotsOcupacion'

const REPORTES = [
  {
    key:   'accesos',
    label: 'Salidas al Campo',
    desc:  'Registro de rondas por socio y categoría, con detalle de acompañantes',
    icon:  MapPin,
    color: '#267F56',
    bg:    '#F4F5F7',
  },
  {
    key:   'cobranza',
    label: 'Cobranza / CXC',
    desc:  'Cuotas por categoría, tipo y status con resumen y detalle',
    icon:  CreditCard,
    color: '#1C1D21',
    bg:    '#F4F5F7',
  },
  {
    key:   'estado-cuenta',
    label: 'Estado de Cuenta',
    desc:  'Cuotas y recibos por socio en un período',
    icon:  FileText,
    color: '#6B4E79',
    bg:    '#F4F5F7',
  },
  {
    key:   'caballos-servicios',
    label: 'Caballos y Servicios',
    desc:  'Desglose por caballo y tipo de servicio, con filtros por fechas, caballo y tipo',
    icon:  BarChart2,
    color: '#7A4B0C',
    bg:    '#F4F5F7',
  },
  {
    key:   'miembros-federados',
    label: 'Miembros Federados',
    desc:  'Socios inscritos a la Federación Mexicana de Golf por período (año)',
    icon:  Award,
    color: '#B5761A',
    bg:    '#F4F5F7',
  },
  {
    key:   'slots-ocupacion',
    label: 'Ocupación de Slots / Cajones',
    desc:  'Status de cada cajón con socio y familiar ocupante, tipo, marca y modelo del carrito',
    icon:  Warehouse,
    color: '#267F56',
    bg:    '#F4F5F7',
  },
  {
    key:   'auditoria-slots',
    label: 'Auditoría de Slots',
    desc:  'Hoja de verificación: ocupación según sistema contra levantamiento físico en motor lobby',
    icon:  ClipboardCheck,
    color: '#178A80',
    bg:    '#F4F5F7',
  },
]

export default function GolfReportesPage() {
  const [activo, setActivo] = useState<string | null>(null)

  const reporte = REPORTES.find(r => r.key === activo)

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        onBack={activo ? () => setActivo(null) : undefined}
        backHref={!activo ? '/golf' : undefined}
        title={activo ? (reporte?.label ?? '') : 'Reportes Club Golf'}
        subtitle={!activo ? 'Selecciona un reporte para consultar' : undefined}
        actions={activo ? (
          <button className="btn-ghost" onClick={() => setActivo(null)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart2 size={13} /> Todos los reportes
          </button>
        ) : undefined}
      />

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
                  background: '#fff', border: '1px solid #E6E8EB',
                  textAlign: 'left', outline: 'none', transition: 'all 0.15s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(28,29,33,0.08)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = '#19D3C5'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = '#E6E8EB'
                }}
              >
                <div className="icon-chip" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={20} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#26282D', marginBottom: 6 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: '#62666E', lineHeight: 1.5 }}>{r.desc}</div>
                <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: r.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Consultar →
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Reporte activo */}
      {activo === 'accesos'            && <ReporteGolfAccesos />}
      {activo === 'cobranza'           && <ReporteGolfCobranza />}
      {activo === 'estado-cuenta'      && <ReporteGolfEstadoCuenta />}
      {activo === 'caballos-servicios' && <ReporteHipicoServicios />}
      {activo === 'miembros-federados' && <ReporteMiembrosFederados />}
      {activo === 'slots-ocupacion'    && <ReporteGolfSlotsOcupacion />}
      {activo === 'auditoria-slots'    && <ReporteGolfAuditoriaSlots />}
    </div>
  )
}
