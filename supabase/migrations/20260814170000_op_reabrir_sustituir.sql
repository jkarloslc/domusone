-- Soporte para que superadmin pueda reabrir una OP Rechazada (regresarla al
-- punto de autorización donde fue rechazada) o duplicarla con folio nuevo,
-- dejando la original con status 'Sustituida' (mismos efectos que
-- Cancelada/Rechazada: no se considera una OP viva en ningún reporte,
-- dashboard ni CXP).

ALTER TABLE comp.ordenes_pago ADD COLUMN IF NOT EXISTS reabierta_por text;
ALTER TABLE comp.ordenes_pago ADD COLUMN IF NOT EXISTS fecha_reapertura timestamptz;
ALTER TABLE comp.ordenes_pago ADD COLUMN IF NOT EXISTS id_op_sustituta_fk integer REFERENCES comp.ordenes_pago(id);
ALTER TABLE comp.ordenes_pago ADD COLUMN IF NOT EXISTS id_op_original_fk  integer REFERENCES comp.ordenes_pago(id);
