-- ================================================================
-- Corte a ingreso derivado de cobranza (F4d)
-- Migracion: 20260921100000
-- ================================================================
--
-- PROBLEMA
-- El ingreso de Fraccionamiento (52% del total, $17.6M en 2026) se captura a
-- mano como un recibo global por mes ("Cobranza Global Enero 2026") con
-- desglose solo por seccion. El destino es derivarlo de la cobranza real, con
-- lo que el desglose por seccion Y la clasificacion vencido/corriente/
-- anticipado salen solos del periodo de cada cuota.
--
-- El riesgo de la transicion es el doble conteo: si un mes tiene el recibo
-- global capturado a mano Y el derivado del corte, el ingreso se duplica y
-- nada lo detecta.
--
-- DECISION DEL USUARIO (2026-09-20)
--   1. Corte hacia adelante: desde una fecha el ingreso se deriva de la
--      cobranza, y los meses ya capturados de 2026 se quedan como estan.
--      Recapturar 9 meses lote por lote es un proyecto de datos, no de
--      software, y el historico ya cuadra con el Estado de Resultados.
--   2. Despues del corte se BLOQUEA la captura manual para ese centro. Es lo
--      unico que garantiza que no se duplique por descuido.
--
-- COMO FUNCIONA
-- `fecha_corte_derivado` en el centro de ingreso. A partir de esa fecha
-- (inclusive) /ingresos rechaza capturar o editar recibos manuales de ese
-- centro; su ingreso solo puede entrar por el corte de cobranza. NULL = el
-- centro sigue 100% manual, que es el estado de todos los demas centros.
--
-- Se deja en NULL a proposito: el corte se activa capturando la fecha en
-- Catalogos > Centros de Ingreso cuando la operacion este lista, no al correr
-- esta migracion. Asi el despliegue no cambia el comportamiento de nadie.
-- ================================================================

ALTER TABLE cfg.centros_ingreso
  ADD COLUMN IF NOT EXISTS fecha_corte_derivado date;

COMMENT ON COLUMN cfg.centros_ingreso.fecha_corte_derivado IS
  'Desde esta fecha el ingreso del centro se deriva de la cobranza y /ingresos bloquea la captura manual, para que el recibo global y el derivado no se sumen. NULL = centro 100% manual.';

CREATE INDEX IF NOT EXISTS idx_centros_ingreso_corte_derivado
  ON cfg.centros_ingreso (fecha_corte_derivado)
  WHERE fecha_corte_derivado IS NOT NULL;

DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM cfg.centros_ingreso WHERE fecha_corte_derivado IS NOT NULL;
  RAISE NOTICE 'OK: columna fecha_corte_derivado lista. Centros con corte activo: % (se espera 0: se activa capturando la fecha cuando la operacion este lista).', v_n;
END $$;
