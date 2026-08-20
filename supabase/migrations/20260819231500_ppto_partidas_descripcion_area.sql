-- Descripción de partidas = Tipo + Módulo + Área (egresos con área vinculada)
-- Reemplaza el cálculo de 20260819230000_ppto_partidas_descripcion_auto.sql

UPDATE ctrl.ppto_partidas p
SET descripcion = INITCAP(p.tipo) || ' ' || p.modulo
  || CASE WHEN p.tipo = 'egreso' AND p.id_area_fk IS NOT NULL
       THEN ' ' || (SELECT a.nombre FROM cfg.areas a WHERE a.id = p.id_area_fk)
       ELSE '' END
WHERE descripcion IS DISTINCT FROM (
  INITCAP(p.tipo) || ' ' || p.modulo
  || CASE WHEN p.tipo = 'egreso' AND p.id_area_fk IS NOT NULL
       THEN ' ' || (SELECT a.nombre FROM cfg.areas a WHERE a.id = p.id_area_fk)
       ELSE '' END
);
