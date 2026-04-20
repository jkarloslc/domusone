-- ============================================================
-- GOLF SCHEMA v8 — Configuración de Cuotas por Categoría
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Catálogo de tipos de cuota configurables por categoría
--    tipo: INSCRIPCION | MENSUALIDAD | PENSION_CARRITO
CREATE TABLE IF NOT EXISTS golf.cat_cuotas_config (
  id                  SERIAL PRIMARY KEY,
  id_categoria_fk     INTEGER REFERENCES golf.cat_categorias_socios(id),
  tipo                TEXT NOT NULL,          -- INSCRIPCION | MENSUALIDAD | PENSION_CARRITO
  nombre              TEXT NOT NULL,          -- ej. "Inscripción Platino", "Mensualidad Ordinario"
  monto               NUMERIC(10,2) NOT NULL DEFAULT 0,
  meses_aplicar       INTEGER DEFAULT 12,     -- cuántas mensualidades genera (solo tipo MENSUALIDAD)
  dia_vencimiento     INTEGER DEFAULT 10,     -- día del mes en que vence cada mensualidad
  activo              BOOLEAN NOT NULL DEFAULT true,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cat_cuotas_config_cat  ON golf.cat_cuotas_config(id_categoria_fk);
CREATE INDEX IF NOT EXISTS idx_cat_cuotas_config_tipo ON golf.cat_cuotas_config(tipo);

-- GRANTs + RLS
GRANT ALL ON golf.cat_cuotas_config TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_cuotas_config_id_seq TO anon, authenticated;
ALTER TABLE golf.cat_cuotas_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.cat_cuotas_config;
CREATE POLICY "allow_all" ON golf.cat_cuotas_config
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. Agregar columnas a cxc_golf para soportar el flujo completo
--    (solo agrega si no existen)
ALTER TABLE golf.cxc_golf
  ADD COLUMN IF NOT EXISTS id_contrato_fk  INTEGER REFERENCES golf.ctrl_contratos_membresia(id),
  ADD COLUMN IF NOT EXISTS id_cuota_config_fk INTEGER REFERENCES golf.cat_cuotas_config(id),
  ADD COLUMN IF NOT EXISTS mes_numero      INTEGER,   -- 1-12 para mensualidades
  ADD COLUMN IF NOT EXISTS usuario_crea    TEXT,
  ADD COLUMN IF NOT EXISTS usuario_cobra   TEXT;

-- ============================================================
-- NOTAS DE USO
-- ============================================================
-- Al registrar un contrato (SocioModal → tab Contratos):
--   1. Buscar cat_cuotas_config WHERE id_categoria_fk = socio.id_categoria_fk
--   2. Insertar 1 fila en cxc_golf con tipo=INSCRIPCION
--   3. Insertar 12 filas con tipo=MENSUALIDAD (una por mes, periodo='YYYY-MM',
--      fecha_vencimiento = YYYY-MM-{dia_vencimiento})
--
-- Al asignar slot de carrito (Carritos → PensionModal):
--   Insertar 1 fila con tipo=PENSION_CARRITO por cada mes activo
--
-- Generación masiva (CXC → botón "Generar cuotas del periodo"):
--   Para cada socio activo con id_categoria_fk que tenga config:
--   Verificar que no exista ya cuota del periodo → insertar
-- ============================================================
