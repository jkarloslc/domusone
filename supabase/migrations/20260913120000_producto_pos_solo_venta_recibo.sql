-- Reemplaza el criterio indirecto de bloqueo de venta directa en POS
-- (búsqueda inversa de id_producto_pos_fk en 5 tablas de config + nombres
-- de centro/producto hardcodeados en el código) por una propiedad explícita
-- e intrínseca del producto. A partir de ahora el admin corrige cualquier
-- clasificación errónea directamente en Golf > POS > Catálogo, sin tocar
-- configuración de otros módulos.
-- Ver memoria: pos-bloqueo-venta-directa-criterio-incompleto

ALTER TABLE golf.cat_productos_pos
  ADD COLUMN IF NOT EXISTS solo_venta_por_recibo BOOLEAN NOT NULL DEFAULT false;

-- Backfill: arranca con la clasificación que ya existía en el código como
-- punto de partida (el admin corrige a mano los casos que quedaron mal).

-- 1) Productos ya enlazados como placeholder por algún módulo de cobranza
UPDATE golf.cat_productos_pos p
SET solo_venta_por_recibo = true
WHERE p.id IN (
  SELECT id_producto_pos_fk FROM golf.cfg_carritos      WHERE id_producto_pos_fk IS NOT NULL
  UNION
  SELECT id_producto_pos_fk FROM golf.cat_cuotas_config WHERE id_producto_pos_fk IS NOT NULL
  UNION
  SELECT id_producto_pos_fk FROM hip.cfg_hip            WHERE id_producto_pos_fk IS NOT NULL
  UNION
  SELECT id_producto_pos_fk FROM ctrl.loc_propiedades   WHERE id_producto_pos_fk IS NOT NULL
  UNION
  SELECT id_producto_pos_fk FROM cfg.cuotas_estandar    WHERE id_producto_pos_fk IS NOT NULL
);

-- 2) Respaldo por nombre en Hípico (por si el enlace en cfg_hip no estaba capturado)
UPDATE golf.cat_productos_pos p
SET solo_venta_por_recibo = true
FROM golf.cat_centros_venta c
WHERE p.id_centro_fk = c.id
  AND c.nombre = 'Hípico'
  AND p.nombre = 'Renta Caballeriza / Tack Room';

-- 3) Centros cuyo cobro completo vivía en el módulo de origen — todos sus
-- productos quedan marcados como punto de partida.
UPDATE golf.cat_productos_pos p
SET solo_venta_por_recibo = true
FROM golf.cat_centros_venta c
WHERE p.id_centro_fk = c.id
  AND c.nombre IN ('Membresias', 'Pensiones', 'Cuotas Mantto.');
