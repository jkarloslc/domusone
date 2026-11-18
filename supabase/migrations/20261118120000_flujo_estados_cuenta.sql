-- =============================================================
-- Tesorería › Flujo de Caja › Estados de cuenta (fase 1)
--
-- Reusa las tablas de la migración 20261030120000 (módulo Flujo de
-- Efectivo, código eliminado en 7911fe0) para cargar movimientos
-- bancarios desde Excel y clasificarlos:
--   concepto de flujo  (grupo › categoría)      comp.flujo_conceptos
--   segmento           (centro de costo)         cfg.centros_costo
--   tipo de gasto      (= "partida" del banco)   cfg.tipos_gasto
-- Las reglas (comp.flujo_reglas) se evalúan por prioridad y cada campo
-- lo pone la primera regla que lo trae; lo capturado a mano no se toca.
-- El segmento por omisión sale de la cuenta.
--
-- Se eliminan comp.flujo_versiones / flujo_version_lineas (proyección
-- desde Presupuestos, sin pantalla desde el 12-nov).
-- =============================================================

-- 1. Limpieza de la proyección por versiones
DROP TRIGGER IF EXISTS trg_flujo_version_lineas_blindada ON comp.flujo_version_lineas;
DROP FUNCTION IF EXISTS comp.flujo_version_lineas_blindada();
DROP TABLE IF EXISTS comp.flujo_version_lineas;
DROP TABLE IF EXISTS comp.flujo_versiones;

-- 2. Cuentas bancarias: alias y segmento por omisión + las 2 cuentas que faltaban
ALTER TABLE cfg.cuentas_bancarias ADD COLUMN IF NOT EXISTS alias text;
ALTER TABLE cfg.cuentas_bancarias ADD COLUMN IF NOT EXISTS id_centro_costo_fk integer REFERENCES cfg.centros_costo (id);

INSERT INTO cfg.cuentas_bancarias (banco, numero_cuenta, saldo, activo)
SELECT v.banco, v.numero, 0, true
FROM (VALUES ('BanBajío', '253306060201'), ('Scotia Bank', '03503619567')) AS v(banco, numero)
WHERE NOT EXISTS (SELECT 1 FROM cfg.cuentas_bancarias c WHERE c.numero_cuenta = v.numero);

UPDATE cfg.cuentas_bancarias c SET alias = v.alias, id_centro_costo_fk = v.cc
FROM (VALUES
  ('238105000201', 'BanBajío ·0500', 2),
  ('253306060201', 'BanBajío ·0606', 7),
  ('282364790201', 'BanBajío ·6479', 3),
  ('430943330201', 'BanBajío ·4333', 1),
  ('03504394631',  'Scotiabank ·4631', 1),
  ('03503619567',  'Scotiabank ·9567', NULL)
) AS v(numero, alias, cc)
WHERE c.numero_cuenta = v.numero AND c.alias IS NULL;

-- 3. Conceptos de flujo: Grupo (raíz) › Categoría
ALTER TABLE comp.flujo_conceptos ADD COLUMN IF NOT EXISTS excluir_consolidado boolean NOT NULL DEFAULT false;
DELETE FROM comp.flujo_conceptos WHERE NOT EXISTS (SELECT 1 FROM comp.flujo_mov_banco)
  AND NOT EXISTS (SELECT 1 FROM comp.flujo_reglas);   -- solo la semilla vieja, aún sin uso

INSERT INTO comp.flujo_conceptos (nombre, es_ingreso, es_egreso, orden, excluir_consolidado)
SELECT v.nombre, true, true, v.orden, v.excl
FROM (VALUES ('Operación', 1, false), ('Traspaso interno', 2, true), ('Inversión', 3, false),
             ('Intercompañía', 4, false), ('CAPEX', 5, false)) AS v(nombre, orden, excl)
WHERE NOT EXISTS (SELECT 1 FROM comp.flujo_conceptos x WHERE x.id_padre_fk IS NULL AND x.nombre = v.nombre);

INSERT INTO comp.flujo_conceptos (id_padre_fk, nombre, es_ingreso, es_egreso, orden, excluir_consolidado)
SELECT p.id, h.nombre, h.ing, h.egr, h.orden, p.excluir_consolidado
FROM comp.flujo_conceptos p
JOIN (VALUES
  ('Operación', 'Transferencias recibidas',              true,  false, 1),
  ('Operación', 'Ventas con tarjeta (TPV)',              true,  true,  2),
  ('Operación', 'Depósitos en efectivo y cheques',       true,  false, 3),
  ('Operación', 'Pagos por transferencia (proveedores)', false, true,  4),
  ('Operación', 'Nómina',                                false, true,  5),
  ('Operación', 'Servicios (CFE, telefonía)',            false, true,  6),
  ('Operación', 'Impuestos y derechos',                  false, true,  7),
  ('Operación', 'Comisiones e IVA bancarios',            true,  true,  8),
  ('Operación', 'Compras con tarjeta de débito',         false, true,  9),
  ('Operación', 'Retiros en efectivo / cheques',         false, true,  10),
  ('Operación', 'Cargos domiciliados',                   false, true,  11),
  ('Operación', 'Servicios de OOB',                      false, true,  12),
  ('Operación', 'Compra de divisas',                     false, true,  13),
  ('Traspaso interno', 'Traspaso entre cuentas propias', true,  true,  1),
  ('Inversión', 'Inversión / mercado de dinero',         true,  true,  1),
  ('Intercompañía', 'Intercompañía',                     true,  true,  1),
  ('CAPEX', 'CAPEX',                                     false, true,  1)
) AS h(padre, nombre, ing, egr, orden) ON h.padre = p.nombre
WHERE p.id_padre_fk IS NULL
  AND NOT EXISTS (SELECT 1 FROM comp.flujo_conceptos x WHERE x.id_padre_fk = p.id AND x.nombre = h.nombre);

-- 4. Layouts: banco y hoja
ALTER TABLE comp.flujo_layouts ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE comp.flujo_layouts ADD COLUMN IF NOT EXISTS hoja text;          -- NULL = primera hoja

-- 5. Cargas (una por archivo): portada del estado de cuenta y cuadre
CREATE TABLE IF NOT EXISTS comp.flujo_cargas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cuenta_fk       integer NOT NULL REFERENCES cfg.cuentas_bancarias (id),
  id_layout_fk       bigint REFERENCES comp.flujo_layouts (id) ON DELETE SET NULL,
  archivo            text NOT NULL,
  fecha_desde        date NOT NULL,
  fecha_hasta        date NOT NULL,
  saldo_inicial      numeric(16, 2),        -- según el banco
  saldo_final        numeric(16, 2),
  total_abonos       numeric(16, 2) NOT NULL DEFAULT 0,   -- leídos del archivo
  total_cargos       numeric(16, 2) NOT NULL DEFAULT 0,
  movimientos        integer NOT NULL DEFAULT 0,
  nuevos             integer NOT NULL DEFAULT 0,
  duplicados         integer NOT NULL DEFAULT 0,
  cuadra             boolean,               -- NULL = sin saldos para validar
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flujo_cargas_cuenta ON comp.flujo_cargas (id_cuenta_fk, fecha_desde);

-- 6. Movimientos: FK de cuenta, segmento, tipo de gasto, carga y origen de cada campo
ALTER TABLE comp.flujo_mov_banco DROP COLUMN IF EXISTS lote;
ALTER TABLE comp.flujo_mov_banco ADD COLUMN IF NOT EXISTS id_centro_costo_fk integer REFERENCES cfg.centros_costo (id);
ALTER TABLE comp.flujo_mov_banco ADD COLUMN IF NOT EXISTS id_tipo_gasto_fk integer REFERENCES cfg.tipos_gasto (id);
ALTER TABLE comp.flujo_mov_banco ADD COLUMN IF NOT EXISTS id_carga_fk bigint REFERENCES comp.flujo_cargas (id) ON DELETE CASCADE;
ALTER TABLE comp.flujo_mov_banco ADD COLUMN IF NOT EXISTS origen_segmento text CHECK (origen_segmento IN ('cuenta', 'regla', 'manual'));
ALTER TABLE comp.flujo_mov_banco ADD COLUMN IF NOT EXISTS origen_tipo_gasto text CHECK (origen_tipo_gasto IN ('regla', 'manual'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flujo_mov_banco_id_cuenta_fk_fkey') THEN
    ALTER TABLE comp.flujo_mov_banco ADD CONSTRAINT flujo_mov_banco_id_cuenta_fk_fkey
      FOREIGN KEY (id_cuenta_fk) REFERENCES cfg.cuentas_bancarias (id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_flujo_mov_banco_cuenta_fecha ON comp.flujo_mov_banco (id_cuenta_fk, fecha);
CREATE INDEX IF NOT EXISTS idx_flujo_mov_banco_carga ON comp.flujo_mov_banco (id_carga_fk);

-- 7. Reglas: también ponen segmento y tipo de gasto
ALTER TABLE comp.flujo_reglas ALTER COLUMN id_concepto_fk DROP NOT NULL;
ALTER TABLE comp.flujo_reglas ADD COLUMN IF NOT EXISTS id_centro_costo_fk integer REFERENCES cfg.centros_costo (id);
ALTER TABLE comp.flujo_reglas ADD COLUMN IF NOT EXISTS id_tipo_gasto_fk integer REFERENCES cfg.tipos_gasto (id);
ALTER TABLE comp.flujo_reglas ADD COLUMN IF NOT EXISTS nota text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flujo_reglas_algun_destino') THEN
    ALTER TABLE comp.flujo_reglas ADD CONSTRAINT flujo_reglas_algun_destino
      CHECK (id_concepto_fk IS NOT NULL OR id_centro_costo_fk IS NOT NULL OR id_tipo_gasto_fk IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flujo_reglas_id_cuenta_fk_fkey') THEN
    ALTER TABLE comp.flujo_reglas ADD CONSTRAINT flujo_reglas_id_cuenta_fk_fkey
      FOREIGN KEY (id_cuenta_fk) REFERENCES cfg.cuentas_bancarias (id);
  END IF;
END $$;

-- 8. Semilla de reglas (solo si no hay ninguna)
DO $seed$ BEGIN
IF NOT EXISTS (SELECT 1 FROM comp.flujo_reglas) THEN
-- Reglas de categoría (concepto de flujo), validadas contra 10,864 movimientos ene–nov 2026 (99.95 %)
INSERT INTO comp.flujo_reglas (nombre, patron, tipo_mov, id_concepto_fk, prioridad)
SELECT v.nombre, v.patron, v.tipo_mov, c.id, v.prioridad
FROM (VALUES
  ('GocoBlock (CAPEX)', 'gocoblock', 'Cargo', 'CAPEX', 100),
  ('IVA de comisiones (Scotiabank)', 'iva comisiones', 'Cargo', 'Comisiones e IVA bancarios', 105),
  ('Traspaso a cuenta propia BPCC', 'balvanera polo y country club', NULL, 'Traspaso entre cuentas propias', 110),
  ('Traspaso desde/hacia cuenta propia (No. cuenta)', '23810500', NULL, 'Traspaso entre cuentas propias', 111),
  ('Traspaso desde/hacia cuenta propia (No. cuenta)', '28236479', NULL, 'Traspaso entre cuentas propias', 112),
  ('Traspaso desde/hacia cuenta propia (No. cuenta)', '43094333', NULL, 'Traspaso entre cuentas propias', 113),
  ('Traspaso desde/hacia cuenta propia (No. cuenta)', '25330606', NULL, 'Traspaso entre cuentas propias', 114),
  ('Traspaso desde/hacia cuenta propia (No. cuenta)', '4394631', NULL, 'Traspaso entre cuentas propias', 115),
  ('Traspaso desde/hacia cuenta propia (No. cuenta)', '3619567', NULL, 'Traspaso entre cuentas propias', 116),
  ('Traspaso entre cuentas', 'traspaso entre cuentas', NULL, 'Traspaso entre cuentas propias', 117),
  ('Pagos al Organismo Operador', 'organismo operador', 'Cargo', 'Servicios de OOB', 120),
  ('Pagos al Organismo Operador (typo banco)', 'organismo operador blavanera', 'Cargo', 'Servicios de OOB', 121),
  ('Ingresos del Organismo Operador', 'organismo operador', 'Abono', 'Intercompañía', 125),
  ('Residencial Balvanera', 'residencial balvanera sa de cv', NULL, 'Intercompañía', 130),
  ('SPEI enviado (Scotiabank)', 'spei enviado', 'Cargo', 'Pagos por transferencia (proveedores)', 150),
  ('Comisiones bancarias', 'comision', 'Cargo', 'Comisiones e IVA bancarios', 200),
  ('Comisión envío SPEI (Scotiabank)', 'transf envio spei', 'Cargo', 'Comisiones e IVA bancarios', 201),
  ('Penalización saldo mínimo', 'penal no', 'Cargo', 'Comisiones e IVA bancarios', 202),
  ('IVA de comisiones (grupo)', 'iva grupo', 'Cargo', 'Comisiones e IVA bancarios', 203),
  ('Comisiones grupo AEC', 'grupo aec', 'Cargo', 'Comisiones e IVA bancarios', 204),
  ('Comisiones grupo 1AEC', 'grupo 1aec', 'Cargo', 'Comisiones e IVA bancarios', 205),
  ('Ventas con tarjeta (TPV)', 'negocios afiliados', NULL, 'Ventas con tarjeta (TPV)', 210),
  ('Mercado de dinero', 'mercado de dinero', NULL, 'Inversión / mercado de dinero', 220),
  ('Inversión', 'inversion', NULL, 'Inversión / mercado de dinero', 221),
  ('Dispersión de nómina', 'nomina', 'Cargo', 'Nómina', 230),
  ('Dispersión de nómina (sin acentos del banco)', 'nmina', 'Cargo', 'Nómina', 231),
  ('Finiquitos', 'finiquito', 'Cargo', 'Nómina', 232),
  ('Pago de impuestos', 'pago de impuestos', 'Cargo', 'Impuestos y derechos', 240),
  ('Derechos de gobierno', 'gobierno', 'Cargo', 'Impuestos y derechos', 241),
  ('Impuestos en línea', 'impuestos', 'Cargo', 'Impuestos y derechos', 242),
  ('Pago de servicios (CFE, Telcel)', 'pago de servicio', 'Cargo', 'Servicios (CFE, telefonía)', 250),
  ('Pago de servicios (Scotiabank)', 'sel pago', 'Cargo', 'Servicios (CFE, telefonía)', 251),
  ('Cargos domiciliados', 'domicilia', 'Cargo', 'Cargos domiciliados', 260),
  ('Compras con tarjeta de débito', 'compra disposicion', 'Cargo', 'Compras con tarjeta de débito', 270),
  ('Retiro en cajero', 'retiro atm', 'Cargo', 'Retiros en efectivo / cheques', 280),
  ('Cheque pagado', 'cheque pagado', 'Cargo', 'Retiros en efectivo / cheques', 281),
  ('Retiros misceláneos', 'retiros miscelaneos', 'Cargo', 'Retiros en efectivo / cheques', 282),
  ('Depósito efectivo (Scotiabank)', 'deposito efectivo', 'Abono', 'Depósitos en efectivo y cheques', 289),
  ('Depósito en efectivo', 'deposito en efectivo', 'Abono', 'Depósitos en efectivo y cheques', 290),
  ('Depósito salvo buen cobro', 'salvo buen cobro', 'Abono', 'Depósitos en efectivo y cheques', 291),
  ('Depósito SBC', 'deposito sbc', 'Abono', 'Depósitos en efectivo y cheques', 292),
  ('Depósito con cheque', 'deposito con', 'Abono', 'Depósitos en efectivo y cheques', 293),
  ('Depósitos SBC', 'depositos sbc', 'Abono', 'Depósitos en efectivo y cheques', 294),
  ('Compra de divisas', 'divisas', NULL, 'Compra de divisas', 300),
  ('Operación de cambios', 'operacion cambios', NULL, 'Compra de divisas', 301),
  ('Transferencia recibida (SPEI)', 'spei', 'Abono', 'Transferencias recibidas', 900),
  ('Transferencia recibida', 'transf', 'Abono', 'Transferencias recibidas', 901),
  ('Traspaso recibido', 'traspaso', 'Abono', 'Transferencias recibidas', 902),
  ('Devolución recibida', 'devolucion', 'Abono', 'Transferencias recibidas', 903),
  ('TEF recibido', 'tef recibido', 'Abono', 'Transferencias recibidas', 904),
  ('Pago por transferencia (SPEI)', 'spei', 'Cargo', 'Pagos por transferencia (proveedores)', 950),
  ('Pago por transferencia', 'transf', 'Cargo', 'Pagos por transferencia (proveedores)', 951),
  ('Traspaso enviado', 'traspaso', 'Cargo', 'Pagos por transferencia (proveedores)', 952)
) AS v(nombre, patron, tipo_mov, concepto, prioridad)
JOIN comp.flujo_conceptos c ON c.nombre = v.concepto AND c.id_padre_fk IS NOT NULL;

-- Reglas de segmento (centro de costo) y tipo de gasto, del Asignador de segmentos BPCC
INSERT INTO comp.flujo_reglas (nombre, patron, tipo_mov, id_cuenta_fk, monto_min, monto_max, id_centro_costo_fk, id_tipo_gasto_fk, prioridad, nota)
SELECT v.nombre, v.patron, v.tipo_mov, cb.id, v.monto, v.monto, v.cc, v.tg, v.prioridad, v.nota
FROM (VALUES
  ('Depósitos de 12760 de Grupo Gastronómico', 'grupo gastronomico', 'Abono', '238105000201', 12760::numeric, 1, NULL::int, 1, 'Depósitos de 12760 de Grupo Gastronómico'),
  ('Demás depósitos de Grupo Gastronómico', 'grupo gastronomico', 'Abono', '238105000201', NULL::numeric, 4, NULL::int, 2, 'Demás depósitos de Grupo Gastronómico'),
  ('Pagos a Grupo Gastronómico', 'grupo gastronomico', 'Cargo', '238105000201', NULL::numeric, 7, NULL::int, 3, 'Pagos a Grupo Gastronómico'),
  ('Depósitos de 12760 de Grupo Gastronómico', 'grupo gastronomico', 'Abono', '282364790201', 12760::numeric, 1, NULL::int, 4, 'Depósitos de 12760 de Grupo Gastronómico'),
  ('Demás depósitos de Grupo Gastronómico', 'grupo gastronomico', 'Abono', '282364790201', NULL::numeric, 4, NULL::int, 5, 'Demás depósitos de Grupo Gastronómico'),
  ('Pagos a Grupo Gastronómico', 'grupo gastronomico', 'Cargo', '282364790201', NULL::numeric, 7, NULL::int, 6, 'Pagos a Grupo Gastronómico'),
  ('Pagos a XOOK (licencias de software)', 'xook mexico', 'Cargo', NULL, NULL::numeric, NULL::int, 20, 8, 'Pagos a XOOK (licencias de software)'),
  ('Pagos a gasolineras', 'servicios gasolineros de mexico', 'Cargo', NULL, NULL::numeric, NULL::int, 6, 9, 'Pagos a gasolineras'),
  ('Cesar Javier Hurtad', 'cesar javier hurtad', NULL, NULL, NULL::numeric, NULL::int, 43, 10, NULL),
  ('Ideas Y Servicios Inmobiliarios Sa Decv', 'ideas y servicios inmobiliarios sa decv', NULL, NULL, NULL::numeric, 2, 26, 11, NULL),
  ('Matias De Alba Alvarez', 'matias de alba alvarez', NULL, NULL, NULL::numeric, 5, 26, 12, NULL),
  ('Leon Commerce Exterieur', 'leon commerce exterieur', NULL, NULL, NULL::numeric, 2, 34, 13, NULL),
  ('Edenred Mexico Sa De Cv', 'edenred mexico sa de cv', NULL, NULL, NULL::numeric, NULL::int, 37, 15, NULL),
  ('Gregorio De Jesus Torres', 'gregorio de jesus torres', NULL, NULL, NULL::numeric, NULL::int, 23, 16, NULL),
  ('Zurich Aseguradora Mexicana Sa De Cv', 'zurich aseguradora mexicana sa de cv', NULL, NULL, NULL::numeric, NULL::int, 33, 17, NULL),
  ('Radiomovil Dipsa', 'radiomovil dipsa', NULL, NULL, NULL::numeric, NULL::int, 36, 18, NULL),
  ('Miguel Valdes Del Toro', 'miguel valdes del toro', NULL, NULL, NULL::numeric, NULL::int, 48, 19, NULL),
  ('Jose Manuel Moreno', 'jose manuel moreno', NULL, NULL, NULL::numeric, 4, 50, 21, NULL),
  ('Gas Imperial Sa De Cv (', 'gas imperial sa de cv (', NULL, NULL, NULL::numeric, NULL::int, 46, 22, NULL),
  ('Arrendadora Comercial Celaya', 'arrendadora comercial celaya', NULL, NULL, NULL::numeric, NULL::int, 2, 23, NULL),
  ('Sytba', 'sytba', NULL, NULL, NULL::numeric, NULL::int, 67, 24, NULL),
  ('Sergio Olvera Frias', 'sergio olvera frias', NULL, NULL, NULL::numeric, 3, 41, 25, NULL),
  ('Promotora Y Operadora De Areas Verdes', 'promotora y operadora de areas verdes', NULL, NULL, NULL::numeric, NULL::int, 53, 26, NULL),
  ('Mas Agroquimicos Y Semillas', 'mas agroquimicos y semillas', NULL, NULL, NULL::numeric, NULL::int, 53, 27, NULL),
  ('Mauricio Eduardo Gonzalez', 'mauricio eduardo gonzalez', NULL, NULL, NULL::numeric, NULL::int, 29, 28, NULL),
  ('Zurich', 'zurich', NULL, NULL, NULL::numeric, NULL::int, 33, 29, NULL),
  ('Jose De Alba Barnola', 'jose de alba barnola', NULL, NULL, NULL::numeric, 4, 13, 30, NULL),
  ('Miguel Alfredo Valdes Del Toro', 'miguel alfredo valdes del toro', NULL, NULL, NULL::numeric, NULL::int, 48, 31, NULL),
  ('Jose Gonzalo Lopez Ceballos', 'jose gonzalo lopez ceballos', NULL, NULL, NULL::numeric, 4, 65, 32, NULL)
) AS v(nombre, patron, tipo_mov, numero_cuenta, monto, cc, tg, prioridad, nota)
LEFT JOIN cfg.cuentas_bancarias cb ON cb.numero_cuenta = v.numero_cuenta;

INSERT INTO comp.flujo_reglas (nombre, patron, id_concepto_fk, prioridad, nota)
SELECT 'Eduardo Macías Martínez (CAPEX Hípico)', 'eduardo macias martinez', c.id, 14, 'Partida original: Capex Hípico'
FROM comp.flujo_conceptos c WHERE c.nombre = 'CAPEX' AND c.id_padre_fk IS NOT NULL;
END IF;
END $seed$;

-- 9. RLS + GRANT
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['flujo_cargas']
  LOOP
    EXECUTE format('ALTER TABLE comp.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON comp.%I', tbl || '_all', tbl);
    EXECUTE format('CREATE POLICY %I ON comp.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl || '_all', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp.%I TO authenticated, service_role', tbl);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', pg_get_serial_sequence('comp.' || tbl, 'id'));
  END LOOP;
END $$;
