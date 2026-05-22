-- Tabla de servicios de suministros (CFE, Agua) para el módulo de Mantenimiento
CREATE TABLE IF NOT EXISTS ctrl.servicios_suministros (
  id               BIGSERIAL PRIMARY KEY,
  no_servicio      TEXT        NOT NULL,
  ubicacion        TEXT,
  tipo_servicio    TEXT        NOT NULL CHECK (tipo_servicio IN ('CFE', 'Agua')),
  modalidad        TEXT        NOT NULL CHECK (modalidad IN ('Mensual', 'Bimestral')),
  consumo_periodo  NUMERIC,
  monto_periodo    NUMERIC     NOT NULL DEFAULT 0,
  fecha_periodo    DATE        NOT NULL,
  notas            TEXT,
  activo           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de búsqueda/filtro frecuentes
CREATE INDEX IF NOT EXISTS idx_svc_tipo     ON ctrl.servicios_suministros (tipo_servicio);
CREATE INDEX IF NOT EXISTS idx_svc_periodo  ON ctrl.servicios_suministros (fecha_periodo DESC);
CREATE INDEX IF NOT EXISTS idx_svc_activo   ON ctrl.servicios_suministros (activo);

-- Permisos para el rol de app
GRANT SELECT, INSERT, UPDATE ON ctrl.servicios_suministros TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.servicios_suministros_id_seq TO authenticated;
