-- ══════════════════════════════════════════════════════════════════════════
-- ctrl.ppto_partidas.devengado_igual_a_cobro — venta diaria
--
-- POR QUÉ EXISTE: en base Devengado, el Real de una partida de ingreso sale
-- SOLO de la cartera de cuotas (lib/cobranzaCuotas.ts →
-- fetchDevengadoSinIvaPorPartida). Las partidas de venta diaria no tienen
-- cartera —el servicio se presta y se cobra el mismo día—, así que quedaban
-- con Real en CERO. En Golf 2026 son $5.61M presupuestados contra una columna
-- en blanco: Green Fees, Tee de Práctica, Torneos, Fee AyB y Renta Cancha.
--
-- La regla «nunca rellenar el Real devengado con el real de caja» se puso
-- pensando en Fraccionamiento, donde caja y devengado son cosas distintas
-- (se cobra un periodo y se devenga otro). En venta diaria **coinciden por
-- naturaleza**, así que ahí tomar el real de caja no es un relleno: es el dato.
--
-- Se declara con un flag propio y NO se deriva de «esta partida no tiene
-- cartera»: esa inferencia confundiría «no tiene cartera» con «su cartera aún
-- no se ha capturado», que es justo el caso de Fraccionamiento antes de F4.
-- Mismo criterio de [[feedback_no_fake_modulo_para_dimensiones_ortogonales]].
--
-- Nace en `false` para todas: activarlo es una decisión por partida y por
-- empresa, desde Presupuestos › Partidas. El despliegue no cambia ningún
-- número por sí solo.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS devengado_igual_a_cobro boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ctrl.ppto_partidas.devengado_igual_a_cobro IS
  'true = venta diaria: el servicio se presta y se cobra el mismo día, así que en base Devengado el Real se toma del real de caja. Solo aplica a partidas de ingreso.';

-- Golf 2026 — las cinco de venta diaria. Se dejan comentadas a propósito: son
-- los nombres de ESTA empresa y hay que confirmarlos antes de activarlos.
-- UPDATE ctrl.ppto_partidas SET devengado_igual_a_cobro = true
--  WHERE tipo = 'ingreso'
--    AND nombre IN ('Green Fees', 'Operacion Tee Practica', 'Torneos',
--                   'Fee Ayb La Practica', 'Renta Cancha Fut Bol');

NOTIFY pgrst, 'reload schema';
