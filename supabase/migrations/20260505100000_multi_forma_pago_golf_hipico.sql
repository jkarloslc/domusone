-- ============================================================
-- Multi-forma de pago: Golf (recibos_golf) y Hípico (ctrl_pagos)
-- ============================================================

-- ── Golf: líneas de pago del recibo ──────────────────────────
CREATE TABLE IF NOT EXISTS golf.recibos_golf_pagos (
  id               SERIAL PRIMARY KEY,
  id_recibo_fk     INTEGER NOT NULL REFERENCES golf.recibos_golf(id) ON DELETE CASCADE,
  id_forma_pago_fk INTEGER REFERENCES cfg.formas_pago(id),
  forma_nombre     TEXT NOT NULL,
  monto            NUMERIC(12,2) NOT NULL DEFAULT 0,
  referencia       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON golf.recibos_golf_pagos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.recibos_golf_pagos_id_seq TO authenticated;

-- ── Hípico: líneas de pago del ctrl_pagos ────────────────────
CREATE TABLE IF NOT EXISTS hip.ctrl_pagos_formas (
  id            SERIAL PRIMARY KEY,
  id_pago_fk    INTEGER NOT NULL REFERENCES hip.ctrl_pagos(id) ON DELETE CASCADE,
  id_forma_fk   INTEGER REFERENCES cfg.formas_pago(id),
  forma_nombre  TEXT NOT NULL,
  monto         NUMERIC(12,2) NOT NULL DEFAULT 0,
  referencia    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON hip.ctrl_pagos_formas TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.ctrl_pagos_formas_id_seq TO authenticated;
