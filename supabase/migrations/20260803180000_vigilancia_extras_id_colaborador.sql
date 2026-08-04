-- Complemento a 20260803150000_vigilancia_extras.sql: la tabla ya se había
-- ejecutado antes de agregar el selector de Colaboradores al campo Nombre,
-- así que aquí solo se suma la columna faltante.
ALTER TABLE ctrl.vigilancia_extras_guardias
  ADD COLUMN IF NOT EXISTS id_colaborador_fk INTEGER REFERENCES cfg.colaboradores(id);

CREATE INDEX IF NOT EXISTS idx_vig_extras_guardias_colab ON ctrl.vigilancia_extras_guardias(id_colaborador_fk);
