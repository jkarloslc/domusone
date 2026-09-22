-- ═════════════════════════════════════════════════════════════════════════
-- Corregir ctrl_pensiones.monto_mensual al precio realmente pactado
--
-- POR QUÉ: las 329 cuotas de PENSION_CARRITO no tienen id_cuota_config_fk
-- (PensionModal no lo escribe), así que quedaron fuera del sembrado de
-- golf.cuotas_socios. No lo necesitan: el precio pactado de una pensión ya vive
-- en su contrato, igual que en Hípico y Locales. Lo que quedó mal es el dato —
-- el contrato guarda la tarifa global de cfg_carritos ($800) que el cajero
-- aceptó por default, y la diferencia contra lo realmente pactado ($666.67 =
-- $8,000 anuales) se liquidó condonando: $67,865.69.
--
-- Sin esto, al agregar las cuotas del año siguiente PensionModal vuelve a
-- proponer el monto del contrato y el cargo nace otra vez al precio de lista.
--
-- ⚠️ Depende de golf.tmp_pactado_por_cuota, que crea
-- sql/seed_tarifas_pactadas_golf.sql y se deja a propósito. Se calculó ANTES de
-- la reexpresión, así que sigue teniendo el precio pactado aunque la Fase 2 ya
-- se haya corrido. Si la tabla ya no existe, volver a correr el bloque 1 del
-- sembrado NO sirve: la condonación ya no está. Restaurar desde
-- golf.bkp_cond_* en ese caso.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. Qué se va a cambiar (revisar antes de aplicar) ───────────────────
WITH pact AS (
  SELECT x.id_pension_fk,
         COUNT(*)                          AS cuotas,
         COUNT(DISTINCT t.pactado)         AS pactado_distintos,
         MIN(t.pactado)::numeric(12,2)     AS pactado,
         MAX(t.lista)::numeric(12,2)       AS lista
  FROM golf.tmp_pactado_por_cuota t
  JOIN golf.cxc_golf x ON x.id = t.id_cuota
  WHERE t.tipo = 'PENSION_CARRITO' AND x.id_pension_fk IS NOT NULL
  GROUP BY x.id_pension_fk
)
SELECT p.id_pension_fk,
       COALESCE(so.numero_socio, '') || ' ' ||
         CONCAT_WS(' ', so.nombre, so.apellido_paterno, so.apellido_materno) AS socio,
       pe.monto_mensual AS contrato_hoy,
       p.lista, p.pactado, p.cuotas, p.pactado_distintos, pe.activo,
       CASE
         WHEN p.pactado_distintos > 1 THEN 'Varios precios: revisar a mano'
         WHEN p.pactado = 0           THEN 'Pensión en cortesía: decidir si el contrato va a 0 (dejaría de poder generar cuotas)'
         ELSE                              'Se actualiza a ' || p.pactado
       END AS accion
FROM pact p
LEFT JOIN golf.ctrl_pensiones pe ON pe.id = p.id_pension_fk
LEFT JOIN golf.cat_socios so     ON so.id = pe.id_socio_fk
ORDER BY p.pactado, socio;

-- ── 2. Aplicar — solo los estables y con precio mayor a cero ────────────
-- Las pensiones en cortesía ($0) se quedan fuera a propósito: poner el contrato
-- en 0 haría que PensionModal rechace agregar cuotas con un mensaje confuso
-- ("El monto mensual debe ser mayor a 0"). Se deciden una por una con la
-- lista del bloque 1.
WITH pact AS (
  SELECT x.id_pension_fk,
         COUNT(DISTINCT t.pactado)     AS pactado_distintos,
         MIN(t.pactado)::numeric(12,2) AS pactado
  FROM golf.tmp_pactado_por_cuota t
  JOIN golf.cxc_golf x ON x.id = t.id_cuota
  WHERE t.tipo = 'PENSION_CARRITO' AND x.id_pension_fk IS NOT NULL
  GROUP BY x.id_pension_fk
)
UPDATE golf.ctrl_pensiones pe
   SET monto_mensual = p.pactado,
       observaciones = CONCAT_WS(' | ', NULLIF(pe.observaciones, ''),
         'Monto corregido el ' || CURRENT_DATE || ' al precio pactado (antes ' || pe.monto_mensual ||
         '): la diferencia se venía liquidando por condonación.')
  FROM pact p
 WHERE pe.id = p.id_pension_fk
   AND p.pactado_distintos = 1
   AND p.pactado > 0
   AND pe.monto_mensual <> p.pactado;

-- ── 3. Verificar ────────────────────────────────────────────────────────
SELECT pe.id, pe.monto_mensual, pe.activo, COUNT(x.id) AS cuotas_vivas
FROM golf.ctrl_pensiones pe
LEFT JOIN golf.cxc_golf x ON x.id_pension_fk = pe.id AND x.status <> 'CANCELADO'
WHERE pe.id IN (SELECT DISTINCT x2.id_pension_fk FROM golf.tmp_pactado_por_cuota t
                  JOIN golf.cxc_golf x2 ON x2.id = t.id_cuota
                 WHERE t.tipo = 'PENSION_CARRITO' AND x2.id_pension_fk IS NOT NULL)
GROUP BY pe.id, pe.monto_mensual, pe.activo
ORDER BY pe.monto_mensual;


-- ── 4. Pensiones en cortesía — decisión del usuario (2026-09-21) ────────
-- Los 3 contratos que el bloque 2 dejó fuera por tener pactado $0 quedaron
-- activos a $800 con CERO cuotas vivas (la Fase 2 canceló las suyas por quedar
-- en cero). Si alguien genera las cuotas del año siguiente, PensionModal les
-- propondría $800 y les cobraría una pensión que está pactada en cortesía.
--
-- Se decide bloquearlo por dato: con monto_mensual = 0 el modal rechaza
-- agregar cuotas ("El monto mensual debe ser mayor a 0"), que es el resultado
-- correcto. El mensaje no lo explica, por eso el motivo va en observaciones.
--
-- Los ids salen del bloque 3: activos, a 800.00 y con cuotas_vivas = 0.
UPDATE golf.ctrl_pensiones
   SET monto_mensual = 0,
       observaciones = CONCAT_WS(' | ', NULLIF(observaciones, ''),
         'Pensión en cortesía: incluida en el convenio del socio. No genera cuotas.')
 WHERE id IN (2, 68, 77);

-- Verificar: los 3 deben quedar en 0.00, activos y sin cuotas vivas.
SELECT pe.id, pe.monto_mensual, pe.activo, pe.observaciones,
       COUNT(x.id) AS cuotas_vivas
FROM golf.ctrl_pensiones pe
LEFT JOIN golf.cxc_golf x ON x.id_pension_fk = pe.id AND x.status <> 'CANCELADO'
WHERE pe.id IN (2, 68, 77)
GROUP BY pe.id, pe.monto_mensual, pe.activo, pe.observaciones;
