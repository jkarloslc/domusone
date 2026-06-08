-- Trigger: valida que no se asignen más lotes a una sección
-- de los que indica cfg.secciones.cantidad_lotes.
-- Solo aplica cuando cantidad_lotes tiene un valor > 0.

CREATE OR REPLACE FUNCTION cat.check_lote_seccion_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_limite  integer;
  v_actual  integer;
BEGIN
  -- Si no hay sección asignada, no hay nada que validar
  IF NEW.id_seccion_fk IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si la sección no cambió en un UPDATE, saltar
  IF TG_OP = 'UPDATE' AND OLD.id_seccion_fk IS NOT DISTINCT FROM NEW.id_seccion_fk THEN
    RETURN NEW;
  END IF;

  -- Leer límite configurado en la sección
  SELECT cantidad_lotes
    INTO v_limite
    FROM cfg.secciones
   WHERE id = NEW.id_seccion_fk;

  -- Sin límite definido → sin restricción
  IF v_limite IS NULL OR v_limite = 0 THEN
    RETURN NEW;
  END IF;

  -- Contar lotes ya asignados a esa sección (sin incluir el registro actual en UPDATE)
  SELECT COUNT(*)
    INTO v_actual
    FROM cat.lotes
   WHERE id_seccion_fk = NEW.id_seccion_fk
     AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_actual >= v_limite THEN
    RAISE EXCEPTION
      'La sección ya tiene % lote(s) asignado(s), que es el límite configurado (cantidad_lotes = %). No se puede agregar más lotes.',
      v_actual, v_limite;
  END IF;

  RETURN NEW;
END;
$$;

-- Eliminar si ya existía (idempotente)
DROP TRIGGER IF EXISTS trg_check_lote_seccion_capacity ON cat.lotes;

CREATE TRIGGER trg_check_lote_seccion_capacity
  BEFORE INSERT OR UPDATE OF id_seccion_fk
  ON cat.lotes
  FOR EACH ROW
  EXECUTE FUNCTION cat.check_lote_seccion_capacity();

-- Grants para que el rol autenticado pueda ejecutar la función
GRANT EXECUTE ON FUNCTION cat.check_lote_seccion_capacity() TO authenticated;
