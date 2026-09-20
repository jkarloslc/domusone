-- ════════════════════════════════════════════════════════════════
-- Fecha de arranque operativo de cobranza por módulo
-- Migración: 20260920140000
-- ════════════════════════════════════════════════════════════════
--
-- PROBLEMA QUE RESUELVE
-- Al poner Golf en producción se cargó la cartera del año completo
-- (cargos + los pagos ya recibidos) para que los estados de cuenta
-- de los socios quedaran correctos desde el día uno. Esa carga NO
-- generó recibos de ingreso: es histórico, no cobranza operada por
-- el sistema.
--
-- Evidencia (verificada en producción 2026-09-20):
--   · golf.recibos_golf con fecha_recibo < 2026-07-01:
--       474 recibos · $16,554,725 · CERO con id_venta_pos_fk
--   · golf.recibos_golf con fecha_recibo >= 2026-07-01:
--       436 recibos · $2,079,122 · solo 9 sin ticket POS
--   · el primer recibo con ticket POS es del 2026-07-02
--   · los 387 recibos de enero ($15,168,490) se capturaron todos
--     entre el 2026-06-23 y el 2026-06-30 (created_at)
--
-- Si esa carga se trata como cobranza del mes, cualquier reporte de
-- flujo muestra un pico de $15.2M en enero que no existe en el
-- Estado de Resultados (recibos_ingreso Golf+Membresías de enero:
-- $3,549,083). El devengado, en cambio, SÍ debe conservar esos
-- cargos: la cuota de cada periodo se devengó de verdad.
--
-- SOLUCIÓN
-- Una fecha de arranque operativo por módulo. Todo cobro con
-- fecha_pago ANTERIOR a esa fecha es carga inicial y queda fuera de
-- las medidas de caja/flujo, pero sigue contando en el devengado y
-- en la cartera. Vive en cfg.configuracion (ya existe y ya tiene los
-- GRANT correctos) en vez de una tabla nueva, porque es un parámetro
-- por módulo, no una entidad.
--
-- Valor vacío ('') = el módulo no declara carga inicial → toda su
-- cobranza se considera operativa. Los reportes avisan en pantalla
-- cuáles módulos no tienen fecha configurada, para que la exclusión
-- nunca sea silenciosa.
--
-- NOTA sobre la fecha de Golf: entre el 2026-06-23 y el 2026-07-01
-- hay 30 recibos ($549k) sin ticket POS capturados esa misma semana.
-- Con el corte en 2026-07-01 caen del lado de la carga inicial. Si
-- se considera que esa semana ya fue operativa, basta cambiar el
-- valor a '2026-06-23' — no hay que tocar código ni datos.
-- ════════════════════════════════════════════════════════════════

INSERT INTO cfg.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion) VALUES
  ('arranque_cobranza_golf',        '2026-07-01', 'texto', 'cobranza',
   'Arranque cobranza — Club Golf',
   'Cobros de cuotas de Golf con fecha de pago anterior a esta fecha se tratan como carga inicial de cartera: cuentan para el devengado, no para el flujo de caja. Vacío = sin carga inicial.'),

  ('arranque_cobranza_residencial', '',           'texto', 'cobranza',
   'Arranque cobranza — Fraccionamiento',
   'Se llenará cuando se cargue el histórico de cuotas de Fraccionamiento en ctrl.cargos. Vacío = sin carga inicial.'),

  ('arranque_cobranza_hipico',      '',           'texto', 'cobranza',
   'Arranque cobranza — Hípico',
   'Cobros de renta de caballerizas anteriores a esta fecha se tratan como carga inicial. Vacío = sin carga inicial.'),

  ('arranque_cobranza_locales',     '',           'texto', 'cobranza',
   'Arranque cobranza — Locales Comerciales',
   'Cobros de renta de locales anteriores a esta fecha se tratan como carga inicial. Vacío = sin carga inicial.')
ON CONFLICT (clave) DO NOTHING;
