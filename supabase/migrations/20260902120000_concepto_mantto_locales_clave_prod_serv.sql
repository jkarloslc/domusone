-- ============================================================
-- Locales: Clave SAT (Producto/Servicio) faltante en el concepto
-- de ingreso "Servicio de Mantenimiento" (cfg.conceptos_ingreso.id=29,
-- centro "Locales Comerciales").
--
-- Contexto (ver 20260821120000_clave_prod_serv_sat.sql): cuando una
-- línea de ctrl_ventas_det no trae id_producto_fk (caso de las cuotas
-- de renta/mantto de Locales, que resuelven id_concepto_ingreso_fk
-- directo), la clave SAT para el CFDI se toma de
-- cfg.conceptos_ingreso.clave_prod_serv. Ese campo estaba NULL en
-- "Servicio de Mantenimiento" — cualquier factura sobre una cuota de
-- Servicios de Mantto habría fallado por falta de ProductCode.
--
-- Clave "80131801 — Administración de propiedades (cuotas de
-- mantenimiento)" tomada del catálogo curado en lib/pacService.ts
-- (CLAVE_PROD_SERV_COMUNES) y ya usada en este mismo concepto vía el
-- producto POS "Contraprestación Fija" (golf.cat_productos_pos.id=25).
-- 2026-09-02
-- ============================================================

UPDATE cfg.conceptos_ingreso
SET clave_prod_serv = '80131801'
WHERE id_centro_ingreso_fk = (SELECT id FROM cfg.centros_ingreso WHERE nombre = 'Locales Comerciales')
  AND nombre = 'Servicio de Mantenimiento'
  AND clave_prod_serv IS NULL;
