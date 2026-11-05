-- ── Roles admin por lado (Club / Fraccionamiento) ─────────────────────────────
-- 10 roles nuevos: mismo poder que su rol base pero sin ver los módulos del
-- otro lado. La lógica vive en lib/AuthContext.tsx (ROLES_LADO); solo se
-- necesita ampliar el CHECK de cfg.usuarios.
--   admin_golf*  → base admin*, oculta módulos exclusivos de Fraccionamiento
--   admin_fracc* → base admin*, oculta módulos exclusivos de Club
-- Sufijos: (ninguno)=admin, _lector, _finanzas, _tesoreria, _low_level

ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin',
    'admin',
    'admin_lector',
    'admin_finanzas',
    'admin_low_level',
    'admin_tesoreria',
    'admin_golf',
    'admin_golf_lector',
    'admin_golf_finanzas',
    'admin_golf_tesoreria',
    'admin_golf_low_level',
    'admin_fracc',
    'admin_fracc_lector',
    'admin_fracc_finanzas',
    'admin_fracc_tesoreria',
    'admin_fracc_low_level',
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
