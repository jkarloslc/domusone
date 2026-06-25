-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo Proyectos CAPEX
-- Jerarquía: capex_proyectos → capex_frentes → capex_partidas → capex_insumos
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Proyectos CAPEX (cabecera) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.capex_proyectos (
  id                   bigserial PRIMARY KEY,
  folio                text UNIQUE,
  nombre               text NOT NULL,
  descripcion          text,
  id_centro_costo_fk   bigint REFERENCES cfg.centros_costo(id) ON DELETE SET NULL,
  id_area_fk           bigint REFERENCES cfg.areas(id)          ON DELETE SET NULL,
  tipo                 text,
  status               text NOT NULL DEFAULT 'Borrador'
    CHECK (status IN ('Borrador','En Revisión','Aprobado','En Ejecución','Terminado','Cancelado')),
  fecha_inicio         date,
  fecha_fin_estimada   date,
  fecha_fin_real       date,
  monto_presupuestado  numeric(16,2) DEFAULT 0,
  notas                text,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ctrl.capex_proyectos IS 'Proyectos de inversión CAPEX. Sin relación con proyectos residenciales de lotes.';

-- ── 2. Frentes de obra (por proyecto) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.capex_frentes (
  id              bigserial PRIMARY KEY,
  id_proyecto_fk  bigint NOT NULL REFERENCES ctrl.capex_proyectos(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  descripcion     text,
  orden           int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ctrl.capex_frentes IS 'Frentes de obra específicos de cada proyecto CAPEX (≠ cfg.frentes).';

-- ── 3. Partidas / Conceptos de obra (APU cabecera) ───────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.capex_partidas (
  id              bigserial PRIMARY KEY,
  id_frente_fk    bigint NOT NULL REFERENCES ctrl.capex_frentes(id) ON DELETE CASCADE,
  clave           text,
  descripcion     text NOT NULL,
  unidad          text NOT NULL DEFAULT 'm²',
  cantidad        numeric(14,4) NOT NULL DEFAULT 0,

  -- Precio Unitario por tipo (almacenado; se recalcula al guardar insumos)
  pu_materiales   numeric(14,4) NOT NULL DEFAULT 0,
  pu_mano_obra    numeric(14,4) NOT NULL DEFAULT 0,
  pu_maquinaria   numeric(14,4) NOT NULL DEFAULT 0,

  -- Columnas generadas (solo lectura)
  pu_total         numeric(14,4) GENERATED ALWAYS AS (pu_materiales + pu_mano_obra + pu_maquinaria) STORED,
  monto_materiales numeric(16,2) GENERATED ALWAYS AS (ROUND(cantidad * pu_materiales, 2)) STORED,
  monto_mano_obra  numeric(16,2) GENERATED ALWAYS AS (ROUND(cantidad * pu_mano_obra, 2))  STORED,
  monto_maquinaria numeric(16,2) GENERATED ALWAYS AS (ROUND(cantidad * pu_maquinaria, 2)) STORED,
  monto_total      numeric(16,2) GENERATED ALWAYS AS (ROUND(cantidad * (pu_materiales + pu_mano_obra + pu_maquinaria), 2)) STORED,

  orden           int  NOT NULL DEFAULT 0
);

COMMENT ON TABLE ctrl.capex_partidas IS 'Conceptos de obra CAPEX. pu_* se actualizan al guardar insumos.';

-- ── 4. Insumos del APU (detalle por partida) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.capex_insumos (
  id                bigserial PRIMARY KEY,
  id_partida_fk     bigint NOT NULL REFERENCES ctrl.capex_partidas(id) ON DELETE CASCADE,
  tipo              text  NOT NULL
    CHECK (tipo IN ('material', 'mano_obra', 'maquinaria')),

  -- FK condicional: material/maquinaria → comp.articulos; mano_obra → cfg.colaboradores
  id_articulo_fk    bigint REFERENCES comp.articulos(id)    ON DELETE SET NULL,
  id_colaborador_fk bigint REFERENCES cfg.colaboradores(id) ON DELETE SET NULL,

  -- Descripción almacenada inline para independencia del catálogo
  descripcion       text NOT NULL,
  unidad            text,
  cantidad          numeric(14,4) NOT NULL DEFAULT 0,
  precio_unitario   numeric(14,4) NOT NULL DEFAULT 0,

  monto             numeric(14,4) GENERATED ALWAYS AS (ROUND(cantidad * precio_unitario, 4)) STORED,

  orden             int  NOT NULL DEFAULT 0
);

COMMENT ON TABLE ctrl.capex_insumos IS 'APU detalle por partida. Es la fuente de la explosión de insumos.';

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_capex_frentes_proyecto  ON ctrl.capex_frentes(id_proyecto_fk);
CREATE INDEX IF NOT EXISTS idx_capex_partidas_frente   ON ctrl.capex_partidas(id_frente_fk);
CREATE INDEX IF NOT EXISTS idx_capex_insumos_partida   ON ctrl.capex_insumos(id_partida_fk);
CREATE INDEX IF NOT EXISTS idx_capex_insumos_tipo      ON ctrl.capex_insumos(tipo);
CREATE INDEX IF NOT EXISTS idx_capex_proyectos_cc      ON ctrl.capex_proyectos(id_centro_costo_fk);
CREATE INDEX IF NOT EXISTS idx_capex_proyectos_area    ON ctrl.capex_proyectos(id_area_fk);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE ctrl.capex_proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.capex_frentes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.capex_partidas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.capex_insumos   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='capex_proyectos' AND schemaname='ctrl') THEN
    CREATE POLICY "capex_proyectos_auth" ON ctrl.capex_proyectos USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='capex_frentes' AND schemaname='ctrl') THEN
    CREATE POLICY "capex_frentes_auth"   ON ctrl.capex_frentes   USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='capex_partidas' AND schemaname='ctrl') THEN
    CREATE POLICY "capex_partidas_auth"  ON ctrl.capex_partidas  USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='capex_insumos' AND schemaname='ctrl') THEN
    CREATE POLICY "capex_insumos_auth"   ON ctrl.capex_insumos   USING (auth.role() = 'authenticated');
  END IF;
END $$;
