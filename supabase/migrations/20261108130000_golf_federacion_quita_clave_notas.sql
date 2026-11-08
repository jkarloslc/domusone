-- La clave de federación ahora es única por socio (cat_socios.federacion_clave); notas ya no se usa.
-- Requiere haber ejecutado antes 20261108120000 (copia la clave al socio).
ALTER TABLE golf.ctrl_federacion
  DROP COLUMN IF EXISTS clave,
  DROP COLUMN IF EXISTS notas;
