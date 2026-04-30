-- ══════════════════════════════════════════════════════════════
-- Migración: Secuencias atómicas para generación de folios
-- Elimina race condition del patrón COUNT+1 en cliente
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Crear secuencias (una por prefijo)
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_op;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_oc;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_req;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_trf;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_rfq;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_rec;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_val;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_art;

-- 2. Inicializar desde el conteo actual de cada tabla
--    (setval con is_called=true → próximo nextval() devuelve count+1)
SELECT setval('comp.seq_folio_op',  GREATEST(1, (SELECT COUNT(*) FROM comp.ordenes_pago)));
SELECT setval('comp.seq_folio_oc',  GREATEST(1, (SELECT COUNT(*) FROM comp.ordenes_compra)));
SELECT setval('comp.seq_folio_req', GREATEST(1, (SELECT COUNT(*) FROM comp.requisiciones)));
SELECT setval('comp.seq_folio_trf', GREATEST(1, (SELECT COUNT(*) FROM comp.transferencias)));
SELECT setval('comp.seq_folio_rfq', GREATEST(1, (SELECT COUNT(*) FROM comp.cotizaciones)));
SELECT setval('comp.seq_folio_rec', GREATEST(1, (SELECT COUNT(*) FROM comp.recepciones)));
-- VAL inicia en 1 (no hay tabla de conteo directa)
-- SELECT setval('comp.seq_folio_val', GREATEST(1, (SELECT COUNT(*) FROM equipo.vales_combustible)));
SELECT setval('comp.seq_folio_art', GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(clave,'-',2) AS INTEGER)) FROM comp.articulos WHERE clave ~ '^ART-[0-9]+$'), 1)));

-- 3. Función RPC que devuelve el siguiente folio de forma atómica
CREATE OR REPLACE FUNCTION comp.fn_next_folio(prefijo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  num  BIGINT;
  anio TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
BEGIN
  CASE prefijo
    WHEN 'OP'  THEN num := nextval('comp.seq_folio_op');
    WHEN 'OC'  THEN num := nextval('comp.seq_folio_oc');
    WHEN 'REQ' THEN num := nextval('comp.seq_folio_req');
    WHEN 'TRF' THEN num := nextval('comp.seq_folio_trf');
    WHEN 'RFQ' THEN num := nextval('comp.seq_folio_rfq');
    WHEN 'REC' THEN num := nextval('comp.seq_folio_rec');
    WHEN 'VAL' THEN num := nextval('comp.seq_folio_val');
    WHEN 'ART' THEN
      num := nextval('comp.seq_folio_art');
      RETURN prefijo || '-' || LPAD(num::TEXT, 4, '0');
    ELSE RAISE EXCEPTION 'Prefijo desconocido: %', prefijo;
  END CASE;
  RETURN prefijo || '-' || anio || '-' || LPAD(num::TEXT, 4, '0');
END;
$$;

-- 4. Permisos para usuarios autenticados
GRANT EXECUTE ON FUNCTION comp.fn_next_folio(TEXT) TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_op  TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_oc  TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_req TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_trf TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_rfq TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_rec TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_val TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_art TO authenticated;
