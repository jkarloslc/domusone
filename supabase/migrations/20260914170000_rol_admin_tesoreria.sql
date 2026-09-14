-- ── Rol admin_tesoreria: igual que admin + permisos financieros ampliados ──
-- Permisos adicionales sobre admin (gateados en código, no requieren columnas
-- nuevas salvo la auditoría de edición de pagos CXP):
--   1. Editar recibos de ingreso ya guardados (app/ingresos/page.tsx)
--   2. Editar pagos de CXP ya aplicados, cambiando monto y cuenta bancaria
--      de origen (app/tesoreria/cxp/page.tsx + lib/editarPagoCxp.ts)
--   3. Cancelar recibos de cuotas en Golf/Hípico/Locales/Fraccionamiento
--      (ya heredado de los permisos de escritura de admin en esos módulos)
--   4. Cancelar ventas directas y usar la Mesa de Control del POS de Golf
--      (app/golf/pos/page.tsx)
--   5. Editar y eliminar cuotas ya asignadas en Golf/Hípico/Locales
--      (app/golf/cuotas/page.tsx, app/hipico/cobranza/page.tsx, app/locales/cobranza/page.tsx)

ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin',
    'admin',
    'admin_lector',
    'admin_finanzas',
    'admin_low_level',
    'admin_tesoreria',          -- NUEVO: igual que admin + permisos financieros ampliados
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

-- Rastro de auditoría para la edición de un pago (abono) de CXP ya aplicado:
-- quién lo editó, cuándo y por qué (monto/cuenta anteriores quedan en el
-- historial de movimientos_bancarios vía el movimiento de reverso).
ALTER TABLE comp.cxp_abonos
  ADD COLUMN IF NOT EXISTS editado_by     text,
  ADD COLUMN IF NOT EXISTS editado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_edicion text;
