-- Concepto de Ingreso para Pensión de Carrito: a diferencia de Membresía/
-- Inscripción (que sí tienen fila en golf.cat_cuotas_config), Pensión
-- Carrito nunca usó esa tabla — el monto se captura manual en
-- PensionModal.tsx, así que no hay fila de config a la que colgarle el
-- concepto. Se agrega directo en golf.cfg_carritos (config global única
-- del módulo Carritos/Pensión), igual patrón que hip.cfg_hip.

ALTER TABLE golf.cfg_carritos
  ADD COLUMN IF NOT EXISTS id_concepto_ingreso_fk INTEGER REFERENCES cfg.conceptos_ingreso(id);
