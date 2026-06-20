-- ============================================================
--  GOLF — Pases: política anual para otorgar pases de invitado
--  al cobrar cuotas (12 mensualidades completas / pronto pago)
-- ============================================================

CREATE TABLE IF NOT EXISTS golf.cfg_pases_politica (
  id                            bigserial     PRIMARY KEY,
  anio                          integer       NOT NULL UNIQUE,
  pases_anuales_12_cuotas       integer       NOT NULL DEFAULT 0,
  pases_mensuales_pronto_pago   integer       NOT NULL DEFAULT 0,
  dia_limite_pronto_pago        integer       NOT NULL DEFAULT 5,
  created_at                    timestamptz   NOT NULL DEFAULT now(),
  updated_at                    timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO golf.cfg_pases_politica (anio, pases_anuales_12_cuotas, pases_mensuales_pronto_pago, dia_limite_pronto_pago)
VALUES (2026, 24, 2, 5)
ON CONFLICT (anio) DO NOTHING;

GRANT ALL ON golf.cfg_pases_politica TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cfg_pases_politica_id_seq TO anon, authenticated;
ALTER TABLE golf.cfg_pases_politica ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.cfg_pases_politica;
CREATE POLICY "allow_all" ON golf.cfg_pases_politica
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
