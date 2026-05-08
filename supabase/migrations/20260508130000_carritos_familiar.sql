-- Migración: Soporte de familiar en carritos
-- Agrega id_familiar_fk a cat_carritos, ctrl_pensiones y cxc_golf

ALTER TABLE golf.cat_carritos
  ADD COLUMN IF NOT EXISTS id_familiar_fk INTEGER REFERENCES golf.cat_familiares(id);

ALTER TABLE golf.ctrl_pensiones
  ADD COLUMN IF NOT EXISTS id_familiar_fk INTEGER REFERENCES golf.cat_familiares(id);

ALTER TABLE golf.cxc_golf
  ADD COLUMN IF NOT EXISTS id_familiar_fk INTEGER REFERENCES golf.cat_familiares(id);

-- Índices de apoyo
CREATE INDEX IF NOT EXISTS idx_cat_carritos_familiar ON golf.cat_carritos(id_familiar_fk);
CREATE INDEX IF NOT EXISTS idx_ctrl_pensiones_familiar ON golf.ctrl_pensiones(id_familiar_fk);
CREATE INDEX IF NOT EXISTS idx_cxc_golf_familiar ON golf.cxc_golf(id_familiar_fk);
