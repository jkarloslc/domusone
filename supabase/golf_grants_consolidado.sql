-- ============================================================
-- GOLF SCHEMA — GRANTs consolidados para anon + authenticated
-- Ejecutar completo en Supabase → SQL Editor
-- ============================================================

-- 1. Acceso al schema
GRANT USAGE ON SCHEMA golf TO anon;
GRANT USAGE ON SCHEMA golf TO authenticated;

-- 2. Tablas — ALL para ambos roles
GRANT ALL ON golf.cat_carritos              TO anon, authenticated;
GRANT ALL ON golf.cat_categorias_socios     TO anon, authenticated;
GRANT ALL ON golf.cat_centros_venta         TO anon, authenticated;
GRANT ALL ON golf.cat_espacios_deportivos   TO anon, authenticated;
GRANT ALL ON golf.cat_familiares            TO anon, authenticated;
GRANT ALL ON golf.cat_formas_juego          TO anon, authenticated;
GRANT ALL ON golf.cat_formas_pago_pos       TO anon, authenticated;
GRANT ALL ON golf.cat_pases_config          TO anon, authenticated;
GRANT ALL ON golf.cat_productos_pos         TO anon, authenticated;
GRANT ALL ON golf.cat_slots                 TO anon, authenticated;
GRANT ALL ON golf.cat_socios               TO anon, authenticated;
GRANT ALL ON golf.cfg_carritos              TO anon, authenticated;
GRANT ALL ON golf.cfg_pos                   TO anon, authenticated;
GRANT ALL ON golf.ctrl_acceso_acomp         TO anon, authenticated;
GRANT ALL ON golf.ctrl_accesos              TO anon, authenticated;
GRANT ALL ON golf.ctrl_cortes_caja          TO anon, authenticated;
GRANT ALL ON golf.ctrl_cortes_caja_det      TO anon, authenticated;
GRANT ALL ON golf.ctrl_pases                TO anon, authenticated;
GRANT ALL ON golf.ctrl_pases_movimientos    TO anon, authenticated;
GRANT ALL ON golf.ctrl_pensiones            TO anon, authenticated;
GRANT ALL ON golf.ctrl_reservaciones        TO anon, authenticated;
GRANT ALL ON golf.ctrl_ventas               TO anon, authenticated;
GRANT ALL ON golf.ctrl_ventas_det           TO anon, authenticated;
GRANT ALL ON golf.ctrl_ventas_pagos         TO anon, authenticated;
GRANT ALL ON golf.cxc_golf                  TO anon, authenticated;

-- 3. Secuencias (para INSERT con SERIAL)
GRANT USAGE, SELECT ON SEQUENCE golf.cat_carritos_id_seq            TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_categorias_socios_id_seq   TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_centros_venta_id_seq       TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_espacios_deportivos_id_seq TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_familiares_id_seq          TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_formas_juego_id_seq        TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_formas_pago_pos_id_seq     TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_pases_config_id_seq        TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_productos_pos_id_seq       TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_slots_id_seq               TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_socios_id_seq              TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cfg_carritos_id_seq            TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cfg_pos_id_seq                 TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_acceso_acomp_id_seq       TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_accesos_id_seq            TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_cortes_caja_id_seq        TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_cortes_caja_det_id_seq    TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_pases_id_seq              TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_pases_movimientos_id_seq  TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_pensiones_id_seq          TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_reservaciones_id_seq      TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_id_seq             TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_det_id_seq         TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_pagos_id_seq       TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cxc_golf_id_seq                TO anon, authenticated;

-- 4. RLS — asegurar que todas las tablas tienen política permisiva
--    (DROP primero para evitar duplicados si ya existían)

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'cat_carritos','cat_categorias_socios','cat_centros_venta',
    'cat_espacios_deportivos','cat_familiares','cat_formas_juego',
    'cat_formas_pago_pos','cat_pases_config','cat_productos_pos',
    'cat_slots','cat_socios','cfg_carritos','cfg_pos',
    'ctrl_acceso_acomp','ctrl_accesos','ctrl_cortes_caja',
    'ctrl_cortes_caja_det','ctrl_pases','ctrl_pases_movimientos',
    'ctrl_pensiones','ctrl_reservaciones','ctrl_ventas',
    'ctrl_ventas_det','ctrl_ventas_pagos','cxc_golf'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE golf.%I ENABLE ROW LEVEL SECURITY', t);
    -- Borrar política anterior si existe
    EXECUTE format('DROP POLICY IF EXISTS "auth_all" ON golf.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_all" ON golf.%I', t);
    -- Crear política única que permite todo a anon y authenticated
    EXECUTE format(
      'CREATE POLICY "allow_all" ON golf.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
