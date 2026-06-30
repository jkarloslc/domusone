-- Las OT generadas desde el Programa de Mantenimiento (general y Golf)
-- usan la jerarquía Cuadrante → Área → Área Común, pero ctrl.ordenes_trabajo
-- solo tenía Centro de Costo → Área → Frente (estructura legacy). Como esas
-- OT nunca traían id_frente_fk, quedaban invisibles para los filtros de
-- "Frente" del listado y perdían la ubicación real del programa.
-- Se agrega id_cuadrante_fk / id_area_comun_fk como alternativa moderna;
-- id_centro_costo_fk / id_frente_fk se conservan para OT capturadas a mano
-- con la estructura anterior.

ALTER TABLE ctrl.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS id_cuadrante_fk  INTEGER REFERENCES cfg.cuadrantes(id),
  ADD COLUMN IF NOT EXISTS id_area_comun_fk INTEGER REFERENCES cfg.areas_comunes(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_area_comun ON ctrl.ordenes_trabajo (id_area_comun_fk);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_cuadrante  ON ctrl.ordenes_trabajo (id_cuadrante_fk);
