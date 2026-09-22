-- ══════════════════════════════════════════════════════════════════════════
-- golf.cuotas_socios — TARIFA PACTADA por socio
--
-- POR QUÉ EXISTE
-- Golf era el único módulo de cobranza cuyo cargo nacía SIEMPRE con el precio
-- de lista de la categoría (golf.cat_cuotas_config_det), sin forma de registrar
-- que con un socio se pactó otro precio. Cuando el socio pagaba lo pactado, la
-- diferencia se liquidaba con la forma de pago «Condonación» (SAT 15), que
-- extingue saldo igual que una transferencia: $4.99M de 2026 quedaron como
-- cobranza que nunca fue dinero, inflando cartera, devengado y —cuando el
-- recibo generó ticket— el libro de ingresos y el CFDI.
--
-- Los otros tres módulos ya tenían el mecanismo:
--   · Hípico   → hip.ctrl_asignaciones.monto_mensual   (precio del contrato)
--   · Locales  → ctrl.loc_asignaciones.monto_mensual   (precio del contrato)
--   · Fraccion.→ ctrl.cuotas_lotes                     (tarifa excepcional por lote)
-- Esta tabla es el equivalente de ctrl.cuotas_lotes para socios de Golf, y se
-- resuelve igual: `excepción ?? precio de lista` al generar el cargo.
--
-- Diagnóstico del histórico: sql/diag_condonacion_universo.sql
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS golf.cuotas_socios (
  id                  bigserial     PRIMARY KEY,
  id_socio_fk         integer       NOT NULL REFERENCES golf.cat_socios(id)        ON DELETE CASCADE,
  id_cuota_config_fk  integer       NOT NULL REFERENCES golf.cat_cuotas_config(id) ON DELETE CASCADE,
  -- Importe mensual pactado, con IVA incluido igual que el precio de lista.
  -- 0 es un valor válido y explícito: cuota en cortesía / incluida en el
  -- convenio. No genera cargo (no hay nada que cobrar), y queda documentado
  -- aquí en vez de resolverse condonando después.
  monto               numeric(12,2) NOT NULL CHECK (monto >= 0),
  -- Vigencia por PERIODO ('YYYY-MM', el mismo formato de cxc_golf.periodo), no
  -- por fecha: lo que decide qué tarifa aplica es el periodo que se devenga, no
  -- el día en que se genera el cargo. NULL = sin límite por ese lado.
  vigente_desde       text          CHECK (vigente_desde IS NULL OR vigente_desde ~ '^\d{4}-\d{2}$'),
  vigente_hasta       text          CHECK (vigente_hasta IS NULL OR vigente_hasta ~ '^\d{4}-\d{2}$'),
  -- Obligatorio a propósito: una tarifa distinta a la de su categoría es una
  -- excepción comercial y tiene que poder explicarse sin preguntarle a nadie.
  motivo_excepcion    text          NOT NULL CHECK (btrim(motivo_excepcion) <> ''),
  activo              boolean       NOT NULL DEFAULT true,
  usuario_crea        text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT cuotas_socios_vigencia_chk CHECK (
    vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta >= vigente_desde
  )
);

COMMENT ON TABLE  golf.cuotas_socios IS
  'Tarifa pactada por socio para una cuota de Golf. Gana sobre el precio de lista de cat_cuotas_config_det al generar el cargo. Equivalente de ctrl.cuotas_lotes en Fraccionamiento.';
COMMENT ON COLUMN golf.cuotas_socios.monto IS
  'Importe mensual pactado (IVA incluido). 0 = cuota en cortesía: no se genera cargo.';
COMMENT ON COLUMN golf.cuotas_socios.vigente_desde IS
  'Periodo YYYY-MM desde el que aplica. NULL = desde siempre. Se compara contra cxc_golf.periodo.';

-- Una sola tarifa activa por socio × cuota × inicio de vigencia. Permite el
-- cambio de tarifa a media anualidad (hay 7 casos reales en el histórico) sin
-- permitir dos filas activas idénticas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cuotas_socios_activa
  ON golf.cuotas_socios (id_socio_fk, id_cuota_config_fk, COALESCE(vigente_desde, '0000-00'))
  WHERE activo;

CREATE INDEX IF NOT EXISTS idx_cuotas_socios_socio ON golf.cuotas_socios (id_socio_fk) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_cuotas_socios_cuota ON golf.cuotas_socios (id_cuota_config_fk) WHERE activo;

-- Permisos: SOLO `authenticated`. La llave `anon` es NEXT_PUBLIC_ y viaja en el
-- bundle del navegador; las tablas viejas de Golf la traen por herencia, pero
-- una tabla nueva no debe nacer expuesta. `service_role` con SELECT para poder
-- auditar por PostgREST (ver migración 20260921120000).
GRANT SELECT, INSERT, UPDATE, DELETE ON golf.cuotas_socios TO authenticated;
GRANT SELECT                          ON golf.cuotas_socios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE golf.cuotas_socios_id_seq TO authenticated;

ALTER TABLE golf.cuotas_socios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_authenticated" ON golf.cuotas_socios;
CREATE POLICY "allow_authenticated" ON golf.cuotas_socios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sin este NOTIFY la tabla nace invisible para PostgREST y el insert falla en
-- silencio con PGRST205 (patrón repetido varias veces en este proyecto).
NOTIFY pgrst, 'reload schema';
