-- ============================================================
-- Hípico: vincula cfg_hip al producto POS de renta de caballeriza
-- que ya existía en el catálogo (creado a mano, nunca conectado al
-- flujo de cobranza recurrente): golf.cat_productos_pos
-- "RENTA INSTALACIONES ECUESTRES" (precio_variable=true, ya mapeado
-- al concepto "Renta de Caballeriza" con su clave SAT 80131500).
-- No crea nada — solo vincula.
-- 2026-09-02
-- ============================================================

UPDATE hip.cfg_hip h
SET id_producto_pos_fk = p.id
FROM golf.cat_productos_pos p
WHERE p.nombre = 'RENTA INSTALACIONES ECUESTRES'
  AND h.id_producto_pos_fk IS NULL;
