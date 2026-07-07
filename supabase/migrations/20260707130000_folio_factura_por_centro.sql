-- ─────────────────────────────────────────────────────────────────
-- Folio de factura propio para golf/pos, independiente del folio del
-- ticket (folio_dia) y del folio_fiscal (UUID del SAT):
--   - Serie: fija por centro de venta (ej. 'GOLF', 'HIPICO').
--   - Folio: un contador consecutivo GLOBAL (compartido entre todas
--     las series) — no se reinicia por centro.
-- ─────────────────────────────────────────────────────────────────

-- 1) Serie configurable por centro de venta
ALTER TABLE golf.cat_centros_venta
  ADD COLUMN IF NOT EXISTS serie_factura TEXT;

-- 2) Contador global consecutivo
CREATE SEQUENCE IF NOT EXISTS golf.seq_folio_factura START 1;

-- Siguiente folio (consume la secuencia)
CREATE OR REPLACE FUNCTION golf.next_folio_factura()
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT nextval('golf.seq_folio_factura');
$$;

-- Folio que se asignaría a continuación, SIN consumirlo (para mostrar
-- en la UI de configuración)
CREATE OR REPLACE FUNCTION golf.peek_folio_factura()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END
  FROM golf.seq_folio_factura;
$$;

-- Configurar folio inicial: el próximo next_folio_factura() devolverá
-- exactamente nuevo_inicio (no reinicia por serie, es el contador global)
CREATE OR REPLACE FUNCTION golf.set_folio_factura_inicial(nuevo_inicio bigint)
RETURNS void
LANGUAGE sql
AS $$
  SELECT setval('golf.seq_folio_factura', nuevo_inicio - 1, false);
$$;

-- 3) Folio de factura (serie + número) ya asignado, para mostrarlo en
--    el grid de Facturas — independiente de folio_fiscal (UUID SAT)
ALTER TABLE golf.ctrl_ventas_cfdi
  ADD COLUMN IF NOT EXISTS folio_factura TEXT;

-- 4) Grants — mismo patrón que el resto de funciones/tablas de golf.*
GRANT USAGE, SELECT ON SEQUENCE golf.seq_folio_factura TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.seq_folio_factura TO anon;
GRANT USAGE, SELECT ON SEQUENCE golf.seq_folio_factura TO service_role;

GRANT EXECUTE ON FUNCTION golf.next_folio_factura() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION golf.peek_folio_factura() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION golf.set_folio_factura_inicial(bigint) TO authenticated, anon, service_role;
