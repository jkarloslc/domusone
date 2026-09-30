-- Backfill de subtotal/iva para que Comparativo (sin IVA) no mezcle montos con IVA.
-- Solo toca filas con subtotal NULL; es idempotente.

-- 1) Ingresos: todos los conceptos/secciones causan IVA 16% (decisión 2026-09-30).
UPDATE ctrl.recibos_ingreso_conceptos
   SET subtotal = ROUND(monto / 1.16, 2),
       iva      = monto - ROUND(monto / 1.16, 2)
 WHERE subtotal IS NULL AND monto IS NOT NULL;

UPDATE ctrl.recibos_ingreso_secciones
   SET subtotal = ROUND(monto / 1.16, 2),
       iva      = monto - ROUND(monto / 1.16, 2)
 WHERE subtotal IS NULL AND monto IS NOT NULL;

-- 2) OP con OC: proporción subtotal/total de la OC aplicada al monto de la OP
--    (cubre pagos parciales o con monto distinto al total de la OC).
UPDATE comp.ordenes_pago op
   SET subtotal = ROUND(op.monto * oc.subtotal / oc.total, 2),
       iva      = op.monto - ROUND(op.monto * oc.subtotal / oc.total, 2)
  FROM comp.ordenes_compra oc
 WHERE op.id_oc_fk = oc.id
   AND op.subtotal IS NULL
   AND oc.subtotal IS NOT NULL
   AND COALESCE(oc.total, 0) > 0;
