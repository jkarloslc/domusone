-- ─────────────────────────────────────────────────────────────────────────────
-- CAPEX: diferencia Maquinaria (cfg.equipos) de Equipo Menor (cfg.herramientas)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. capex_insumos — nuevas FKs y tipo actualizado ──────────────────────────

-- FK a cfg.equipos (maquinaria pesada)
ALTER TABLE ctrl.capex_insumos
  ADD COLUMN IF NOT EXISTS id_equipo_fk bigint REFERENCES cfg.equipos(id) ON DELETE SET NULL;

-- FK a cfg.herramientas (equipo menor)
ALTER TABLE ctrl.capex_insumos
  ADD COLUMN IF NOT EXISTS id_herramienta_fk bigint REFERENCES cfg.herramientas(id) ON DELETE SET NULL;

-- Actualizar CHECK para incluir 'equipo_menor'
ALTER TABLE ctrl.capex_insumos DROP CONSTRAINT IF EXISTS capex_insumos_tipo_check;
ALTER TABLE ctrl.capex_insumos
  ADD CONSTRAINT capex_insumos_tipo_check
  CHECK (tipo IN ('material', 'mano_obra', 'maquinaria', 'equipo_menor'));

-- ── 2. capex_partidas — agrega pu_equipo_menor, regenera columnas ─────────────

-- Eliminar columnas generadas que dependen de pu_total / monto_total
ALTER TABLE ctrl.capex_partidas DROP COLUMN IF EXISTS monto_total;
ALTER TABLE ctrl.capex_partidas DROP COLUMN IF EXISTS monto_maquinaria;
ALTER TABLE ctrl.capex_partidas DROP COLUMN IF EXISTS monto_mano_obra;
ALTER TABLE ctrl.capex_partidas DROP COLUMN IF EXISTS monto_materiales;
ALTER TABLE ctrl.capex_partidas DROP COLUMN IF EXISTS pu_total;

-- Agregar precio unitario de equipo menor
ALTER TABLE ctrl.capex_partidas
  ADD COLUMN IF NOT EXISTS pu_equipo_menor numeric(14,4) NOT NULL DEFAULT 0;

-- Recrear columnas generadas con la fórmula actualizada
ALTER TABLE ctrl.capex_partidas
  ADD COLUMN pu_total numeric(14,4)
    GENERATED ALWAYS AS (pu_materiales + pu_mano_obra + pu_maquinaria + pu_equipo_menor) STORED;

ALTER TABLE ctrl.capex_partidas
  ADD COLUMN monto_materiales numeric(16,2)
    GENERATED ALWAYS AS (ROUND(cantidad * pu_materiales, 2)) STORED;

ALTER TABLE ctrl.capex_partidas
  ADD COLUMN monto_mano_obra numeric(16,2)
    GENERATED ALWAYS AS (ROUND(cantidad * pu_mano_obra, 2)) STORED;

ALTER TABLE ctrl.capex_partidas
  ADD COLUMN monto_maquinaria numeric(16,2)
    GENERATED ALWAYS AS (ROUND(cantidad * pu_maquinaria, 2)) STORED;

ALTER TABLE ctrl.capex_partidas
  ADD COLUMN monto_equipo_menor numeric(16,2)
    GENERATED ALWAYS AS (ROUND(cantidad * pu_equipo_menor, 2)) STORED;

ALTER TABLE ctrl.capex_partidas
  ADD COLUMN monto_total numeric(16,2)
    GENERATED ALWAYS AS (
      ROUND(cantidad * (pu_materiales + pu_mano_obra + pu_maquinaria + pu_equipo_menor), 2)
    ) STORED;

-- ── 3. Índices adicionales ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_capex_insumos_equipo      ON ctrl.capex_insumos(id_equipo_fk);
CREATE INDEX IF NOT EXISTS idx_capex_insumos_herramienta ON ctrl.capex_insumos(id_herramienta_fk);
