-- Contacto de referencia en la carta de intercambio (no se imprime)
ALTER TABLE golf.cartas_intercambio ADD COLUMN IF NOT EXISTS contacto TEXT;
