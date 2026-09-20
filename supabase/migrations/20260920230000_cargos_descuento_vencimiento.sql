-- ════════════════════════════════════════════════════════════════
-- ctrl.cargos: descuento aplicado y fecha de vencimiento (F4)
-- Migración: 20260920230000
-- ════════════════════════════════════════════════════════════════
--
-- Dos huecos del modelo de cargos que hay que cerrar ANTES de poner la
-- cobranza de Fraccionamiento en operación. Los dos envenenarían la
-- medición de cartera y de devengado desde el primer mes.
--
-- ── 1. El adeudo fantasma del descuento ─────────────────────────
-- Al cobrar con descuento por pago anualizado, app/cobranza/ReciboModal.tsx
-- hace:
--     monto_pagado += montoNeto          (neto, ya descontado)
--     saldo         = monto - monto_pagado
--     status        = saldo <= 0.005 ? 'Pagado' : 'Parcial'
--
-- Como `monto` es el cargo BRUTO y `montoNeto` viene neto del descuento, el
-- cargo queda con `saldo = descuento` y status 'Parcial' para siempre: un
-- adeudo que no existe. Con 12 cuotas anualizadas por lote eso serían 12
-- adeudos fantasma por cada propietario que pagó por adelantado, y cualquier
-- reporte de cartera vencida los contaría como morosidad.
--
-- Es el mismo bug que ya se vivió en Golf ("adeudo residual fantasma").
--
-- `descuento_aplicado` guarda cuánto del cargo se liquidó vía descuento, y el
-- cargo se cierra cuando monto_pagado + descuento_aplicado >= monto. Así el
-- descuento queda auditable por cargo (no escondido en el recibo) y el saldo
-- refleja deuda real.
--
-- ── 2. Sin fecha de vencimiento no hay cartera vencida ──────────
-- ctrl.cargos no tiene `fecha_vencimiento`, a diferencia de cxc_golf /
-- cxc_hip / loc_cxc que sí la traen. Por eso lib/cobranzaCuotas.ts devuelve
-- fechaVencimiento = null para Fraccionamiento y su antigüedad de saldos no
-- se puede calcular.
--
-- La regla operativa es día 10 del mes del periodo (confirmada por el
-- usuario: "presenta adeudo cuando tiene una o más cuotas vencidas, día 10
-- de cada mes"). Se guarda como columna, no se deriva al vuelo, para que un
-- cambio de política a futuro no reescriba la historia.
-- 2026-09-20
-- ════════════════════════════════════════════════════════════════

-- ── Día de vencimiento configurable por cuota ───────────────────
-- Mismo patrón que golf.cat_cuotas_config.dia_vencimiento, que ya existe.
ALTER TABLE cfg.cuotas_estandar
  ADD COLUMN IF NOT EXISTS dia_vencimiento INTEGER NOT NULL DEFAULT 10;

ALTER TABLE cfg.cuotas_estandar
  DROP CONSTRAINT IF EXISTS cuotas_estandar_dia_vencimiento_check;
ALTER TABLE cfg.cuotas_estandar
  ADD CONSTRAINT cuotas_estandar_dia_vencimiento_check
  CHECK (dia_vencimiento BETWEEN 1 AND 28);

COMMENT ON COLUMN cfg.cuotas_estandar.dia_vencimiento IS
  'Día del mes del periodo en que vence la cuota. Default 10, la regla operativa de Fraccionamiento.';

-- ── Cargos ──────────────────────────────────────────────────────
ALTER TABLE ctrl.cargos
  ADD COLUMN IF NOT EXISTS descuento_aplicado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento  date;

COMMENT ON COLUMN ctrl.cargos.descuento_aplicado IS
  'Parte del cargo liquidada vía descuento (ej. pago anualizado). El cargo se cierra cuando monto_pagado + descuento_aplicado >= monto. Sin esto el descuento deja un saldo residual que se ve como morosidad inexistente.';
COMMENT ON COLUMN ctrl.cargos.fecha_vencimiento IS
  'Vencimiento de la cuota: día cfg.cuotas_estandar.dia_vencimiento del mes del periodo. Columna y no cálculo al vuelo, para que un cambio de política no reescriba la historia.';

CREATE INDEX IF NOT EXISTS idx_cargos_vencimiento
  ON ctrl.cargos (fecha_vencimiento)
  WHERE status IN ('Pendiente', 'Parcial');

-- ── Backfill de fecha_vencimiento para cargos existentes ────────
-- periodo_mes es el NOMBRE del mes en español (igual que en
-- lib/clasificacionCobranza.ts → periodoDesdeNombre).
UPDATE ctrl.cargos c
SET fecha_vencimiento = make_date(
      c.periodo_anio,
      array_position(
        ARRAY['enero','febrero','marzo','abril','mayo','junio',
              'julio','agosto','septiembre','octubre','noviembre','diciembre'],
        lower(trim(c.periodo_mes))
      ),
      LEAST(COALESCE(ce.dia_vencimiento, 10), 28)
    )
FROM cfg.cuotas_estandar ce
WHERE c.fecha_vencimiento IS NULL
  AND c.id_cuota_estandar_fk = ce.id
  AND c.periodo_anio IS NOT NULL
  AND array_position(
        ARRAY['enero','febrero','marzo','abril','mayo','junio',
              'julio','agosto','septiembre','octubre','noviembre','diciembre'],
        lower(trim(c.periodo_mes))
      ) IS NOT NULL;

-- Cargos sin cuota estándar ligada (capturados a mano): día 10 por defecto.
UPDATE ctrl.cargos c
SET fecha_vencimiento = make_date(
      c.periodo_anio,
      array_position(
        ARRAY['enero','febrero','marzo','abril','mayo','junio',
              'julio','agosto','septiembre','octubre','noviembre','diciembre'],
        lower(trim(c.periodo_mes))
      ),
      10
    )
WHERE c.fecha_vencimiento IS NULL
  AND c.periodo_anio IS NOT NULL
  AND array_position(
        ARRAY['enero','febrero','marzo','abril','mayo','junio',
              'julio','agosto','septiembre','octubre','noviembre','diciembre'],
        lower(trim(c.periodo_mes))
      ) IS NOT NULL;

-- ── Adeudos fantasma ya existentes: se REPORTAN, no se corrigen ─
-- Un cargo 'Parcial' con saldo chico PODRÍA ser el residuo de un descuento…
-- o un pago parcial genuino. No hay forma de distinguirlos desde los datos:
-- un saldo del 20% del cargo significa que se pagó el 80%, y eso es tan
-- plausible como un descuento del 20%. Cerrarlos automáticamente convertiría
-- deuda real en deuda saldada, que es peor que dejarlos abiertos.
--
-- Así que esta migración NO los toca: solo avisa cuántos hay para revisarlos a
-- mano contra los recibos. Al 2026-09-20 son 0 (ctrl.cargos tiene únicamente
-- un cargo de prueba), pero el aviso sirve si esto se corre sobre una base que
-- ya operó — por ejemplo al replicar a otra empresa.
DO $$
DECLARE v_n integer; v_monto numeric;
BEGIN
  SELECT count(*), COALESCE(sum(saldo), 0) INTO v_n, v_monto
  FROM ctrl.cargos
  WHERE status = 'Parcial' AND saldo > 0 AND descuento_aplicado = 0;

  IF v_n > 0 THEN
    RAISE NOTICE 'REVISAR A MANO: % cargo(s) en Parcial con saldo (total %) anteriores a esta migración. Si el saldo corresponde a un descuento por pago anticipado, pásalo a descuento_aplicado y cierra el cargo; si es un pago parcial real, déjalo como está.', v_n, v_monto;
  ELSE
    RAISE NOTICE 'OK: no hay cargos en Parcial con saldo pendiente de revisar.';
  END IF;
END $$;
