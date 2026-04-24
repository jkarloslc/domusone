-- ============================================================
-- MÓDULO HOSPITALITY — Schema en ctrl (tablas ctrl.*)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. Catálogo de lugares / salones ─────────────────────────

CREATE TABLE IF NOT EXISTS ctrl.cat_lugares (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT    NOT NULL,
  capacidad   INT,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Catálogo de tipos de evento ───────────────────────────
-- (se puede poblar con INSERT o gestionar desde catálogos)

CREATE TABLE IF NOT EXISTS ctrl.cat_tipos_evento (
  id       SERIAL PRIMARY KEY,
  nombre   TEXT    NOT NULL,
  color    TEXT    NOT NULL DEFAULT '#6366f1',  -- hex para el calendario
  activo   BOOLEAN NOT NULL DEFAULT true
);

-- Valores iniciales
INSERT INTO ctrl.cat_tipos_evento (nombre, color) VALUES
  ('Boda',              '#ec4899'),
  ('Cumpleaños / Social','#f59e0b'),
  ('Corporativo',       '#6366f1'),
  ('Torneo / Deportivo','#10b981')
ON CONFLICT DO NOTHING;

-- ── 3. Eventos ───────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS ctrl.seq_folio_evento START 1;

CREATE TABLE IF NOT EXISTS ctrl.eventos (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT    NOT NULL UNIQUE
                        DEFAULT ('EVT-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(NEXTVAL('ctrl.seq_folio_evento')::TEXT,3,'0')),
  nombre              TEXT    NOT NULL,
  id_tipo_evento_fk   INT     REFERENCES ctrl.cat_tipos_evento(id),
  id_lugar_fk         INT     REFERENCES ctrl.cat_lugares(id),
  fecha_inicio        DATE    NOT NULL,
  fecha_fin           DATE,
  hora_inicio         TIME,
  hora_fin            TIME,
  num_asistentes      INT,
  responsable         TEXT,
  cliente_nombre      TEXT,
  cliente_telefono    TEXT,
  cliente_email       TEXT,
  notas               TEXT,
  status              TEXT    NOT NULL DEFAULT 'Cotización'
                        CHECK (status IN ('Cotización','Confirmado','En curso','Realizado','Cancelado')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Ingresos del evento (recibos internos EVT-) ───────────

CREATE SEQUENCE IF NOT EXISTS ctrl.seq_folio_recibo_evento START 1;

CREATE TABLE IF NOT EXISTS ctrl.eventos_ingresos (
  id              SERIAL PRIMARY KEY,
  folio           TEXT    NOT NULL UNIQUE
                    DEFAULT ('RHE-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(NEXTVAL('ctrl.seq_folio_recibo_evento')::TEXT,3,'0')),
  id_evento_fk    INT     NOT NULL REFERENCES ctrl.eventos(id) ON DELETE CASCADE,
  descripcion     TEXT    NOT NULL,
  monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_pago      DATE    NOT NULL DEFAULT CURRENT_DATE,
  forma_pago      TEXT    NOT NULL DEFAULT 'Transferencia'
                    CHECK (forma_pago IN ('Efectivo','Transferencia','Tarjeta','Cheque','Otro')),
  referencia      TEXT,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Relación evento ↔ Órdenes de Pago ────────────────────

CREATE TABLE IF NOT EXISTS ctrl.eventos_ops (
  id           SERIAL PRIMARY KEY,
  id_evento_fk INT NOT NULL REFERENCES ctrl.eventos(id) ON DELETE CASCADE,
  id_op_fk     INT NOT NULL,   -- FK lógica a comp.ordenes_pago.id
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_evento_fk, id_op_fk)
);

-- ── 6. RLS ───────────────────────────────────────────────────

ALTER TABLE ctrl.cat_lugares          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.cat_tipos_evento     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.eventos_ingresos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.eventos_ops          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_authenticated_cat_lugares"
  ON ctrl.cat_lugares FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_cat_tipos_evento"
  ON ctrl.cat_tipos_evento FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_eventos"
  ON ctrl.eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_eventos_ingresos"
  ON ctrl.eventos_ingresos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_eventos_ops"
  ON ctrl.eventos_ops FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 7. GRANTs ────────────────────────────────────────────────

GRANT ALL ON ctrl.cat_lugares          TO authenticated;
GRANT ALL ON ctrl.cat_tipos_evento     TO authenticated;
GRANT ALL ON ctrl.eventos              TO authenticated;
GRANT ALL ON ctrl.eventos_ingresos     TO authenticated;
GRANT ALL ON ctrl.eventos_ops          TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE ctrl.seq_folio_evento         TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.seq_folio_recibo_evento  TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ctrl TO authenticated;

-- ── 8. Trigger updated_at ────────────────────────────────────

CREATE OR REPLACE FUNCTION ctrl.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_eventos_updated_at ON ctrl.eventos;
CREATE TRIGGER trg_eventos_updated_at
  BEFORE UPDATE ON ctrl.eventos
  FOR EACH ROW EXECUTE FUNCTION ctrl.set_updated_at();
