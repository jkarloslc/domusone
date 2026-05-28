-- Habilita RLS en tablas expuestas al Data API sin protección
-- Policy: acceso total para authenticated (sin cambio funcional para la app)
-- anon queda bloqueado en todas estas tablas

DO $$
DECLARE
  schemas_tablas TEXT[][] := ARRAY[
    -- cat schema
    ARRAY['cat', 'contactos_propietarios'],
    ARRAY['cat', 'propietarios_datos_fiscales'],
    -- cfg schema
    ARRAY['cfg', 'tipos_cuotas'],
    -- ctrl schema
    ARRAY['ctrl', 'accesos_vehiculos'],
    ARRAY['ctrl', 'acciones_en_curso'],
    ARRAY['ctrl', 'afectaciones_proyectos'],
    ARRAY['ctrl', 'bitacora_cobranza'],
    ARRAY['ctrl', 'bitacora_helipuerto'],
    ARRAY['ctrl', 'contratos'],
    ARRAY['ctrl', 'escrituras'],
    ARRAY['ctrl', 'expedientes_digitales'],
    ARRAY['ctrl', 'historico_cobranza'],
    ARRAY['ctrl', 'historico_status'],
    ARRAY['ctrl', 'incidencias'],
    ARRAY['ctrl', 'litigios'],
    ARRAY['ctrl', 'membresias'],
    ARRAY['ctrl', 'ordenes_trabajo'],
    ARRAY['ctrl', 'ot_evidencias'],
    ARRAY['ctrl', 'ot_recursos'],
    ARRAY['ctrl', 'pagos_lote'],
    ARRAY['ctrl', 'pagos_membresia'],
    ARRAY['ctrl', 'pagos_proyecto'],
    ARRAY['ctrl', 'parte_novedades'],
    ARRAY['ctrl', 'parte_novedades_detalle'],
    ARRAY['ctrl', 'ppto_partidas'],
    ARRAY['ctrl', 'ppto_presupuesto_det'],
    ARRAY['ctrl', 'ppto_presupuesto_real_manual'],
    ARRAY['ctrl', 'ppto_presupuestos'],
    ARRAY['ctrl', 'programa_tareas'],
    ARRAY['ctrl', 'programas_mantenimiento'],
    ARRAY['ctrl', 'propietarios_anteriores'],
    ARRAY['ctrl', 'proveedores_servicios_lotes'],
    ARRAY['ctrl', 'proyectos'],
    ARRAY['ctrl', 'servicio_agua'],
    ARRAY['ctrl', 'servicio_cfe'],
    ARRAY['ctrl', 'solicitudes_compra_venta']
  ];
  s TEXT;
  t TEXT;
BEGIN
  FOREACH s, t SLICE 1 IN ARRAY schemas_tablas LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t);

    -- SELECT
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_auth', s, t
    );
    -- INSERT
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t || '_insert_auth', s, t
    );
    -- UPDATE
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t || '_update_auth', s, t
    );
    -- DELETE
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR DELETE TO authenticated USING (true)',
      t || '_delete_auth', s, t
    );
  END LOOP;
END $$;
