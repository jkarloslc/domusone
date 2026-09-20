-- ════════════════════════════════════════════════════════════════
-- CORRECCIÓN: la Cuota de Mantenimiento de Fraccionamiento SÍ causa IVA 16%
-- Migración: 20260920220000
-- ════════════════════════════════════════════════════════════════
--
-- QUÉ ESTABA MAL
-- El catálogo declaraba la cuota como exenta:
--   golf.cat_productos_pos (sku CMANT) → iva_pct 0, aplica_iva false
--   cfg.cuotas_estandar                → aplica_iva false
--
-- Pero el ingreso que se reconoce de esas mismas cuotas SÍ lleva 16%.
-- Verificado en producción (2026-09-20) sobre ctrl.recibos_ingreso_secciones:
--   Agaves      monto 406,524.01  subtotal 350,451.73  iva 56,072.28 → 16.0%
--   Fairway     monto 341,365.00  subtotal 294,280.17  iva 47,084.83 → 16.0%
--   Alzada      monto  37,760.00  subtotal  32,551.72  iva  5,208.28 → 16.0%
-- (app/ingresos/page.tsx → calcFiscal() divide entre 1.16 sin excepción).
--
-- Es decir: producción venía reconociendo 16% mientras el catálogo decía 0%.
--
-- DE DÓNDE VINO EL ERROR
-- La migración 20260902230000 creó el producto con iva_pct 0 y lo documentó
-- como intencional citando `app/cobranza/ReciboModal.tsx` ("ticket con
-- iva_pct=0 fijo"). Pero ese 0 del ReciboModal era un valor hardcodeado que
-- nunca se revisó, no una regla fiscal: la migración copió el bug del código
-- en vez de corregirlo. Confirmado por el usuario el 2026-09-20: las cuotas
-- de Fraccionamiento sí llevan IVA al 16%.
--
-- >>> NO revertir esta migración con el argumento de 20260902230000. <<<
--
-- ALCANCE FISCAL
-- La cobranza de Fraccionamiento no está en operación (ctrl.recibos tiene 1
-- fila de prueba), así que NO hay CFDIs históricos emitidos al 0% que haya
-- que corregir. Pero F4 pone justamente ese flujo en producción, así que esto
-- tiene que quedar corregido antes del primer recibo real; de lo contrario se
-- timbraría al 0% sobre un ingreso que sí causa IVA.
--
-- El `iva_pct: 0` hardcodeado de app/cobranza/ReciboModal.tsx se corrige en el
-- mismo commit: ahora la tasa se lee del producto ligado a la cuota.
-- 2026-09-20
-- ════════════════════════════════════════════════════════════════

-- 1) Producto POS de la cuota
UPDATE golf.cat_productos_pos
SET iva_pct = 16, aplica_iva = true
WHERE sku = 'CMANT';

-- 2) Cuota estándar
UPDATE cfg.cuotas_estandar
SET aplica_iva = true
WHERE id_producto_pos_fk IN (SELECT id FROM golf.cat_productos_pos WHERE sku = 'CMANT');

-- Red de seguridad: si alguna cuota estándar quedó sin producto ligado pero es
-- la de mantenimiento, también se corrige.
UPDATE cfg.cuotas_estandar
SET aplica_iva = true
WHERE activo = true AND aplica_iva = false AND nombre ILIKE '%mantenimiento%';

-- 3) Verificación (debe devolver iva_pct 16 / aplica_iva true)
DO $$
DECLARE v_pct numeric; v_aplica boolean;
BEGIN
  SELECT iva_pct, aplica_iva INTO v_pct, v_aplica
  FROM golf.cat_productos_pos WHERE sku = 'CMANT' LIMIT 1;
  IF v_pct IS DISTINCT FROM 16 OR v_aplica IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CMANT quedó en iva_pct=% aplica_iva=% — se esperaba 16/true', v_pct, v_aplica;
  END IF;
  RAISE NOTICE 'OK: CMANT con IVA 16%%';
END $$;
