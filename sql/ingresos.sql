-- ============================================================
-- MÓDULO INGRESOS — DomusOne
-- Ejecutar en orden en el Supabase SQL Editor
-- Fecha: 2026-04-15
-- ============================================================

-- ── 1. CATÁLOGO DE CENTROS DE INGRESO (schema: cfg) ─────────
CREATE TABLE IF NOT EXISTS cfg.centros_ingreso (
  id              serial PRIMARY KEY,
  nombre          text NOT NULL,
  codigo          text,                        -- GOLF, CUO, ESP, CAB
  tipo            text,                        -- golf | cuotas | rentas_espacios | caballerizas | otro
  tipo_desglose   text DEFAULT 'unico',        -- unico | secciones
  activo          boolean DEFAULT true,
  notas           text,
  created_at      timestamptz DEFAULT now()
);

-- Datos iniciales
INSERT INTO cfg.centros_ingreso (nombre, codigo, tipo, tipo_desglose) VALUES
  ('Golf',               'GOLF', 'golf',             'unico'),
  ('Cuotas Residencial', 'CUO',  'cuotas',           'secciones'),
  ('Renta de Espacios',  'ESP',  'rentas_espacios',  'unico'),
  ('Caballerizas',       'CAB',  'caballerizas',     'unico')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE cfg.centros_ingreso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centros_ingreso_all" ON cfg.centros_ingreso FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 2. RECIBOS DE INGRESO (schema: ctrl) ────────────────────
CREATE TABLE IF NOT EXISTS ctrl.recibos_ingreso (
  id                  serial PRIMARY KEY,
  folio               text UNIQUE,                  -- ING-2026-0001
  fecha               date NOT NULL DEFAULT current_date,
  id_centro_ingreso_fk int REFERENCES cfg.centros_ingreso(id),
  descripcion         text,
  monto_efectivo      numeric(14,2) DEFAULT 0,
  monto_transferencia numeric(14,2) DEFAULT 0,
  monto_tarjeta       numeric(14,2) DEFAULT 0,
  monto_cheque        numeric(14,2) DEFAULT 0,
  monto_total         numeric(14,2) DEFAULT 0,      -- se calcula al guardar
  status              text DEFAULT 'Confirmado',    -- Borrador | Confirmado | Cancelado
  origen              text DEFAULT 'manual',        -- manual | cobranza | externo
  referencia_externa  text,
  notas               text,
  usuario_crea        text,
  usuario_cancela     text,
  fecha_cancela       timestamptz,
  motivo_cancelacion  text,
  created_at          timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE ctrl.recibos_ingreso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recibos_ingreso_all" ON ctrl.recibos_ingreso FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 3. DESGLOSE POR SECCIÓN (schema: ctrl) ──────────────────
--    Aplica cuando el centro tiene tipo_desglose = 'secciones'
--    (Cuotas Residencial → monto por sección)
CREATE TABLE IF NOT EXISTS ctrl.recibos_ingreso_secciones (
  id              serial PRIMARY KEY,
  id_recibo_fk    int NOT NULL REFERENCES ctrl.recibos_ingreso(id) ON DELETE CASCADE,
  id_seccion_fk   int REFERENCES cfg.secciones(id),
  nombre_seccion  text,                             -- desnormalizado para historial
  monto           numeric(14,2) DEFAULT 0,
  notas           text
);

-- RLS
ALTER TABLE ctrl.recibos_ingreso_secciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recibos_ingreso_secciones_all" ON ctrl.recibos_ingreso_secciones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 4. SECUENCIA DE FOLIOS INGRESOS ─────────────────────────
--    Los folios ING se generan en el cliente usando el id del registro
--    (patrón: ING-2026-0001). No requiere secuencia separada.
--
--    OPCIONAL — si quieres folio atómico server-side igual que compras:
--
--    CREATE SEQUENCE IF NOT EXISTS ctrl.seq_folio_ing;
--    SELECT setval('ctrl.seq_folio_ing', GREATEST(1, (SELECT COUNT(*) FROM ctrl.recibos_ingreso)));
--    GRANT USAGE ON SEQUENCE ctrl.seq_folio_ing TO authenticated, anon;
--
--    Y agregar en comp.fn_next_folio:
--      WHEN 'ING' THEN num := nextval('ctrl.seq_folio_ing');
--    (Por ahora el folio client-side es suficiente y no tiene race condition
--     porque usa el PK serial que ya es único y atómico.)

-- ── 5. TIPOS DE GASTO para Nómina e Impuestos ───────────────
--    Si existe una tabla de catálogo para tipos_gasto en comp,
--    ejecutar esto. Si no, el frontend ya tiene el array hardcoded
--    y se actualizará directamente en el código.
--
--    Los tipos a agregar en el frontend (ordenes-pago/page.tsx):
--    'Nómina Semanal', 'Nómina Quincenal', 'ISR', 'IMSS', 'IVA', 'IEPS', '3% SN'

-- ── 6. CATÁLOGO DE FRENTES DE INGRESO (schema: cfg) ─────────
--    Aplica a centros con tipo_desglose = 'frentes'
--    (Golf, Renta de Espacios, Caballerizas → frentes específicos)
CREATE TABLE IF NOT EXISTS cfg.frentes_ingreso (
  id                    serial PRIMARY KEY,
  nombre                text NOT NULL,
  codigo                text,
  id_centro_ingreso_fk  int REFERENCES cfg.centros_ingreso(id),
  activo                boolean DEFAULT true,
  notas                 text,
  created_at            timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE cfg.frentes_ingreso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frentes_ingreso_all" ON cfg.frentes_ingreso FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 7. DESGLOSE POR FRENTE (schema: ctrl) ───────────────────
--    Aplica cuando el centro tiene tipo_desglose = 'frentes'
CREATE TABLE IF NOT EXISTS ctrl.recibos_ingreso_frentes (
  id              serial PRIMARY KEY,
  id_recibo_fk    int NOT NULL REFERENCES ctrl.recibos_ingreso(id) ON DELETE CASCADE,
  id_frente_fk    int REFERENCES cfg.frentes_ingreso(id),
  nombre_frente   text,                             -- desnormalizado para historial
  monto           numeric(14,2) DEFAULT 0,
  notas           text
);

-- RLS
ALTER TABLE ctrl.recibos_ingreso_frentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recibos_ingreso_frentes_all" ON ctrl.recibos_ingreso_frentes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── FIN ──────────────────────────────────────────────────────
-- Verificación:
-- SELECT * FROM cfg.centros_ingreso;
-- SELECT * FROM cfg.frentes_ingreso;
-- SELECT table_name FROM information_schema.tables WHERE table_schema IN ('ctrl','cfg') ORDER BY 1;
