-- ============================================================
-- CFG SCHEMA — GRANTs consolidados para anon + authenticated
-- Ejecutar completo en Supabase → SQL Editor
-- ============================================================

-- 1. Acceso al schema
GRANT USAGE ON SCHEMA cfg TO anon;
GRANT USAGE ON SCHEMA cfg TO authenticated;

-- 2. Tablas — ALL para ambos roles (tolerante: omite tablas inexistentes)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'areas','centros_costo','centros_ingreso','clasificacion',
    'configuracion','cuentas_bancarias','cuotas_estandar','equipos',
    'formas_pago','frentes','frentes_ingreso','marcas_vehiculos',
    'origenes_incidencia','secciones','tipos_incidencia','tipos_lote','usuarios'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('GRANT ALL ON cfg.%I TO anon, authenticated', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table cfg.% not found — skipped', t;
    END;
  END LOOP;
END $$;

-- 3. Secuencias (para INSERT con SERIAL / BIGSERIAL)
--    Ejecutar solo las que existan en tu instancia.
--    Si alguna falla con "does not exist", simplemente omítela.
DO $$
DECLARE
  seq TEXT;
  seqs TEXT[] := ARRAY[
    'areas_id_seq',
    'centros_costo_id_seq',
    'centros_ingreso_id_seq',
    'clasificacion_id_seq',
    'configuracion_id_seq',
    'cuentas_bancarias_id_seq',
    'cuotas_estandar_id_seq',
    'equipos_id_seq',
    'formas_pago_id_seq',
    'frentes_id_seq',
    'frentes_ingreso_id_seq',
    'marcas_vehiculos_id_seq',
    'origenes_incidencia_id_seq',
    'secciones_id_seq',
    'tipos_incidencia_id_seq',
    'tipos_lote_id_seq',
    'usuarios_id_seq'
  ];
BEGIN
  FOREACH seq IN ARRAY seqs LOOP
    BEGIN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE cfg.%I TO anon, authenticated', seq);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'Sequence cfg.% not found — skipped', seq;
    END;
  END LOOP;
END $$;

-- 4. RLS — política permisiva para todas las tablas cfg
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'areas','centros_costo','centros_ingreso','clasificacion',
    'configuracion','cuentas_bancarias','cuotas_estandar','equipos',
    'formas_pago','frentes','frentes_ingreso','marcas_vehiculos',
    'origenes_incidencia','secciones','tipos_incidencia','tipos_lote','usuarios'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE cfg.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON cfg.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS "auth_all" ON cfg.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS "anon_all" ON cfg.%I', t);
      EXECUTE format(
        'CREATE POLICY "allow_all" ON cfg.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        t
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table cfg.% not found — skipped', t;
    END;
  END LOOP;
END $$;
