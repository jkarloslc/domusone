-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo: Estatus del Campo (Mantto. Campo → Golf)
-- Bitácora de apertura/cierre del campo y de los caminos.
-- Un mismo día puede tener varios registros (ej. cerrado por lluvia en la
-- mañana y abierto para la segunda ronda por la tarde). El reporte de
-- estadística clasifica cada día como abierto/cerrado/parcial a partir de
-- los registros existentes ese día.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS golf.estatus_campo (
  id              bigserial PRIMARY KEY,
  fecha           date NOT NULL,
  status_campo    text NOT NULL
    CHECK (status_campo IN ('abierto', 'cerrado', 'parcial')),
  status_caminos  text NOT NULL DEFAULT 'abierto'
    CHECK (status_caminos IN ('abierto', 'cerrado', 'parcial')),
  franja          text,        -- ej. "Todo el día", "Mañana", "A partir de las 14:00"
  motivo          text,        -- ej. "Lluvia / anegación", "Torneo", "Mantenimiento"
  observaciones   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE golf.estatus_campo IS
  'Bitácora de status del campo (abierto/cerrado/parcial) y de los caminos por día. Un día puede tener varios registros (ej. cerrado por lluvia en la mañana, abierto en la tarde).';

CREATE INDEX IF NOT EXISTS idx_estatus_campo_fecha ON golf.estatus_campo(fecha);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE golf.estatus_campo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_estatus_campo ON golf.estatus_campo;
CREATE POLICY auth_all_estatus_campo
  ON golf.estatus_campo FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── GRANTs ────────────────────────────────────────────────────────────────────
GRANT ALL ON golf.estatus_campo TO authenticated;
GRANT ALL ON golf.estatus_campo TO anon;
GRANT USAGE, SELECT ON SEQUENCE golf.estatus_campo_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.estatus_campo_id_seq TO anon;
