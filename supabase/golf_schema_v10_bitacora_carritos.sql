-- ============================================================
-- Golf Schema v10 — Bitácora de Carritos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS golf.bitacora_carritos (
  id               SERIAL PRIMARY KEY,
  id_carrito_fk    INTEGER NOT NULL REFERENCES golf.cat_carritos(id) ON DELETE CASCADE,
  id_pension_fk    INTEGER REFERENCES golf.ctrl_pensiones(id) ON DELETE SET NULL,
  id_socio_fk      INTEGER REFERENCES golf.cat_socios(id) ON DELETE SET NULL,

  -- Tipo de evento
  tipo_evento      TEXT NOT NULL CHECK (tipo_evento IN (
    'SALIDA_TALLER',
    'REGRESO_TALLER',
    'PRESTAMO_TERCERO',
    'INCIDENCIA'
  )),

  -- Fechas
  fecha_evento     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin        TIMESTAMPTZ,           -- p.ej. regreso de taller o fin de préstamo

  -- Contenido
  descripcion      TEXT NOT NULL,         -- detalle del evento
  taller           TEXT,                  -- nombre del taller (para SALIDA/REGRESO)
  tercero_nombre   TEXT,                  -- nombre del tercero autorizado (PRESTAMO)
  tercero_telefono TEXT,                  -- teléfono del tercero
  costo_estimado   NUMERIC(12,2),         -- estimado para taller
  costo_real       NUMERIC(12,2),         -- costo final al regresar
  nivel_urgencia   TEXT CHECK (nivel_urgencia IN ('BAJA','MEDIA','ALTA')) DEFAULT 'MEDIA',
  resuelto         BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones    TEXT,
  usuario_registra TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_bitacora_carritos_carrito  ON golf.bitacora_carritos(id_carrito_fk);
CREATE INDEX IF NOT EXISTS idx_bitacora_carritos_socio    ON golf.bitacora_carritos(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_bitacora_carritos_tipo     ON golf.bitacora_carritos(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_bitacora_carritos_fecha    ON golf.bitacora_carritos(fecha_evento DESC);

-- 3. RLS
ALTER TABLE golf.bitacora_carritos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bitacora_carritos_select" ON golf.bitacora_carritos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bitacora_carritos_insert" ON golf.bitacora_carritos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "bitacora_carritos_update" ON golf.bitacora_carritos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "bitacora_carritos_delete" ON golf.bitacora_carritos
  FOR DELETE TO authenticated USING (true);

-- 4. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON golf.bitacora_carritos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.bitacora_carritos_id_seq TO authenticated;
