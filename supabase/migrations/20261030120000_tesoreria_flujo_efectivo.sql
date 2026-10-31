-- Flujo de Efectivo (Tesorería): flujo real clasificado desde estados de cuenta
-- (CSV/Excel con layout) + flujo proyectado versionado a partir de Presupuestos
-- (egresos por CC/Área, ingresos por Centro de ingreso/Sección).
-- Ejecutar en Supabase SQL Editor o: supabase db push

-- 1. Catálogo jerárquico de conceptos de flujo
CREATE TABLE IF NOT EXISTS comp.flujo_conceptos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_padre_fk  bigint REFERENCES comp.flujo_conceptos (id),
  nombre       text NOT NULL,
  es_ingreso   boolean NOT NULL DEFAULT false,
  es_egreso    boolean NOT NULL DEFAULT false,
  orden        integer NOT NULL DEFAULT 0,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flujo_conceptos_padre ON comp.flujo_conceptos (id_padre_fk);

-- 2. Reglas de clasificación automática de movimientos bancarios
CREATE TABLE IF NOT EXISTS comp.flujo_reglas (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre              text NOT NULL,
  patron              text NOT NULL,                 -- texto contenido en la descripción (sin mayúsculas/acentos)
  tipo_mov            text CHECK (tipo_mov IN ('Cargo', 'Abono')),   -- NULL = ambos
  id_cuenta_fk        integer,                       -- cfg.cuentas_bancarias; NULL = todas
  monto_min           numeric,
  monto_max           numeric,
  id_concepto_fk      bigint NOT NULL REFERENCES comp.flujo_conceptos (id),
  prioridad           integer NOT NULL DEFAULT 100,  -- menor = se evalúa primero
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. Layouts de lectura de estados de cuenta (CSV/Excel)
CREATE TABLE IF NOT EXISTS comp.flujo_layouts (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre             text NOT NULL,
  id_cuenta_fk       integer,                        -- cuenta por defecto (opcional)
  fila_inicio        integer NOT NULL DEFAULT 2,     -- primera fila con datos (1 = primera del archivo)
  col_fecha          integer NOT NULL,               -- columnas base 1 (A=1)
  col_descripcion    integer NOT NULL,
  col_referencia     integer,
  col_cargo          integer,                        -- columnas separadas cargo/abono
  col_abono          integer,
  col_monto          integer,                        -- o una sola columna con signo
  col_saldo          integer,
  formato_fecha      text NOT NULL DEFAULT 'DD/MM/YYYY' CHECK (formato_fecha IN ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  activo             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (col_monto IS NOT NULL OR col_cargo IS NOT NULL OR col_abono IS NOT NULL)
);

-- 4. Movimientos importados del estado de cuenta (independientes del kardex de
--    movimientos_bancarios para no alterar el saldo operativo de la cuenta)
CREATE TABLE IF NOT EXISTS comp.flujo_mov_banco (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cuenta_fk     integer NOT NULL,
  fecha            date NOT NULL,
  descripcion      text NOT NULL,
  referencia       text,
  cargo            numeric NOT NULL DEFAULT 0,
  abono            numeric NOT NULL DEFAULT 0,
  saldo            numeric,
  id_concepto_fk   bigint REFERENCES comp.flujo_conceptos (id),
  id_regla_fk      bigint REFERENCES comp.flujo_reglas (id) ON DELETE SET NULL,
  clasificado_por  text CHECK (clasificado_por IN ('regla', 'manual')),
  id_layout_fk     bigint REFERENCES comp.flujo_layouts (id) ON DELETE SET NULL,
  lote             text,
  huella           text NOT NULL,                    -- cuenta|fecha|desc|cargo|abono|ocurrencia, anti-duplicados
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_cuenta_fk, huella)
);
CREATE INDEX IF NOT EXISTS idx_flujo_mov_banco_fecha ON comp.flujo_mov_banco (fecha);
CREATE INDEX IF NOT EXISTS idx_flujo_mov_banco_concepto ON comp.flujo_mov_banco (id_concepto_fk);

-- 5. Versiones de flujo proyectado
CREATE TABLE IF NOT EXISTS comp.flujo_versiones (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre           text NOT NULL,
  id_presupuesto_fk integer NOT NULL,                -- ctrl.ppto_presupuestos
  mes_inicio       date NOT NULL,                    -- primer día del mes
  mes_fin          date NOT NULL CHECK (mes_fin >= mes_inicio),
  saldo_inicial    numeric NOT NULL DEFAULT 0,
  escenario        text NOT NULL DEFAULT 'Esperada' CHECK (escenario IN ('Optimista', 'Esperada', 'Pesimista')),
  pct_ingresos     numeric NOT NULL DEFAULT 100,     -- factor sobre ingresos (ej. 85 = cobranza al 85%)
  pct_egresos      numeric NOT NULL DEFAULT 100,
  status           text NOT NULL DEFAULT 'Borrador' CHECK (status IN ('Borrador', 'Autorizado', 'Blindado', 'Cancelado')),
  autorizado_por   text,
  autorizado_at    timestamptz,
  activo           boolean NOT NULL DEFAULT true,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comp.flujo_version_lineas (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_version_fk         bigint NOT NULL REFERENCES comp.flujo_versiones (id) ON DELETE CASCADE,
  id_partida_fk         integer NOT NULL,            -- ctrl.ppto_partidas
  mes                   date NOT NULL,               -- primer día del mes
  tipo                  text NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  id_centro_costo_fk    integer,
  id_area_fk            integer,
  id_centro_ingreso_fk  integer,
  id_seccion_fk         integer,
  id_concepto_flujo_fk  bigint REFERENCES comp.flujo_conceptos (id),
  monto_ppto            numeric NOT NULL DEFAULT 0,  -- tal como salió del presupuesto (con IVA)
  monto                 numeric NOT NULL DEFAULT 0,  -- editable; arranca igual a monto_ppto
  UNIQUE (id_version_fk, id_partida_fk, mes)
);
CREATE INDEX IF NOT EXISTS idx_flujo_version_lineas_ver ON comp.flujo_version_lineas (id_version_fk);

-- Una versión Blindada no admite cambios en sus líneas
CREATE OR REPLACE FUNCTION comp.flujo_version_lineas_blindada() RETURNS trigger AS $$
DECLARE v_id bigint; v_status text;
BEGIN
  v_id := COALESCE(NEW.id_version_fk, OLD.id_version_fk);
  SELECT status INTO v_status FROM comp.flujo_versiones WHERE id = v_id;
  IF v_status = 'Blindado' THEN
    RAISE EXCEPTION 'La versión de flujo está blindada y no admite cambios';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_flujo_version_lineas_blindada ON comp.flujo_version_lineas;
CREATE TRIGGER trg_flujo_version_lineas_blindada
  BEFORE INSERT OR UPDATE OR DELETE ON comp.flujo_version_lineas
  FOR EACH ROW EXECUTE FUNCTION comp.flujo_version_lineas_blindada();

-- 6. Semilla del catálogo (raíces + hijos frecuentes)
INSERT INTO comp.flujo_conceptos (nombre, es_ingreso, es_egreso, orden)
SELECT v.nombre, true, true, v.orden
FROM (VALUES ('Operativos', 1), ('No operativos', 2), ('No identificados', 3),
             ('Financieros', 4), ('Inversiones', 5), ('Otros', 6)) AS v(nombre, orden)
WHERE NOT EXISTS (SELECT 1 FROM comp.flujo_conceptos WHERE id_padre_fk IS NULL AND nombre = v.nombre);

INSERT INTO comp.flujo_conceptos (id_padre_fk, nombre, es_ingreso, es_egreso, orden)
SELECT p.id, h.nombre, h.ing, h.egr, h.orden
FROM comp.flujo_conceptos p
JOIN (VALUES
  ('Operativos', 'Cobranza e ingresos operativos', true,  false, 1),
  ('Operativos', 'Proveedores y gasto operativo',  false, true,  2),
  ('Operativos', 'Nómina y cargas sociales',       false, true,  3),
  ('Operativos', 'Impuestos',                      false, true,  4),
  ('Financieros', 'Créditos y financiamiento',     true,  true,  1),
  ('Financieros', 'Intereses y comisiones',        false, true,  2),
  ('Inversiones', 'Inversiones y CAPEX',           false, true,  1)
) AS h(padre, nombre, ing, egr, orden) ON h.padre = p.nombre
WHERE p.id_padre_fk IS NULL
  AND NOT EXISTS (SELECT 1 FROM comp.flujo_conceptos x WHERE x.id_padre_fk = p.id AND x.nombre = h.nombre);

-- 7. RLS + GRANT (mismo patrón que el resto de comp.*)
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['flujo_conceptos', 'flujo_reglas', 'flujo_layouts', 'flujo_mov_banco', 'flujo_versiones', 'flujo_version_lineas']
  LOOP
    EXECUTE format('ALTER TABLE comp.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON comp.%I', tbl || '_all', tbl);
    EXECUTE format('CREATE POLICY %I ON comp.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl || '_all', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp.%I TO authenticated, service_role', tbl);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', pg_get_serial_sequence('comp.' || tbl, 'id'));
  END LOOP;
END $$;
