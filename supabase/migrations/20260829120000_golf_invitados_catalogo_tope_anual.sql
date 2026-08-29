-- ============================================================
--  GOLF — Catálogo de Invitados + tope anual de visitas
--  Antes cada acompañante "Invitado"/"Green Fee" se guardaba solo
--  como texto libre en ctrl_acceso_acomp.nombre — sin identidad
--  persistente no se podía saber si dos registros son la misma
--  persona, ni contar su frecuencia de asistencia cruzada entre
--  distintos socios anfitriones. Esta migración agrega el catálogo
--  y liga cada acompañante de tipo Invitado (pase o Green Fee) a su
--  ficha, para poder aplicar un tope anual de visitas (20, igual
--  para todo tipo de socio; Green Fee de invitado también cuenta).
-- ============================================================

CREATE TABLE IF NOT EXISTS golf.cat_invitados (
  id            bigserial     PRIMARY KEY,
  nombre        text          NOT NULL,
  telefono      text,
  email         text,
  observaciones text,
  activo        boolean       NOT NULL DEFAULT true,
  created_by    text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

GRANT ALL ON golf.cat_invitados TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_invitados_id_seq TO anon, authenticated;
ALTER TABLE golf.cat_invitados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.cat_invitados;
CREATE POLICY "allow_all" ON golf.cat_invitados
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Liga el acompañante a su ficha del catálogo. Queda NULL en tipos que
-- no son invitado personal del socio (Familiar, Intercambio) y en
-- registros anteriores a esta migración (no se migran retroactivamente
-- por no tener forma confiable de matchear el nombre libre a una persona).
ALTER TABLE golf.ctrl_acceso_acomp
  ADD COLUMN IF NOT EXISTS id_invitado_fk bigint REFERENCES golf.cat_invitados(id);

CREATE INDEX IF NOT EXISTS idx_acceso_acomp_invitado ON golf.ctrl_acceso_acomp(id_invitado_fk);

COMMENT ON COLUMN golf.ctrl_acceso_acomp.id_invitado_fk IS
  'FK a golf.cat_invitados — solo para tipo Invitado (PASE o GREEN_FEE). NULL en Familiar/Intercambio y en registros anteriores a esta migración.';

-- Política de tope anual — un único valor, igual para todos los socios
CREATE TABLE IF NOT EXISTS golf.cfg_invitados_politica (
  id           bigserial     PRIMARY KEY,
  limite_anual integer       NOT NULL DEFAULT 20,
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO golf.cfg_invitados_politica (limite_anual)
  SELECT 20 WHERE NOT EXISTS (SELECT 1 FROM golf.cfg_invitados_politica);

GRANT ALL ON golf.cfg_invitados_politica TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cfg_invitados_politica_id_seq TO anon, authenticated;
ALTER TABLE golf.cfg_invitados_politica ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.cfg_invitados_politica;
CREATE POLICY "allow_all" ON golf.cfg_invitados_politica
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── Refuerzo server-side ────────────────────────────────────────
-- La UI ya valida el tope antes de guardar, pero un trigger evita que
-- una condición de carrera (dos salidas casi simultáneas con el mismo
-- invitado) o una inserción directa se lo salten.
CREATE OR REPLACE FUNCTION golf.fn_check_tope_invitados()
RETURNS trigger AS $$
DECLARE
  v_limite  integer;
  v_anio    integer;
  v_visitas integer;
BEGIN
  IF NEW.id_invitado_fk IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT limite_anual INTO v_limite FROM golf.cfg_invitados_politica ORDER BY id LIMIT 1;
  IF v_limite IS NULL THEN
    v_limite := 20;
  END IF;

  SELECT date_part('year', fecha_entrada)::integer INTO v_anio
    FROM golf.ctrl_accesos WHERE id = NEW.id_acceso_fk;

  SELECT count(*) INTO v_visitas
    FROM golf.ctrl_acceso_acomp aa
    JOIN golf.ctrl_accesos a ON a.id = aa.id_acceso_fk
    WHERE aa.id_invitado_fk = NEW.id_invitado_fk
      AND date_part('year', a.fecha_entrada) = v_anio;

  IF v_visitas >= v_limite THEN
    RAISE EXCEPTION 'El invitado ya alcanzó el límite anual de % visitas', v_limite;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_tope_invitados ON golf.ctrl_acceso_acomp;
CREATE TRIGGER trg_check_tope_invitados
  BEFORE INSERT ON golf.ctrl_acceso_acomp
  FOR EACH ROW EXECUTE FUNCTION golf.fn_check_tope_invitados();
