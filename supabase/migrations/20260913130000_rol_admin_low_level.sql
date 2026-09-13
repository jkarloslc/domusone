-- ── Rol admin_low_level: igual que admin, restringido incrementalmente ──
-- Primera restricción: no puede editar el Catálogo de Productos POS
-- (Golf > POS > Catálogo) — solo superadmin puede crear/editar productos.
-- Se le irán quitando más permisos puntuales conforme se pidan.

ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin',
    'admin',
    'admin_lector',
    'admin_finanzas',
    'admin_low_level',          -- NUEVO: igual que admin, sin editar Catálogo POS
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
