-- Kardex de Combustible — control de resguardo (stock físico en tanque)
-- Independiente del inventario de almacén
CREATE TABLE IF NOT EXISTS comp.combustible_movimientos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_combustible text    NOT NULL CHECK (tipo_combustible IN ('magna','premium','diesel')),
  tipo_mov         text    NOT NULL CHECK (tipo_mov IN ('ENTRADA','SALIDA','AJUSTE')),
  fecha            date    NOT NULL DEFAULT CURRENT_DATE,
  litros           numeric(12,3) NOT NULL,
  precio_litro     numeric(10,4),
  monto_total      numeric(12,2),
  referencia       text,
  observaciones    text,
  created_at       timestamptz DEFAULT now(),
  created_by       text
);

CREATE INDEX IF NOT EXISTS idx_comb_mov_tipo ON comp.combustible_movimientos(tipo_combustible, fecha);
