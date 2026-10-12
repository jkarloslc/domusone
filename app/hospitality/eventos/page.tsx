import { redirect } from 'next/navigation'

// Desactivada (2026-10-12): la gestión de eventos se unificó en Torneos Ecuestres.
// La versión anterior de esta pantalla queda en el historial de git.
export default function HospitalityEventosPage() {
  redirect('/hipico/eventos-ecuestres')
}
