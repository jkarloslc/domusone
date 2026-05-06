-- Ficha Maestra: campos adicionales para eventos de hospitality
ALTER TABLE ctrl.eventos
  -- Resumen ejecutivo
  ADD COLUMN IF NOT EXISTS objetivo            TEXT,
  ADD COLUMN IF NOT EXISTS riesgos_operativos  TEXT,
  -- Infraestructura y montajes
  ADD COLUMN IF NOT EXISTS montaje_carpas      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_escenario   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_pista_baile BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_mesas_sillas BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_iluminacion BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_audio       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_pantallas   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_generador   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaje_notas       TEXT,
  -- Seguridad y control
  ADD COLUMN IF NOT EXISTS seg_guardias        TEXT,
  ADD COLUMN IF NOT EXISTS seg_control_accesos TEXT,
  ADD COLUMN IF NOT EXISTS seg_paramedicos     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS seg_ambulancia      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS seg_valet_parking   BOOLEAN DEFAULT false,
  -- Alimentos y bebidas
  ADD COLUMN IF NOT EXISTS ayb_banquetero          TEXT,
  ADD COLUMN IF NOT EXISTS ayb_tipo_servicio        TEXT,
  ADD COLUMN IF NOT EXISTS ayb_num_comensales       INT,
  ADD COLUMN IF NOT EXISTS ayb_barra_libre          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ayb_permisos_sanitarios  BOOLEAN DEFAULT false,
  -- Golf (condicional)
  ADD COLUMN IF NOT EXISTS golf_tipo_torneo   TEXT,
  ADD COLUMN IF NOT EXISTS golf_num_jugadores INT,
  ADD COLUMN IF NOT EXISTS golf_tee_times     TEXT,
  ADD COLUMN IF NOT EXISTS golf_caddies       INT,
  ADD COLUMN IF NOT EXISTS golf_carritos      INT,
  -- Ecuestre (condicional)
  ADD COLUMN IF NOT EXISTS hip_tipo_evento    TEXT,
  ADD COLUMN IF NOT EXISTS hip_num_caballos   INT,
  ADD COLUMN IF NOT EXISTS hip_caballerizas   TEXT,
  ADD COLUMN IF NOT EXISTS hip_veterinario    TEXT,
  ADD COLUMN IF NOT EXISTS hip_trailers       TEXT,
  -- Checklist operativo
  ADD COLUMN IF NOT EXISTS chk_contrato_firmado   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS chk_anticipo_pagado    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS chk_layout_autorizado  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS chk_montaje_concluido  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS chk_revision_final     BOOLEAN DEFAULT false,
  -- Reporte posterior
  ADD COLUMN IF NOT EXISTS post_incidencias  TEXT,
  ADD COLUMN IF NOT EXISTS post_danos        TEXT,
  ADD COLUMN IF NOT EXISTS post_evaluacion   TEXT,
  ADD COLUMN IF NOT EXISTS post_conclusion   TEXT;
