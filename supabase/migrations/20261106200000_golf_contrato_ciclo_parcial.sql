-- ============================================================
-- Golf: ciclos parciales (alta/renovación con el año avanzado).
-- La inscripción se prorratea en la app (meses restantes/12) y el contrato guarda
-- fecha_inicio = primer día del mes de inicio. Aquí, la activación respeta ese mes:
-- las mensualidades nunca arrancan antes del mes de inicio del contrato.
-- 2026-11-06
-- ============================================================
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
  -- ciclo parcial: no antes del mes de inicio del contrato
  IF c.fecha_inicio IS NOT NULL AND date_trunc('month', c.fecha_inicio)::date > v_inicio THEN
    v_inicio := date_trunc('month', c.fecha_inicio)::date;
  END IF;

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

  UPDATE golf.ctrl_contratos_membresia SET vigente = false WHERE id_socio_fk = c.id_socio_fk AND id <> c.id AND vigente;
  UPDATE golf.ctrl_contratos_membresia
     SET estado = 'ACTIVO', vigente = true, fecha_fin = COALESCE(fecha_fin, make_date(c.anio, 12, 31))
   WHERE id = c.id;
END $$;

GRANT EXECUTE ON FUNCTION golf.activar_contrato_membresia(INTEGER) TO authenticated;
