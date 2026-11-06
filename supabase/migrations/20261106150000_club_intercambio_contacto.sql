-- El contacto es del club (referencia), no de la carta: se mueve de cartas_intercambio a cat_clubes_intercambio
ALTER TABLE golf.cat_clubes_intercambio ADD COLUMN IF NOT EXISTS contacto TEXT;
ALTER TABLE golf.cartas_intercambio DROP COLUMN IF EXISTS contacto;
