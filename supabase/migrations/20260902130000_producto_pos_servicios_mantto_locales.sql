-- ============================================================
-- Locales: producto POS "Servicios de Mantto"
-- ------------------------------------------------------------
-- Hasta ahora las cuotas de Servicios de Mantto (loc_cxc.tipo =
-- 'SERVICIOS_MANTTO') resolvían su concepto de ingreso directo en la
-- línea de ctrl_ventas_det (sin producto POS), igual que la renta.
-- A petición del usuario, el mantenimiento pasa a usar un producto
-- real del catálogo POS (golf.cat_productos_pos) — mismo patrón que
-- "Contraprestación Fija"/"RENTA INSTALACIONES ECUESTRES": precio
-- placeholder + precio_variable=true, porque el monto real siempre
-- viene de la cuota (loc_cxc.monto_final), no del catálogo.
--
-- Un solo producto compartido entre todas las propiedades: el monto
-- varía por propiedad/asignación, pero el concepto de ingreso
-- ("Servicio de Mantenimiento", id 29) ya es compartido — no per-propiedad
-- como la renta.
-- 2026-09-02
-- ============================================================

INSERT INTO golf.cat_productos_pos
  (id_centro_fk, nombre, sku, precio, costo, iva_pct, aplica_iva, tipo, activo, precio_variable, id_concepto_ingreso_fk, clave_prod_serv)
SELECT
  ccv.id, 'Servicios de Mantto', 'SMT', 1.00, 1.00, 16.00, true, 'SERVICIO', true, true, ci.id, '80131801'
FROM golf.cat_centros_venta ccv
JOIN cfg.centros_ingreso   ci_c ON ci_c.nombre = 'Locales Comerciales'
JOIN cfg.conceptos_ingreso ci   ON ci.id_centro_ingreso_fk = ci_c.id AND ci.nombre = 'Servicio de Mantenimiento'
WHERE ccv.nombre = 'Locales Comerciales'
  AND NOT EXISTS (
    SELECT 1 FROM golf.cat_productos_pos p WHERE p.id_centro_fk = ccv.id AND p.nombre = 'Servicios de Mantto'
  );
