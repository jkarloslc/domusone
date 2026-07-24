-- ─────────────────────────────────────────────────────────────────
-- Vincula cuotas de Golf (Membresía/Mensualidad, Pensión Carrito) y
-- Renta de Caballerizas (Hípico) a un Concepto de Ingreso propio, para
-- que el corte POS las distribuya a su partida correspondiente en vez
-- de caer siempre en "Otros" (ver golf/pos/distribucionIngreso.ts:
-- las líneas de ctrl_ventas_det generadas desde estos flujos nunca
-- traen id_producto_fk, así que el mapeo producto→concepto no aplica).
-- ─────────────────────────────────────────────────────────────────

-- 1. Concepto asignado a cada tipo/config de cuota de Golf
ALTER TABLE golf.cat_cuotas_config
  ADD COLUMN IF NOT EXISTS id_concepto_ingreso_fk INTEGER REFERENCES cfg.conceptos_ingreso(id);

-- 2. Concepto asignado a la renta de caballerizas (config global de Hípico)
ALTER TABLE hip.cfg_hip
  ADD COLUMN IF NOT EXISTS id_concepto_ingreso_fk INTEGER REFERENCES cfg.conceptos_ingreso(id);

-- 3. Override directo por línea de ticket POS: se captura al generar el
--    ticket (desde el concepto de la cuota/renta vigente en ese momento),
--    y tiene prioridad sobre el mapeo por producto en distribucionIngreso.ts
ALTER TABLE golf.ctrl_ventas_det
  ADD COLUMN IF NOT EXISTS id_concepto_ingreso_fk INTEGER REFERENCES cfg.conceptos_ingreso(id);
