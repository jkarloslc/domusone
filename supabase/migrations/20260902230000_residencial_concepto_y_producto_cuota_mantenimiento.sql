-- ============================================================
-- Residencial: no existía ningún concepto de ingreso adecuado para
-- "Cuota de Mantenimiento" bajo el centro "Mantto. Residencial
-- [Cuotas]" (cfg.cuotas_estandar.id_concepto_ingreso_fk llevaba
-- NULL desde que se agregó la columna en 20260821120000). Se crea
-- el concepto, se vincula cuotas_estandar, y se crea + vincula su
-- producto POS compartido.
--
-- Nota: Residencial no cobra IVA en sus cuotas (ver
-- app/cobranza/ReciboModal.tsx, ticket con iva_pct=0 fijo) — el
-- producto se crea igual, sin IVA, para no introducir una
-- discrepancia nueva.
--
-- Nota reporting: el centro de ingreso de Residencial usa
-- tipo_desglose='secciones', un pipeline de reporting
-- (ctrl.recibos_ingreso_secciones) totalmente desacoplado de
-- conceptos/productos — este cambio no afecta Presupuestos ni
-- Dashboard, solo mejora la clave SAT al facturar.
-- 2026-09-02
-- ============================================================

-- 1) Concepto de ingreso "Cuota de Mantenimiento"
INSERT INTO cfg.conceptos_ingreso (id_centro_ingreso_fk, nombre, clave, clave_prod_serv, orden, activo)
SELECT
  ci_c.id, 'Cuota de Mantenimiento', 'CMANT', '80131801',
  COALESCE((SELECT MAX(orden) FROM cfg.conceptos_ingreso WHERE id_centro_ingreso_fk = ci_c.id), 0) + 1,
  true
FROM cfg.centros_ingreso ci_c
WHERE ci_c.nombre = 'Mantto. Residencial [Cuotas]'
  AND NOT EXISTS (
    SELECT 1 FROM cfg.conceptos_ingreso c2 WHERE c2.id_centro_ingreso_fk = ci_c.id AND c2.nombre = 'Cuota de Mantenimiento'
  );

-- 2) Vincular cuotas_estandar al concepto (donde faltaba)
UPDATE cfg.cuotas_estandar ce
SET id_concepto_ingreso_fk = ci.id
FROM cfg.conceptos_ingreso ci
JOIN cfg.centros_ingreso ci_c ON ci_c.id = ci.id_centro_ingreso_fk
WHERE ci_c.nombre = 'Mantto. Residencial [Cuotas]'
  AND ci.nombre = 'Cuota de Mantenimiento'
  AND ce.id_concepto_ingreso_fk IS NULL
  AND ce.activo = true;

-- 3) Producto POS compartido, bajo el centro de venta "Cuotas Mantto."
INSERT INTO golf.cat_productos_pos
  (id_centro_fk, nombre, sku, precio, costo, iva_pct, aplica_iva, tipo, activo, precio_variable, id_concepto_ingreso_fk, clave_prod_serv)
SELECT
  ccv.id, 'Cuota de Mantenimiento', 'CMANT', 1.00, 1.00, 0, false, 'SERVICIO', true, true, ci.id, ci.clave_prod_serv
FROM golf.cat_centros_venta ccv
JOIN cfg.centros_ingreso ci_c ON ci_c.nombre = 'Mantto. Residencial [Cuotas]'
JOIN cfg.conceptos_ingreso ci ON ci.id_centro_ingreso_fk = ci_c.id AND ci.nombre = 'Cuota de Mantenimiento'
WHERE ccv.nombre = 'Cuotas Mantto.'
  AND NOT EXISTS (
    SELECT 1 FROM golf.cat_productos_pos p WHERE p.id_centro_fk = ccv.id AND p.nombre = 'Cuota de Mantenimiento'
  );

-- 4) Vincular cuotas_estandar al producto
UPDATE cfg.cuotas_estandar ce
SET id_producto_pos_fk = p.id
FROM golf.cat_productos_pos p
WHERE p.nombre = 'Cuota de Mantenimiento'
  AND ce.activo = true
  AND ce.id_producto_pos_fk IS NULL;
