-- Puntos de conexión por servicio (medidores, tomas, circuitos, etc.)
CREATE TABLE ctrl.servicios_puntos_conexion (
  id             BIGSERIAL    PRIMARY KEY,
  id_servicio_fk BIGINT       NOT NULL REFERENCES ctrl.servicios_catalogo(id) ON DELETE CASCADE,
  nombre         TEXT         NOT NULL,
  tipo           TEXT,
  referencia     TEXT,
  ubicacion      TEXT,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON ctrl.servicios_puntos_conexion(id_servicio_fk);

ALTER TABLE ctrl.servicios_puntos_conexion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_puntos_conexion"
  ON ctrl.servicios_puntos_conexion FOR ALL
  USING (true) WITH CHECK (true);
