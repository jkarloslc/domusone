-- Rediseño: catálogo de servicios + registros por periodo

-- Eliminar tabla monolítica anterior si existe
DROP TABLE IF EXISTS ctrl.servicios_suministros CASCADE;

-- ── Catálogo de servicios (se captura una sola vez) ─────────
CREATE TABLE IF NOT EXISTS ctrl.servicios_catalogo (
  id            BIGSERIAL PRIMARY KEY,
  no_servicio   TEXT        NOT NULL,
  ubicacion     TEXT,
  tipo_servicio TEXT        NOT NULL CHECK (tipo_servicio IN ('CFE', 'Agua')),
  modalidad     TEXT        NOT NULL CHECK (modalidad IN ('Mensual', 'Bimestral')),
  notas         TEXT,
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_svc_cat_tipo   ON ctrl.servicios_catalogo (tipo_servicio);
CREATE INDEX IF NOT EXISTS idx_svc_cat_activo ON ctrl.servicios_catalogo (activo);

-- ── Registros por periodo (captura recurrente) ───────────────
CREATE TABLE IF NOT EXISTS ctrl.servicios_registros (
  id                 BIGSERIAL PRIMARY KEY,
  id_servicio_fk     BIGINT      NOT NULL REFERENCES ctrl.servicios_catalogo(id) ON DELETE CASCADE,
  fecha_periodo      DATE        NOT NULL,
  consumo_periodo    NUMERIC,
  monto_periodo      NUMERIC     NOT NULL DEFAULT 0,
  notas              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_svc_reg_servicio ON ctrl.servicios_registros (id_servicio_fk);
CREATE INDEX IF NOT EXISTS idx_svc_reg_periodo  ON ctrl.servicios_registros (fecha_periodo DESC);

-- Permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.servicios_catalogo  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.servicios_registros TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.servicios_catalogo_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.servicios_registros_id_seq TO authenticated;
