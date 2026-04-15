-- ═══════════════════════════════════════════════════════════════════
-- Agregar rol 'usuario_solicitante' al CHECK constraint de cfg.usuarios
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Eliminar el constraint existente de rol (ajusta el nombre si difiere)
ALTER TABLE cfg.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

-- 2. Recrear con el nuevo valor incluido
ALTER TABLE cfg.usuarios
  ADD CONSTRAINT usuarios_rol_check CHECK (rol IN (
    'superadmin',
    'admin',
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
    'usuario_solicitante'   -- NUEVO
  ));

-- ───────────────────────────────────────────────────────────────────
-- Permisos del nuevo rol (solo lectura de tablas que necesita):
--   • requisiciones       → puede crear y editar
--   • transferencias      → puede crear (solicitar) y confirmar recepción
--   • Sin autorización    → NO está en ROLES_AUTH del frontend
-- ───────────────────────────────────────────────────────────────────
-- Verificación: puedes agregar usuarios con este rol desde
-- cfg.usuarios asignando rol = 'usuario_solicitante'
