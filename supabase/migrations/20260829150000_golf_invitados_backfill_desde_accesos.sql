-- ============================================================
--  GOLF — Backfill de golf.cat_invitados desde el histórico de
--  acompañantes registrado como texto libre en ctrl_acceso_acomp.
--
--  Solo aplica a acompañantes que son invitado personal del socio
--  (por pase o Green Fee) — se excluyen Familiares (id_familiar_fk
--  no nulo) e Intercambios (origen_pago = 'INTERCAMBIO' o con
--  club_origen), que no son "invitados" en este sentido.
--
--  Los nombres se agrupan por una clave normalizada (minúsculas,
--  espacios colapsados) para no crear un invitado distinto por cada
--  variación de mayúsculas/espacios del mismo nombre. Cuando una
--  misma clave tiene varias variantes de captura, se usa como
--  nombre a mostrar la variante más frecuente (y en empate, la más
--  reciente). NO corrige errores de dedo distintos entre sí (ej.
--  "Perez" vs "Peres") — eso requiere revisión manual si aplica.
--
--  Esta UPDATE de backfill NO dispara el trigger trg_check_tope_invitados
--  (es BEFORE INSERT, no BEFORE UPDATE) — correcto: no se debe bloquear
--  historial ya ocurrido por la política de tope de hoy.
-- ============================================================

-- 1) Crear un invitado por cada nombre normalizado distinto que
--    todavía no exista en el catálogo.
WITH candidatos AS (
  SELECT
    trim(regexp_replace(aa.nombre, '\s+', ' ', 'g'))         AS nombre_original,
    lower(trim(regexp_replace(aa.nombre, '\s+', ' ', 'g')))  AS clave,
    a.fecha_entrada
  FROM golf.ctrl_acceso_acomp aa
  JOIN golf.ctrl_accesos a ON a.id = aa.id_acceso_fk
  WHERE aa.id_invitado_fk IS NULL
    AND aa.id_familiar_fk IS NULL
    AND coalesce(aa.origen_pago, '') <> 'INTERCAMBIO'
    AND aa.club_origen IS NULL
    AND trim(coalesce(aa.nombre, '')) <> ''
),
agregados AS (
  SELECT clave, nombre_original, count(*) AS frecuencia, max(fecha_entrada) AS ultima_fecha
  FROM candidatos
  GROUP BY clave, nombre_original
),
rankeados AS (
  SELECT clave, nombre_original,
    row_number() OVER (PARTITION BY clave ORDER BY frecuencia DESC, ultima_fecha DESC) AS rn
  FROM agregados
)
INSERT INTO golf.cat_invitados (nombre)
SELECT r.nombre_original
FROM rankeados r
WHERE r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM golf.cat_invitados ci
    WHERE lower(trim(regexp_replace(ci.nombre, '\s+', ' ', 'g'))) = r.clave
  );

-- 2) Ligar cada acompañante histórico a su ficha del catálogo,
--    haciendo match por el mismo nombre normalizado.
UPDATE golf.ctrl_acceso_acomp aa
SET id_invitado_fk = ci.id
FROM golf.cat_invitados ci
WHERE aa.id_invitado_fk IS NULL
  AND aa.id_familiar_fk IS NULL
  AND coalesce(aa.origen_pago, '') <> 'INTERCAMBIO'
  AND aa.club_origen IS NULL
  AND trim(coalesce(aa.nombre, '')) <> ''
  AND lower(trim(regexp_replace(aa.nombre, '\s+', ' ', 'g'))) = lower(trim(regexp_replace(ci.nombre, '\s+', ' ', 'g')));
