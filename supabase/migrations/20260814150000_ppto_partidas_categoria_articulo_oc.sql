-- Formaliza el gasto de OP con OC (tipo_gasto=null por diseño) que hoy caía
-- siempre en "Otros Gastos [Área]", atribuyéndolo a la categoría del artículo
-- realmente comprado (comp.articulos.categoria vía comp.ordenes_compra_det).
-- Ver lib/pptoOcCategoria.ts (commit 2227f04) — el código ya reparte este gasto
-- por categoría en cada carga de página; esta migración crea las partidas
-- específicas para que esa reclasificación tenga dónde mostrarse.
--
-- Se excluye a propósito la porción sin categoría (~$33,826.91 MXN — líneas de
-- OC sin artículo o cuyo artículo no tiene categoría en el catálogo): sigue
-- cayendo, correctamente, en el catch-all "Otros Gastos [Área]" de cada área.
--
-- 49 partidas nuevas, $543,228.05 MXN,
-- auditoría 2026-08-14 (ver memoria project_ppto_oc_categoria_articulo).

BEGIN;

INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_costo_fk, id_area_fk, orden, activo, fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  ('Construcción, Ferreteria y Pinturas [Operaciones Hospitality]', 'egreso', 7, 45, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Eventos', true, true),
  ('Limpieza y Suministros [Operaciones Hospitality]', 'egreso', 7, 45, 3, true, 'op_area', 'Limpieza y Suministros', 'Eventos', true, true),
  ('Construcción, Ferreteria y Pinturas [Admón. Golf]', 'egreso', 2, 39, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Golf', true, true),
  ('Jardineria [Admón. Golf]', 'egreso', 2, 39, 3, true, 'op_area', 'Jardineria', 'Golf', true, true),
  ('Limpieza y Suministros [Admón. Golf]', 'egreso', 2, 39, 3, true, 'op_area', 'Limpieza y Suministros', 'Golf', true, true),
  ('Papeleria [Admón. Golf]', 'egreso', 2, 39, 3, true, 'op_area', 'Papeleria', 'Golf', true, true),
  ('Agroquimicos [Campo de Golf]', 'egreso', 2, 23, 3, true, 'op_area', 'Agroquimicos', 'Golf', true, true),
  ('Construcción, Ferreteria y Pinturas [Campo de Golf]', 'egreso', 2, 23, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Golf', true, true),
  ('Construcción, Ferreteria y Pinturas [Casa Club]', 'egreso', 2, 24, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Golf', true, true),
  ('Limpieza y Suministros [Casa Club]', 'egreso', 2, 24, 3, true, 'op_area', 'Limpieza y Suministros', 'Golf', true, true),
  ('Refacciones [Casa Club]', 'egreso', 2, 24, 3, true, 'op_area', 'Refacciones', 'Golf', true, true),
  ('Construcción, Ferreteria y Pinturas [Cuadrilla]', 'egreso', 2, 43, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Golf', true, true),
  ('Jardineria [Cuadrilla]', 'egreso', 2, 43, 3, true, 'op_area', 'Jardineria', 'Golf', true, true),
  ('Refacciones [Cuadrilla]', 'egreso', 2, 43, 3, true, 'op_area', 'Refacciones', 'Golf', true, true),
  ('Construcción, Ferreteria y Pinturas [Tee de Practica]', 'egreso', 2, 44, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Golf', true, true),
  ('Construcción, Ferreteria y Pinturas [Admón. Hípico]', 'egreso', 3, 40, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Hípico', true, true),
  ('Limpieza y Suministros [Admón. Hípico]', 'egreso', 3, 40, 3, true, 'op_area', 'Limpieza y Suministros', 'Hípico', true, true),
  ('Alimento para caballos [Caballerizas]', 'egreso', 3, 25, 3, true, 'op_area', 'Alimento para caballos', 'Hípico', true, true),
  ('Construcción, Ferreteria y Pinturas [Caballerizas]', 'egreso', 3, 25, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Hípico', true, true),
  ('Refacciones [Caballerizas]', 'egreso', 3, 25, 3, true, 'op_area', 'Refacciones', 'Hípico', true, true),
  ('Construcción, Ferreteria y Pinturas [Paddocks]', 'egreso', 3, 29, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Hípico', true, true),
  ('Agroquimicos [Pistas]', 'egreso', 3, 26, 3, true, 'op_area', 'Agroquimicos', 'Hípico', true, true),
  ('Jardineria [Pistas]', 'egreso', 3, 26, 3, true, 'op_area', 'Jardineria', 'Hípico', true, true),
  ('Limpieza y Suministros [Acceso Zona Norte]', 'egreso', 1, 52, 3, true, 'op_area', 'Limpieza y Suministros', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Admón. Mantto Residencial]', 'egreso', 1, 21, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Limpieza y Suministros [Admón. Mantto Residencial]', 'egreso', 1, 21, 3, true, 'op_area', 'Limpieza y Suministros', 'Mantenimiento', true, true),
  ('Refacciones [Admón. Mantto Residencial]', 'egreso', 1, 21, 3, true, 'op_area', 'Refacciones', 'Mantenimiento', true, true),
  ('Agroquimicos [Mantto. Agaves]', 'egreso', 1, 1, 3, true, 'op_area', 'Agroquimicos', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. Agaves]', 'egreso', 1, 1, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Jardineria [Mantto. Agaves]', 'egreso', 1, 1, 3, true, 'op_area', 'Jardineria', 'Mantenimiento', true, true),
  ('Refacciones [Mantto. Agaves]', 'egreso', 1, 1, 3, true, 'op_area', 'Refacciones', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. Circuito Balvanera]', 'egreso', 1, 22, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Agroquimicos [Mantto. Fairway]', 'egreso', 1, 3, 3, true, 'op_area', 'Agroquimicos', 'Mantenimiento', true, true),
  ('Jardineria [Mantto. Fairway]', 'egreso', 1, 3, 3, true, 'op_area', 'Jardineria', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. Palermo Balvanera]', 'egreso', 1, 5, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Agroquimicos [Mantto. Palermo Soho]', 'egreso', 1, 8, 3, true, 'op_area', 'Agroquimicos', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. Palermo Soho]', 'egreso', 1, 8, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. Panorámica]', 'egreso', 1, 2, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Jardineria [Mantto. Privada Palermo]', 'egreso', 1, 7, 3, true, 'op_area', 'Jardineria', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. South Hill Fairway]', 'egreso', 1, 51, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. Villas Balvanera]', 'egreso', 1, 18, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Mantto. Windsor Court]', 'egreso', 1, 19, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Vigilancia]', 'egreso', 1, 36, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Mantenimiento', true, true),
  ('Limpieza y Suministros [Vigilancia]', 'egreso', 1, 36, 3, true, 'op_area', 'Limpieza y Suministros', 'Mantenimiento', true, true),
  ('Papeleria [Vigilancia]', 'egreso', 1, 36, 3, true, 'op_area', 'Papeleria', 'Mantenimiento', true, true),
  ('Construcción, Ferreteria y Pinturas [Casa 2 Cerro Pelón]', 'egreso', 5, 38, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Patron''s', true, true),
  ('Construcción, Ferreteria y Pinturas [Villa 7 B]', 'egreso', 5, 46, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Patron''s', true, true),
  ('Limpieza y Suministros [Villa 7 B]', 'egreso', 5, 46, 3, true, 'op_area', 'Limpieza y Suministros', 'Patron''s', true, true),
  ('Construcción, Ferreteria y Pinturas [Admon. Polo]', 'egreso', 4, 41, 3, true, 'op_area', 'Construcción, Ferreteria y Pinturas', 'Polo', true, true);

COMMIT;
