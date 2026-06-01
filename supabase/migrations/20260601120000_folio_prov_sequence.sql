-- Agrega secuencia y soporte para folio PROV (Proveedores)
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_prov;

SELECT setval('comp.seq_folio_prov', GREATEST(1, (SELECT COUNT(*) FROM comp.proveedores)));

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
    WHEN 'OP'   THEN num := nextval('comp.seq_folio_op');
    WHEN 'OC'   THEN num := nextval('comp.seq_folio_oc');
    WHEN 'REQ'  THEN num := nextval('comp.seq_folio_req');
    WHEN 'TRF'  THEN num := nextval('comp.seq_folio_trf');
    WHEN 'RFQ'  THEN num := nextval('comp.seq_folio_rfq');
    WHEN 'REC'  THEN num := nextval('comp.seq_folio_rec');
    WHEN 'VAL'  THEN num := nextval('comp.seq_folio_val');
    WHEN 'PROV' THEN num := nextval('comp.seq_folio_prov');
    WHEN 'ART'  THEN
      num := nextval('comp.seq_folio_art');
      RETURN prefijo || '-' || LPAD(num::TEXT, 4, '0');
    ELSE RAISE EXCEPTION 'Prefijo desconocido: %', prefijo;
  END CASE;
  RETURN prefijo || '-' || anio || '-' || LPAD(num::TEXT, 4, '0');
END;
$$;

GRANT USAGE ON SEQUENCE comp.seq_folio_prov TO authenticated;
