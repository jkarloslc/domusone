-- Carta de intercambio: permite que solo vaya(n) el/los familiar(es) sin el socio titular
ALTER TABLE golf.cartas_intercambio
  ADD COLUMN IF NOT EXISTS titular_asiste BOOLEAN NOT NULL DEFAULT true;
