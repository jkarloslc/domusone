-- ═══════════════════════════════════════════════════════════════════
-- Agregar rol 'admin_lector' al CHECK constraint de cfg.usuarios
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin',
    'admin',
    'admin_lector',          -- NUEVO: admin solo lectura
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
    'usuariohospitality'
  )
);

-- ───────────────────────────────────────────────────────────────────
-- Permisos del rol admin_lector:
--   • LEER:    todos los módulos de admin (sidebar completo)
--   • ESCRIBIR: ninguno (botones Nuevo/Editar ocultos)
--   • canDelete: NO
--   • canAuth:   NO (no puede autorizar documentos)
--   • canCompras: 'all' (ve todos los submenús de compras)
-- ───────────────────────────────────────────────────────────────────
