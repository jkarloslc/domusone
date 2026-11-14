-- fecha_op se llenaba con DEFAULT CURRENT_DATE (UTC): las OPs creadas después de
-- las 18:00 hora de México quedaron con fecha del día siguiente. Se corrigen al
-- día real de creación (hora de México). Se excluyen las fechadas a fin de mes a
-- propósito (OP-2026-0299..0306 y OP-2026-0913).
-- El formulario de OP envía fecha_op explícita (hora de México).
UPDATE comp.ordenes_pago
SET fecha_op = (created_at AT TIME ZONE 'America/Mexico_City')::date
WHERE id IN (5, 6, 7, 12, 349, 350, 351, 400, 401, 454, 462, 507, 565, 566, 567, 734, 735, 789, 790, 842)
  AND fecha_op = (created_at AT TIME ZONE 'UTC')::date
  AND fecha_op <> (created_at AT TIME ZONE 'America/Mexico_City')::date;

-- Default en hora de México para los demás flujos que crean OPs sin enviar
-- fecha_op (pre-órdenes, caja chica, OC, rol de pagos).
ALTER TABLE comp.ordenes_pago
  ALTER COLUMN fecha_op SET DEFAULT ((now() AT TIME ZONE 'America/Mexico_City')::date);
