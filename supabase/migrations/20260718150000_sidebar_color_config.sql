-- Colores del sidebar configurables por proyecto (cfg.configuracion).
-- El Sidebar ya trae estos mismos valores como default en el código
-- (lib/ConfigContext.tsx), así que esta migración es opcional: solo hace
-- falta correrla (con otros valores) en los proyectos que quieran un color
-- distinto al azul marino + dorado de Balvanera.

insert into cfg.configuracion (clave, valor) values
  ('color_sidebar_bg',           '#2d3660'),
  ('color_sidebar_acento',       '#C4A048'),
  ('color_sidebar_acento_claro', '#E8CA75')
on conflict (clave) do nothing;
