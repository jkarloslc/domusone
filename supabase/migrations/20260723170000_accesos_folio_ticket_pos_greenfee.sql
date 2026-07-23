-- Salidas al Campo con acompañantes Green Fee: exigir folio del ticket de venta
-- emitido en el POS de Golf antes de registrar la salida (control de cobro).
ALTER TABLE golf.ctrl_accesos ADD COLUMN IF NOT EXISTS folio_ticket_pos TEXT;
