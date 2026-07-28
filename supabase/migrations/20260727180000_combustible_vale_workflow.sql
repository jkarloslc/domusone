-- Rediseño del flujo de Vales de Combustible (status automático) y enlace de la
-- Bitácora de Uso de Equipos con el Kardex de Combustible de Compras.
--
-- Proceso: Área usuaria solicita vale -> Tesorería lo emite -> área usuaria carga
-- (garrafa o gasolinería) -> Almacén completa garrafas / usuario completa gasolinería
-- con comprobante. El status ya no se elige a mano en la UI, así que solo dejamos
-- 'Solicitado' como default (antes 'Emitido') para inserts que no lo especifiquen.
ALTER TABLE ctrl.vales_combustible ALTER COLUMN status SET DEFAULT 'Solicitado';

-- Vincula cada registro de Bitácora de Uso con el movimiento de SALIDA que genera
-- en el Kardex de Combustible (comp.combustible_movimientos), para poder editarlo/
-- borrarlo en cascada cuando el registro de uso cambie.
ALTER TABLE ctrl.bitacora_uso_equipos
  ADD COLUMN IF NOT EXISTS id_combustible_mov_fk BIGINT REFERENCES comp.combustible_movimientos(id);

-- comp.combustible_movimientos se creó sin GRANT (20260608120000_combustible_kardex.sql);
-- ahora que la Bitácora de Uso insertará/borrará ahí, lo dejamos explícito.
GRANT SELECT, INSERT, UPDATE, DELETE ON comp.combustible_movimientos TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE comp.combustible_movimientos_id_seq TO authenticated, service_role;
