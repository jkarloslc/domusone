-- ================================================================
-- Lectura completa para service_role (auditoría y trabajo de datos)
-- Migracion: 20260921120000
-- ================================================================
--
-- PROBLEMA
-- Las migraciones de este proyecto otorgan permisos tabla por tabla y casi
-- siempre solo a `authenticated` (el rol de la app en el navegador). El
-- resultado es que `service_role` — la llave de servidor — no puede leer:
--
--   · schemas completos negados: cat, comp, hip
--   · 63 tablas sueltas en ctrl, cfg y golf
--
-- Eso vuelve inauditable buena parte del sistema desde fuera de la app. Se
-- topó de frente al revisar el devengado sin dimension ($1.7M de Hipico y
-- Locales) y los cobros sin fecha de pago: hip.cxc_hip y ctrl.loc_cxc solo
-- se podian consultar entrando al SQL Editor a mano.
--
-- Algunas tablas ni siquiera aparecen en el cache de PostgREST (devuelven
-- PGRST205 "Could not find the table" en vez de 42501): cuando un rol no
-- tiene NINGUN privilegio sobre la tabla, PostgREST la omite del cache. Por
-- eso al final va un NOTIFY para recargarlo.
--
-- POR QUE service_role Y NO anon
-- `anon` usa la llave NEXT_PUBLIC_SUPABASE_ANON_KEY, que viaja en el bundle
-- del navegador: es publica por diseño y cualquiera puede extraerla. Darle
-- lectura a estas tablas publicaria cartera, nomina (rol_pagos_*,
-- colaboradores), proveedores y datos fiscales de socios a internet.
-- `service_role` vive solo en el servidor (.env.local / variables de Vercel).
--
-- Se otorga SELECT y nada mas. service_role ya hace BYPASSRLS, asi que con
-- el GRANT basta para leer; para escribir hay que ampliarlo a proposito.
--
-- EFECTO EN LA APP: ninguno. La app se conecta con la llave anon + el JWT de
-- `authenticated`, y esos permisos no se tocan.
-- ================================================================

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['ctrl', 'cat', 'cfg', 'comp', 'golf', 'hip'] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', s);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO service_role', s);
    -- Sin esto, cada tabla nueva vuelve a nacer invisible para service_role.
    -- Es el mismo tropiezo que ya se pago varias veces con `authenticated`
    -- (inserts que fallaban en silencio por falta de GRANT).
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON TABLES TO service_role', s);
  END LOOP;
END $$;

-- ── Verificación: ninguna tabla debe quedar sin SELECT para service_role ──
DO $$
DECLARE faltan text;
BEGIN
  SELECT string_agg(t.table_schema || '.' || t.table_name, ', ' ORDER BY 1)
    INTO faltan
    FROM information_schema.tables t
   WHERE t.table_schema IN ('ctrl', 'cat', 'cfg', 'comp', 'golf', 'hip')
     AND t.table_type IN ('BASE TABLE', 'VIEW')
     AND NOT has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'SELECT');

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'service_role sigue sin SELECT en: %', faltan;
  END IF;
  RAISE NOTICE 'service_role tiene SELECT en los 6 schemas.';
END $$;

-- PostgREST omite del cache las tablas sobre las que el rol no tenia ningun
-- privilegio; sin recargarlo siguen respondiendo PGRST205 pese al GRANT.
NOTIFY pgrst, 'reload schema';
