'use client'
import { Wrench, Truck, Hammer, ClipboardList, ClipboardCheck } from 'lucide-react'
import HubGrid from '@/components/layout/HubGrid'

const ITEMS = [
  { key: 'mantenimiento',  permKey: 'mantenimiento', label: 'Mantenimiento',           icon: Wrench,         desc: 'Programa anual de mantenimiento preventivo',               href: '/residencial/mantenimiento/gestion' },
  { key: 'ot-residencial', permKey: 'mantenimiento', label: 'OT Mantto. Fraccionamiento', icon: ClipboardList, desc: 'Órdenes de trabajo del mantenimiento del fraccionamiento', href: '/residencial/mantenimiento/ot-residencial' },
  { key: 'ot-generales',   permKey: 'mantenimiento', label: "OT's Generales",          icon: ClipboardCheck, desc: 'Órdenes de trabajo de la cuadrilla general',               href: '/residencial/mantenimiento/ot-generales' },
  { key: 'equipo-flota',   permKey: 'equipo-flota',  label: 'Vehículos y Maquinaria',  icon: Truck,          desc: 'Flotilla, mantenimientos y bitácora de uso',               href: '/equipo-flota' },
  { key: 'herramientas',   permKey: 'herramientas',  label: 'Equipo y Herramienta',    icon: Hammer,         desc: 'Catálogo, préstamos y mantenimiento de herramienta',       href: '/herramientas' },
]

export default function MantenimientoHubPage() {
  return <HubGrid icon={Wrench} title="Mantenimiento" subtitle="Mantenimiento, órdenes de trabajo, vehículos y herramienta" color="#b45309" items={ITEMS} />
}
