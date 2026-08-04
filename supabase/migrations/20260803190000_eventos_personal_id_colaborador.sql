-- El campo Nombre del Empleado en la tab "Personal Op." de Eventos ahora se
-- elige vía popup de Colaboradores (puesto = 'Areas Publicas') en vez de
-- texto libre. Se agrega el vínculo opcional; nombre_empleado se conserva
-- como copia del nombre completo al momento de captura.
ALTER TABLE ctrl.eventos_personal
  ADD COLUMN IF NOT EXISTS id_colaborador_fk INTEGER REFERENCES cfg.colaboradores(id);

CREATE INDEX IF NOT EXISTS idx_eventos_personal_colab ON ctrl.eventos_personal(id_colaborador_fk);
