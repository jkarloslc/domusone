-- Inscripciones a la Federación Mexicana de Golf por socio y año
CREATE TABLE IF NOT EXISTS golf.ctrl_federacion (
  id               BIGSERIAL PRIMARY KEY,
  id_socio_fk      BIGINT NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  clave            TEXT,
  periodo          INT NOT NULL,
  comprobante_url  TEXT,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_socio_fk, periodo)
);

CREATE INDEX IF NOT EXISTS idx_fed_socio  ON golf.ctrl_federacion (id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_fed_periodo ON golf.ctrl_federacion (periodo DESC);

-- Permisos (misma política que otras tablas golf)
GRANT SELECT, INSERT, UPDATE, DELETE ON golf.ctrl_federacion TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_federacion_id_seq TO authenticated;
