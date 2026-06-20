-- Inscripciones a torneos de golf: jugadores (socio o invitado), status de pago
-- y vínculo a ticket POS. Centro de venta dedicado "Torneos" para no mezclar
-- esta venta con Green Fees / Proshop en reportes y corte POS.

INSERT INTO golf.cat_centros_venta (nombre, descripcion, orden)
VALUES ('Torneos', 'Inscripciones a torneos de golf', 4)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ctrl.torneo_jugadores (
  id               BIGSERIAL PRIMARY KEY,
  id_evento_fk     BIGINT NOT NULL REFERENCES ctrl.eventos(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('Miembro','Invitado')),
  id_socio_fk      INTEGER REFERENCES golf.cat_socios(id),
  nombre_completo  TEXT NOT NULL,
  tel_contacto     TEXT,
  handicap         NUMERIC(4,1),
  hoyo             TEXT,
  status           TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pagado','Pendiente','Cancelado')),
  inscripcion      NUMERIC(12,2) NOT NULL DEFAULT 0,
  pago             NUMERIC(12,2) NOT NULL DEFAULT 0,
  por_cobrar       NUMERIC(12,2) GENERATED ALWAYS AS (inscripcion - pago) STORED,
  id_venta_pos_fk  INTEGER REFERENCES golf.ctrl_ventas(id),
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_torneo_jugadores_evento ON ctrl.torneo_jugadores(id_evento_fk);
CREATE INDEX IF NOT EXISTS idx_torneo_jugadores_socio  ON ctrl.torneo_jugadores(id_socio_fk);
CREATE UNIQUE INDEX IF NOT EXISTS idx_torneo_jugadores_venta_pos_uniq
  ON ctrl.torneo_jugadores(id_venta_pos_fk) WHERE id_venta_pos_fk IS NOT NULL;

ALTER TABLE ctrl.torneo_jugadores ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.torneo_jugadores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.torneo_jugadores TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.torneo_jugadores_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.torneo_jugadores_id_seq TO service_role;

DROP POLICY IF EXISTS "torneo_jugadores_select" ON ctrl.torneo_jugadores;
CREATE POLICY "torneo_jugadores_select" ON ctrl.torneo_jugadores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "torneo_jugadores_insert" ON ctrl.torneo_jugadores;
CREATE POLICY "torneo_jugadores_insert" ON ctrl.torneo_jugadores FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "torneo_jugadores_update" ON ctrl.torneo_jugadores;
CREATE POLICY "torneo_jugadores_update" ON ctrl.torneo_jugadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "torneo_jugadores_delete" ON ctrl.torneo_jugadores;
CREATE POLICY "torneo_jugadores_delete" ON ctrl.torneo_jugadores FOR DELETE TO authenticated USING (true);
