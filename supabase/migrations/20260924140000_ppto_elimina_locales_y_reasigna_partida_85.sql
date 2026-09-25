-- Decisiones del usuario (2026-09-24):
--   1. Locales no tiene presupuesto propio: sus rentas se presupuestan en el
--      módulo donde vive cada partida (Golf / Polo).
--   2. Los $395k capturados en la partida inactiva 85 pasan a la activa 161.

BEGIN;

-- ── 1a. Partidas que SOLO estaban presupuestadas en Locales (id 9) ─────────
-- Se llevan al presupuesto del módulo de la partida para no perder el monto:
--   290 Renta Carpa Carritos  (Golf)          $120,984 → presupuesto 4
--   291 Fee Carritos          (Golf)          $144,000 → presupuesto 4
--   289 Servicio de Mantto.   (Mantenimiento) $193,026 → presupuesto 3
-- Las que ya tenían monto en Golf/Polo (76, 78, 286, 287, 288, 292) se
-- quedan con el de su módulo; la copia de Locales se descarta en 1b.
UPDATE ctrl.ppto_presupuesto_det d
   SET id_presupuesto_fk = CASE WHEN d.id_partida_fk = 289 THEN 3 ELSE 4 END,
       updated_at = NOW()
 WHERE d.id_presupuesto_fk = 9
   AND d.id_partida_fk IN (289, 290, 291)
   AND NOT EXISTS (
     SELECT 1 FROM ctrl.ppto_presupuesto_det x
      WHERE x.id_presupuesto_fk = CASE WHEN d.id_partida_fk = 289 THEN 3 ELSE 4 END
        AND x.id_partida_fk = d.id_partida_fk
        AND x.mes = d.mes);

-- ── 1b. Elimina el presupuesto de Locales ─────────────────────────────────
-- ON DELETE CASCADE borra sus filas restantes de ppto_presupuesto_det
-- (las copias duplicadas) y de ppto_presupuesto_real_manual (no tiene).
DELETE FROM ctrl.ppto_presupuestos WHERE id = 9 AND modulo = 'Locales';

-- ── 2. Partida 85 (inactiva, duplicado de la 161) → 161 ─────────────────────
-- Misma área (23) y mismo tipo_gasto "Mantto. de Equipo en Gral". La 161 no
-- tenía montos en Golf, así que no hay choque con UNIQUE(ppto, partida, mes).
UPDATE ctrl.ppto_presupuesto_det d
   SET id_partida_fk = 161, updated_at = NOW()
 WHERE d.id_presupuesto_fk = 4
   AND d.id_partida_fk = 85
   AND NOT EXISTS (
     SELECT 1 FROM ctrl.ppto_presupuesto_det x
      WHERE x.id_presupuesto_fk = 4 AND x.id_partida_fk = 161 AND x.mes = d.mes);

COMMIT;
