-- Portadas de estados de cuenta: lo que el banco reporta por cuenta y mes
-- (saldo inicial, depósitos, retiros, saldo final). Se compara contra lo que
-- suman los movimientos cargados (comp.flujo_mov_banco) para el cuadre mensual.
CREATE TABLE IF NOT EXISTS comp.flujo_portadas (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cuenta_fk    integer NOT NULL REFERENCES cfg.cuentas_bancarias (id),
  periodo         date NOT NULL CHECK (EXTRACT(DAY FROM periodo) = 1),   -- primer día del mes
  saldo_inicial   numeric(16, 2) NOT NULL,
  depositos       numeric(16, 2) NOT NULL DEFAULT 0,
  retiros         numeric(16, 2) NOT NULL DEFAULT 0,
  saldo_final     numeric(16, 2) NOT NULL,
  sin_movimientos boolean NOT NULL DEFAULT false,   -- estado en ceros: la cuenta no se movió ese mes
  notas           text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_cuenta_fk, periodo)
);

ALTER TABLE comp.flujo_portadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flujo_portadas_all ON comp.flujo_portadas;
CREATE POLICY flujo_portadas_all ON comp.flujo_portadas FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp.flujo_portadas TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE comp.flujo_portadas_id_seq TO authenticated, service_role;
