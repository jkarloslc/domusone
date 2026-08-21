-- ─────────────────────────────────────────────────────────────────
-- Clave de Producto/Servicio SAT por línea, en vez de una sola clave
-- fija por factura completa (ver FacturaUniversalModal.tsx).
--
-- golf.ctrl_ventas_det ya trae, según el origen de la línea, una de dos
-- FKs resueltas: id_producto_fk (ventas nativas del POS de Golf) o
-- id_concepto_ingreso_fk (cuotas de Golf, renta de caballerizas de
-- Hípico, renta de Locales). Agregando clave_prod_serv a esos dos
-- catálogos, abrirFacturarPOS puede resolverla por línea sin tocar los
-- flujos de venta de cada módulo.
-- ─────────────────────────────────────────────────────────────────

-- 1. Producto/servicio del POS de Golf
ALTER TABLE golf.cat_productos_pos
  ADD COLUMN IF NOT EXISTS clave_prod_serv text;

-- 2. Hub compartido: Locales (renta), Hípico (renta de caballerizas),
--    Golf (cuotas de membresía/pensión) — todos ya resuelven
--    id_concepto_ingreso_fk por línea en ctrl_ventas_det.
ALTER TABLE cfg.conceptos_ingreso
  ADD COLUMN IF NOT EXISTS clave_prod_serv text;

-- 3. Cierra el gap de Residencial: a diferencia de golf.cat_cuotas_config
--    y hip.cfg_hip (ver 20260724120000_cuotas_concepto_ingreso.sql),
--    cfg.cuotas_estandar nunca quedó vinculada a un Concepto de Ingreso,
--    así que sus cuotas (ej. "Cuota de Mantenimiento") no llegaban a
--    id_concepto_ingreso_fk en el ticket POS. Mismo patrón, aplicado aquí.
ALTER TABLE cfg.cuotas_estandar
  ADD COLUMN IF NOT EXISTS id_concepto_ingreso_fk INTEGER REFERENCES cfg.conceptos_ingreso(id);
