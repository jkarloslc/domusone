-- Flujo de Caja (Tesorería): proyección de posición de caja diaria/semanal por
-- periodo (rango de meses libre) y centro de costo, con captura manual de
-- egresos por concepto de pago (nómina, IMSS, impuestos, aguinaldos,
-- proveedores, CFE, combustible) e ingresos mensuales por centro de costo.
-- Ejecutar en Supabase SQL Editor o: supabase db push

-- 1. Periodos (escenarios): un periodo = un rango de meses con su propia
--    captura de egresos/ingresos. Permite tener varios guardados (ej. "4T 2026").
CREATE TABLE IF NOT EXISTS comp.flujo_caja_periodos (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre                   text NOT NULL,
  fecha_inicio             date NOT NULL,
  fecha_fin                date NOT NULL CHECK (fecha_fin >= fecha_inicio),
  saldo_inicial            numeric NOT NULL DEFAULT 0,
  dia_pago_impuestos       smallint NOT NULL DEFAULT 17 CHECK (dia_pago_impuestos IN (17, 22)),
  frecuencia_proveedores   text NOT NULL DEFAULT 'semanal' CHECK (frecuencia_proveedores IN ('semanal', 'mensual')),
  mes_ancla_imss_bimestral date, -- primer día del mes que paga IMSS bimestral; los demás meses pagan IMSS mensual
  activo                   boolean NOT NULL DEFAULT true,
  created_by               text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flujo_caja_periodos_activo ON comp.flujo_caja_periodos (activo);

COMMENT ON TABLE comp.flujo_caja_periodos IS
  'Escenario de proyección de caja de Tesorería: rango de meses + parámetros de calendario de pago.';

-- 2. Matriz de egresos: monto por pago, por concepto (catálogo fijo en código,
--    igual patrón que cfg.tipos_gasto — TEXT, no FK) y centro de costo real.
CREATE TABLE IF NOT EXISTS comp.flujo_caja_captura (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_periodo_fk       bigint NOT NULL REFERENCES comp.flujo_caja_periodos (id) ON DELETE CASCADE,
  concepto            text NOT NULL,
  id_centro_costo_fk  integer NOT NULL REFERENCES cfg.centros_costo (id),
  monto_por_pago      numeric NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_periodo_fk, concepto, id_centro_costo_fk)
);

CREATE INDEX IF NOT EXISTS idx_flujo_caja_captura_periodo ON comp.flujo_caja_captura (id_periodo_fk);

COMMENT ON TABLE comp.flujo_caja_captura IS
  'Monto por pago capturado por concepto y centro de costo dentro de un periodo de Flujo de Caja.';

-- 3. Ingresos mensuales por centro de costo (varía mes a mes dentro del periodo).
CREATE TABLE IF NOT EXISTS comp.flujo_caja_ingresos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_periodo_fk       bigint NOT NULL REFERENCES comp.flujo_caja_periodos (id) ON DELETE CASCADE,
  id_centro_costo_fk  integer NOT NULL REFERENCES cfg.centros_costo (id),
  mes                 date NOT NULL, -- primer día del mes
  monto_mensual       numeric NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_periodo_fk, id_centro_costo_fk, mes)
);

CREATE INDEX IF NOT EXISTS idx_flujo_caja_ingresos_periodo ON comp.flujo_caja_ingresos (id_periodo_fk);

COMMENT ON TABLE comp.flujo_caja_ingresos IS
  'Ingreso mensual esperado por centro de costo dentro de un periodo de Flujo de Caja.';

-- 4. RLS + GRANT (PostgREST usa el rol `authenticated` con JWT; hace falta
--    GRANT además de RLS, mismo patrón que el resto de comp.*)
ALTER TABLE comp.flujo_caja_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp.flujo_caja_captura  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp.flujo_caja_ingresos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flujo_caja_periodos_select" ON comp.flujo_caja_periodos FOR SELECT TO authenticated USING (true);
CREATE POLICY "flujo_caja_periodos_insert" ON comp.flujo_caja_periodos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "flujo_caja_periodos_update" ON comp.flujo_caja_periodos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "flujo_caja_periodos_delete" ON comp.flujo_caja_periodos FOR DELETE TO authenticated USING (true);

CREATE POLICY "flujo_caja_captura_select" ON comp.flujo_caja_captura FOR SELECT TO authenticated USING (true);
CREATE POLICY "flujo_caja_captura_insert" ON comp.flujo_caja_captura FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "flujo_caja_captura_update" ON comp.flujo_caja_captura FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "flujo_caja_captura_delete" ON comp.flujo_caja_captura FOR DELETE TO authenticated USING (true);

CREATE POLICY "flujo_caja_ingresos_select" ON comp.flujo_caja_ingresos FOR SELECT TO authenticated USING (true);
CREATE POLICY "flujo_caja_ingresos_insert" ON comp.flujo_caja_ingresos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "flujo_caja_ingresos_update" ON comp.flujo_caja_ingresos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "flujo_caja_ingresos_delete" ON comp.flujo_caja_ingresos FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp.flujo_caja_periodos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp.flujo_caja_captura  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp.flujo_caja_ingresos TO authenticated, service_role;

DO $$
DECLARE
  seqname text;
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['comp.flujo_caja_periodos', 'comp.flujo_caja_captura', 'comp.flujo_caja_ingresos']
  LOOP
    seqname := pg_get_serial_sequence(tbl, 'id');
    IF seqname IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', seqname);
    END IF;
  END LOOP;
END $$;
