-- Permite cancelar reembolsos de caja chica ya autorizados (solo admin/superadmin, desde la UI)
ALTER TABLE comp.reembolsos DROP CONSTRAINT IF EXISTS reembolsos_status_check;
ALTER TABLE comp.reembolsos ADD CONSTRAINT reembolsos_status_check CHECK (
  status IN ('Borrador', 'Pendiente Auth', 'Autorizado', 'Pagado', 'Rechazado', 'Cancelado')
);
