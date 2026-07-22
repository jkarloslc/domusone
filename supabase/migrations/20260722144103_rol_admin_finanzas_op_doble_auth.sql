-- ── Rol admin_finanzas: igual que admin + 2da autorización de Órdenes de Pago ──
-- Flujo de autorización de OP pasa de 1 a 2 pasos:
--   1) Crear OP (con o sin OC)                 → status 'Pendiente Auth'
--   2) 1ra autorización (ROLES_AUTH de siempre)→ status 'Pendiente Auth Finanzas'
--   3) 2da autorización (admin_finanzas/super) → status 'Pendiente' (entra a CXP)

ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin',
    'admin',
    'admin_lector',
    'admin_finanzas',           -- NUEVO: igual que admin + 2da autorización de OP
    'usuarioadmin',
    'usuariomantto',
    'atencion_residentes',
    'cobranza',
    'vigilancia',
    'compras',
    'compras_supervisor',
    'almacen',
    'mantenimiento',
    'fraccionamiento',
    'tesoreria',
    'seguridad',
    'ingresos',
    'usuario_solicitante',
    'usuariogolf',
    'usuariohipico',
    'usuariohospitality',
    'usuario_nomina',
    'usuario_organismo',
    'admin_organismo',
    'caja_organismo',
    'aux_organismo'
  )
);

-- Trazabilidad de la 2da autorización (la 1ra ya usa autorizado_por / fecha_autorizacion)
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS autorizado_finanzas_por     TEXT,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion_finanzas TIMESTAMPTZ;
