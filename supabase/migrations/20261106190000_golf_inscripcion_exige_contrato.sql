-- ============================================================
-- Golf: la inscripción (ciclo 2027+) solo puede existir ligada a un contrato firmado.
-- Brecha: «Cuotas → Nueva cuota» permitía crear un cargo INSCRIPCION suelto
-- (sin id_contrato_fk) y cobrarlo sin pasar por contrato/firma.
-- 2026-11-06
-- ============================================================
CREATE OR REPLACE FUNCTION golf.trg_inscripcion_exige_contrato()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_estado TEXT;
BEGIN
  IF NEW.tipo = 'INSCRIPCION' AND COALESCE(NEW.periodo, '') >= '2027-01' THEN
    IF NEW.id_contrato_fk IS NULL THEN
      RAISE EXCEPTION 'La inscripción se genera desde el contrato firmado del socio (Socio → Contratos), no como cargo suelto';
    END IF;
    SELECT estado INTO v_estado FROM golf.ctrl_contratos_membresia WHERE id = NEW.id_contrato_fk;
    IF v_estado IS NULL OR v_estado NOT IN ('FIRMADO','ACTIVO') THEN
      RAISE EXCEPTION 'El contrato debe estar firmado para generar la inscripción';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inscripcion_exige_contrato ON golf.cxc_golf;
CREATE TRIGGER trg_inscripcion_exige_contrato
  BEFORE INSERT ON golf.cxc_golf
  FOR EACH ROW EXECUTE FUNCTION golf.trg_inscripcion_exige_contrato();

-- Cobro: tampoco se puede cobrar (recibo) una inscripción 2027+ sin contrato
CREATE OR REPLACE FUNCTION golf.trg_recibo_det_inscripcion_exige_contrato()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM golf.cxc_golf q WHERE q.id = NEW.id_cuota_fk AND q.tipo = 'INSCRIPCION'
             AND q.id_contrato_fk IS NULL AND COALESCE(q.periodo,'') >= '2027-01') THEN
    RAISE EXCEPTION 'No se puede cobrar una inscripción que no proviene de un contrato firmado';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recibo_det_inscripcion_exige_contrato ON golf.recibos_golf_det;
CREATE TRIGGER trg_recibo_det_inscripcion_exige_contrato
  BEFORE INSERT ON golf.recibos_golf_det
  FOR EACH ROW EXECUTE FUNCTION golf.trg_recibo_det_inscripcion_exige_contrato();
