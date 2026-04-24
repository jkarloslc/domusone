-- ============================================================
-- ROL: usuariohospitality
-- Ejecutar en Supabase SQL Editor (schema public / cfg)
-- ============================================================

-- ── 1. Ampliar CHECK CONSTRAINT en cfg.usuarios ──────────────
-- Agrega usuariohospitality a la lista de roles válidos

ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin','admin','usuarioadmin','usuariomantto',
    'atencion_residentes','cobranza','vigilancia',
    'compras','compras_supervisor','almacen','mantenimiento',
    'fraccionamiento','tesoreria','seguridad',
    'ingresos','usuario_solicitante',
    'usuariogolf','usuariohipico',
    'usuariohospitality'
  )
);

-- ── 2. RLS ya está habilitado en las tablas Hospitality ──────
--    (creadas en hospitality_schema.sql)
--    Las políticas permiten acceso a `authenticated`, lo que
--    cubre a usuariohospitality sin cambios adicionales.

-- ── 3. Verificación — listar usuarios con el nuevo rol ───────
-- SELECT id, nombre, email, rol FROM cfg.usuarios WHERE rol = 'usuariohospitality';

-- ── 4. Crear un usuario Hospitality (ejemplo) ────────────────
-- Reemplaza los valores antes de ejecutar.
-- Primero crea el usuario en Supabase Auth (Dashboard → Authentication → Users)
-- y anota el UUID generado. Luego ejecuta:

/*
INSERT INTO cfg.usuarios (id, nombre, email, rol, activo)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- UUID del usuario en Auth
  'Operador Hospitality',
  'hospitality@balvanera.com',
  'usuariohospitality',
  true
);
*/

-- ── 5. Módulos permitidos para usuariohospitality ────────────
-- Si tu aplicación tiene una tabla cfg.modulos_por_rol o similar,
-- ejecuta lo que corresponda. De lo contrario el acceso queda
-- controlado únicamente por el sidebar (ya actualizado en código).

-- ── 6. GRANT en tablas Hospitality (por si acaso) ────────────
-- Ya se ejecutaron en hospitality_schema.sql, pero si necesitas
-- re-aplicar en un ambiente limpio:

GRANT ALL ON ctrl.cat_lugares          TO authenticated;
GRANT ALL ON ctrl.cat_tipos_evento     TO authenticated;
GRANT ALL ON ctrl.eventos              TO authenticated;
GRANT ALL ON ctrl.eventos_ingresos     TO authenticated;
GRANT ALL ON ctrl.eventos_ops          TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.seq_folio_evento        TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.seq_folio_recibo_evento TO authenticated;
