-- Corrige cat.lotes.cve_lote: actualmente contiene la clave del PROPIETARIO
-- (cargada por error en la importación), no la clave real del lote.
--
-- 1) Rescata el valor actual de cve_lote hacia cat.propietarios.clave
--    (vía ctrl.propietarios_lotes, prefiriendo el propietario marcado
--    es_principal = true), antes de perderlo.
-- 2) Recalcula cve_lote = 3 caracteres de cfg.secciones.clave_alfa
--    + No. Lote a 3 dígitos (ej. "GR-001").
--
-- IMPORTANTE (2026-06-22): el diagnóstico encontró ~90 grupos de colisión
-- en cat.lotes.lote (No. Lote) repartidos en 12 secciones — el campo
-- numérico "lote" está mal cargado a gran escala, no solo en casos
-- aislados. Se decidió quitar el UNIQUE de cve_lote y dejarlo así
-- A PROPÓSITO: el resultado de este recálculo va a tener duplicados.
-- La corrección de "lote" se hace manualmente caso por caso después de
-- correr este archivo, y el UNIQUE se vuelve a crear en una migración
-- aparte una vez que ya no haya colisiones (ver query de validación
-- en el mensaje del chat: agrupar por id_seccion_fk + lote, HAVING > 1).

BEGIN;

-- 0) Se quita el UNIQUE para permitir el recálculo aunque queden
--    duplicados temporales. NO se vuelve a crear en este archivo.
ALTER TABLE cat.lotes DROP CONSTRAINT IF EXISTS lotes_cve_lote_key;

-- 0.5) Corrige el No. Lote mal cargado en 3 registros de Cordillera II
--      (id_seccion_fk = 15) que compartían lote = 2 por error de captura.
--      Números correctos confirmados manualmente, 2026-06-22.
UPDATE cat.lotes SET lote = 51 WHERE id = 652;
UPDATE cat.lotes SET lote = 52 WHERE id = 677;
UPDATE cat.lotes SET lote = 53 WHERE id = 1519;

-- 1) Columna donde queda la clave rescatada del propietario
ALTER TABLE cat.propietarios ADD COLUMN IF NOT EXISTS clave text;

-- 2) Rescate: lote → propietario preferente (es_principal, o el primero activo)
WITH propietario_por_lote AS (
  SELECT DISTINCT ON (pl.id_lote_fk)
         pl.id_lote_fk,
         pl.id_propietario_fk
    FROM ctrl.propietarios_lotes pl
   WHERE pl.activo = true
   ORDER BY pl.id_lote_fk, pl.es_principal DESC, pl.id
),
clave_por_propietario AS (
  SELECT ppl.id_propietario_fk AS id_propietario,
         MIN(l.cve_lote)        AS clave_rescatada
    FROM propietario_por_lote ppl
    JOIN cat.lotes l ON l.id = ppl.id_lote_fk
   WHERE l.cve_lote IS NOT NULL
   GROUP BY ppl.id_propietario_fk
)
UPDATE cat.propietarios p
   SET clave = cpp.clave_rescatada
  FROM clave_por_propietario cpp
 WHERE p.id = cpp.id_propietario
   AND p.clave IS NULL;

-- 3) Recalcula cve_lote = ABREVIATURA(3) + '-' + No.Lote(3 dígitos)
--    Solo toca lotes con sección, número de lote y clave_alfa válida (>= 3 chars).
UPDATE cat.lotes l
   SET cve_lote = UPPER(LEFT(TRIM(s.clave_alfa), 3)) || '-' || LPAD(l.lote::text, 3, '0')
  FROM cfg.secciones s
 WHERE s.id = l.id_seccion_fk
   AND l.id_seccion_fk IS NOT NULL
   AND l.lote IS NOT NULL
   AND s.clave_alfa IS NOT NULL
   AND length(TRIM(s.clave_alfa)) >= 3;

-- 4) El UNIQUE se queda fuera intencionalmente (ver nota arriba).
--    Pendiente: corregir manualmente los "lote" duplicados y correr
--    en una migración aparte:
--      ALTER TABLE cat.lotes ADD CONSTRAINT lotes_cve_lote_key UNIQUE (cve_lote);

COMMIT;
