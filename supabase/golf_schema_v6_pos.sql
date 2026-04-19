-- ============================================================
-- GOLF SCHEMA v6 — POS Ventas
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Centros de venta
CREATE TABLE IF NOT EXISTS golf.cat_centros_venta (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Centros iniciales
INSERT INTO golf.cat_centros_venta (nombre, descripcion, orden) VALUES
  ('Green Fees',    'Cobro de rondas de golf',         1),
  ('Carritos',      'Renta y servicio de carritos',     2),
  ('Tienda Proshop','Venta de productos y equipos',     3)
ON CONFLICT DO NOTHING;

-- 2. Catálogo de productos/servicios del POS
CREATE TABLE IF NOT EXISTS golf.cat_productos_pos (
  id              SERIAL PRIMARY KEY,
  id_centro_fk    INTEGER REFERENCES golf.cat_centros_venta(id),
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  sku             TEXT,
  precio          NUMERIC(10,2) NOT NULL DEFAULT 0,
  costo           NUMERIC(10,2) NOT NULL DEFAULT 0,
  iva_pct         NUMERIC(5,2)  NOT NULL DEFAULT 16,    -- % de IVA (0 o 16)
  aplica_iva      BOOLEAN NOT NULL DEFAULT true,
  tipo            TEXT NOT NULL DEFAULT 'SERVICIO',      -- PRODUCTO | SERVICIO
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- tipo PRODUCTO = inventariable (descuenta stock en el futuro)
-- tipo SERVICIO = no inventariable (greenfee, renta carrito, etc.)

-- 3. Formas de pago
CREATE TABLE IF NOT EXISTS golf.cat_formas_pago_pos (
  id      SERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL,
  activo  BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO golf.cat_formas_pago_pos (nombre) VALUES
  ('Efectivo'), ('Tarjeta'), ('Transferencia'), ('Cargo a Cuenta'), ('Cortesía')
ON CONFLICT DO NOTHING;

-- 4. Ventas (cabecera)
CREATE TABLE IF NOT EXISTS golf.ctrl_ventas (
  id                SERIAL PRIMARY KEY,
  folio_dia         INTEGER NOT NULL DEFAULT 1,        -- reinicia cada día por centro
  id_centro_fk      INTEGER REFERENCES golf.cat_centros_venta(id),
  fecha             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cliente
  id_socio_fk       INTEGER REFERENCES golf.cat_socios(id),
  nombre_cliente    TEXT,                               -- Capturado al vender
  es_socio          BOOLEAN NOT NULL DEFAULT true,
  -- Totales
  subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
  descuento         NUMERIC(10,2) NOT NULL DEFAULT 0,
  iva               NUMERIC(10,2) NOT NULL DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Estado
  status            TEXT NOT NULL DEFAULT 'PAGADA',     -- PAGADA | CANCELADA
  motivo_cancelacion TEXT,
  -- Corte
  id_corte_fk       INTEGER,                            -- FK a ctrl_cortes_caja (se llena al cortar)
  -- Facturación
  facturada         BOOLEAN NOT NULL DEFAULT false,
  -- Auditoría
  usuario_crea      TEXT,
  num_impresiones   INTEGER NOT NULL DEFAULT 0,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Detalle de ventas
CREATE TABLE IF NOT EXISTS golf.ctrl_ventas_det (
  id              SERIAL PRIMARY KEY,
  id_venta_fk     INTEGER NOT NULL REFERENCES golf.ctrl_ventas(id) ON DELETE CASCADE,
  id_producto_fk  INTEGER REFERENCES golf.cat_productos_pos(id),
  concepto        TEXT NOT NULL,                        -- Nombre capturado al momento
  cantidad        NUMERIC(10,3) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(10,2) NOT NULL DEFAULT 0,
  iva_pct         NUMERIC(5,2)  NOT NULL DEFAULT 16,
  iva             NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  notas           TEXT
);

-- 6. Pagos de la venta (puede haber 2 formas)
CREATE TABLE IF NOT EXISTS golf.ctrl_ventas_pagos (
  id              SERIAL PRIMARY KEY,
  id_venta_fk     INTEGER NOT NULL REFERENCES golf.ctrl_ventas(id) ON DELETE CASCADE,
  id_forma_fk     INTEGER REFERENCES golf.cat_formas_pago_pos(id),
  forma_nombre    TEXT NOT NULL,
  monto           NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 7. Cortes de caja
CREATE TABLE IF NOT EXISTS golf.ctrl_cortes_caja (
  id              SERIAL PRIMARY KEY,
  id_centro_fk    INTEGER REFERENCES golf.cat_centros_venta(id),
  centro_nombre   TEXT,
  fecha_inicio    TIMESTAMPTZ NOT NULL,
  fecha_fin       TIMESTAMPTZ NOT NULL,
  fecha_corte     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Totales
  num_ventas      INTEGER NOT NULL DEFAULT 0,
  num_canceladas  INTEGER NOT NULL DEFAULT 0,
  total_ventas    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cancelado NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_neto      NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Integración con Ingresos
  id_recibo_ingreso INTEGER,                           -- FK a ctrl schema recibos_ingreso
  -- Auditoría
  usuario         TEXT,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Desglose de formas de pago por corte
CREATE TABLE IF NOT EXISTS golf.ctrl_cortes_caja_det (
  id            SERIAL PRIMARY KEY,
  id_corte_fk   INTEGER NOT NULL REFERENCES golf.ctrl_cortes_caja(id) ON DELETE CASCADE,
  id_forma_fk   INTEGER REFERENCES golf.cat_formas_pago_pos(id),
  forma_nombre  TEXT NOT NULL,
  monto         NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 9. Config POS por centro (datos fiscales para ticket)
CREATE TABLE IF NOT EXISTS golf.cfg_pos (
  id              SERIAL PRIMARY KEY,
  razon_social    TEXT NOT NULL DEFAULT 'Club de Golf',
  rfc             TEXT,
  direccion       TEXT,
  telefono        TEXT,
  municipio       TEXT,
  leyenda_ticket  TEXT NOT NULL DEFAULT '¡Gracias por su visita!',
  updated_at      TIMESTAMPTZ
);
INSERT INTO golf.cfg_pos (razon_social, leyenda_ticket)
  VALUES ('Club de Golf Balvanera', '¡Gracias por su visita! Conserve su comprobante.')
ON CONFLICT DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE golf.cat_centros_venta    ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.cat_productos_pos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.cat_formas_pago_pos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.ctrl_ventas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.ctrl_ventas_det      ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.ctrl_ventas_pagos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.ctrl_cortes_caja     ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.ctrl_cortes_caja_det ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.cfg_pos              ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON golf.cat_centros_venta    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.cat_productos_pos    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.cat_formas_pago_pos  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.ctrl_ventas          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.ctrl_ventas_det      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.ctrl_ventas_pagos    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.ctrl_cortes_caja     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.ctrl_cortes_caja_det FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON golf.cfg_pos              FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GRANTs ─────────────────────────────────────────────────────
GRANT ALL ON golf.cat_centros_venta    TO authenticated;
GRANT ALL ON golf.cat_productos_pos    TO authenticated;
GRANT ALL ON golf.cat_formas_pago_pos  TO authenticated;
GRANT ALL ON golf.ctrl_ventas          TO authenticated;
GRANT ALL ON golf.ctrl_ventas_det      TO authenticated;
GRANT ALL ON golf.ctrl_ventas_pagos    TO authenticated;
GRANT ALL ON golf.ctrl_cortes_caja     TO authenticated;
GRANT ALL ON golf.ctrl_cortes_caja_det TO authenticated;
GRANT ALL ON golf.cfg_pos              TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE golf.cat_centros_venta_id_seq    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_productos_pos_id_seq    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_formas_pago_pos_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_id_seq          TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_det_id_seq      TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_pagos_id_seq    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_cortes_caja_id_seq     TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_cortes_caja_det_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cfg_pos_id_seq              TO authenticated;
