-- El commit 69b462b (2026-08-12) dividió el tipo_gasto 'Nómina' del catálogo
-- de Órdenes de Pago en 'Nómina Semanal' / 'Nómina Quincenal', pero nunca se
-- actualizó cfg.rol_tipos_op — la tabla que controla qué tipo_gasto puede
-- ver/crear cada rol. Efecto real desde esa fecha:
--   - usuario_nomina (ALLOW 'Nómina', solo_propios) perdió visibilidad de
--     toda OP de nómina nueva, y no puede seleccionar ninguna de las dos
--     opciones al crear una OP.
--   - compras (DENY 'Nómina') dejó de bloquear nómina — el equipo de
--     compras puede ver OPs de nómina que debían quedar ocultas.
--
-- Fix: reemplaza 'Nómina' por las dos etiquetas nuevas en ambos roles,
-- conservando el mismo modo/solo_propios que ya tenían.

BEGIN;

UPDATE cfg.rol_tipos_op SET tipo_gasto = 'Nómina Semanal'
WHERE rol = 'usuario_nomina' AND tipo_gasto = 'Nómina';

INSERT INTO cfg.rol_tipos_op (rol, tipo_gasto, modo, solo_propios)
VALUES ('usuario_nomina', 'Nómina Quincenal', 'ALLOW', true)
ON CONFLICT (rol, tipo_gasto) DO NOTHING;

UPDATE cfg.rol_tipos_op SET tipo_gasto = 'Nómina Semanal'
WHERE rol = 'compras' AND tipo_gasto = 'Nómina';

INSERT INTO cfg.rol_tipos_op (rol, tipo_gasto, modo, solo_propios)
VALUES ('compras', 'Nómina Quincenal', 'DENY', false)
ON CONFLICT (rol, tipo_gasto) DO NOTHING;

COMMIT;
