-- HR › Nómina: carga del Excel de nómina (semanal / quincenal) y generación
-- automática de una OP de Nómina por Área (y su CC) por mes, con fecha_op =
-- último día del mes del periodo (no la fecha de captura).
--
-- ctrl.nomina_cargas      1 renglón por archivo (Semanal P44, Quincena 20…)
-- ctrl.nomina_cargas_det  1 renglón por colaborador del archivo + ajustes
--                         manuales (p. ej. personal en sustitución patronal)
-- ctrl.nomina_op_mes      vínculo mes + área → OP generada (soft FK a
--                         comp.ordenes_pago, mismo patrón que rol_pagos_lotes)

CREATE TABLE IF NOT EXISTS ctrl.nomina_cargas (
  id                  bigserial PRIMARY KEY,
  tipo                text NOT NULL CHECK (tipo IN ('Semanal','Quincenal')),
  anio                int  NOT NULL,
  periodo             int  NOT NULL,
  fecha_inicio        date,
  fecha_fin           date,
  mes                 date NOT NULL,          -- primer día del mes al que se imputa
  archivo             text,
  total_percepciones  numeric(14,2) NOT NULL DEFAULT 0,
  total_neto          numeric(14,2) NOT NULL DEFAULT 0,
  hc                  int NOT NULL DEFAULT 0,
  notas               text,
  created_by          text,
  created_by_id       uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, anio, periodo)
);
CREATE INDEX IF NOT EXISTS nomina_cargas_mes_idx ON ctrl.nomina_cargas (mes);

CREATE TABLE IF NOT EXISTS ctrl.nomina_cargas_det (
  id                  bigserial PRIMARY KEY,
  id_carga_fk         bigint NOT NULL REFERENCES ctrl.nomina_cargas(id) ON DELETE CASCADE,
  no_empleado         text,
  nombre              text,
  cc_archivo          text,                   -- texto "CENTRO DE COSTOS" tal como viene en el Excel
  id_colaborador_fk   int,                    -- cfg.colaboradores.id (soft FK)
  id_area_fk          int,                    -- cfg.areas.id (el CC se deriva del Área)
  percepciones        numeric(14,2) NOT NULL DEFAULT 0,
  neto                numeric(14,2) NOT NULL DEFAULT 0,
  es_ajuste           boolean NOT NULL DEFAULT false,
  concepto_ajuste     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nomina_cargas_det_carga_idx ON ctrl.nomina_cargas_det (id_carga_fk);

CREATE TABLE IF NOT EXISTS ctrl.nomina_op_mes (
  id                  bigserial PRIMARY KEY,
  mes                 date NOT NULL,
  id_area_fk          int  NOT NULL,
  id_op_fk            int  NOT NULL,          -- comp.ordenes_pago.id (soft FK)
  monto               numeric(14,2) NOT NULL,
  percepciones        numeric(14,2) NOT NULL DEFAULT 0,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nomina_op_mes_mes_idx ON ctrl.nomina_op_mes (mes, id_area_fk);

-- Tablas nuevas: GRANT explícito (ver feedback_supabase_new_table_grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.nomina_cargas, ctrl.nomina_cargas_det, ctrl.nomina_op_mes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.nomina_cargas_id_seq, ctrl.nomina_cargas_det_id_seq, ctrl.nomina_op_mes_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.nomina_cargas, ctrl.nomina_cargas_det, ctrl.nomina_op_mes TO service_role;  -- mismo patrón que rol_pagos_lotes
GRANT USAGE, SELECT ON SEQUENCE ctrl.nomina_cargas_id_seq, ctrl.nomina_cargas_det_id_seq, ctrl.nomina_op_mes_id_seq TO service_role;

ALTER TABLE ctrl.nomina_cargas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.nomina_cargas_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.nomina_op_mes     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nomina_cargas_auth ON ctrl.nomina_cargas;
DROP POLICY IF EXISTS nomina_cargas_det_auth ON ctrl.nomina_cargas_det;
DROP POLICY IF EXISTS nomina_op_mes_auth ON ctrl.nomina_op_mes;
CREATE POLICY nomina_cargas_auth     ON ctrl.nomina_cargas     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY nomina_cargas_det_auth ON ctrl.nomina_cargas_det FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY nomina_op_mes_auth     ON ctrl.nomina_op_mes     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Clave estable para ubicar el tipo de gasto Nómina desde código (sin hardcodear id 23)
UPDATE cfg.tipos_gasto SET clave = 'nomina' WHERE nombre = 'Nómina' AND clave IS NULL;

-- Datos (ejecutado 2026-11-13, no repetible tal cual): cfg.colaboradores.id_area_fk /
-- id_centro_costo_fk se llenaron para 86 colaboradores (semanal/quincenal) con la
-- clasificación CC/sección del tablero "Nómina BPCC 2026" (CORPORATIVO→54,
-- GOLF→39, HIPICO→40 salvo Áreas Públicas→45 Eventos, MANTENIMIENTO→21,
-- PATRONS→42, POLO→41). Respaldo: ctrl.respaldo_colaboradores_area_20261113.
