-- Liga cada centro de ingreso con su centro de costo (Dashboard: un solo filtro
-- de centro de ingreso acota también egresos y CXP).
ALTER TABLE cfg.centros_ingreso
  ADD COLUMN IF NOT EXISTS id_centro_costo_fk integer REFERENCES cfg.centros_costo(id);

-- Asignación inicial
UPDATE cfg.centros_ingreso SET id_centro_costo_fk = 1 WHERE id = 2;                    -- Cuotas → Mantto. Fraccionamiento
UPDATE cfg.centros_ingreso SET id_centro_costo_fk = 2 WHERE id IN (1, 11, 12, 13, 14); -- Club de Golf → Golf
UPDATE cfg.centros_ingreso SET id_centro_costo_fk = 3 WHERE id = 4;                    -- Hípico → Hípico
UPDATE cfg.centros_ingreso SET id_centro_costo_fk = 4 WHERE id IN (3, 10);             -- Locales Comerciales, Polo → Polo
UPDATE cfg.centros_ingreso SET id_centro_costo_fk = 7 WHERE id = 9;                    -- Eventos → Eventos
