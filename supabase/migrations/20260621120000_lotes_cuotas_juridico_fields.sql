-- Agrega campos de Cuotas y Jurídico al modal de Lotes (tabs nuevos)

ALTER TABLE cat.lotes
  -- Cuotas
  ADD COLUMN IF NOT EXISTS tipo_cuota          text,
  ADD COLUMN IF NOT EXISTS segmento            text,
  ADD COLUMN IF NOT EXISTS motivo_detalle      text,
  ADD COLUMN IF NOT EXISTS motivo_incobrable   text,
  ADD COLUMN IF NOT EXISTS domiciliacion       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_pago_activo    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_pago_enganche  numeric(12,2),
  ADD COLUMN IF NOT EXISTS plan_pago_plazo     integer,
  -- Jurídico
  ADD COLUMN IF NOT EXISTS base_juridica       text,
  ADD COLUMN IF NOT EXISTS convenio_firmado    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS convenio_fecha      date,
  ADD COLUMN IF NOT EXISTS escritura_clausula  boolean NOT NULL DEFAULT false;
