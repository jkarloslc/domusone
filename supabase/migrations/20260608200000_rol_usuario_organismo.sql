-- ── Rol: usuario_organismo ────────────────────────────────────────────────────
-- Acceso de solo lectura al módulo Residencial (Lotes, Propietarios) y reportes
-- residenciales. Pensado para organismos externos o dependencias que consultan
-- el estado del fraccionamiento sin poder modificar ningún registro.

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
    'usuario_organismo'        -- NUEVO: solo lectura residencial + reportes
  )
);
