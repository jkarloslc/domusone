-- ============================================================
--  GOLF — Revertir el poblado (backfill) de golf.cat_invitados
--
--  Decisión: no partir del historial inferido de nombres en texto
--  libre (20260829150000_golf_invitados_backfill_desde_accesos.sql)
--  — el control de invitados arranca limpio a partir de hoy.
--
--  1) Desvincula el histórico en ctrl_acceso_acomp (id_invitado_fk
--     vuelve a NULL, como estaba antes del backfill — el texto libre
--     en la columna `nombre` de cada acompañante NO se toca, sigue
--     visible tal cual quedó registrado en su momento).
--  2) Vacía golf.cat_invitados y reinicia el contador de id.
--
--  No se toca el tope anual, el trigger ni el índice único — el
--  catálogo queda listo para poblarse solo con capturas de hoy en
--  adelante, a través de AccesoModal o de /golf/invitados.
-- ============================================================

UPDATE golf.ctrl_acceso_acomp
SET id_invitado_fk = NULL
WHERE id_invitado_fk IS NOT NULL;

DELETE FROM golf.cat_invitados;

ALTER SEQUENCE golf.cat_invitados_id_seq RESTART WITH 1;
