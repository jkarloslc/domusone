-- =============================================================
-- Saldos de efectivo capturados para Flujo de Efectivo
--
--   tipo = 'inicial' → saldo al INICIO del día `fecha`. El del 1-ene es el
--                      saldo inicial del año; cualquier otro corrige el
--                      saldo encadenado (calculado) desde esa fecha.
--   tipo = 'real'    → saldo real en banco al CIERRE del día `fecha`; el
--                      reporte lo compara contra el calculado (diferencia
--                      sin conciliar).
--
-- id_cuenta_bancaria_fk NULL = saldo consolidado (todas las cuentas). La
-- columna queda lista para capturar por cuenta más adelante.
--
-- Fuentes automáticas (lib/saldosFlujo.ts), en orden de prioridad para el
-- saldo real: estado de cuenta importado (comp.flujo_mov_banco) →
-- Tesorería (comp.movimientos_bancarios, apagada hasta que el proceso
-- corra al día) → captura manual de esta tabla.
-- =============================================================

CREATE TABLE IF NOT EXISTS ctrl.flujo_saldos (
  id                    SERIAL PRIMARY KEY,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('inicial', 'real')),
  fecha                 DATE NOT NULL,
  id_cuenta_bancaria_fk INTEGER REFERENCES cfg.cuentas_bancarias(id) ON DELETE CASCADE,
  monto                 NUMERIC(16, 2) NOT NULL,
  notas                 TEXT,
  updated_by            TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_flujo_saldos_tipo_fecha_cuenta
  ON ctrl.flujo_saldos (tipo, fecha, COALESCE(id_cuenta_bancaria_fk, 0));

ALTER TABLE ctrl.flujo_saldos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flujo_saldos_all" ON ctrl.flujo_saldos;
CREATE POLICY "flujo_saldos_all" ON ctrl.flujo_saldos FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.flujo_saldos TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.flujo_saldos_id_seq TO authenticated, service_role;
