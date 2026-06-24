import { dbGolf } from '@/lib/supabase'

export type TicketSalidaCarrito = {
  id: number
  fecha_salida: string
  fecha_regreso?: string | null
  carrito: string
  placa: string | null
  tipo: string | null
  cajon: string | null
  socio: string
  numero_socio: string | null
  observaciones: string | null
  usuario_registra: string | null
}

export async function abrirTicketSalidaCarrito(t: TicketSalidaCarrito, autoPrint: boolean) {
  const { data: cfg } = await dbGolf
    .from('cfg_pos')
    .select('razon_social, rfc, direccion, telefono, municipio')
    .single()

  const ticketData = {
    ...t,
    razon_social: cfg?.razon_social ?? 'Balvanera Golf, Polo & Country Club',
    municipio:    cfg?.municipio ?? '',
    direccion:    cfg?.direccion ?? '',
    rfc:          cfg?.rfc ?? '',
    telefono:     cfg?.telefono ?? '',
  }
  const encoded = encodeURIComponent(JSON.stringify(ticketData))
  window.open(`/ticket-salida-carrito.html?data=${encoded}${autoPrint ? '&print=1' : ''}`, '_blank', 'width=400,height=700')
}
