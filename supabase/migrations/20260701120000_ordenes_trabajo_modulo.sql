-- ctrl.ordenes_trabajo es una sola tabla compartida por Mantenimiento General,
-- Campo de Golf e Incidencias (Residencial). Hasta ahora la única partición
-- entre vistas era `empresa` ('Balvanera' | 'Cuadrilla'), pero Golf también
-- usa 'Balvanera' — sus OT quedaban mezcladas con las de OT Mantto. Res.
--
-- Se agrega `modulo` como el campo real de "Tipo" para filtrar cada vista:
--   'mantenimiento' → tab OT Mantto. Res (Programa de Mantenimiento general)
--   'golf'          → tab OT Campo de Golf (Programa de Mantenimiento Golf)
--   'generales'     → tab OT's Generales (Incidencias / captura manual)

ALTER TABLE ctrl.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS modulo TEXT NOT NULL DEFAULT 'mantenimiento';

ALTER TABLE ctrl.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_modulo_check;
ALTER TABLE ctrl.ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_modulo_check
  CHECK (modulo IN ('mantenimiento', 'golf', 'generales'));

-- Backfill: lo que hoy vive en empresa='Cuadrilla' es OT's Generales
-- (Incidencias / captura manual desde esa pestaña).
UPDATE ctrl.ordenes_trabajo SET modulo = 'generales' WHERE empresa = 'Cuadrilla';

CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_modulo ON ctrl.ordenes_trabajo (modulo);
