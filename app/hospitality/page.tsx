import { redirect } from 'next/navigation'

// El hub de Hospitality se fusionó con Hípico ("Hípico y Eventos").
// Las sub-rutas (/hospitality/eventos, /calendario, /catalogos) siguen vigentes.
export default function HospitalityPage() {
  redirect('/hipico')
}
