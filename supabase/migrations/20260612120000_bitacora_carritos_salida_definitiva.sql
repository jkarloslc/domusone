-- La UI de bitácora (BitacoraModal) envía el tipo SALIDA_DEFINITIVA, pero el
-- CHECK de la tabla solo admitía los 4 tipos originales y rechazaba el insert:
-- "violates check constraint bitacora_carritos_tipo_evento_check"

ALTER TABLE golf.bitacora_carritos
  DROP CONSTRAINT IF EXISTS bitacora_carritos_tipo_evento_check;

ALTER TABLE golf.bitacora_carritos
  ADD CONSTRAINT bitacora_carritos_tipo_evento_check CHECK (
    tipo_evento IN (
      'SALIDA_TALLER',
      'REGRESO_TALLER',
      'PRESTAMO_TERCERO',
      'INCIDENCIA',
      'SALIDA_DEFINITIVA'
    )
  );
