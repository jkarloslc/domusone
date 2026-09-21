-- ─────────────────────────────────────────────────────────────────────────
-- Diagnóstico: devengado sin concepto ni sección con que ligarse a una
-- partida de presupuesto (aviso del Comparativo / Dashboard, base Devengado).
--
-- Correr en el SQL Editor de Supabase (proyecto lgftbeiafwyafvoodowr).
-- hip.cxc_hip y ctrl.loc_cxc solo tienen GRANT para `authenticated`, así que
-- desde PostgREST con anon/service_role no se pueden auditar: el editor SQL
-- corre como superusuario y sí las ve.
--
-- `concepto_viejo` = lo que resolvía el código antes del fix (solo la columna
-- id_concepto_ingreso_fk). `concepto_nuevo` = con la ruta por producto POS.
-- La diferencia entre las dos columnas de monto es lo que el fix recupera.
-- ─────────────────────────────────────────────────────────────────────────

WITH cfg_hip AS (SELECT * FROM hip.cfg_hip LIMIT 1),
hip AS (
  SELECT 'Hípico'::text AS modulo, c.periodo, c.monto_final,
         f.id_concepto_ingreso_fk                                  AS concepto_viejo,
         COALESCE(p.id_concepto_ingreso_fk, f.id_concepto_ingreso_fk) AS concepto_nuevo
  FROM hip.cxc_hip c
  LEFT JOIN cfg_hip f ON true
  LEFT JOIN golf.cat_productos_pos p ON p.id = f.id_producto_pos_fk
  WHERE c.status <> 'CANCELADO'
),
loc AS (
  SELECT 'Locales'::text AS modulo, c.periodo, c.monto_final,
         pr.id_concepto_ingreso_fk                                   AS concepto_viejo,
         COALESCE(p.id_concepto_ingreso_fk, pr.id_concepto_ingreso_fk) AS concepto_nuevo
  FROM ctrl.loc_cxc c
  LEFT JOIN ctrl.loc_asignaciones a ON a.id = c.id_asignacion_fk
  LEFT JOIN ctrl.loc_propiedades  pr ON pr.id = a.id_propiedad_fk
  LEFT JOIN golf.cat_productos_pos p ON p.id = pr.id_producto_pos_fk
  WHERE c.status <> 'CANCELADO'
),
todo AS (SELECT * FROM hip UNION ALL SELECT * FROM loc)
SELECT modulo,
       COUNT(*)                                                          AS filas,
       SUM(monto_final)                                                  AS devengado_total,
       SUM(monto_final) FILTER (WHERE concepto_viejo IS NULL)            AS sin_dimension_antes,
       SUM(monto_final) FILTER (WHERE concepto_nuevo  IS NULL)           AS sin_dimension_despues,
       SUM(monto_final) FILTER (WHERE periodo LIKE '2026%')              AS devengado_2026,
       SUM(monto_final) FILTER (WHERE concepto_viejo IS NULL
                                  AND periodo LIKE '2026%')              AS sin_dimension_2026_antes
FROM todo
GROUP BY ROLLUP (modulo)
ORDER BY modulo NULLS LAST;

-- Detalle de Locales: qué propiedades declaran su clasificación por producto
-- POS (la ruta que el devengado ignoraba) y cuáles no declaran ninguna.
SELECT pr.id, pr.clave, pr.nombre,
       pr.id_concepto_ingreso_fk AS concepto_directo,
       pr.id_producto_pos_fk     AS producto_pos,
       p.id_concepto_ingreso_fk  AS concepto_del_producto,
       COUNT(c.id)               AS cuotas,
       SUM(c.monto_final)        AS devengado
FROM ctrl.loc_propiedades pr
LEFT JOIN golf.cat_productos_pos p ON p.id = pr.id_producto_pos_fk
LEFT JOIN ctrl.loc_asignaciones  a ON a.id_propiedad_fk = pr.id
LEFT JOIN ctrl.loc_cxc           c ON c.id_asignacion_fk = a.id AND c.status <> 'CANCELADO'
GROUP BY pr.id, pr.clave, pr.nombre, pr.id_concepto_ingreso_fk, pr.id_producto_pos_fk, p.id_concepto_ingreso_fk
ORDER BY devengado DESC NULLS LAST;

-- Configuración de Hípico: una sola fila clasifica todo el módulo.
SELECT f.id_producto_pos_fk, p.nombre AS producto, p.id_concepto_ingreso_fk AS concepto_del_producto,
       f.id_concepto_ingreso_fk AS concepto_directo
FROM hip.cfg_hip f
LEFT JOIN golf.cat_productos_pos p ON p.id = f.id_producto_pos_fk;
