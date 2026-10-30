'use client'
import { Building2, ListChecks, HardHat } from 'lucide-react'
import HubGrid from '@/components/layout/HubGrid'

const ITEMS = [
  { key: 'conceptos',     permKey: 'mantenimiento', label: 'Catálogo de Conceptos',   icon: ListChecks, desc: 'Conceptos de obra/mantenimiento y matriz de PU',  href: '/residencial/mantenimiento/conceptos' },
  { key: 'capex',         permKey: 'capex',         label: 'Proyectos CAPEX',         icon: Building2,  desc: 'Avance y presupuesto de proyectos de inversión',   href: '/capex' },
  { key: 'cat_mano_obra', permKey: 'mantenimiento', label: 'Categorías Mano de Obra', icon: HardHat,    desc: 'Sueldo diario de referencia por categoría',        href: '/residencial/mantenimiento/categorias-mano-obra' },
]

export default function CapexHubPage() {
  return <HubGrid icon={Building2} title="Capex" subtitle="Proyectos de inversión, catálogo de conceptos y mano de obra" color="#059669" items={ITEMS} />
}
