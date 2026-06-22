-- ══════════════════════════════════════════════════════════════
-- Administración Interna del Condominio — por periodo, por sección
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cfg.seccion_administracion (
  id                   bigserial    PRIMARY KEY,
  id_seccion_fk        bigint       NOT NULL REFERENCES cfg.secciones(id) ON DELETE CASCADE,
  nombre_administrador text         NOT NULL,
  telefono             text,
  correo               text,
  periodo_inicio       date         NOT NULL,
  periodo_fin          date,  -- NULL = periodo abierto/vigente hasta que se registre el siguiente
  notas                text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seccion_administracion_seccion ON cfg.seccion_administracion(id_seccion_fk);

-- Solo una administración por periodo: no se permiten rangos de fechas
-- traslapados para la misma sección (periodo_fin NULL se trata como abierto/infinito).
CREATE OR REPLACE FUNCTION cfg.check_seccion_administracion_periodo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM cfg.seccion_administracion
     WHERE id_seccion_fk = NEW.id_seccion_fk
       AND (TG_OP = 'INSERT' OR id <> NEW.id)
       AND NEW.periodo_inicio <= COALESCE(periodo_fin, 'infinity'::date)
       AND COALESCE(NEW.periodo_fin, 'infinity'::date) >= periodo_inicio
  ) THEN
    RAISE EXCEPTION
      'Ya existe una administración registrada para esta sección que se traslapa con el periodo indicado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_seccion_administracion_periodo ON cfg.seccion_administracion;

CREATE TRIGGER trg_check_seccion_administracion_periodo
  BEFORE INSERT OR UPDATE OF id_seccion_fk, periodo_inicio, periodo_fin
  ON cfg.seccion_administracion
  FOR EACH ROW
  EXECUTE FUNCTION cfg.check_seccion_administracion_periodo();

GRANT EXECUTE ON FUNCTION cfg.check_seccion_administracion_periodo() TO authenticated;

-- RLS
ALTER TABLE cfg.seccion_administracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY seccion_administracion_select_auth
  ON cfg.seccion_administracion FOR SELECT TO authenticated USING (true);
CREATE POLICY seccion_administracion_insert_auth
  ON cfg.seccion_administracion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY seccion_administracion_update_auth
  ON cfg.seccion_administracion FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY seccion_administracion_delete_auth
  ON cfg.seccion_administracion FOR DELETE TO authenticated USING (true);

-- Grants
GRANT SELECT ON cfg.seccion_administracion TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.seccion_administracion TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE cfg.seccion_administracion_id_seq TO authenticated;
GRANT ALL ON cfg.seccion_administracion TO service_role;
