// Roles que revisan los Partes de Novedades de Vigilancia: ven el pendiente en Inicio
// y, al abrir un parte enviado, queda marcado como visto. Quien captura (vigilancia,
// seguridad) y admin_lector (solo lectura) no son revisores.
export const ROLES_REVISORES_NOVEDADES = [
  'superadmin', 'admin', 'admin_low_level', 'admin_finanzas', 'admin_tesoreria',
  'usuarioadmin', 'fraccionamiento', 'atencion_residentes',
]
export const esRevisorNovedades = (rol: string | undefined | null) =>
  !!rol && ROLES_REVISORES_NOVEDADES.includes(rol)
