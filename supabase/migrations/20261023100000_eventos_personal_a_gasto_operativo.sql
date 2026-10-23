-- ============================================================
-- Eventos: la compensación del Personal Operativo pasa automáticamente
-- a Gasto Operativo del evento (ctrl.eventos_gastos).
--
-- Una fila de eventos_personal con compensacion > 0 genera/actualiza UNA
-- fila en eventos_gastos enlazada por id_personal_fk (FK sobre id, no por
-- texto). Si la compensación pasa a 0/NULL, el gasto se elimina; si se borra
-- el personal (o el evento), el gasto se borra en cascada.
-- Aplica a Eventos Ecuestres y Torneos Golf (ambos usan estas tablas), y el
-- reporte Hospitality-Eventos ya suma eventos_gastos, sin cambios.
-- ============================================================
BEGIN;

ALTER TABLE ctrl.eventos_gastos
  ADD COLUMN IF NOT EXISTS id_personal_fk BIGINT
    REFERENCES ctrl.eventos_personal(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eventos_gastos_personal
  ON ctrl.eventos_gastos(id_personal_fk) WHERE id_personal_fk IS NOT NULL;

CREATE OR REPLACE FUNCTION ctrl.fn_eventos_personal_a_gasto()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_concepto TEXT;
BEGIN
  IF COALESCE(NEW.compensacion, 0) <= 0 THEN
    DELETE FROM ctrl.eventos_gastos WHERE id_personal_fk = NEW.id;
    RETURN NEW;
  END IF;

  v_concepto := 'Personal operativo — ' || NEW.nombre_empleado
             || CASE WHEN NEW.turno IS NOT NULL AND NEW.turno <> '' THEN ' (' || NEW.turno || ')' ELSE '' END;

  UPDATE ctrl.eventos_gastos
     SET id_evento_fk = NEW.id_evento_fk,
         concepto     = v_concepto,
         tipo_gasto   = 'Personal Operativo',
         monto        = NEW.compensacion,
         fecha        = NEW.dia,
         updated_at   = NOW()
   WHERE id_personal_fk = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO ctrl.eventos_gastos
      (id_evento_fk, concepto, tipo_gasto, monto, fecha, notas, id_personal_fk)
    VALUES
      (NEW.id_evento_fk, v_concepto, 'Personal Operativo', NEW.compensacion, NEW.dia,
       'Generado automáticamente desde Personal Operativo', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eventos_personal_a_gasto ON ctrl.eventos_personal;
CREATE TRIGGER trg_eventos_personal_a_gasto
  AFTER INSERT OR UPDATE ON ctrl.eventos_personal
  FOR EACH ROW EXECUTE FUNCTION ctrl.fn_eventos_personal_a_gasto();

-- Backfill: personal ya capturado que aún no tiene gasto
INSERT INTO ctrl.eventos_gastos
  (id_evento_fk, concepto, tipo_gasto, monto, fecha, notas, id_personal_fk)
SELECT p.id_evento_fk,
       'Personal operativo — ' || p.nombre_empleado
         || CASE WHEN p.turno IS NOT NULL AND p.turno <> '' THEN ' (' || p.turno || ')' ELSE '' END,
       'Personal Operativo', p.compensacion, p.dia,
       'Generado automáticamente desde Personal Operativo', p.id
  FROM ctrl.eventos_personal p
 WHERE COALESCE(p.compensacion, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM ctrl.eventos_gastos g WHERE g.id_personal_fk = p.id);

COMMIT;
