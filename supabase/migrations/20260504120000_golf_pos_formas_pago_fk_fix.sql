-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: Eliminar cat_formas_pago_pos y redirigir FK a cfg.formas_pago
-- Las formas de pago del POS ahora se toman de la tabla global cfg.formas_pago
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Eliminar FK de ctrl_ventas_pagos → cat_formas_pago_pos
ALTER TABLE golf.ctrl_ventas_pagos
  DROP CONSTRAINT IF EXISTS ctrl_ventas_pagos_id_forma_fk_fkey;

-- 2. Agregar nueva FK → cfg.formas_pago
ALTER TABLE golf.ctrl_ventas_pagos
  ADD CONSTRAINT ctrl_ventas_pagos_id_forma_fk_fkey
  FOREIGN KEY (id_forma_fk) REFERENCES cfg.formas_pago(id) ON DELETE SET NULL;

-- 3. Eliminar FK de ctrl_cortes_caja_det → cat_formas_pago_pos (si existe)
ALTER TABLE golf.ctrl_cortes_caja_det
  DROP CONSTRAINT IF EXISTS ctrl_cortes_caja_det_id_forma_fk_fkey;

-- 4. Eliminar la tabla obsoleta (ya no se usa)
DROP TABLE IF EXISTS golf.cat_formas_pago_pos CASCADE;
