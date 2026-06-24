-- Actualiza el nombre del club en la configuración del POS
UPDATE golf.cfg_pos
SET razon_social = 'Balvanera Golf, Polo & Country Club'
WHERE razon_social IN ('Club de Golf Balvanera', 'Club de Golf');
