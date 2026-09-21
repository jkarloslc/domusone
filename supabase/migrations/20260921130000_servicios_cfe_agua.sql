-- ================================================================
-- Servicios del lote: CFE y Agua Potable
-- Migracion: 20260921130000
-- ================================================================
--
-- La pestaña «Servicios» del expediente del lote consulta estas dos tablas
-- desde el 2026-06 (app/lotes/LoteDetail.tsx → ServiciosTab y
-- app/lotes/expediente/page.tsx), pero NUNCA se creó la migración que las
-- define: no existen en la base.
--
-- El síntoma no era un error sino silencio. El fetch hace
-- `setCfe(r1.data ?? [])` sin mirar `r1.error`, así que la pestaña se ve
-- vacía ("Sin servicios CFE registrados") en vez de avisar, y al guardar el
-- insert falla sin que nadie se entere. Se detectó auditando permisos: las
-- dos tablas respondían PGRST205 con TODAS las llaves, no 42501.
--
-- El esquema se deriva de lo que el código escribe y lee, no se inventa:
--   CFE   → no_servicio, tarifa, medidor, status, notas   (LoteDetail:159)
--   Agua  → no_contrato, tipo_toma, medidor, status, notas (LoteDetail:164)
--
-- Un lote puede tener varios servicios de cada tipo (el botón «Agregar» de la
-- pestaña los apila), por eso no hay UNIQUE sobre id_lote_fk.
--
-- `tarifa` y `tipo_toma` quedan como TEXT libre a propósito. Sus listas viven
-- en el componente (TF y TT) y son valores de CFE / del organismo operador
-- que cambian por fuera; un CHECK obligaría a una migración cada vez que se
-- agregue una tarifa. `status` sí lleva CHECK: sus 3 valores los escribe el
-- propio código y son estado interno.
-- ================================================================

CREATE TABLE IF NOT EXISTS ctrl.servicios_cfe (
  id           SERIAL PRIMARY KEY,
  id_lote_fk   INTEGER NOT NULL REFERENCES cat.lotes(id),
  no_servicio  TEXT,
  tarifa       TEXT,
  medidor      TEXT,
  status       TEXT NOT NULL DEFAULT 'Activo'
                 CHECK (status IN ('Activo', 'Suspendido', 'Inactivo')),
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servicios_cfe_lote ON ctrl.servicios_cfe(id_lote_fk);

CREATE TABLE IF NOT EXISTS ctrl.servicios_agua (
  id           SERIAL PRIMARY KEY,
  id_lote_fk   INTEGER NOT NULL REFERENCES cat.lotes(id),
  no_contrato  TEXT,
  tipo_toma    TEXT,
  medidor      TEXT,
  status       TEXT NOT NULL DEFAULT 'Activo'
                 CHECK (status IN ('Activo', 'Suspendido', 'Inactivo')),
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servicios_agua_lote ON ctrl.servicios_agua(id_lote_fk);

-- La pestaña guarda con UPDATE directo y no toca `updated_at`; sin trigger la
-- columna mentiría (se quedaría en la fecha de alta).
CREATE OR REPLACE FUNCTION ctrl.set_servicios_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_servicios_cfe_updated_at  ON ctrl.servicios_cfe;
CREATE TRIGGER trg_servicios_cfe_updated_at
  BEFORE UPDATE ON ctrl.servicios_cfe
  FOR EACH ROW EXECUTE FUNCTION ctrl.set_servicios_updated_at();

DROP TRIGGER IF EXISTS trg_servicios_agua_updated_at ON ctrl.servicios_agua;
CREATE TRIGGER trg_servicios_agua_updated_at
  BEFORE UPDATE ON ctrl.servicios_agua
  FOR EACH ROW EXECUTE FUNCTION ctrl.set_servicios_updated_at();

-- ── RLS ──
ALTER TABLE ctrl.servicios_cfe  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.servicios_agua ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "servicios_cfe_all"  ON ctrl.servicios_cfe;
DROP POLICY IF EXISTS "servicios_agua_all" ON ctrl.servicios_agua;
CREATE POLICY "servicios_cfe_all"  ON ctrl.servicios_cfe  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "servicios_agua_all" ON ctrl.servicios_agua FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GRANTS explícitos (sin ellos el insert falla en silencio) ──
-- `anon` queda fuera a propósito: esa llave viaja en el bundle del navegador.
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.servicios_cfe  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.servicios_agua TO authenticated;
GRANT SELECT ON ctrl.servicios_cfe  TO service_role;
GRANT SELECT ON ctrl.servicios_agua TO service_role;

GRANT USAGE, SELECT ON SEQUENCE ctrl.servicios_cfe_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.servicios_agua_id_seq TO authenticated;

COMMENT ON TABLE ctrl.servicios_cfe  IS 'Servicios de energía eléctrica (CFE) del lote. Varios por lote. Captura: pestaña Servicios del expediente del lote.';
COMMENT ON TABLE ctrl.servicios_agua IS 'Tomas de agua potable del lote. Varias por lote. Captura: pestaña Servicios del expediente del lote.';

-- ── Verificación ──
DO $$
DECLARE faltan text;
BEGIN
  SELECT string_agg(x.t, ', ')
    INTO faltan
    FROM (VALUES ('servicios_cfe'), ('servicios_agua')) AS x(t)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'ctrl' AND table_name = x.t)
      OR NOT has_table_privilege('authenticated', format('ctrl.%I', x.t), 'INSERT');
  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan tablas o permisos de ctrl: %', faltan;
  END IF;
  RAISE NOTICE 'ctrl.servicios_cfe y ctrl.servicios_agua creadas y con permisos.';
END $$;

-- Las tablas nuevas no aparecen en el cache de PostgREST hasta que se recarga.
NOTIFY pgrst, 'reload schema';
