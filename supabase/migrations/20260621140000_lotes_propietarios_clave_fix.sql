-- Corrige cat.lotes.cve_lote: actualmente contiene la clave del PROPIETARIO
-- (cargada por error en la importación), no la clave real del lote.
--
-- 1) Rescata el valor actual de cve_lote hacia cat.propietarios.clave
--    (vía ctrl.propietarios_lotes, prefiriendo el propietario marcado
--    es_principal = true), antes de perderlo.
-- 2) Recalcula cve_lote = 3 caracteres de cfg.secciones.clave_alfa
--    + No. Lote a 3 dígitos (ej. "GR-001").
--
-- Antes de correr este archivo en producción, ejecutar los SELECTs de
-- diagnóstico (ver mensaje del chat) para revisar secciones con
-- clave_alfa inválida y lotes sin sección/numero.

BEGIN;

-- 0) El UNIQUE sobre cve_lote no es diferible, así que el UPDATE masivo de abajo
--    puede chocar transitoriamente contra valores que otra fila todavía no ha
--    cambiado (aunque el resultado final sea único). Se quita aquí y se vuelve
--    a crear al final, dentro de la misma transacción: si al recrearlo SÍ hay
--    una colisión real de datos, este paso falla con el detalle del duplicado
--    y toda la transacción hace rollback sin dejar nada a medias.
ALTER TABLE cat.lotes DROP CONSTRAINT IF EXISTS lotes_cve_lote_key;

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

-- 4) Restaura el UNIQUE. Si quedó algún cve_lote duplicado (dos lotes con el
--    mismo No. Lote en la misma sección, o dos secciones cuyo clave_alfa
--    truncado a 3 caracteres coincide), esta línea falla y revierte todo.
ALTER TABLE cat.lotes ADD CONSTRAINT lotes_cve_lote_key UNIQUE (cve_lote);

COMMIT;
