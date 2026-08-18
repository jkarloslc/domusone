-- Fix + automatización: renombrar un valor en cfg.tipos_gasto (vía
-- /catalogos) NO cascadeaba a comp.ordenes_pago.tipo_gasto ni
-- ctrl.ppto_partidas.tipo_gasto — quedaban con el label viejo, y como
-- Presupuestos (dashboard/comparativo/flujo) matchea por igualdad exacta
-- de string, las OP nuevas (con el label nuevo) dejaban de atribuirse a su
-- partida y caían al catch-all "Otros Gastos" del área.
--
-- Ya pasó en producción: alguien renombró 4 valores desde /catalogos
-- (Reparación→Mantenimiento de Equipo en Gral, Impuestos Estatales→ISN 3%,
-- Impuestos Federales→I.V.A, Mantenimiento de Vehículos→Mantenimiento de
-- Vehículos y Maquinaria) sin la migración de datos manual que sí se hizo
-- para los 3 renames anteriores (Pagos a Personal Externo, Mantenimiento
-- de Instalaciones e Infraestructura, Renta de Mobiliario y Equipo).
--
-- Parte 1: fix único — realinea los datos ya divergentes.
-- Parte 2: trigger — de aquí en adelante, cualquier UPDATE de
--   cfg.tipos_gasto.nombre (desde /catalogos o SQL directo) cascadea solo,
--   en la misma transacción, a ordenes_pago/ppto_partidas/rol_tipos_op. No
--   hace falta volver a escribir esta migración a mano cada vez.
BEGIN;

-- ── Parte 1: fix único de los 4 renames ya divergentes ──────────────
UPDATE comp.ordenes_pago SET tipo_gasto = 'Mantenimiento de Equipo en Gral'
  WHERE tipo_gasto = 'Reparación';
UPDATE ctrl.ppto_partidas
  SET tipo_gasto = 'Mantenimiento de Equipo en Gral',
      nombre = REPLACE(nombre, 'Reparación [', 'Mantenimiento de Equipo en Gral [')
  WHERE tipo_gasto = 'Reparación';

UPDATE comp.ordenes_pago SET tipo_gasto = 'ISN 3%'
  WHERE tipo_gasto = 'Impuestos Estatales';
UPDATE ctrl.ppto_partidas
  SET tipo_gasto = 'ISN 3%',
      nombre = REPLACE(nombre, 'Impuestos Estatales [', 'ISN 3% [')
  WHERE tipo_gasto = 'Impuestos Estatales';

UPDATE comp.ordenes_pago SET tipo_gasto = 'I.V.A'
  WHERE tipo_gasto = 'Impuestos Federales';
UPDATE ctrl.ppto_partidas
  SET tipo_gasto = 'I.V.A',
      nombre = REPLACE(nombre, 'Impuestos Federales [', 'I.V.A [')
  WHERE tipo_gasto = 'Impuestos Federales';

UPDATE comp.ordenes_pago SET tipo_gasto = 'Mantenimiento de Vehículos y Maquinaria'
  WHERE tipo_gasto = 'Mantenimiento de Vehículos';
UPDATE ctrl.ppto_partidas
  SET tipo_gasto = 'Mantenimiento de Vehículos y Maquinaria',
      nombre = REPLACE(nombre, 'Mantenimiento de Vehículos [', 'Mantenimiento de Vehículos y Maquinaria [')
  WHERE tipo_gasto = 'Mantenimiento de Vehículos';

-- cfg.rol_tipos_op no tenía filas con ninguno de estos 4 valores (auditado
-- contra las 5 migraciones que la alimentan), pero se corre igual por
-- seguridad — 0 filas afectadas si no aplica.
UPDATE cfg.rol_tipos_op SET tipo_gasto = 'Mantenimiento de Equipo en Gral' WHERE tipo_gasto = 'Reparación';
UPDATE cfg.rol_tipos_op SET tipo_gasto = 'ISN 3%' WHERE tipo_gasto = 'Impuestos Estatales';
UPDATE cfg.rol_tipos_op SET tipo_gasto = 'I.V.A' WHERE tipo_gasto = 'Impuestos Federales';
UPDATE cfg.rol_tipos_op SET tipo_gasto = 'Mantenimiento de Vehículos y Maquinaria' WHERE tipo_gasto = 'Mantenimiento de Vehículos';

-- ── Parte 2: trigger de cascada automática ───────────────────────────
-- SECURITY DEFINER: el trigger corre con los privilegios de quien lo creó
-- (vía SQL Editor, típicamente postgres), no con los del usuario que edita
-- el catálogo desde /catalogos — así puede escribir en ctrl.ppto_partidas
-- y cfg.rol_tipos_op aunque el rol authenticated no tenga GRANT directo
-- sobre esta última (a propósito: rol_tipos_op solo se edita por
-- migración, nunca desde la UI).
CREATE OR REPLACE FUNCTION cfg.fn_tipos_gasto_cascade_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cfg, comp, ctrl, pg_catalog
AS $$
BEGIN
  IF NEW.nombre IS DISTINCT FROM OLD.nombre THEN
    UPDATE comp.ordenes_pago
      SET tipo_gasto = NEW.nombre
      WHERE tipo_gasto = OLD.nombre;

    UPDATE ctrl.ppto_partidas
      SET tipo_gasto = NEW.nombre,
          nombre = REPLACE(nombre, OLD.nombre || ' [', NEW.nombre || ' [')
      WHERE tipo_gasto = OLD.nombre;

    UPDATE cfg.rol_tipos_op
      SET tipo_gasto = NEW.nombre
      WHERE tipo_gasto = OLD.nombre;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tipos_gasto_cascade_rename ON cfg.tipos_gasto;
CREATE TRIGGER trg_tipos_gasto_cascade_rename
  AFTER UPDATE ON cfg.tipos_gasto
  FOR EACH ROW
  EXECUTE FUNCTION cfg.fn_tipos_gasto_cascade_rename();

COMMIT;
