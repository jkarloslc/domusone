-- ============================================================
-- Consecutivo automático para golf.cat_socios.numero_socio
-- Formato: BPCC-MEMB-0001
-- ============================================================

-- 1. Secuencia dedicada
CREATE SEQUENCE IF NOT EXISTS golf.seq_numero_socio START 1;

-- 2. Función trigger
CREATE OR REPLACE FUNCTION golf.fn_auto_numero_socio()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_socio IS NULL OR trim(NEW.numero_socio) = '' THEN
    NEW.numero_socio := 'BPCC-MEMB-' || LPAD(nextval('golf.seq_numero_socio')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger BEFORE INSERT
DROP TRIGGER IF EXISTS trg_auto_numero_socio ON golf.cat_socios;
CREATE TRIGGER trg_auto_numero_socio
  BEFORE INSERT ON golf.cat_socios
  FOR EACH ROW EXECUTE FUNCTION golf.fn_auto_numero_socio();

-- 4. Actualizar TODOS los registros existentes en orden de id ASC
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS n
  FROM golf.cat_socios
)
UPDATE golf.cat_socios s
SET numero_socio = 'BPCC-MEMB-' || LPAD(n.n::text, 4, '0')
FROM numbered n
WHERE s.id = n.id;

-- 5. Avanzar la secuencia al total actual para que nuevos inserts continúen sin colisión
SELECT setval('golf.seq_numero_socio', GREATEST((SELECT COUNT(*) FROM golf.cat_socios), 1), true);
