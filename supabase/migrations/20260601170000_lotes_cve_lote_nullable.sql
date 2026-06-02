-- Permite que cve_lote sea NULL en la tabla de lotes
ALTER TABLE cat.lotes ALTER COLUMN cve_lote DROP NOT NULL;
