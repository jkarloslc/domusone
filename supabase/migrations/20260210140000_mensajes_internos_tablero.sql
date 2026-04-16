-- Mensajería interna tipo ERP (bandeja 1:1, sin servicios externos)
-- Esquema ctrl · remitente/destinatario = cfg.usuarios.id (= auth.users.id)

CREATE TABLE IF NOT EXISTS ctrl.mensajes_internos (
  id                bigserial PRIMARY KEY,
  remitente_id      uuid NOT NULL,
  destinatario_id   uuid NOT NULL,
  remitente_nombre  text,
  cuerpo            text NOT NULL,
  leido_en          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mensajes_distintos CHECK (remitente_id <> destinatario_id)
);

CREATE INDEX IF NOT EXISTS idx_mensajes_internos_dest_created
  ON ctrl.mensajes_internos (destinatario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensajes_internos_remit_created
  ON ctrl.mensajes_internos (remitente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensajes_internos_pair
  ON ctrl.mensajes_internos (remitente_id, destinatario_id);

COMMENT ON TABLE ctrl.mensajes_internos IS
  'Mensajes directos entre usuarios del sistema (Mi Tablero).';

-- Solo permitir cambiar leido_en al marcar lectura (auditoría)
CREATE OR REPLACE FUNCTION ctrl.trg_mensajes_internos_solo_leido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.cuerpo IS DISTINCT FROM NEW.cuerpo
       OR OLD.remitente_id IS DISTINCT FROM NEW.remitente_id
       OR OLD.destinatario_id IS DISTINCT FROM NEW.destinatario_id
       OR OLD.remitente_nombre IS DISTINCT FROM NEW.remitente_nombre
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
    THEN
      RAISE EXCEPTION 'Solo se puede actualizar leido_en';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mensajes_internos_solo_leido ON ctrl.mensajes_internos;
CREATE TRIGGER mensajes_internos_solo_leido
  BEFORE UPDATE ON ctrl.mensajes_internos
  FOR EACH ROW
  EXECUTE FUNCTION ctrl.trg_mensajes_internos_solo_leido();

ALTER TABLE ctrl.mensajes_internos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensajes_internos_select"
  ON ctrl.mensajes_internos FOR SELECT TO authenticated
  USING (remitente_id = auth.uid() OR destinatario_id = auth.uid());

CREATE POLICY "mensajes_internos_insert"
  ON ctrl.mensajes_internos FOR INSERT TO authenticated
  WITH CHECK (remitente_id = auth.uid());

CREATE POLICY "mensajes_internos_update_leido"
  ON ctrl.mensajes_internos FOR UPDATE TO authenticated
  USING (destinatario_id = auth.uid())
  WITH CHECK (destinatario_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON TABLE ctrl.mensajes_internos TO authenticated;

DO $$
DECLARE
  seqname text;
BEGIN
  seqname := pg_get_serial_sequence('ctrl.mensajes_internos', 'id');
  IF seqname IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seqname);
  END IF;
END $$;

-- Si aparece "permission denied for schema ctrl", descomenta:
-- GRANT USAGE ON SCHEMA ctrl TO authenticated;
