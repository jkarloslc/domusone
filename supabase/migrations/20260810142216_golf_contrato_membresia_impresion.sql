-- Datos necesarios para imprimir el contrato de membresía (SocioModal, tab Membresía)

-- Lugar de nacimiento y domicilio del socio (no existían en cat_socios)
ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS lugar_nacimiento TEXT,
  ADD COLUMN IF NOT EXISTS domicilio TEXT;

-- El contrato (Cláusula SEGUNDA) desglosa dos montos distintos: cuota de
-- inscripción y cuota anual. El campo `monto` original no distinguía entre
-- ambos, se agregan los dos campos explícitos.
ALTER TABLE golf.ctrl_contratos_membresia
  ADD COLUMN IF NOT EXISTS monto_inscripcion NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS monto_anual NUMERIC(12,2);
