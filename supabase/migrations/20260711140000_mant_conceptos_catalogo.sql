-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo de Conceptos de Obra/Mantenimiento + Matriz de Precios Unitarios
-- Vive en el módulo de Mantenimiento. Independiente de los catálogos de
-- equipos (cfg.equipos), herramientas (cfg.herramientas) y mano de obra
-- (cfg.colaboradores): la matriz de PU tiene su propio catálogo de insumos
-- de referencia (ctrl.mant_insumos). Solo los insumos de tipo 'material'
-- pueden vincularse opcionalmente al catálogo de artículos (comp.articulos).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Categorías de conceptos (A. Jardinería, B. Bacheo, …) ─────────────────
CREATE TABLE IF NOT EXISTS ctrl.mant_conceptos_categorias (
  id          bigserial PRIMARY KEY,
  codigo      text UNIQUE NOT NULL,
  nombre      text NOT NULL,
  orden       int  NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Catálogo de insumos base (mano de obra / material / equipo) ──────────
CREATE TABLE IF NOT EXISTS ctrl.mant_insumos (
  id                bigserial PRIMARY KEY,
  codigo            text UNIQUE NOT NULL,
  descripcion       text NOT NULL,
  unidad            text NOT NULL,
  costo             numeric(14,4) NOT NULL DEFAULT 0,
  tipo              text NOT NULL CHECK (tipo IN ('mano_obra', 'material', 'equipo')),
  id_articulo_fk    bigint REFERENCES comp.articulos(id) ON DELETE SET NULL,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ctrl.mant_insumos IS 'Catálogo base de costos de referencia para la matriz de PU. Independiente de cfg.colaboradores/cfg.equipos/cfg.herramientas; id_articulo_fk es el único vínculo permitido (solo materiales).';
COMMENT ON COLUMN ctrl.mant_insumos.id_articulo_fk IS 'Vínculo opcional a comp.articulos, solo aplica cuando tipo = material.';

-- ── 3. Conceptos (cabecera del catálogo + PU calculado) ──────────────────────
CREATE TABLE IF NOT EXISTS ctrl.mant_conceptos (
  id                  bigserial PRIMARY KEY,
  id_categoria_fk     bigint REFERENCES ctrl.mant_conceptos_categorias(id) ON DELETE SET NULL,
  codigo              text UNIQUE NOT NULL,
  descripcion         text NOT NULL,
  unidad              text NOT NULL,
  factor_indirectos   numeric(6,4) NOT NULL DEFAULT 0.28,
  costo_directo       numeric(14,4) NOT NULL DEFAULT 0,
  pu_venta            numeric(14,4) NOT NULL DEFAULT 0,
  rango_min           numeric(14,4),
  rango_max           numeric(14,4),
  fuente_referencia   text,
  observaciones       text,
  activo              boolean NOT NULL DEFAULT true,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ctrl.mant_conceptos IS 'Catálogo de conceptos de obra/mantenimiento. costo_directo y pu_venta se recalculan al guardar los insumos de la matriz (ctrl.mant_conceptos_insumos).';

-- ── 4. Matriz de PU / explosión de insumos por concepto ──────────────────────
CREATE TABLE IF NOT EXISTS ctrl.mant_conceptos_insumos (
  id                bigserial PRIMARY KEY,
  id_concepto_fk    bigint NOT NULL REFERENCES ctrl.mant_conceptos(id) ON DELETE CASCADE,
  tipo              text NOT NULL CHECK (tipo IN ('mano_obra', 'material', 'equipo', 'herramienta_menor')),
  id_insumo_fk      bigint REFERENCES ctrl.mant_insumos(id) ON DELETE SET NULL,

  -- Descripción inline: independiente del catálogo de insumos (permite ajustar sin afectar el maestro)
  descripcion       text NOT NULL,
  unidad            text,
  cantidad          numeric(14,6) NOT NULL DEFAULT 0,
  costo_unitario    numeric(14,4) NOT NULL DEFAULT 0,

  importe           numeric(14,4) GENERATED ALWAYS AS (ROUND(cantidad * costo_unitario, 4)) STORED,

  orden             int NOT NULL DEFAULT 0
);

COMMENT ON TABLE ctrl.mant_conceptos_insumos IS 'Matriz de precios unitarios (APU) por concepto. tipo=herramienta_menor representa el % sobre mano de obra (sin id_insumo_fk).';

-- ── 5. CAPEX: trazabilidad opcional al concepto de origen ────────────────────
ALTER TABLE ctrl.capex_partidas
  ADD COLUMN IF NOT EXISTS id_concepto_fk bigint REFERENCES ctrl.mant_conceptos(id) ON DELETE SET NULL;

COMMENT ON COLUMN ctrl.capex_partidas.id_concepto_fk IS 'Concepto del catálogo (ctrl.mant_conceptos) del que se copió esta partida, si aplica. La partida conserva su propia copia editable de insumos.';

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mant_conceptos_categoria       ON ctrl.mant_conceptos(id_categoria_fk);
CREATE INDEX IF NOT EXISTS idx_mant_conceptos_insumos_concepto ON ctrl.mant_conceptos_insumos(id_concepto_fk);
CREATE INDEX IF NOT EXISTS idx_mant_conceptos_insumos_insumo   ON ctrl.mant_conceptos_insumos(id_insumo_fk);
CREATE INDEX IF NOT EXISTS idx_mant_insumos_articulo           ON ctrl.mant_insumos(id_articulo_fk);
CREATE INDEX IF NOT EXISTS idx_capex_partidas_concepto         ON ctrl.capex_partidas(id_concepto_fk);

-- ── GRANTs ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.mant_conceptos_categorias TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mant_conceptos_categorias_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.mant_insumos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mant_insumos_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.mant_conceptos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mant_conceptos_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.mant_conceptos_insumos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mant_conceptos_insumos_id_seq TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE ctrl.mant_conceptos_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.mant_insumos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.mant_conceptos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.mant_conceptos_insumos    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mant_conceptos_categorias_select" ON ctrl.mant_conceptos_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "mant_conceptos_categorias_insert" ON ctrl.mant_conceptos_categorias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mant_conceptos_categorias_update" ON ctrl.mant_conceptos_categorias FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mant_conceptos_categorias_delete" ON ctrl.mant_conceptos_categorias FOR DELETE TO authenticated USING (true);

CREATE POLICY "mant_insumos_select" ON ctrl.mant_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "mant_insumos_insert" ON ctrl.mant_insumos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mant_insumos_update" ON ctrl.mant_insumos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mant_insumos_delete" ON ctrl.mant_insumos FOR DELETE TO authenticated USING (true);

CREATE POLICY "mant_conceptos_select" ON ctrl.mant_conceptos FOR SELECT TO authenticated USING (true);
CREATE POLICY "mant_conceptos_insert" ON ctrl.mant_conceptos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mant_conceptos_update" ON ctrl.mant_conceptos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mant_conceptos_delete" ON ctrl.mant_conceptos FOR DELETE TO authenticated USING (true);

CREATE POLICY "mant_conceptos_insumos_select" ON ctrl.mant_conceptos_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "mant_conceptos_insumos_insert" ON ctrl.mant_conceptos_insumos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mant_conceptos_insumos_update" ON ctrl.mant_conceptos_insumos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mant_conceptos_insumos_delete" ON ctrl.mant_conceptos_insumos FOR DELETE TO authenticated USING (true);
