import { redirect } from 'next/navigation'

// Hospitality ahora es el módulo independiente "Eventos" (/eventos).
export default function HospitalityPage() { redirect('/eventos') }
