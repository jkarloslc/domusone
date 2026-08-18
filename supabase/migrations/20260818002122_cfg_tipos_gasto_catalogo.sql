-- Catálogo cfg.tipos_gasto: única fuente de la lista de "Tipo de Gasto" de
-- OP/Presupuestos (antes duplicada como array TIPOS_GASTO hardcodeado en 8
-- archivos .tsx). comp.ordenes_pago.tipo_gasto, ctrl.ppto_partidas.tipo_gasto
-- y cfg.rol_tipos_op.tipo_gasto SIGUEN siendo TEXT — esta tabla no es FK,
-- solo alimenta los selects/dropdowns. Un rename futuro de un valor sigue
-- requiriendo actualizar esas 3 columnas a mano (o vía migración), pero ya
-- no hay que tocar ningún archivo .tsx.
--
-- No incluye TIPOS_GASTO_EVT (Hospitality/Torneos Golf/Eventos Ecuestres,
-- ctrl.eventos_gastos.tipo_gasto) — es un catálogo de gasto de EVENTOS,
-- concepto de negocio distinto, fuera de alcance a propósito.
BEGIN;

CREATE TABLE cfg.tipos_gasto (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE,
  activo     BOOLEAN NOT NULL DEFAULT true,
  orden      INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO cfg.tipos_gasto (nombre, orden) VALUES
  ('Agua', 1),
  ('Arrendamiento', 2),
  ('Asesoría', 3),
  ('Capacitación', 4),
  ('Comisiones Bancarias', 5),
  ('Combustible', 6),
  ('Depósitos en Garantía (Fianzas)', 7),
  ('Desazolves', 8),
  ('Electricidad', 9),
  ('Finiquitos y Liquidaciones', 10),
  ('Fonacot', 11),
  ('Gasto Operativo Eventos', 12),
  ('Honorarios', 13),
  ('Impuestos Estatales', 14),
  ('Impuestos Federales', 15),
  ('IMSS', 16),
  ('Intercompañías BPCC', 17),
  ('Intercompañías OOB', 18),
  ('Intercompañías RBA', 19),
  ('Licencias de Software', 20),
  ('Mantenimiento de Instalaciones e Infraestructura', 21),
  ('Mantenimiento de Vehículos', 22),
  ('Nómina Semanal', 23),
  ('Nómina Quincenal', 24),
  ('Otro', 25),
  ('Pagos a Personal Externo', 26),
  ('Perimetrales', 27),
  ('PTU', 28),
  ('Publicidad', 29),
  ('Recolección de Basura', 30),
  ('Renta de Mobiliario y Equipo', 31),
  ('Reparación', 32),
  ('Seguros', 33),
  ('Servicios de Vigilancia', 34),
  ('Servicios Profesionales', 35),
  ('Telefonía / Internet', 36),
  ('Vales Despensa', 37);

GRANT ALL ON cfg.tipos_gasto TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE cfg.tipos_gasto_id_seq TO anon, authenticated;
ALTER TABLE cfg.tipos_gasto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON cfg.tipos_gasto FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;
