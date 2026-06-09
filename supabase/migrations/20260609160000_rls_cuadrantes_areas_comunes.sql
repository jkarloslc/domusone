-- RLS para cfg.cuadrantes y cfg.areas_comunes
-- Mismo patrón que 20260527200000_rls_tablas_sin_proteger.sql

DO $$
DECLARE
  schemas_tablas TEXT[][] := ARRAY[
    ARRAY['cfg', 'cuadrantes'],
    ARRAY['cfg', 'areas_comunes']
  ];
  par TEXT[];
BEGIN
  FOREACH par SLICE 1 IN ARRAY schemas_tablas LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', par[1], par[2]);

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (true)',
      par[2] || '_select_auth', par[1], par[2]
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR INSERT TO authenticated WITH CHECK (true)',
      par[2] || '_insert_auth', par[1], par[2]
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      par[2] || '_update_auth', par[1], par[2]
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR DELETE TO authenticated USING (true)',
      par[2] || '_delete_auth', par[1], par[2]
    );
  END LOOP;
END $$;
