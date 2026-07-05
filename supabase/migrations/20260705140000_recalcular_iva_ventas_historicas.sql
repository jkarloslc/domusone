-- ─────────────────────────────────────────────────────────────────
-- Backfill: recalcula IVA en registros históricos de golf.ctrl_ventas /
-- golf.ctrl_ventas_det que quedaron en 0 por el bug de "iva_pct: 0"
-- hardcodeado en cuotas, inscripciones, pensiones, torneos e hípico
-- (corregido en el código el 2026-07-05).
--
-- Regla aplicada:
--  1) Renglones SIN producto (id_producto_fk IS NULL): son conceptos
--     armados a mano por la app (cuota, inscripción, pensión, torneo,
--     cargo/descuento adicional) — SIEMPRE deben llevar IVA 16%.
--  2) Renglones CON producto (id_producto_fk IS NOT NULL): solo se
--     recalculan si el producto en el catálogo actual tiene
--     aplica_iva = true (se respeta si un producto está exento a
--     propósito), usando el iva_pct configurado en ese producto.
--  3) El monto ya cobrado (`total`) NO cambia en ningún caso — el IVA
--     se desglosa hacia adentro (subtotal = total / (1+tasa), igual
--     que hace la app en desglosarIva()/calcLinea()), nunca se suma
--     por fuera.
--  4) `subtotal` de golf.ctrl_ventas_det también se recalcula (aunque
--     no se pidió explícitamente): es la base que usa
--     golf/pos::abrirFacturarPOS como `importe` al facturar — si se
--     deja igual al total mientras se sube iva_pct a 16, cualquier
--     venta de esta lista que se facture DESPUÉS de este backfill
--     quedaría facturada de más (IVA calculado sobre el total en vez
--     de sobre la base).
--  5) golf.ctrl_ventas.iva (cabecera) se recalcula como la suma del
--     detalle ya corregido — no se fuerza un valor fijo, para no
--     alterar ventas que sean legítimamente 100% exentas.
--
-- ⚠️ Recomendado: respaldar golf.ctrl_ventas y golf.ctrl_ventas_det
-- antes de correr este script (es una actualización masiva sobre
-- datos históricos/fiscales). Para dimensionar el impacto antes de
-- ejecutar, correr por separado:
--
--   SELECT count(*) FROM golf.ctrl_ventas_det WHERE COALESCE(iva_pct,0) = 0 AND id_producto_fk IS NULL AND total <> 0;
--   SELECT count(*) FROM golf.ctrl_ventas_det d JOIN golf.cat_productos_pos p ON p.id = d.id_producto_fk
--     WHERE COALESCE(d.iva_pct,0) = 0 AND p.aplica_iva = true AND p.iva_pct > 0 AND d.total <> 0;
--   SELECT count(*) FROM golf.ctrl_ventas WHERE COALESCE(iva,0) = 0;
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Renglones sin producto (cuotas/inscripciones/pensiones/torneos/cargos): IVA 16% fijo.
UPDATE golf.ctrl_ventas_det d
SET
  iva_pct  = 16.00,
  subtotal = ROUND(d.total / 1.16, 2),
  iva      = ROUND(d.total - ROUND(d.total / 1.16, 2), 2)
WHERE d.id_producto_fk IS NULL
  AND COALESCE(d.iva_pct, 0) = 0
  AND d.total <> 0;

-- 2) Renglones con producto: solo si el producto actual NO está marcado exento.
UPDATE golf.ctrl_ventas_det d
SET
  iva_pct  = p.iva_pct,
  subtotal = ROUND(d.total / (1 + p.iva_pct / 100.0), 2),
  iva      = ROUND(d.total - ROUND(d.total / (1 + p.iva_pct / 100.0), 2), 2)
FROM golf.cat_productos_pos p
WHERE d.id_producto_fk = p.id
  AND COALESCE(d.iva_pct, 0) = 0
  AND p.aplica_iva = true
  AND p.iva_pct > 0
  AND d.total <> 0;

-- 3) Recalcular el IVA de cabecera (ctrl_ventas.iva) como la suma del
--    detalle ya corregido, solo para ventas que hoy muestran iva = 0.
UPDATE golf.ctrl_ventas v
SET iva = sub.total_iva
FROM (
  SELECT id_venta_fk, COALESCE(SUM(iva), 0) AS total_iva
  FROM golf.ctrl_ventas_det
  GROUP BY id_venta_fk
) sub
WHERE v.id = sub.id_venta_fk
  AND COALESCE(v.iva, 0) = 0
  AND sub.total_iva <> 0;

COMMIT;
