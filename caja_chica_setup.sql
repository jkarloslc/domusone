-- ============================================================
-- MÓDULO CAJA CHICA — DomusOne
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Fondos de Caja Chica (asignados a un usuario)
CREATE TABLE IF NOT EXISTS comp.fondos_caja_chica (
  id              serial PRIMARY KEY,
  id_usuario_fk   text    NOT NULL,           -- email del usuario beneficiario
  usuario_nombre  text,                        -- nombre display (desnormalizado para reportes)
  monto_asignado  numeric(12,2) NOT NULL,
  saldo_disponible numeric(12,2),              -- calculado: monto_asignado - sum(reembolsos pagados pendientes)
  fecha_apertura  date    NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre    date,
  status          text    NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo','Cerrado','Suspendido')),
  notas           text,
  created_by      text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 2. Reembolsos (cabecera)
CREATE TABLE IF NOT EXISTS comp.reembolsos (
  id              serial PRIMARY KEY,
  folio           text    UNIQUE,
  id_fondo_fk     int     REFERENCES comp.fondos_caja_chica(id),
  id_usuario_fk   text    NOT NULL,           -- quien solicita el reembolso
  usuario_nombre  text,
  fecha           date    NOT NULL DEFAULT CURRENT_DATE,
  total           numeric(12,2) NOT NULL DEFAULT 0,
  status          text    NOT NULL DEFAULT 'Borrador'
                  CHECK (status IN ('Borrador','Pendiente Auth','Autorizado','Pagado','Rechazado')),
  observaciones   text,
  notas_auth      text,                       -- comentario del autorizador
  id_op_fk        int     REFERENCES comp.ordenes_pago(id),  -- OP generada al autorizar
  created_by      text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 3. Detalle del reembolso (un renglón por gasto)
CREATE TABLE IF NOT EXISTS comp.reembolsos_detalle (
  id                  serial PRIMARY KEY,
  id_reembolso_fk     int     NOT NULL REFERENCES comp.reembolsos(id) ON DELETE CASCADE,
  concepto            text    NOT NULL,
  monto               numeric(12,2) NOT NULL,
  categoria           text    NOT NULL DEFAULT 'Otro'
                      CHECK (categoria IN ('Producto','Servicio','Viáticos','Combustible','Otro')),
  tipo_comprobante    text    NOT NULL DEFAULT 'Sin comprobante'
                      CHECK (tipo_comprobante IN ('Factura','Nota de Remisión','Ticket','Sin comprobante')),
  num_comprobante     text,
  url_comprobante     text,                   -- archivo adjunto
  id_centro_costo_fk  int     REFERENCES cfg.centros_costo(id),
  id_seccion_fk       int     REFERENCES cfg.secciones(id),
  id_frente_fk        int     REFERENCES cfg.frentes(id),
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- 4. Modificar ordenes_pago: agregar tipo_op y FK a reembolso
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS tipo_op         text DEFAULT 'Sin OC'
    CHECK (tipo_op IN ('Con OC','Sin OC','Reembolso')),
  ADD COLUMN IF NOT EXISTS id_reembolso_fk int REFERENCES comp.reembolsos(id);

-- Hacer CC opcional (las OPs de tipo Reembolso no llevan CC en la OP)
ALTER TABLE comp.ordenes_pago
  ALTER COLUMN id_centro_costo_fk DROP NOT NULL,
  ALTER COLUMN id_seccion_fk      DROP NOT NULL,
  ALTER COLUMN id_frente_fk       DROP NOT NULL;

-- Backfill: todas las OPs existentes son Sin OC o Con OC (no Reembolso)
UPDATE comp.ordenes_pago
SET tipo_op = CASE WHEN id_oc_fk IS NOT NULL OR EXISTS (
  SELECT 1 FROM comp.ordenes_pago_oc WHERE id_op_fk = ordenes_pago.id
) THEN 'Con OC' ELSE 'Sin OC' END
WHERE tipo_op IS NULL OR tipo_op = 'Sin OC';

-- Índices
CREATE INDEX IF NOT EXISTS idx_reembolsos_usuario    ON comp.reembolsos(id_usuario_fk);
CREATE INDEX IF NOT EXISTS idx_reembolsos_status     ON comp.reembolsos(status);
CREATE INDEX IF NOT EXISTS idx_reembolsos_det_rem    ON comp.reembolsos_detalle(id_reembolso_fk);
CREATE INDEX IF NOT EXISTS idx_fondos_usuario        ON comp.fondos_caja_chica(id_usuario_fk);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT 'fondos_caja_chica' AS tabla, count(*) FROM comp.fondos_caja_chica
UNION ALL
SELECT 'reembolsos',                  count(*) FROM comp.reembolsos
UNION ALL
SELECT 'reembolsos_detalle',          count(*) FROM comp.reembolsos_detalle;
