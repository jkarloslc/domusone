-- Agrega columna para registrar quién autorizó el reembolso
ALTER TABLE comp.reembolsos
  ADD COLUMN IF NOT EXISTS autorizado_por TEXT;
