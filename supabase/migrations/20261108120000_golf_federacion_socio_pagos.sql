-- Federación: datos del socio (federado, clave, código) + pagos por ciclo (monto, fecha de pago, beneficiarios)
ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS federado         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS federacion_clave  TEXT,
  ADD COLUMN IF NOT EXISTS federacion_codigo TEXT;

ALTER TABLE golf.ctrl_federacion
  ADD COLUMN IF NOT EXISTS monto         NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS fecha_pago    DATE,
  ADD COLUMN IF NOT EXISTS beneficiarios TEXT;

-- Backfill: socios con inscripciones previas quedan como federados con su última clave
UPDATE golf.cat_socios s
   SET federado = TRUE,
       federacion_clave = COALESCE(s.federacion_clave, (
         SELECT f.clave FROM golf.ctrl_federacion f
          WHERE f.id_socio_fk = s.id AND f.clave IS NOT NULL
          ORDER BY f.periodo DESC LIMIT 1))
 WHERE EXISTS (SELECT 1 FROM golf.ctrl_federacion f WHERE f.id_socio_fk = s.id);
