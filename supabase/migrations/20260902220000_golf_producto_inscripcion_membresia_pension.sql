-- ============================================================
-- Golf: productos POS compartidos para Inscripción, Membresía
-- (golf.cat_cuotas_config) y Pensión de Carrito (golf.cfg_carritos).
-- precio_variable=true porque el monto real siempre viene de la
-- cuota calculada (cat_cuotas_config_det por categoría de socio),
-- no del catálogo — mismo patrón ya usado en Locales/Servicios de
-- Mantto e Hípico/RENTA INSTALACIONES ECUESTRES.
--
-- Los centros de venta y el concepto de ingreso se toman de los FKs
-- que cat_cuotas_config/cfg_carritos ya traen resueltos (no se
-- resuelve por nombre aquí, evita ambigüedad).
-- 2026-09-02
-- ============================================================

-- 1) Inscripción y Membresía — bajo el centro de venta de Membresías
--    (cfg_carritos.id_centro_membresias_fk, ya resuelto en la config existente)
INSERT INTO golf.cat_productos_pos
  (id_centro_fk, nombre, sku, precio, costo, iva_pct, aplica_iva, tipo, activo, precio_variable, id_concepto_ingreso_fk, clave_prod_serv)
SELECT
  cfc.id_centro_membresias_fk,
  CASE cc.tipo WHEN 'INSCRIPCION' THEN 'Inscripción' ELSE 'Membresía' END,
  CASE cc.tipo WHEN 'INSCRIPCION' THEN 'INSC' ELSE 'MEMB' END,
  1.00, 1.00, 16.00, true, 'SERVICIO', true, true,
  cc.id_concepto_ingreso_fk,
  ci.clave_prod_serv
FROM golf.cat_cuotas_config cc
CROSS JOIN golf.cfg_carritos cfc
LEFT JOIN cfg.conceptos_ingreso ci ON ci.id = cc.id_concepto_ingreso_fk
WHERE cc.tipo IN ('INSCRIPCION', 'MENSUALIDAD')
  AND cc.activo = true
  AND NOT EXISTS (
    SELECT 1 FROM golf.cat_productos_pos p
    WHERE p.id_centro_fk = cfc.id_centro_membresias_fk AND p.id_concepto_ingreso_fk = cc.id_concepto_ingreso_fk
  );

-- 2) Pensión de Carrito — bajo el centro de venta de Pensiones
INSERT INTO golf.cat_productos_pos
  (id_centro_fk, nombre, sku, precio, costo, iva_pct, aplica_iva, tipo, activo, precio_variable, id_concepto_ingreso_fk, clave_prod_serv)
SELECT
  cfc.id_centro_pension_fk, 'Pensión de Carrito', 'PENS',
  1.00, 1.00, 16.00, true, 'SERVICIO', true, true,
  cfc.id_concepto_ingreso_fk,
  ci.clave_prod_serv
FROM golf.cfg_carritos cfc
LEFT JOIN cfg.conceptos_ingreso ci ON ci.id = cfc.id_concepto_ingreso_fk
WHERE NOT EXISTS (
  SELECT 1 FROM golf.cat_productos_pos p
  WHERE p.id_centro_fk = cfc.id_centro_pension_fk AND p.id_concepto_ingreso_fk = cfc.id_concepto_ingreso_fk
);

-- 3) Vincular la configuración a los productos recién creados (o ya existentes)
UPDATE golf.cat_cuotas_config cc
SET id_producto_pos_fk = p.id
FROM golf.cat_productos_pos p, golf.cfg_carritos cfc
WHERE p.id_centro_fk = cfc.id_centro_membresias_fk
  AND p.id_concepto_ingreso_fk = cc.id_concepto_ingreso_fk
  AND cc.tipo IN ('INSCRIPCION', 'MENSUALIDAD')
  AND cc.id_producto_pos_fk IS NULL;

UPDATE golf.cfg_carritos cfc
SET id_producto_pos_fk = p.id
FROM golf.cat_productos_pos p
WHERE p.id_centro_fk = cfc.id_centro_pension_fk
  AND p.id_concepto_ingreso_fk = cfc.id_concepto_ingreso_fk
  AND cfc.id_producto_pos_fk IS NULL;
