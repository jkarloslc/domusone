-- =============================================================
-- Centro de Costo → Zona → Área
-- Solo los CC marcados con usa_zonas muestran el nivel Zona entre
-- CC y Área (hoy: Mantto. Fraccionamiento). Se edita en
-- Catálogos › Centros de Costo.
-- (Ingresos no necesita columna: el CI de cuotas con desglose por
--  secciones ya se identifica por agrupadores_ingreso.es_cuotas_fraccionamiento.)
-- =============================================================
ALTER TABLE cfg.centros_costo
  ADD COLUMN IF NOT EXISTS usa_zonas BOOLEAN NOT NULL DEFAULT false;

-- Marca inicial: CC cuyas áreas están asignadas a zonas en su mayoría
-- (Mantto. Fraccionamiento). Hípico tiene 1 área en zona y no se marca.
UPDATE cfg.centros_costo SET usa_zonas = true
WHERE id IN (
  SELECT a.id_centro_costo_fk
  FROM cfg.areas a JOIN cfg.rel_area_cuadrante r ON r.id_area = a.id
  GROUP BY a.id_centro_costo_fk
  HAVING count(DISTINCT a.id) >= 3
);
