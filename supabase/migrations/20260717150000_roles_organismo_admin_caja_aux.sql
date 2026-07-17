-- ── Roles: admin_organismo, caja_organismo, aux_organismo ──────────────────────
-- admin_organismo: leer/escribir/eliminar en Compras, Mantenimiento, Tesorería,
--                  Ingresos, Presupuestos y Catálogos.
-- caja_organismo:  Ingresos + Compras (solo cards Requisiciones y Transferencias).
-- aux_organismo:   Mantenimiento + Compras (solo cards Requisiciones y Transferencias).

ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin',
    'admin',
    'admin_lector',
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
    'admin_organismo',          -- NUEVO: leer/escribir/eliminar compras, mantto, tesorería, ingresos, presupuestos, catálogos
    'caja_organismo',           -- NUEVO: ingresos + compras (req/transferencias)
    'aux_organismo'             -- NUEVO: mantenimiento + compras (req/transferencias)
  )
);
