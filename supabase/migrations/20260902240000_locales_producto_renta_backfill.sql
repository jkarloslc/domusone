-- ============================================================
-- Locales: backfill de productos POS para la renta por propiedad.
-- Varias propiedades ya tenían su producto creado a mano (Renta
-- Villa 01 A, Renta La Rambla, "Contraprestación Fija" = Renta Casa
-- Balvanera, Renta Carpa Carritos, RENTA CANCHA FUTBOL) — este
-- backfill solo crea el producto para las propiedades cuyo concepto
-- de ingreso todavía no tiene un producto asociado bajo el centro
-- "Locales Comerciales", y vincula TODAS las propiedades (nuevas y
-- ya existentes) a su producto correspondiente.
--
-- 100% set-based por diseño: no hay lectura directa de
-- ctrl.loc_propiedades disponible fuera de este motor SQL.
-- Propiedades sin id_concepto_ingreso_fk (usan el fallback global)
-- quedan sin producto — mismo comportamiento que hoy.
-- 2026-09-02
-- ============================================================

-- 1) Crea un producto por cada concepto de propiedad que aún no tenga uno
--    bajo "Locales Comerciales" (uno por concepto, no por propiedad —
--    si dos propiedades comparten concepto, comparten producto).
INSERT INTO golf.cat_productos_pos
  (id_centro_fk, nombre, sku, precio, costo, iva_pct, aplica_iva, tipo, activo, precio_variable, id_concepto_ingreso_fk, clave_prod_serv)
SELECT DISTINCT
  ccv.id,
  'Renta — ' || lp.clave,
  'REN-' || lp.clave,
  1.00, 1.00, 16.00, true, 'SERVICIO', true, true,
  lp.id_concepto_ingreso_fk,
  COALESCE(ci.clave_prod_serv, '80131500')
FROM ctrl.loc_propiedades lp
JOIN golf.cat_centros_venta ccv ON ccv.nombre = 'Locales Comerciales'
LEFT JOIN cfg.conceptos_ingreso ci ON ci.id = lp.id_concepto_ingreso_fk
WHERE lp.id_concepto_ingreso_fk IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM golf.cat_productos_pos p
    WHERE p.id_centro_fk = ccv.id AND p.id_concepto_ingreso_fk = lp.id_concepto_ingreso_fk
  );

-- 2) Vincula cada propiedad al producto de su mismo concepto (ya existente
--    a mano, o recién creado en el paso 1).
UPDATE ctrl.loc_propiedades lp
SET id_producto_pos_fk = p.id
FROM golf.cat_productos_pos p
JOIN golf.cat_centros_venta ccv ON ccv.id = p.id_centro_fk AND ccv.nombre = 'Locales Comerciales'
WHERE p.id_concepto_ingreso_fk = lp.id_concepto_ingreso_fk
  AND lp.id_concepto_ingreso_fk IS NOT NULL
  AND lp.id_producto_pos_fk IS NULL;
