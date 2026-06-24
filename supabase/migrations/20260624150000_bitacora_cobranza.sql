-- ── Bitácora de Seguimiento de Cobranza ──────────────────────
-- Tres tablas separadas (una por módulo) para mantener FK estricta.
-- Campos comunes: fecha_contacto, canal, respuesta, seguimiento,
--                 fecha_proximo_contacto, notas, usuario_nombre, created_at.

-- ── Golf: seguimiento por socio ─────────────────────────────
CREATE TABLE IF NOT EXISTS golf.bitacora_cobranza (
  id                     BIGSERIAL PRIMARY KEY,
  id_socio_fk            INT NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  fecha_contacto         DATE NOT NULL DEFAULT CURRENT_DATE,
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

-- ── Residencial: seguimiento por propietario ─────────────────
CREATE TABLE IF NOT EXISTS ctrl.bitacora_cobranza_res (
  id                     BIGSERIAL PRIMARY KEY,
  id_propietario_fk      INT NOT NULL REFERENCES cat.propietarios(id) ON DELETE CASCADE,
  fecha_contacto         DATE NOT NULL DEFAULT CURRENT_DATE,
  canal                  VARCHAR(20)  NOT NULL DEFAULT 'Llamada',
  respuesta              TEXT,
  seguimiento            VARCHAR(30)  NOT NULL DEFAULT 'Contactar de nuevo',
  fecha_proximo_contacto DATE,
  notas                  TEXT,
  usuario_nombre         VARCHAR(120),
  created_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bit_cob_res_prop ON ctrl.bitacora_cobranza_res(id_propietario_fk);
CREATE INDEX IF NOT EXISTS idx_bit_cob_res_next ON ctrl.bitacora_cobranza_res(fecha_proximo_contacto)
  WHERE seguimiento <> 'Cerrado';

-- ── Hípico: seguimiento por arrendatario ─────────────────────
CREATE TABLE IF NOT EXISTS hip.bitacora_cobranza (
  id                     BIGSERIAL PRIMARY KEY,
  id_arrendatario_fk     INT NOT NULL REFERENCES hip.cat_arrendatarios(id) ON DELETE CASCADE,
  fecha_contacto         DATE NOT NULL DEFAULT CURRENT_DATE,
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
