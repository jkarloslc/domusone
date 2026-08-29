-- ============================================================
--  GOLF — Invitados: apellidos separados, normalización a
--  MAYÚSCULAS y unicidad a nivel de base de datos
--
--  Antes golf.cat_invitados solo tenía un campo `nombre` con el
--  nombre completo capturado a mano, sin control de mayúsculas ni
--  de duplicados — la misma persona podía terminar registrada dos
--  veces por una simple diferencia de mayúsculas/minúsculas o de
--  espacios extra. Este cambio:
--    1) Agrega apellido_paterno / apellido_materno (igual que
--       cat_socios / cat_familiares).
--    2) Normaliza el nombre existente a MAYÚSCULAS sin espacios dobles.
--    3) Fusiona duplicados exactos que hayan quedado de capturas
--       manuales antes de este cambio, reasignando su historial de
--       visitas al registro que se conserva.
--    4) Agrega un índice único (nombre, apellido_paterno,
--       apellido_materno) para que la base de datos rechace
--       duplicados exactos futuros — la app hace upsert sobre este
--       mismo criterio al capturar un invitado nuevo.
-- ============================================================

-- 1) Normalizar nombre existente a MAYÚSCULAS, sin espacios dobles
UPDATE golf.cat_invitados
SET nombre = upper(trim(regexp_replace(nombre, '\s+', ' ', 'g')));

-- 2) Apellidos como columnas separadas (vacías en registros previos,
--    que hasta ahora guardaban el nombre completo en una sola columna)
ALTER TABLE golf.cat_invitados
  ADD COLUMN IF NOT EXISTS apellido_paterno text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS apellido_materno text NOT NULL DEFAULT '';

-- 3) Fusionar duplicados exactos (mismo nombre + apellidos) que hayan
--    quedado de capturas manuales antes de este cambio — se conserva
--    el registro más antiguo (menor id) y se reasignan sus visitas.
WITH duplicados AS (
  SELECT id,
    first_value(id) OVER (PARTITION BY nombre, apellido_paterno, apellido_materno ORDER BY id) AS id_canonico
  FROM golf.cat_invitados
)
UPDATE golf.ctrl_acceso_acomp aa
SET id_invitado_fk = d.id_canonico
FROM duplicados d
WHERE aa.id_invitado_fk = d.id
  AND d.id <> d.id_canonico;

DELETE FROM golf.cat_invitados ci
USING (
  SELECT id,
    first_value(id) OVER (PARTITION BY nombre, apellido_paterno, apellido_materno ORDER BY id) AS id_canonico
  FROM golf.cat_invitados
) d
WHERE ci.id = d.id AND d.id <> d.id_canonico;

-- 4) Unicidad a nivel de base de datos — la app hace upsert con
--    onConflict sobre estas mismas 3 columnas al capturar un invitado.
--    Nota: dos personas distintas con el mismo nombre completo exacto
--    quedarían fusionadas en una sola ficha — si eso llega a pasar,
--    hay que diferenciarlas a mano (ej. agregando un dato en el nombre).
CREATE UNIQUE INDEX IF NOT EXISTS ux_cat_invitados_nombre_completo
  ON golf.cat_invitados (nombre, apellido_paterno, apellido_materno);
