-- Kardex de Combustible — independiente del inventario de almacén
CREATE TABLE IF NOT EXISTS comp.combustible_movimientos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_combustible  text    NOT NULL CHECK (tipo_combustible IN ('magna','premium','diesel')),
  tipo_mov          text    NOT NULL CHECK (tipo_mov IN ('CARGA','CONSUMO','AJUSTE')),
  fecha             date    NOT NULL DEFAULT CURRENT_DATE,
  litros            numeric(12,3) NOT NULL,  -- positivo para CARGA; positivo=ingresa/negativo=retira para AJUSTE; positivo para CONSUMO
  precio_litro      numeric(10,4),
  monto_total       numeric(12,2),
  centro_costo      text,
  area              text,
  frente            text,
  vehiculo_equipo   text,
  referencia        text,
  observaciones     text,
  created_at        timestamptz DEFAULT now(),
  created_by        text
);

CREATE INDEX IF NOT EXISTS idx_comb_mov_tipo ON comp.combustible_movimientos(tipo_combustible, fecha);
