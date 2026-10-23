-- Vigilancia > Parte de Novedades: control de "visto" (revisión) por parte.
-- Un parte Enviado/Cerrado sin visto_at aparece en Inicio como pendiente de atención
-- para los roles revisores (ver lib/vigilanciaNovedades.ts). Abrirlo lo marca como visto.
ALTER TABLE ctrl.vig_partes
  ADD COLUMN IF NOT EXISTS visto_por    TEXT,
  ADD COLUMN IF NOT EXISTS visto_por_id UUID,
  ADD COLUMN IF NOT EXISTS visto_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vig_partes_sin_ver
  ON ctrl.vig_partes(fecha DESC) WHERE visto_at IS NULL AND status = 'Enviado/Cerrado';

-- El histórico importado de Monday ya fue revisado en su momento: no debe inundar Inicio
UPDATE ctrl.vig_partes
   SET visto_por = 'Migración Monday', visto_at = NOW()
 WHERE visto_at IS NULL AND captured_by = 'Importación Monday';
