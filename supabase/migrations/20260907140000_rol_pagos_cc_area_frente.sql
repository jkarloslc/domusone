-- HR > Rol de Pagos: cada línea de colaborador ahora captura su propia
-- Área/Frente (CC se deriva del Área vía cfg.areas.id_centro_costo_fk,
-- mismo patrón ya usado en comp.ordenes_pago_det — ver
-- project_op_distribucion_cc_propio_por_linea). Permite que un mismo rol
-- de pagos reparta colaboradores entre distintos CC/Área/Frente.
--
-- También agrega el vínculo hacia la Orden de Pago generada automáticamente
-- desde el lote (mismo patrón "soft FK" que ctrl.vigilancia_extras_lotes.id_op_fk
-- y ctrl.vales_combustible.id_op_fk — sin REFERENCES formal cross-schema hacia comp).

ALTER TABLE ctrl.rol_pagos_colaboradores
  ADD COLUMN IF NOT EXISTS id_area_fk   INTEGER REFERENCES cfg.areas(id),
  ADD COLUMN IF NOT EXISTS id_frente_fk INTEGER REFERENCES cfg.frentes(id);

CREATE INDEX IF NOT EXISTS idx_rol_pagos_colabs_area ON ctrl.rol_pagos_colaboradores(id_area_fk);

ALTER TABLE ctrl.rol_pagos_lotes
  ADD COLUMN IF NOT EXISTS id_op_fk INTEGER;  -- ref a comp.ordenes_pago, se llena al generar la OP

CREATE INDEX IF NOT EXISTS idx_rol_pagos_lotes_op ON ctrl.rol_pagos_lotes(id_op_fk);
