-- ================================================================
-- CORRECCION: la Cuota de Mantenimiento de Fraccionamiento SI causa IVA 16%
-- Migracion: 20260920220000
-- ================================================================
--
-- QUE ESTABA MAL
-- El catalogo declaraba la cuota como exenta:
--   golf.cat_productos_pos (sku CMANT) -> iva_pct 0, aplica_iva false
--   cfg.cuotas_estandar                -> aplica_iva false
--
-- Pero el ingreso que se reconoce de esas mismas cuotas SI lleva 16%.
-- Verificado en produccion (2026-09-20) sobre ctrl.recibos_ingreso_secciones:
--   Agaves    monto 406,524.01  subtotal 350,451.73  iva 56,072.28 -> 16.0%
--   Fairway   monto 341,365.00  subtotal 294,280.17  iva 47,084.83 -> 16.0%
--   Alzada    monto  37,760.00  subtotal  32,551.72  iva  5,208.28 -> 16.0%
-- (app/ingresos/page.tsx -> calcFiscal() divide entre 1.16 sin excepcion).
--
-- Es decir: produccion venia reconociendo 16% mientras el catalogo decia 0%.
--
-- DE DONDE VINO EL ERROR
-- La migracion 20260902230000 creo el producto con iva_pct 0 y lo documento
-- como intencional citando app/cobranza/ReciboModal.tsx ("ticket con
-- iva_pct=0 fijo"). Pero ese 0 del ReciboModal era un valor hardcodeado que
-- nunca se reviso, no una regla fiscal: la migracion copio el bug del codigo
-- en vez de corregirlo. Confirmado por el usuario el 2026-09-20: las cuotas
-- de Fraccionamiento si llevan IVA al 16%.
--
-- >>> NO revertir esta migracion con el argumento de 20260902230000. <<<
--
-- ALCANCE FISCAL
-- La cobranza de Fraccionamiento no esta en operacion (ctrl.recibos tiene 1
-- fila de prueba), asi que NO hay CFDIs historicos emitidos al 0% que haya
-- que corregir. Pero F4 pone justamente ese flujo en produccion, asi que esto
-- tiene que quedar corregido antes del primer recibo real; de lo contrario se
-- timbraria al 0% sobre un ingreso que si causa IVA.
--
-- El iva_pct: 0 hardcodeado de app/cobranza/ReciboModal.tsx se corrige en el
-- mismo commit: ahora la tasa se lee del producto ligado a la cuota.
--
-- NOTA SOBRE ESTA VERSION DEL SCRIPT
-- El primer intento uso "WHERE id_producto_pos_fk IN (SELECT id FROM ...)" y
-- el editor SQL lo rechazo con 42703 (column "id_producto_pos_fk" does not
-- exist) aunque la columna si existe en cfg.cuotas_estandar (verificado: vale
-- 34). Se reescribio con la forma UPDATE <tabla> <alias> ... FROM ... WHERE,
-- que es la que ya usa con exito la migracion 20260902230000 sobre estas
-- mismas dos tablas, y con cada sentencia calificada por alias para que no
-- quede ninguna referencia ambigua.
-- 2026-09-20
-- ================================================================

-- 1) Producto POS de la cuota
UPDATE golf.cat_productos_pos p
SET iva_pct = 16, aplica_iva = true
WHERE p.sku = 'CMANT';

-- 2) Cuota estandar ligada a ese producto
UPDATE cfg.cuotas_estandar ce
SET aplica_iva = true
FROM golf.cat_productos_pos p
WHERE p.id = ce.id_producto_pos_fk
  AND p.sku = 'CMANT';

-- 3) Red de seguridad: cuota de mantenimiento activa sin producto ligado
UPDATE cfg.cuotas_estandar ce
SET aplica_iva = true
WHERE ce.activo = true
  AND ce.aplica_iva = false
  AND ce.nombre ILIKE '%mantenimiento%';

-- 4) Verificacion: debe quedar iva_pct 16 / aplica_iva true
DO $$
DECLARE
  v_pct numeric;
  v_aplica boolean;
  v_cuotas integer;
BEGIN
  SELECT p.iva_pct, p.aplica_iva INTO v_pct, v_aplica
  FROM golf.cat_productos_pos p WHERE p.sku = 'CMANT' LIMIT 1;

  IF v_pct IS NULL THEN
    RAISE EXCEPTION 'No existe el producto POS con sku CMANT: revisa la migracion 20260902230000';
  END IF;

  IF v_pct IS DISTINCT FROM 16 OR v_aplica IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CMANT quedo en iva_pct=% aplica_iva=% y se esperaba 16/true', v_pct, v_aplica;
  END IF;

  SELECT count(*) INTO v_cuotas
  FROM cfg.cuotas_estandar ce
  WHERE ce.activo = true AND ce.aplica_iva = true;

  RAISE NOTICE 'OK: CMANT con IVA 16 por ciento. Cuotas estandar activas con aplica_iva=true: %', v_cuotas;
END $$;
