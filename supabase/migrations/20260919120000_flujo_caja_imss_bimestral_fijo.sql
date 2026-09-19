-- IMSS bimestral confirmado con el equipo de nómina: se paga los días 17 de
-- enero, marzo, mayo, julio, septiembre y noviembre (meses calendario impares)
-- SIEMPRE, sin importar el periodo capturado. Deja de ser un "mes ancla"
-- configurable por periodo (columna que ya no usa la app) y pasa a ser una
-- regla de calendario fija en lib/flujoCaja.ts.

ALTER TABLE comp.flujo_caja_periodos DROP COLUMN IF EXISTS mes_ancla_imss_bimestral;
