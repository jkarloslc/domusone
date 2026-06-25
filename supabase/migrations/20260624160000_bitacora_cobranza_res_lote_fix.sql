-- ── Corrección: ctrl.bitacora_cobranza_res → FK a lote, no propietario ──
-- La migración 20260624150000 ya corrió con id_propietario_fk.
-- Este script la reemplaza: elimina la tabla (sin datos aún) y la
-- recrea con id_lote_fk REFERENCES cat.lotes(id), que es la entidad
-- deudora correcta en Residencial.

DROP TABLE IF EXISTS ctrl.bitacora_cobranza_res CASCADE;

CREATE TABLE ctrl.bitacora_cobranza_res (
  id                     BIGSERIAL PRIMARY KEY,
  id_lote_fk             INT NOT NULL REFERENCES cat.lotes(id) ON DELETE CASCADE,
  fecha_contacto         DATE         NOT NULL DEFAULT CURRENT_DATE,
  canal                  VARCHAR(20)  NOT NULL DEFAULT 'Llamada',
  respuesta              TEXT,
  seguimiento            VARCHAR(30)  NOT NULL DEFAULT 'Contactar de nuevo',
  fecha_proximo_contacto DATE,
  notas                  TEXT,
  usuario_nombre         VARCHAR(120),
  created_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_bit_cob_res_lote ON ctrl.bitacora_cobranza_res(id_lote_fk);
CREATE INDEX idx_bit_cob_res_next ON ctrl.bitacora_cobranza_res(fecha_proximo_contacto)
  WHERE seguimiento <> 'Cerrado';

ALTER TABLE ctrl.bitacora_cobranza_res ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.bitacora_cobranza_res TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.bitacora_cobranza_res_id_seq TO authenticated;

DROP POLICY IF EXISTS "bitacora_cobranza_res_select" ON ctrl.bitacora_cobranza_res;
CREATE POLICY "bitacora_cobranza_res_select"
  ON ctrl.bitacora_cobranza_res FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bitacora_cobranza_res_insert" ON ctrl.bitacora_cobranza_res;
CREATE POLICY "bitacora_cobranza_res_insert"
  ON ctrl.bitacora_cobranza_res FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bitacora_cobranza_res_update" ON ctrl.bitacora_cobranza_res;
CREATE POLICY "bitacora_cobranza_res_update"
  ON ctrl.bitacora_cobranza_res FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bitacora_cobranza_res_delete" ON ctrl.bitacora_cobranza_res;
CREATE POLICY "bitacora_cobranza_res_delete"
  ON ctrl.bitacora_cobranza_res FOR DELETE TO authenticated USING (true);
