-- ctrl.ppto_partidas → cfg.tipos_gasto por llave foránea.
--
-- Antes la partida guardaba el NOMBRE del tipo de gasto (TEXT) y un rename en
-- el catálogo dependía de un trigger de cascada. Ahora la partida apunta al id.
-- `tipo_gasto` (TEXT) se conserva como espejo sincronizado por trigger: las OP
-- siguen asociándose a la partida por igualdad de nombre (Comparativo, Flujo,
-- Dashboard, pptoOcCategoria), así que ningún lector existente cambia.
-- Se puede escribir cualquiera de los dos campos; el trigger deja ambos
-- coherentes.
BEGIN;

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS id_tipo_gasto_fk integer
    REFERENCES cfg.tipos_gasto(id) ON UPDATE CASCADE ON DELETE RESTRICT;

UPDATE ctrl.ppto_partidas p
   SET id_tipo_gasto_fk = t.id
  FROM cfg.tipos_gasto t
 WHERE p.tipo_gasto = t.nombre AND p.id_tipo_gasto_fk IS NULL;

-- Si algún nombre no existe en el catálogo, aborta en vez de dejar partidas sin enlace.
DO $$
DECLARE huerfanas text;
BEGIN
  SELECT string_agg(DISTINCT tipo_gasto, ', ') INTO huerfanas
    FROM ctrl.ppto_partidas
   WHERE tipo_gasto IS NOT NULL AND id_tipo_gasto_fk IS NULL;
  IF huerfanas IS NOT NULL THEN
    RAISE EXCEPTION 'ppto_partidas con tipo_gasto fuera de cfg.tipos_gasto: %', huerfanas;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ppto_partidas_tipo_gasto_fk
  ON ctrl.ppto_partidas (id_tipo_gasto_fk);

CREATE OR REPLACE FUNCTION ctrl.fn_ppto_partidas_sync_tipo_gasto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cfg, ctrl, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id_tipo_gasto_fk IS NOT NULL THEN
      SELECT nombre INTO NEW.tipo_gasto FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk;
    ELSIF NEW.tipo_gasto IS NOT NULL THEN
      SELECT id INTO NEW.id_tipo_gasto_fk FROM cfg.tipos_gasto WHERE nombre = NEW.tipo_gasto;
      IF NEW.id_tipo_gasto_fk IS NULL THEN
        RAISE EXCEPTION 'tipo_gasto "%" no existe en cfg.tipos_gasto', NEW.tipo_gasto;
      END IF;
    END IF;
  ELSE
    IF NEW.id_tipo_gasto_fk IS DISTINCT FROM OLD.id_tipo_gasto_fk THEN
      NEW.tipo_gasto := (SELECT nombre FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk);
    ELSIF NEW.tipo_gasto IS DISTINCT FROM OLD.tipo_gasto THEN
      -- También cubre la cascada de renombre del catálogo (el id no cambia).
      NEW.id_tipo_gasto_fk := (SELECT id FROM cfg.tipos_gasto WHERE nombre = NEW.tipo_gasto);
      IF NEW.tipo_gasto IS NOT NULL AND NEW.id_tipo_gasto_fk IS NULL THEN
        RAISE EXCEPTION 'tipo_gasto "%" no existe en cfg.tipos_gasto', NEW.tipo_gasto;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ppto_partidas_sync_tipo_gasto ON ctrl.ppto_partidas;
CREATE TRIGGER trg_ppto_partidas_sync_tipo_gasto
  BEFORE INSERT OR UPDATE OF tipo_gasto, id_tipo_gasto_fk ON ctrl.ppto_partidas
  FOR EACH ROW EXECUTE FUNCTION ctrl.fn_ppto_partidas_sync_tipo_gasto();

COMMENT ON COLUMN ctrl.ppto_partidas.id_tipo_gasto_fk IS
  'FK a cfg.tipos_gasto. tipo_gasto (TEXT) es su espejo, sincronizado por trigger, y es lo que usan las OP para asociarse.';

COMMIT;
