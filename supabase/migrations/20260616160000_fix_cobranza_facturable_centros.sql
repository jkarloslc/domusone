-- ════════════════════════════════════════════════════════════════
-- DOMUSONE — Fix cobranza/cuotas/pensiones: facturable + centro POS
-- Migración: 20260616160000
-- ════════════════════════════════════════════════════════════════

-- ── 1. Facturable en recibos de pensión hípica (paridad con golf) ──
ALTER TABLE hip.recibos_hip
  ADD COLUMN IF NOT EXISTS facturable BOOLEAN DEFAULT false;

-- ── 2. Mapeo explícito de centro de venta POS para cobranza golf ──
-- Reemplaza la heurística por nombre (.includes('membresia')/'club'/'carrito')
-- por una selección explícita configurable en Golf > Carritos > Configuración.
ALTER TABLE golf.cfg_carritos
  ADD COLUMN IF NOT EXISTS id_centro_membresias_fk INTEGER REFERENCES golf.cat_centros_venta(id),
  ADD COLUMN IF NOT EXISTS id_centro_pension_fk     INTEGER REFERENCES golf.cat_centros_venta(id);
