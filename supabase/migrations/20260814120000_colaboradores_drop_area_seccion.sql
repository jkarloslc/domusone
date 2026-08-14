-- ─────────────────────────────────────────────────────────────────────────────
-- cfg.colaboradores.id_area_fk / id_seccion_fk: columnas muertas desde su
-- creación (20260617230000) — nunca tuvieron un formulario/flujo que las
-- escribiera; solo se leían como filtro/columna en ReporteColaboradores.tsx,
-- por lo que siempre aparecían vacías. id_seccion_fk además apuntaba al
-- concepto equivocado (cfg.secciones es la subdivisión legal/inmobiliaria,
-- no zonificación de mantenimiento — ver ordenes_trabajo_drop_seccion_fk).
-- La asignación de zona de un colaborador vive en id_cuadrante_fk (asignado
-- vía Catálogos → Cuadrantes → pestaña Colaboradores) y ahora id_centro_costo_fk.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cfg.colaboradores DROP COLUMN IF EXISTS id_area_fk;
ALTER TABLE cfg.colaboradores DROP COLUMN IF EXISTS id_seccion_fk;
