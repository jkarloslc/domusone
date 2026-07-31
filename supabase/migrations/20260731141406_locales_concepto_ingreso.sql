-- ============================================================
-- Locales: Concepto de Ingreso global para tickets POS
-- Fecha: 2026-07-31
-- ------------------------------------------------------------
-- Mismo patrón que hip.cfg_hip.id_concepto_ingreso_fk: los tickets
-- POS generados desde Cobranza de Locales (CobrarModal.tsx / page.tsx
-- handleTicketPOS) insertaban ctrl_ventas_det sin id_concepto_ingreso_fk,
-- por lo que el corte siempre distribuía ese ingreso a "Otros" dentro
-- del centro de ingreso "Locales Comerciales" en vez de a un concepto
-- propio. Esta tabla permite configurar ese concepto una sola vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS ctrl.loc_cfg (
  id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  id_concepto_ingreso_fk  INTEGER REFERENCES cfg.conceptos_ingreso(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ctrl.loc_cfg (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE ctrl.loc_cfg ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loc_cfg_select" ON ctrl.loc_cfg;
DROP POLICY IF EXISTS "loc_cfg_update" ON ctrl.loc_cfg;
CREATE POLICY "loc_cfg_select" ON ctrl.loc_cfg FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_cfg_update" ON ctrl.loc_cfg FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON ctrl.loc_cfg TO authenticated;
GRANT SELECT, UPDATE ON ctrl.loc_cfg TO service_role;
