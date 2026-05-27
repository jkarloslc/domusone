-- ═══════════════════════════════════════════════════════════════════
-- cfg.rol_tipos_op — restricciones de tipo_gasto por rol en Órdenes de Pago
-- modo ALLOW: whitelist — el rol solo ve/crea esos tipos
--             solo_propios=true → además solo ve sus propios registros
-- modo DENY:  blacklist — el rol ve todo excepto esos tipos
-- Sin filas:  sin restricción (ve y crea cualquier tipo)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cfg.rol_tipos_op (
  id           SERIAL  PRIMARY KEY,
  rol          TEXT    NOT NULL,
  tipo_gasto   TEXT    NOT NULL,
  modo         TEXT    NOT NULL DEFAULT 'ALLOW' CHECK (modo IN ('ALLOW', 'DENY')),
  solo_propios BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (rol, tipo_gasto)
);

GRANT SELECT ON cfg.rol_tipos_op TO authenticated;

DO $$
DECLARE seqname text;
BEGIN
  seqname := pg_get_serial_sequence('cfg.rol_tipos_op', 'id');
  IF seqname IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seqname);
  END IF;
END $$;

-- usuario_nomina: solo ve Nómina, solo sus propios registros
INSERT INTO cfg.rol_tipos_op (rol, tipo_gasto, modo, solo_propios)
VALUES ('usuario_nomina', 'Nómina', 'ALLOW', true)
ON CONFLICT (rol, tipo_gasto) DO NOTHING;

-- compras: ve todo excepto Nómina
INSERT INTO cfg.rol_tipos_op (rol, tipo_gasto, modo, solo_propios)
VALUES ('compras', 'Nómina', 'DENY', false)
ON CONFLICT (rol, tipo_gasto) DO NOTHING;

-- ── Columna created_by_id en comp.ordenes_pago ────────────────────
-- Permite filtrar "solo mis registros" de forma confiable (UUID, no nombre texto)
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES auth.users(id);

-- ── CHECK constraint actualizado con usuario_nomina ───────────────
ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin',
    'admin',
    'admin_lector',
    'usuarioadmin',
    'usuariomantto',
    'atencion_residentes',
    'cobranza',
    'vigilancia',
    'compras',
    'compras_supervisor',
    'almacen',
    'mantenimiento',
    'fraccionamiento',
    'tesoreria',
    'seguridad',
    'ingresos',
    'usuario_solicitante',
    'usuariogolf',
    'usuariohipico',
    'usuariohospitality',
    'usuario_nomina'          -- NUEVO: carga OPs de nómina, solo ve las propias
  )
);
