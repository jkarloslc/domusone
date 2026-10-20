-- ============================================================
-- Golf: flujo obligatorio de Alta / Renovación de membresía
--   contrato BORRADOR → IMPRESO → FIRMADO (archivo + fecha_firma)
--   → cargo de inscripción automático → pago → ACTIVO + mensualidades
-- La forma de pago «Condonación» (y el descuento adicional) en la
-- inscripción de un contrato solo la pueden usar superadmin y admin.
-- 2026-10-20
-- ============================================================

-- 1) Columnas del flujo en el contrato
ALTER TABLE golf.ctrl_contratos_membresia
  ADD COLUMN IF NOT EXISTS tipo_movimiento TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS fecha_firma DATE,
  ADD COLUMN IF NOT EXISTS impreso_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS impreso_por TEXT,
  ADD COLUMN IF NOT EXISTS firma_registrada_por TEXT,
  ADD COLUMN IF NOT EXISTS monto_mensualidad NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS id_cuota_inscripcion_fk INTEGER REFERENCES golf.cat_cuotas_config(id),
  ADD COLUMN IF NOT EXISTS id_cuota_mensualidad_fk INTEGER REFERENCES golf.cat_cuotas_config(id);

-- Los contratos que ya existen quedan ACTIVO (el flujo aplica desde el ciclo 2027);
-- los nuevos nacen en BORRADOR.
ALTER TABLE golf.ctrl_contratos_membresia ALTER COLUMN estado SET DEFAULT 'BORRADOR';

ALTER TABLE golf.ctrl_contratos_membresia DROP CONSTRAINT IF EXISTS ctrl_contratos_membresia_estado_check;
ALTER TABLE golf.ctrl_contratos_membresia ADD CONSTRAINT ctrl_contratos_membresia_estado_check
  CHECK (estado IN ('BORRADOR','IMPRESO','FIRMADO','ACTIVO','CANCELADO'));
ALTER TABLE golf.ctrl_contratos_membresia DROP CONSTRAINT IF EXISTS ctrl_contratos_membresia_tipo_mov_check;
ALTER TABLE golf.ctrl_contratos_membresia ADD CONSTRAINT ctrl_contratos_membresia_tipo_mov_check
  CHECK (tipo_movimiento IS NULL OR tipo_movimiento IN ('ALTA','RENOVACION'));

-- Un solo contrato en flujo por socio y ciclo (los históricos sin tipo_movimiento no cuentan)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_socio_ciclo_flujo
  ON golf.ctrl_contratos_membresia (id_socio_fk, anio)
  WHERE tipo_movimiento IS NOT NULL AND estado <> 'CANCELADO';

-- Vínculo cargo ↔ contrato (ya existían en v8 solo si se ejecutó; idempotente)
ALTER TABLE golf.cxc_golf
  ADD COLUMN IF NOT EXISTS id_contrato_fk INTEGER REFERENCES golf.ctrl_contratos_membresia(id),
  ADD COLUMN IF NOT EXISTS id_cuota_config_fk INTEGER REFERENCES golf.cat_cuotas_config(id),
  ADD COLUMN IF NOT EXISTS mes_numero INTEGER,
  ADD COLUMN IF NOT EXISTS usuario_crea TEXT;
CREATE INDEX IF NOT EXISTS idx_cxc_golf_contrato ON golf.cxc_golf(id_contrato_fk);

-- 2) Activación: ACTIVO + vigente + mensualidades.
--    Arrancan en el mes de la firma si firmó del 1 al 15, o el mes siguiente si firmó del 16 en
--    adelante, y terminan el 31 de diciembre del año del ciclo.
CREATE OR REPLACE FUNCTION golf.activar_contrato_membresia(p_id INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = golf, public AS $$
DECLARE
  c golf.ctrl_contratos_membresia%ROWTYPE;
  v_dia INTEGER;
  v_inicio DATE;
  v_mes DATE;
BEGIN
  SELECT * INTO c FROM golf.ctrl_contratos_membresia WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR c.estado = 'ACTIVO' THEN RETURN; END IF;

  PERFORM set_config('golf.activando_contrato', '1', true);

  v_inicio := date_trunc('month', c.fecha_firma)::date;
  IF EXTRACT(DAY FROM c.fecha_firma) >= 16 THEN v_inicio := (v_inicio + INTERVAL '1 month')::date; END IF;
  IF EXTRACT(YEAR FROM v_inicio) < c.anio THEN v_inicio := make_date(c.anio, 1, 1); END IF;

  SELECT COALESCE(dia_vencimiento, 10) INTO v_dia FROM golf.cat_cuotas_config WHERE id = c.id_cuota_mensualidad_fk;
  v_dia := LEAST(COALESCE(v_dia, 10), 28);

  IF COALESCE(c.monto_mensualidad, 0) > 0 THEN
    v_mes := v_inicio;
    WHILE EXTRACT(YEAR FROM v_mes) = c.anio LOOP
      IF NOT EXISTS (
        SELECT 1 FROM golf.cxc_golf
        WHERE id_contrato_fk = c.id AND tipo = 'MENSUALIDAD' AND periodo = to_char(v_mes, 'YYYY-MM')
      ) THEN
        INSERT INTO golf.cxc_golf
          (id_socio_fk, tipo, concepto, periodo, monto_original, descuento, saldo, status,
           fecha_emision, fecha_vencimiento, id_contrato_fk, id_cuota_config_fk, mes_numero, usuario_crea)
        VALUES
          (c.id_socio_fk, 'MENSUALIDAD', 'Mensualidad — ' || to_char(v_mes, 'YYYY-MM'), to_char(v_mes, 'YYYY-MM'),
           c.monto_mensualidad, 0, c.monto_mensualidad, 'PENDIENTE',
           CURRENT_DATE, make_date(c.anio, EXTRACT(MONTH FROM v_mes)::int, v_dia),
           c.id, c.id_cuota_mensualidad_fk, EXTRACT(MONTH FROM v_mes)::int, 'flujo-contrato');
      END IF;
      v_mes := (v_mes + INTERVAL '1 month')::date;
    END LOOP;
  END IF;

  -- Solo un contrato vigente por socio
  UPDATE golf.ctrl_contratos_membresia SET vigente = false WHERE id_socio_fk = c.id_socio_fk AND id <> c.id AND vigente;
  UPDATE golf.ctrl_contratos_membresia
     SET estado = 'ACTIVO', vigente = true, fecha_fin = COALESCE(fecha_fin, make_date(c.anio, 12, 31))
   WHERE id = c.id;
END $$;

-- 3) Candados sobre el contrato
CREATE OR REPLACE FUNCTION golf.trg_contrato_membresia_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo_movimiento IS NOT NULL AND OLD.estado IN ('FIRMADO','ACTIVO') THEN
      RAISE EXCEPTION 'No se puede eliminar un contrato % (ya firmado)', OLD.estado;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ACTIVO' AND NEW.tipo_movimiento IS NOT NULL THEN
      RAISE EXCEPTION 'Un contrato nuevo debe iniciar en BORRADOR';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'ACTIVO' AND COALESCE(current_setting('golf.activando_contrato', true), '') <> '1' THEN
      RAISE EXCEPTION 'Un contrato solo se activa al pagar la inscripción';
    END IF;
    IF NEW.estado = 'FIRMADO' THEN
      IF NEW.archivo_url IS NULL OR NEW.fecha_firma IS NULL THEN
        RAISE EXCEPTION 'Registrar la firma exige el archivo del contrato firmado y la fecha de firma';
      END IF;
      IF OLD.estado NOT IN ('IMPRESO') THEN
        RAISE EXCEPTION 'El contrato debe imprimirse antes de registrar la firma';
      END IF;
    END IF;
  END IF;
  -- vigente solo lo maneja la activación (para contratos del flujo nuevo)
  IF NEW.tipo_movimiento IS NOT NULL AND NEW.vigente AND NOT OLD.vigente
     AND COALESCE(current_setting('golf.activando_contrato', true), '') <> '1' THEN
    RAISE EXCEPTION 'El contrato solo queda vigente al activarse';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contrato_membresia_guard ON golf.ctrl_contratos_membresia;
CREATE TRIGGER trg_contrato_membresia_guard
  BEFORE INSERT OR UPDATE OR DELETE ON golf.ctrl_contratos_membresia
  FOR EACH ROW EXECUTE FUNCTION golf.trg_contrato_membresia_guard();

-- 4) Al firmarse: nace el cargo de inscripción (o, si es cortesía pactada de $0, se activa directo)
CREATE OR REPLACE FUNCTION golf.trg_contrato_firmado_genera_inscripcion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = golf, public AS $$
DECLARE v_dia INTEGER;
BEGIN
  IF NEW.estado = 'FIRMADO' AND OLD.estado IS DISTINCT FROM 'FIRMADO' THEN
    IF COALESCE(NEW.monto_inscripcion, 0) > 0 THEN
      IF NOT EXISTS (SELECT 1 FROM golf.cxc_golf WHERE id_contrato_fk = NEW.id AND tipo = 'INSCRIPCION') THEN
        INSERT INTO golf.cxc_golf
          (id_socio_fk, tipo, concepto, periodo, monto_original, descuento, saldo, status,
           fecha_emision, fecha_vencimiento, id_contrato_fk, id_cuota_config_fk, usuario_crea)
        VALUES
          (NEW.id_socio_fk, 'INSCRIPCION', 'Inscripción ciclo ' || NEW.anio, to_char(NEW.fecha_firma, 'YYYY-MM'),
           NEW.monto_inscripcion, 0, NEW.monto_inscripcion, 'PENDIENTE',
           CURRENT_DATE, NEW.fecha_firma, NEW.id, NEW.id_cuota_inscripcion_fk, 'flujo-contrato');
      END IF;
    ELSE
      PERFORM golf.activar_contrato_membresia(NEW.id);
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_contrato_firmado_genera_inscripcion ON golf.ctrl_contratos_membresia;
CREATE TRIGGER trg_contrato_firmado_genera_inscripcion
  AFTER UPDATE ON golf.ctrl_contratos_membresia
  FOR EACH ROW EXECUTE FUNCTION golf.trg_contrato_firmado_genera_inscripcion();

-- 5) Inscripción saldada → activar contrato y generar mensualidades
CREATE OR REPLACE FUNCTION golf.trg_inscripcion_pagada_activa_contrato()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = golf, public AS $$
BEGIN
  IF NEW.tipo = 'INSCRIPCION' AND NEW.id_contrato_fk IS NOT NULL
     AND NEW.status = 'PAGADO' AND COALESCE(NEW.saldo, 0) <= 0
     AND OLD.status IS DISTINCT FROM 'PAGADO' THEN
    PERFORM golf.activar_contrato_membresia(NEW.id_contrato_fk);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_inscripcion_pagada_activa_contrato ON golf.cxc_golf;
CREATE TRIGGER trg_inscripcion_pagada_activa_contrato
  AFTER UPDATE ON golf.cxc_golf
  FOR EACH ROW EXECUTE FUNCTION golf.trg_inscripcion_pagada_activa_contrato();

-- 6) Condonación / descuento en la inscripción de un contrato: solo superadmin y admin
CREATE OR REPLACE FUNCTION golf.trg_inscripcion_contrato_sin_condonacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = golf, public AS $$
DECLARE v_rol TEXT; v_desc NUMERIC;
BEGIN
  IF EXISTS (
    SELECT 1 FROM golf.recibos_golf_det d
    JOIN golf.cxc_golf q ON q.id = d.id_cuota_fk
    WHERE d.id_recibo_fk = NEW.id_recibo_fk AND q.tipo = 'INSCRIPCION' AND q.id_contrato_fk IS NOT NULL
  ) THEN
    SELECT rol INTO v_rol FROM cfg.usuarios WHERE id = auth.uid();
    SELECT COALESCE(descuento, 0) INTO v_desc FROM golf.recibos_golf WHERE id = NEW.id_recibo_fk;
    IF (lower(COALESCE(NEW.forma_nombre, '')) LIKE '%condonac%' OR v_desc > 0)
       AND COALESCE(v_rol, '') NOT IN ('superadmin', 'admin') THEN
      RAISE EXCEPTION 'Solo superadmin o admin pueden condonar o descontar la inscripción de una membresía';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inscripcion_contrato_sin_condonacion ON golf.recibos_golf_pagos;
CREATE TRIGGER trg_inscripcion_contrato_sin_condonacion
  BEFORE INSERT ON golf.recibos_golf_pagos
  FOR EACH ROW EXECUTE FUNCTION golf.trg_inscripcion_contrato_sin_condonacion();

GRANT EXECUTE ON FUNCTION golf.activar_contrato_membresia(INTEGER) TO authenticated;
