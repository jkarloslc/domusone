-- ============================================================
-- Hípico Cobranza: ajustes para módulo refactorizado
-- 2026-06-13
-- ============================================================

-- ── 1. cat_caballerizas: agregar columna status ──────────────
-- La página de caballerizas y AsignacionModal la requieren.
ALTER TABLE hip.cat_caballerizas
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Libre';

-- Aplicar el CHECK solo si la columna es nueva (safe con IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cat_caballerizas_status_check'
      AND conrelid = 'hip.cat_caballerizas'::regclass
  ) THEN
    ALTER TABLE hip.cat_caballerizas
      ADD CONSTRAINT cat_caballerizas_status_check
      CHECK (status IN ('Libre','Rentada','Ocupada','Mantenimiento','Bloqueada'));
  END IF;
END $$;

-- ── 2. ctrl_cargos.status: agregar 'Pago Parcial' al CHECK ───
-- El módulo de cobranza necesita marcar pagos parciales.
ALTER TABLE hip.ctrl_cargos
  DROP CONSTRAINT IF EXISTS ctrl_cargos_status_check;

ALTER TABLE hip.ctrl_cargos
  ADD CONSTRAINT ctrl_cargos_status_check
  CHECK (status IN ('Pendiente','Pagado','Vencido','Cancelado','Pago Parcial'));

-- ── 3. ctrl_pagos.forma_pago: liberar restricción ────────────
-- Con multi-forma de pago, el campo resumen puede ser
-- "Efectivo + Transferencia" u otras combinaciones.
ALTER TABLE hip.ctrl_pagos
  DROP CONSTRAINT IF EXISTS ctrl_pagos_forma_pago_check;

-- El campo queda como TEXT libre (sin CHECK). La semántica
-- multi-forma se guarda en ctrl_pagos_formas.

-- ── 4. Índice por mes_aplicacion en ctrl_cargos ──────────────
-- Acelera el filtro por mes en la tab Cobranza.
CREATE INDEX IF NOT EXISTS idx_cargos_mes_aplicacion
  ON hip.ctrl_cargos(mes_aplicacion);

-- ── 5. Índice por status en ctrl_cargos ──────────────────────
-- Ya existe en el schema base pero lo aseguramos:
CREATE INDEX IF NOT EXISTS idx_cargos_status
  ON hip.ctrl_cargos(status);
