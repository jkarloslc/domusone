-- Política de máximos de intercambios por día, por club
-- NULL = sin límite. fin de semana (sáb/dom) usa su propio máximo si existe.
ALTER TABLE golf.cat_clubes_intercambio
  ADD COLUMN IF NOT EXISTS max_intercambios_dia           INTEGER CHECK (max_intercambios_dia IS NULL OR max_intercambios_dia >= 0),
  ADD COLUMN IF NOT EXISTS max_intercambios_dia_finsemana INTEGER CHECK (max_intercambios_dia_finsemana IS NULL OR max_intercambios_dia_finsemana >= 0),
  ADD COLUMN IF NOT EXISTS alerta_pct                     INTEGER NOT NULL DEFAULT 80 CHECK (alerta_pct BETWEEN 1 AND 100);

CREATE INDEX IF NOT EXISTS idx_cartas_intercambio_club_visita
  ON golf.cartas_intercambio(id_club_fk, fecha_visita);
