-- ═════════════════════════════════════════════════════════════════════════════
-- Seed de arranque para una instancia nueva (nueva empresa)
-- Ejecutar DESPUÉS de restaurar la estructura (pg_dump --schema-only) en el
-- proyecto Supabase nuevo y de exponer los schemas cat/ctrl/cfg/comp/golf/hip
-- en Settings → API.
--
-- Uso vía psql (recomendado, corre las 3 partes en un solo archivo):
--   psql "postgresql://postgres.<ref-nuevo>:<password>@<host-pooler>:5432/postgres" \
--     -f supabase/seed_nueva_empresa.sql
--
-- Uso vía SQL Editor del dashboard (no soporta \i):
--   1. Reemplaza los placeholders <...> de las Partes A y B abajo y pégalas/corre.
--   2. Abre aparte supabase/migrations/20260711140100_mant_conceptos_seed.sql
--      y pégalo/corre completo (Parte C, ~450 INSERTs, ya es idempotente con
--      ON CONFLICT DO NOTHING).
-- ═════════════════════════════════════════════════════════════════════════════


-- ── Parte A — Identidad de la empresa (cfg.configuracion) ──────────────────────
-- Reemplaza los valores antes de ejecutar.

insert into cfg.configuracion (clave, valor) values
  ('org_nombre',       '<Nombre Completo de la Empresa>'),
  ('org_nombre_corto', '<Nombre Corto>'),
  ('org_subtitulo',    'Administración Residencial'),
  ('org_rfc',          '<RFC o vacío>'),
  ('org_direccion',    '<Dirección o vacío>'),
  ('org_telefono',     '<Teléfono o vacío>'),
  ('org_correo',       '<correo@empresa.com>'),
  ('org_logo_url',     ''),
  ('moneda',           'MXN'),
  ('app_version',      '1.0.0'),
  -- Colores del sidebar (opcional). Si se omiten, el Sidebar usa estos mismos
  -- valores por defecto (look actual de Balvanera: azul marino + dorado).
  ('color_sidebar_bg',           '#2d3660'),
  ('color_sidebar_acento',       '#C4A048'),
  ('color_sidebar_acento_claro', '#E8CA75')
on conflict (clave) do update set valor = excluded.valor;


-- ── Parte B — Primer usuario superadmin (cfg.usuarios) ──────────────────────────
-- Requisito previo (hazlo en el dashboard, no por SQL):
--   Authentication → Users → Add user → captura correo + contraseña
--   → copia el UUID generado y pégalo abajo en <UUID-copiado>.

insert into cfg.usuarios (id, nombre, rol, activo)
values ('<UUID-copiado>', '<Nombre del admin>', 'superadmin', true);


-- ── Parte C — Catálogo de Conceptos de Obra/Mantenimiento (opcional) ────────────
-- Reusa el seed genérico ya versionado en el repo (ctrl.mant_conceptos_categorias,
-- ctrl.mant_insumos, ctrl.mant_conceptos — ~450 filas, precios de referencia
-- Querétaro/Bajío 2025-2026, ajustables después desde /mantenimiento/conceptos).
-- Comenta esta línea si esta empresa no usará el módulo de Mantenimiento/CAPEX
-- o si prefieres capturar sus propios precios desde cero.

\i migrations/20260711140100_mant_conceptos_seed.sql

-- ═════════════════════════════════════════════════════════════════════════════
-- Todo lo demás (secciones, lotes, áreas, centros de costo, proveedores,
-- catálogos de golf/hípico, etc.) queda vacío a propósito: se captura desde
-- /catalogos y la operación normal del sistema.
-- ═════════════════════════════════════════════════════════════════════════════
