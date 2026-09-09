-- ─────────────────────────────────────────────────────────────────────────────
-- cfg.colaboradores.id_area_fk: se re-agrega (había sido eliminada en
-- 20260814120000_colaboradores_drop_area_seccion.sql por ser columna muerta
-- sin UI). Ahora sí tiene un flujo concreto: cuando el Centro de Costo del
-- colaborador es "Mantenimiento Residencial", el modal de alta/edición
-- despliega un selector de Área (cfg.areas) para indicar a cuál está
-- asignado. Para cualquier otro Centro de Costo la columna queda NULL.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cfg.colaboradores ADD COLUMN IF NOT EXISTS id_area_fk INTEGER REFERENCES cfg.areas(id);
