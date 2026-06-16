-- ══════════════════════════════════════════════════════════════
-- Refactor cuotas: cabecera + detalle de precios por sección/clasificación
-- ══════════════════════════════════════════════════════════════

-- 1. Eliminar columnas que ahora van en el detalle
ALTER TABLE cfg.cuotas_estandar
  DROP COLUMN IF EXISTS id_seccion_fk,
  DROP COLUMN IF EXISTS id_clasificacion_fk,
  DROP COLUMN IF EXISTS monto;

-- 2. Tabla de precios por sección × clasificación
CREATE TABLE IF NOT EXISTS cfg.cuotas_estandar_det (
  id                    bigserial    PRIMARY KEY,
  id_cuota_fk           bigint       NOT NULL REFERENCES cfg.cuotas_estandar(id) ON DELETE CASCADE,
  id_seccion_fk         bigint       NOT NULL REFERENCES cfg.secciones(id),
  id_clasificacion_fk   bigint       NOT NULL REFERENCES cfg.clasificacion(id),
  monto                 numeric(12,2) NOT NULL DEFAULT 0,
  activo                boolean      NOT NULL DEFAULT true,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (id_cuota_fk, id_seccion_fk, id_clasificacion_fk)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.cuotas_estandar_det TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE cfg.cuotas_estandar_det_id_seq TO anon, authenticated;

-- 3. Trazabilidad: qué cuota estándar generó cada cargo
ALTER TABLE ctrl.cargos
  ADD COLUMN IF NOT EXISTS id_cuota_estandar_fk bigint REFERENCES cfg.cuotas_estandar(id);

-- 4. cuotas_lotes se reconvierte en "tarifas excepcionales"
--    id_cuota_estandar_fk ya existe; agregamos motivo para documentar la excepción
ALTER TABLE ctrl.cuotas_lotes
  ADD COLUMN IF NOT EXISTS motivo_excepcion text;
