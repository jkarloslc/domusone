-- ============================================================
-- Locales: Concepto de Ingreso por propiedad
-- Fecha: 2026-07-31
-- ------------------------------------------------------------
-- Complementa a ctrl.loc_cfg (concepto global, migración
-- 20260731141406): cada propiedad puede tener su propio concepto
-- de ingreso (mismo criterio que el catálogo manual de
-- golf.cat_productos_pos para el centro "Renta Locales Comerciales",
-- que ya distingue "Renta Casa Balvanera", "Renta La Rambla", etc.).
-- Si la propiedad no tiene concepto propio, se usa el global de
-- ctrl.loc_cfg; si tampoco hay global, cae en "Otros".
-- ============================================================

ALTER TABLE ctrl.loc_propiedades
  ADD COLUMN IF NOT EXISTS id_concepto_ingreso_fk INTEGER REFERENCES cfg.conceptos_ingreso(id);
