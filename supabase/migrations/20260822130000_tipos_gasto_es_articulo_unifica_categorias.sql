-- Unifica CATEGORIAS_ART (categorías de artículo, hardcodeadas en
-- app/compras/types.tsx) dentro de cfg.tipos_gasto — mismo catálogo, misma
-- cascada de renombres, en vez de dos listas mantenidas por separado que
-- solo funcionan juntas cuando alguien escribe el mismo texto exacto en
-- ambas. Bug real detectado: 2 artículos de garrafón de agua categorizados
-- como "Limpieza y Suministros" (herencia de antes de que "Agua en
-- Garrafón" existiera como categoría) — si una OC de esos artículos
-- generara una OP sin tipo_gasto capturado a mano, el gasto real se
-- reatribuiría a la partida equivocada.
--
-- Columna nueva `es_articulo`: marca qué filas de cfg.tipos_gasto también
-- deben ofrecerse como categoría de artículo en /compras/articulos (no
-- todos los tipos de gasto tienen sentido como categoría de un artículo
-- físico — Nómina Quincenal, IMSS, ISR, etc. quedan fuera).

BEGIN;

ALTER TABLE cfg.tipos_gasto ADD COLUMN IF NOT EXISTS es_articulo BOOLEAN NOT NULL DEFAULT false;

-- Ya existían en cfg.tipos_gasto (con la clasificación de OP) y también
-- aplican como categoría de artículo.
UPDATE cfg.tipos_gasto SET es_articulo = true
WHERE nombre IN ('Agua en Garrafón', 'Alimento para Caballos');

-- Las 8 restantes de CATEGORIAS_ART no existían en cfg.tipos_gasto — se
-- insertan con el MISMO texto que ya está grabado en ctrl.ppto_partidas.
-- tipo_gasto (via lib/pptoOcCategoria.ts) para no romper el matching ya
-- funcionando; no se "corrige" la ortografía de las que ya tienen partidas.
INSERT INTO cfg.tipos_gasto (nombre, activo, orden, es_articulo) VALUES
  ('Agroquimicos', true, 100, true),
  ('Construcción, Ferreteria y Pinturas', true, 100, true),
  ('Jardineria', true, 100, true),
  ('Limpieza y Suministros', true, 100, true),
  ('Miscelaneos', true, 100, true),
  ('Papeleria', true, 100, true),
  ('Refacciones', true, 100, true),
  ('Servicios', true, 100, true)
ON CONFLICT (nombre) DO UPDATE SET es_articulo = true;

-- Corrige los 2 artículos de garrafón de agua mal categorizados.
UPDATE comp.articulos
SET categoria = 'Agua en Garrafón'
WHERE categoria = 'Limpieza y Suministros'
  AND (nombre ILIKE '%garrafon%' OR nombre ILIKE '%garrafón%');

COMMIT;
