-- FASE A — enlaza por llave foránea a cfg.tipos_gasto las tablas que aún lo
-- hacían por texto: comp.ordenes_pago.tipo_gasto, cfg.rol_tipos_op.tipo_gasto y
-- comp.articulos.categoria (esta última define a qué tipo de gasto se
-- reatribuye una OP con OC). Misma técnica que ctrl.ppto_partidas
-- (20260930150000): columna id_tipo_gasto_fk + backfill + trigger que mantiene
-- sincronizado el TEXT como espejo TRANSITORIO. La fase B migra el código a
-- ids y la fase C elimina los espejos y el trigger de cascada de renombres.
--
-- Además agrega a cfg.tipos_gasto los atributos con los que el código deja de
-- comparar nombres:
--   es_comodin  → el tipo "Otros" que absorbe todo lo no mapeado en un área.
--   clave       → identificador semántico estable de los pocos tipos que
--                 disparan flujos propios en la captura de OP. Se compara
--                 `clave`, no el nombre (que el usuario puede renombrar): el
--                 flujo de bitácoras de vehículos llevaba roto desde que
--                 "Mantenimiento de Vehículos" se renombró a "Mantto. de
--                 Vehículos y Maquinaria", porque el código comparaba el nombre.
BEGIN;

-- ── Atributos del catálogo ───────────────────────────────────────────
ALTER TABLE cfg.tipos_gasto ADD COLUMN IF NOT EXISTS es_comodin boolean NOT NULL DEFAULT false;
ALTER TABLE cfg.tipos_gasto ADD COLUMN IF NOT EXISTS clave text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_gasto_clave ON cfg.tipos_gasto (clave) WHERE clave IS NOT NULL;

UPDATE cfg.tipos_gasto SET es_comodin = true WHERE nombre = 'Otros';
UPDATE cfg.tipos_gasto SET clave = 'combustible'       WHERE nombre = 'Combustible'                     AND clave IS NULL;
UPDATE cfg.tipos_gasto SET clave = 'perimetrales'      WHERE nombre = 'Perimetrales'                    AND clave IS NULL;
UPDATE cfg.tipos_gasto SET clave = 'vehiculos'         WHERE nombre = 'Mantto. de Vehículos y Maquinaria' AND clave IS NULL;
UPDATE cfg.tipos_gasto SET clave = 'gas_lp'            WHERE nombre = 'Gas LP'                          AND clave IS NULL;
UPDATE cfg.tipos_gasto SET clave = 'electricidad'      WHERE nombre = 'Electricidad'                    AND clave IS NULL;
UPDATE cfg.tipos_gasto SET clave = 'personal_externo'  WHERE nombre = 'Pagos a Personal Externo'        AND clave IS NULL;

COMMENT ON COLUMN cfg.tipos_gasto.es_comodin IS
  'true = tipo comodín del área (hoy "Otros"): absorbe lo que ninguna partida específica cubre.';
COMMENT ON COLUMN cfg.tipos_gasto.clave IS
  'Clave semántica estable para tipos que disparan flujos propios en OP (combustible, perimetrales, vehiculos, gas_lp, electricidad, personal_externo). El código compara la clave, nunca el nombre.';

-- ── Columnas FK ──────────────────────────────────────────────────────
ALTER TABLE comp.ordenes_pago ADD COLUMN IF NOT EXISTS id_tipo_gasto_fk integer
  REFERENCES cfg.tipos_gasto(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE cfg.rol_tipos_op  ADD COLUMN IF NOT EXISTS id_tipo_gasto_fk integer
  REFERENCES cfg.tipos_gasto(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE comp.articulos    ADD COLUMN IF NOT EXISTS id_tipo_gasto_fk integer
  REFERENCES cfg.tipos_gasto(id) ON UPDATE CASCADE ON DELETE RESTRICT;

UPDATE comp.ordenes_pago o SET id_tipo_gasto_fk = t.id
  FROM cfg.tipos_gasto t WHERE o.tipo_gasto = t.nombre AND o.id_tipo_gasto_fk IS NULL;
UPDATE cfg.rol_tipos_op r SET id_tipo_gasto_fk = t.id
  FROM cfg.tipos_gasto t WHERE r.tipo_gasto = t.nombre AND r.id_tipo_gasto_fk IS NULL;
UPDATE comp.articulos a SET id_tipo_gasto_fk = t.id
  FROM cfg.tipos_gasto t WHERE a.categoria = t.nombre AND a.id_tipo_gasto_fk IS NULL;

DO $$
DECLARE huerfanas text;
BEGIN
  SELECT string_agg(DISTINCT x, ', ') INTO huerfanas FROM (
    SELECT 'ordenes_pago:' || tipo_gasto AS x FROM comp.ordenes_pago WHERE tipo_gasto IS NOT NULL AND id_tipo_gasto_fk IS NULL
    UNION ALL
    SELECT 'rol_tipos_op:' || tipo_gasto FROM cfg.rol_tipos_op WHERE tipo_gasto IS NOT NULL AND id_tipo_gasto_fk IS NULL
    UNION ALL
    SELECT 'articulos:' || categoria FROM comp.articulos WHERE categoria IS NOT NULL AND id_tipo_gasto_fk IS NULL
  ) s;
  IF huerfanas IS NOT NULL THEN
    RAISE EXCEPTION 'valores fuera de cfg.tipos_gasto: %', huerfanas;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_op_tipo_gasto_fk       ON comp.ordenes_pago (id_tipo_gasto_fk);
CREATE INDEX IF NOT EXISTS idx_rol_tipos_op_tipo_fk   ON cfg.rol_tipos_op  (id_tipo_gasto_fk);
CREATE INDEX IF NOT EXISTS idx_articulos_tipo_gasto_fk ON comp.articulos   (id_tipo_gasto_fk);

-- ── Espejos sincronizados (transitorios) ─────────────────────────────
-- Escribir el id completa el texto; escribir el texto completa el id.
-- También cubre la cascada de renombres del catálogo (el id no cambia).
CREATE OR REPLACE FUNCTION cfg.fn_sync_tipo_gasto_op()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = cfg, comp, pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id_tipo_gasto_fk IS NOT NULL THEN
      SELECT nombre INTO NEW.tipo_gasto FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk;
    ELSIF NEW.tipo_gasto IS NOT NULL THEN
      SELECT id INTO NEW.id_tipo_gasto_fk FROM cfg.tipos_gasto WHERE nombre = NEW.tipo_gasto;
      IF NEW.id_tipo_gasto_fk IS NULL THEN RAISE EXCEPTION 'tipo_gasto "%" no existe en cfg.tipos_gasto', NEW.tipo_gasto; END IF;
    END IF;
  ELSE
    IF NEW.id_tipo_gasto_fk IS DISTINCT FROM OLD.id_tipo_gasto_fk THEN
      NEW.tipo_gasto := (SELECT nombre FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk);
    ELSIF NEW.tipo_gasto IS DISTINCT FROM OLD.tipo_gasto THEN
      NEW.id_tipo_gasto_fk := (SELECT id FROM cfg.tipos_gasto WHERE nombre = NEW.tipo_gasto);
      IF NEW.tipo_gasto IS NOT NULL AND NEW.id_tipo_gasto_fk IS NULL THEN
        RAISE EXCEPTION 'tipo_gasto "%" no existe en cfg.tipos_gasto', NEW.tipo_gasto;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cfg.fn_sync_tipo_gasto_rol()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = cfg, pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id_tipo_gasto_fk IS NOT NULL THEN
      SELECT nombre INTO NEW.tipo_gasto FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk;
    ELSIF NEW.tipo_gasto IS NOT NULL THEN
      SELECT id INTO NEW.id_tipo_gasto_fk FROM cfg.tipos_gasto WHERE nombre = NEW.tipo_gasto;
      IF NEW.id_tipo_gasto_fk IS NULL THEN RAISE EXCEPTION 'tipo_gasto "%" no existe en cfg.tipos_gasto', NEW.tipo_gasto; END IF;
    END IF;
  ELSE
    IF NEW.id_tipo_gasto_fk IS DISTINCT FROM OLD.id_tipo_gasto_fk THEN
      NEW.tipo_gasto := (SELECT nombre FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk);
    ELSIF NEW.tipo_gasto IS DISTINCT FROM OLD.tipo_gasto THEN
      NEW.id_tipo_gasto_fk := (SELECT id FROM cfg.tipos_gasto WHERE nombre = NEW.tipo_gasto);
      IF NEW.tipo_gasto IS NOT NULL AND NEW.id_tipo_gasto_fk IS NULL THEN
        RAISE EXCEPTION 'tipo_gasto "%" no existe en cfg.tipos_gasto', NEW.tipo_gasto;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cfg.fn_sync_tipo_gasto_art()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = cfg, comp, pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id_tipo_gasto_fk IS NOT NULL THEN
      SELECT nombre INTO NEW.categoria FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk;
    ELSIF NEW.categoria IS NOT NULL THEN
      SELECT id INTO NEW.id_tipo_gasto_fk FROM cfg.tipos_gasto WHERE nombre = NEW.categoria;
      IF NEW.id_tipo_gasto_fk IS NULL THEN RAISE EXCEPTION 'categoria "%" no existe en cfg.tipos_gasto', NEW.categoria; END IF;
    END IF;
  ELSE
    IF NEW.id_tipo_gasto_fk IS DISTINCT FROM OLD.id_tipo_gasto_fk THEN
      NEW.categoria := (SELECT nombre FROM cfg.tipos_gasto WHERE id = NEW.id_tipo_gasto_fk);
    ELSIF NEW.categoria IS DISTINCT FROM OLD.categoria THEN
      NEW.id_tipo_gasto_fk := (SELECT id FROM cfg.tipos_gasto WHERE nombre = NEW.categoria);
      IF NEW.categoria IS NOT NULL AND NEW.id_tipo_gasto_fk IS NULL THEN
        RAISE EXCEPTION 'categoria "%" no existe en cfg.tipos_gasto', NEW.categoria;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_tipo_gasto_op ON comp.ordenes_pago;
CREATE TRIGGER trg_sync_tipo_gasto_op BEFORE INSERT OR UPDATE OF tipo_gasto, id_tipo_gasto_fk ON comp.ordenes_pago
  FOR EACH ROW EXECUTE FUNCTION cfg.fn_sync_tipo_gasto_op();
DROP TRIGGER IF EXISTS trg_sync_tipo_gasto_rol ON cfg.rol_tipos_op;
CREATE TRIGGER trg_sync_tipo_gasto_rol BEFORE INSERT OR UPDATE OF tipo_gasto, id_tipo_gasto_fk ON cfg.rol_tipos_op
  FOR EACH ROW EXECUTE FUNCTION cfg.fn_sync_tipo_gasto_rol();
DROP TRIGGER IF EXISTS trg_sync_tipo_gasto_art ON comp.articulos;
CREATE TRIGGER trg_sync_tipo_gasto_art BEFORE INSERT OR UPDATE OF categoria, id_tipo_gasto_fk ON comp.articulos
  FOR EACH ROW EXECUTE FUNCTION cfg.fn_sync_tipo_gasto_art();

COMMIT;
