-- Tabla de baterías por carrito eléctrico
-- Un carrito puede tener hasta 8 baterías (restricción en la aplicación)

CREATE TABLE IF NOT EXISTS golf.baterias_carritos (
  id            SERIAL PRIMARY KEY,
  id_carrito_fk INTEGER NOT NULL REFERENCES golf.cat_carritos(id) ON DELETE CASCADE,
  tipo          TEXT,          -- Voltaje: 6V, 8V, 12V | Tecnología: Plomo-Ácido, AGM, GEL, Litio
  marca         TEXT,
  anio          SMALLINT,
  numero_serie  TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice por carrito
CREATE INDEX IF NOT EXISTS idx_baterias_carritos_carrito ON golf.baterias_carritos(id_carrito_fk);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION golf.set_baterias_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_baterias_carritos_updated_at
  BEFORE UPDATE ON golf.baterias_carritos
  FOR EACH ROW EXECUTE FUNCTION golf.set_baterias_updated_at();

-- Restricción: máximo 8 baterías activas por carrito (check a nivel BD)
CREATE OR REPLACE FUNCTION golf.check_max_baterias()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM golf.baterias_carritos
  WHERE id_carrito_fk = NEW.id_carrito_fk AND activo = TRUE AND id != COALESCE(NEW.id, 0);
  IF v_count >= 8 THEN
    RAISE EXCEPTION 'Un carrito no puede tener más de 8 baterías activas';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_max_baterias
  BEFORE INSERT OR UPDATE ON golf.baterias_carritos
  FOR EACH ROW WHEN (NEW.activo = TRUE)
  EXECUTE FUNCTION golf.check_max_baterias();
