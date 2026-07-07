-- ─────────────────────────────────────────────────────────────────
-- Cambio de última hora: el folio de factura ya NO es un contador
-- global compartido entre series — ahora cada Serie (centro de venta)
-- lleva su propio consecutivo independiente.
-- Reemplaza lo creado en 20260707130000_folio_factura_por_centro.sql.
-- ─────────────────────────────────────────────────────────────────

-- 1) Quitar el contador global anterior
DROP FUNCTION IF EXISTS golf.next_folio_factura();
DROP FUNCTION IF EXISTS golf.peek_folio_factura();
DROP FUNCTION IF EXISTS golf.set_folio_factura_inicial(bigint);
DROP SEQUENCE IF EXISTS golf.seq_folio_factura;

-- 2) Contador por serie
CREATE TABLE IF NOT EXISTS golf.folio_factura_series (
  serie        TEXT PRIMARY KEY,
  ultimo_folio BIGINT NOT NULL DEFAULT 0
);

-- Siguiente folio de una serie (consume/incrementa el contador de esa serie)
CREATE OR REPLACE FUNCTION golf.next_folio_factura(p_serie TEXT)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO golf.folio_factura_series (serie, ultimo_folio)
  VALUES (p_serie, 1)
  ON CONFLICT (serie) DO UPDATE SET ultimo_folio = golf.folio_factura_series.ultimo_folio + 1
  RETURNING ultimo_folio;
$$;

-- Folio que se asignaría a continuación para esa serie, SIN consumirlo
CREATE OR REPLACE FUNCTION golf.peek_folio_factura(p_serie TEXT)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((SELECT ultimo_folio FROM golf.folio_factura_series WHERE serie = p_serie), 0) + 1;
$$;

-- Configurar folio inicial de una serie específica
CREATE OR REPLACE FUNCTION golf.set_folio_factura_inicial(p_serie TEXT, nuevo_inicio bigint)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO golf.folio_factura_series (serie, ultimo_folio)
  VALUES (p_serie, nuevo_inicio - 1)
  ON CONFLICT (serie) DO UPDATE SET ultimo_folio = nuevo_inicio - 1;
$$;

-- 3) Grants
GRANT SELECT, INSERT, UPDATE ON golf.folio_factura_series TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION golf.next_folio_factura(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION golf.peek_folio_factura(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION golf.set_folio_factura_inicial(text, bigint) TO authenticated, anon, service_role;
