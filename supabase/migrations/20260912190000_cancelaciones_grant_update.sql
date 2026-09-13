-- El GRANT original (20260912150000) solo daba SELECT, INSERT en
-- ctrl.cancelaciones — marcarCancelacionRevertida() hace un UPDATE al
-- reabrir un recibo (superadmin) y fallaba en silencio por falta de permiso
-- (best-effort, no bloqueaba el reabrir, pero nunca marcaba "Revertida").
-- Ejecutar en Supabase SQL Editor o: supabase db push

GRANT UPDATE ON ctrl.cancelaciones TO anon, authenticated;
