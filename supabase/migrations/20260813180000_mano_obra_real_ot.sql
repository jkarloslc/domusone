-- ─────────────────────────────────────────────────────────────────────────────
-- Mano de Obra real por OT: reemplaza la captura genérica (categoría +
-- trabajadores + horas, cfg.cat_categorias_mano_obra) por trabajadores reales
-- de cfg.colaboradores + jornales, para poder reportar consumo real de mano
-- de obra por OT/Cuadrante/Área y por trabajador.
--
-- Se conservan las columnas anteriores (id_categoria_fk, trabajadores, horas)
-- para no romper OT's históricas ya capturadas con el modelo genérico — solo
-- se muestran de solo lectura en la UI. Toda captura nueva (sin excepción,
-- incluidas OT de empresa "Cuadrilla") usa id_colaborador_fk.
--
-- sueldo_diario se guarda como snapshot en cada renglón (igual que
-- ot_conceptos.costo_unitario): un aumento de sueldo futuro no debe alterar
-- el costo ya reportado de una OT pasada.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cfg.colaboradores
  ADD COLUMN IF NOT EXISTS sueldo_diario numeric(10,2);

COMMENT ON COLUMN cfg.colaboradores.sueldo_diario IS 'Jornal (sueldo diario) editable, independiente de sueldo_bruto_mensual. Fuente de costo para ctrl.ot_mano_obra al capturar mano de obra real por OT.';

ALTER TABLE ctrl.ot_mano_obra
  ADD COLUMN IF NOT EXISTS id_colaborador_fk bigint REFERENCES cfg.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nombre         text,
  ADD COLUMN IF NOT EXISTS jornales       numeric(6,2),
  ADD COLUMN IF NOT EXISTS sueldo_diario  numeric(10,2);

COMMENT ON TABLE ctrl.ot_mano_obra IS 'Mano de obra real por OT. Captura por trabajador (id_colaborador_fk + nombre snapshot + jornales + sueldo_diario snapshot); id_categoria_fk/trabajadores/horas son el modelo anterior, conservado solo para lectura de OT históricas.';
COMMENT ON COLUMN ctrl.ot_mano_obra.nombre IS 'Snapshot del nombre completo del colaborador al momento de capturar (por si luego se inactiva o cambia de nombre).';
COMMENT ON COLUMN ctrl.ot_mano_obra.sueldo_diario IS 'Snapshot del jornal del colaborador al momento de capturar. costo_total = jornales * sueldo_diario.';

CREATE INDEX IF NOT EXISTS idx_ot_mano_obra_ot          ON ctrl.ot_mano_obra(id_ot_fk);
CREATE INDEX IF NOT EXISTS idx_ot_mano_obra_colaborador ON ctrl.ot_mano_obra(id_colaborador_fk);
