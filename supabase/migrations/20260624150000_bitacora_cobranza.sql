-- ── Bitácora de Seguimiento de Cobranza ──────────────────────
-- Tres tablas separadas (una por módulo) para mantener FK estricta.
-- Residencial: la entidad deudora es el LOTE (no el propietario,
--   que puede cambiar), con FK a cat.lotes(id).
-- Cada tabla incluye RLS habilitado + GRANT + políticas para authenticated.

-- ════════════════════════════════════════════════════════════
-- Golf: seguimiento por socio
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS golf.bitacora_cobranza (
  id                     BIGSERIAL PRIMARY KEY,
  id_socio_fk            INT NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  fecha_contacto         DATE         NOT NULL DEFAULT CURRENT_DATE,
  canal                  VARCHAR(20)  NOT NULL DEFAULT 'Llamada',
  respuesta              TEXT,
  seguimiento            VARCHAR(30)  NOT NULL DEFAULT 'Contactar de nuevo',
  fecha_proximo_contacto DATE,
  notas                  TEXT,
  usuario_nombre         VARCHAR(120),
  created_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bit_cob_golf_socio ON golf.bitacora_cobranza(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_bit_cob_golf_next  ON golf.bitacora_cobranza(fecha_proximo_contacto)
  WHERE seguimiento <> 'Cerrado';

ALTER TABLE golf.bitacora_cobranza ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON golf.bitacora_cobranza TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.bitacora_cobranza_id_seq TO authenticated;

DROP POLICY IF EXISTS "bitacora_cobranza_golf_select" ON golf.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_golf_select"
  ON golf.bitacora_cobranza FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bitacora_cobranza_golf_insert" ON golf.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_golf_insert"
  ON golf.bitacora_cobranza FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bitacora_cobranza_golf_update" ON golf.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_golf_update"
  ON golf.bitacora_cobranza FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bitacora_cobranza_golf_delete" ON golf.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_golf_delete"
  ON golf.bitacora_cobranza FOR DELETE TO authenticated USING (true);

-- ════════════════════════════════════════════════════════════
-- Residencial: seguimiento por LOTE (entidad deudora)
-- El propietario puede cambiar; el adeudo pertenece al lote.
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ctrl.bitacora_cobranza_res (
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

CREATE INDEX IF NOT EXISTS idx_bit_cob_res_lote ON ctrl.bitacora_cobranza_res(id_lote_fk);
CREATE INDEX IF NOT EXISTS idx_bit_cob_res_next ON ctrl.bitacora_cobranza_res(fecha_proximo_contacto)
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

-- ════════════════════════════════════════════════════════════
-- Hípico: seguimiento por arrendatario
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hip.bitacora_cobranza (
  id                     BIGSERIAL PRIMARY KEY,
  id_arrendatario_fk     INT NOT NULL REFERENCES hip.cat_arrendatarios(id) ON DELETE CASCADE,
  fecha_contacto         DATE         NOT NULL DEFAULT CURRENT_DATE,
  canal                  VARCHAR(20)  NOT NULL DEFAULT 'Llamada',
  respuesta              TEXT,
  seguimiento            VARCHAR(30)  NOT NULL DEFAULT 'Contactar de nuevo',
  fecha_proximo_contacto DATE,
  notas                  TEXT,
  usuario_nombre         VARCHAR(120),
  created_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bit_cob_hip_arr  ON hip.bitacora_cobranza(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_bit_cob_hip_next ON hip.bitacora_cobranza(fecha_proximo_contacto)
  WHERE seguimiento <> 'Cerrado';

ALTER TABLE hip.bitacora_cobranza ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON hip.bitacora_cobranza TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.bitacora_cobranza_id_seq TO authenticated;

DROP POLICY IF EXISTS "bitacora_cobranza_hip_select" ON hip.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_hip_select"
  ON hip.bitacora_cobranza FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bitacora_cobranza_hip_insert" ON hip.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_hip_insert"
  ON hip.bitacora_cobranza FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bitacora_cobranza_hip_update" ON hip.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_hip_update"
  ON hip.bitacora_cobranza FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bitacora_cobranza_hip_delete" ON hip.bitacora_cobranza;
CREATE POLICY "bitacora_cobranza_hip_delete"
  ON hip.bitacora_cobranza FOR DELETE TO authenticated USING (true);
