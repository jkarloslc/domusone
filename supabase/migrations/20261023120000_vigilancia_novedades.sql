-- Módulo Vigilancia > Parte de Novedades (reemplaza el tablero de Monday)
-- Un parte por día (ctrl.vig_partes) con N novedades (ctrl.vig_novedades).
-- Cada novedad se liga a un lote y/o a una o varias ubicaciones del catálogo
-- propio de vigilancia (cfg.vig_ubicaciones), distinto de cfg.areas_comunes
-- (que responde al criterio de mantenimiento).
-- Esquema: ctrl / cfg (sin schema nuevo, ver feedback_no_new_supabase_schemas)

-- ── Catálogo: tipos de novedad ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cfg.vig_tipos_novedad (
  id                SERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL UNIQUE,
  clase             TEXT NOT NULL DEFAULT 'Incidencia'
                    CHECK (clase IN ('Rutina', 'Acceso', 'Incidencia')),
  genera_incidencia BOOLEAN NOT NULL DEFAULT FALSE,  -- sugiere "Escalar a Incidencia"
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Catálogo: ubicaciones de vigilancia ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cfg.vig_ubicaciones (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE,
  tipo       TEXT,    -- Caseta | Sección | Zona | Instalación | General
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Parte diario ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.vig_partes (
  id               SERIAL PRIMARY KEY,
  fecha            DATE NOT NULL UNIQUE,
  responsable      TEXT,                       -- quien reporta (usuario o "General 1" en histórico)
  supervisor       TEXT,
  destinatarios    TEXT,
  status           TEXT NOT NULL DEFAULT 'Borrador'
                   CHECK (status IN ('Borrador', 'Enviado/Cerrado')),
  resumen          TEXT,
  n_vehiculos_adv  INTEGER,
  n_empl_adv       INTEGER,
  n_empl_bitacora  INTEGER,
  enviado_at       TIMESTAMPTZ,
  captured_by      TEXT,
  captured_by_id   UUID,
  id_monday        BIGINT UNIQUE,              -- Item ID de Monday (importación idempotente)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ctrl.vig_parte_personal (
  id                SERIAL PRIMARY KEY,
  id_parte_fk       INTEGER NOT NULL REFERENCES ctrl.vig_partes(id) ON DELETE CASCADE,
  id_colaborador_fk INTEGER REFERENCES cfg.colaboradores(id),
  nombre            TEXT NOT NULL              -- copia del nombre al momento de captura
);
CREATE INDEX IF NOT EXISTS idx_vig_parte_personal_parte ON ctrl.vig_parte_personal(id_parte_fk);
CREATE INDEX IF NOT EXISTS idx_vig_parte_personal_colab ON ctrl.vig_parte_personal(id_colaborador_fk);

-- ── Novedades ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.vig_novedades (
  id                SERIAL PRIMARY KEY,
  id_parte_fk       INTEGER NOT NULL REFERENCES ctrl.vig_partes(id) ON DELETE CASCADE,
  turno             TEXT CHECK (turno IN ('Diurno', 'Mixto', 'Nocturno')),
  hora              TIME,
  id_tipo_fk        INTEGER REFERENCES cfg.vig_tipos_novedad(id),
  titulo            TEXT NOT NULL,
  descripcion       TEXT,
  accion_tomada     TEXT,
  resultado         TEXT CHECK (resultado IN ('Atendido', 'Sin Novedad', 'Pendiente', 'Escalado')),
  status            TEXT NOT NULL DEFAULT 'Abierto'
                    CHECK (status IN ('Abierto', 'En curso', 'Cerrado')),
  criticidad        TEXT NOT NULL DEFAULT 'Baja'
                    CHECK (criticidad IN ('Baja', 'Media', 'Alta', 'Crítica')),
  hora_salida       TIME,
  desc_salida       TEXT,
  id_lote_fk        INTEGER REFERENCES cat.lotes(id),
  id_incidencia_fk  INTEGER REFERENCES ctrl.incidencias(id) ON DELETE SET NULL,
  captured_by       TEXT,
  id_monday         BIGINT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vig_novedades_parte  ON ctrl.vig_novedades(id_parte_fk);
CREATE INDEX IF NOT EXISTS idx_vig_novedades_tipo   ON ctrl.vig_novedades(id_tipo_fk);
CREATE INDEX IF NOT EXISTS idx_vig_novedades_lote   ON ctrl.vig_novedades(id_lote_fk);
CREATE INDEX IF NOT EXISTS idx_vig_novedades_status ON ctrl.vig_novedades(status);

-- Una novedad puede abarcar varias ubicaciones (ej. "Agaves, Panorámica, St. George")
CREATE TABLE IF NOT EXISTS ctrl.vig_novedad_ubicaciones (
  id_novedad_fk   INTEGER NOT NULL REFERENCES ctrl.vig_novedades(id) ON DELETE CASCADE,
  id_ubicacion_fk INTEGER NOT NULL REFERENCES cfg.vig_ubicaciones(id),
  PRIMARY KEY (id_novedad_fk, id_ubicacion_fk)
);
CREATE INDEX IF NOT EXISTS idx_vig_nov_ubic_ubic ON ctrl.vig_novedad_ubicaciones(id_ubicacion_fk);

CREATE TABLE IF NOT EXISTS ctrl.vig_novedad_evidencias (
  id            SERIAL PRIMARY KEY,
  id_novedad_fk INTEGER NOT NULL REFERENCES ctrl.vig_novedades(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  url_origen    TEXT,                          -- URL original de Monday (trazabilidad de la migración)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vig_nov_evid_nov ON ctrl.vig_novedad_evidencias(id_novedad_fk);

-- Seguimiento: comentarios sobre el parte (y opcionalmente sobre una novedad)
CREATE TABLE IF NOT EXISTS ctrl.vig_seguimiento (
  id            SERIAL PRIMARY KEY,
  id_parte_fk   INTEGER NOT NULL REFERENCES ctrl.vig_partes(id) ON DELETE CASCADE,
  id_novedad_fk INTEGER REFERENCES ctrl.vig_novedades(id) ON DELETE CASCADE,
  usuario       TEXT,
  comentario    TEXT NOT NULL,
  id_monday     BIGINT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vig_seguimiento_parte ON ctrl.vig_seguimiento(id_parte_fk);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE cfg.vig_tipos_novedad          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cfg.vig_ubicaciones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vig_partes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vig_parte_personal        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vig_novedades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vig_novedad_ubicaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vig_novedad_evidencias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vig_seguimiento           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vig_tipos_novedad_all"        ON cfg.vig_tipos_novedad        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vig_ubicaciones_all"          ON cfg.vig_ubicaciones          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vig_partes_all"               ON ctrl.vig_partes              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vig_parte_personal_all"       ON ctrl.vig_parte_personal      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vig_novedades_all"            ON ctrl.vig_novedades           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vig_novedad_ubicaciones_all"  ON ctrl.vig_novedad_ubicaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vig_novedad_evidencias_all"   ON ctrl.vig_novedad_evidencias  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vig_seguimiento_all"          ON ctrl.vig_seguimiento         FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GRANTS explícitos (tablas nuevas requieren GRANT o el insert falla en silencio) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.vig_tipos_novedad        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.vig_ubicaciones          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vig_partes              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vig_parte_personal      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vig_novedades           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vig_novedad_ubicaciones TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vig_novedad_evidencias  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vig_seguimiento         TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.vig_tipos_novedad_id_seq        TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.vig_ubicaciones_id_seq          TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vig_partes_id_seq              TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vig_parte_personal_id_seq      TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vig_novedades_id_seq           TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vig_novedad_evidencias_id_seq  TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vig_seguimiento_id_seq         TO authenticated, service_role;

-- ── Semilla: tipos de novedad (normalizados desde Monday, 37 → 40 con clase) ─
INSERT INTO cfg.vig_tipos_novedad (nombre, clase, genera_incidencia) VALUES
  -- Rutina
  ('Apertura / Cierre',              'Rutina', FALSE),
  ('Recorrido',                      'Rutina', FALSE),
  ('Recorrido de Seguridad Pública', 'Rutina', FALSE),
  ('Dotación de Cajero',             'Rutina', FALSE),
  ('Recolección de Basura',          'Rutina', FALSE),
  ('Operativo',                      'Rutina', FALSE),
  -- Acceso
  ('Acceso / Control',               'Acceso', FALSE),
  ('CFE',                            'Acceso', FALSE),
  ('Ingreso de Caballo',             'Acceso', FALSE),
  ('Mudanza',                        'Acceso', FALSE),
  ('Notificación',                   'Acceso', FALSE),
  ('Investigación',                  'Acceso', FALSE),
  ('Nuevo Ingreso',                  'Acceso', FALSE),
  ('Salida Fuera de Horario',        'Acceso', FALSE),
  ('Salida de Leña',                 'Acceso', FALSE),
  ('Aterrizaje',                     'Acceso', FALSE),
  ('Evento',                         'Acceso', FALSE),
  -- Incidencia
  ('Activación de Alarma',           'Incidencia', FALSE),
  ('Persona Sospechosa',             'Incidencia', FALSE),
  ('Perro Suelto',                   'Incidencia', FALSE),
  ('Accidente',                      'Incidencia', FALSE),
  ('Apoyo a Residente',              'Incidencia', FALSE),
  ('Ruidos',                         'Incidencia', FALSE),
  ('Incendio',                       'Incidencia', TRUE),
  ('Robo',                           'Incidencia', TRUE),
  ('Seguridad Perimetral',           'Incidencia', TRUE),
  ('Fuga de Agua',                   'Incidencia', TRUE),
  ('Falla Eléctrica',                'Incidencia', TRUE),
  ('Luminarias',                     'Incidencia', TRUE),
  ('Árbol Caído',                    'Incidencia', TRUE),
  ('Inundación',                     'Incidencia', TRUE),
  ('Mantenimiento',                  'Incidencia', TRUE),
  ('Plumas',                         'Incidencia', TRUE),
  ('Internet',                       'Incidencia', TRUE),
  ('Cámaras',                        'Incidencia', TRUE),
  ('Otros',                          'Incidencia', FALSE)
ON CONFLICT (nombre) DO NOTHING;

-- ── Semilla: ubicaciones de vigilancia (normalizadas desde Monday) ─────────
INSERT INTO cfg.vig_ubicaciones (nombre, tipo) VALUES
  ('General', 'General'),
  ('Caseta Principal', 'Caseta'), ('Caseta Cordillera', 'Caseta'), ('Puerta de Proveedores', 'Caseta'),
  ('Oficinas', 'Instalación'), ('Estacionamiento', 'Instalación'), ('Cajero', 'Instalación'),
  ('Almacén', 'Instalación'), ('Casa Balvanera', 'Instalación'), ('Hacienda', 'Instalación'),
  ('Planta de Tratamiento', 'Instalación'), ('Pozos', 'Instalación'), ('Plaza Comercial Paseo Palermo', 'Instalación'),
  ('Hípico', 'Instalación'), ('Caballerizas', 'Instalación'), ('Canchas de Polo', 'Instalación'),
  ('Canchas de Fútbol', 'Instalación'), ('Patron''s', 'Instalación'),
  ('Campo de Golf', 'Zona'), ('Tee de Práctica', 'Zona'), ('Hoyo 19', 'Zona'), ('Hoyo de Tepetate', 'Zona'),
  ('Cordillera', 'Sección'), ('Villas Cordillera', 'Sección'), ('Cordillera II', 'Sección'),
  ('Agaves', 'Sección'), ('Circuito Agaves', 'Sección'),
  ('Panorámica', 'Sección'), ('Linderos Panorámica', 'Zona'),
  ('Aguada', 'Sección'), ('Alzada', 'Sección'),
  ('St. Andrew Old', 'Sección'), ('Windsor Court', 'Sección'),
  ('St. George', 'Sección'), ('Glorieta de St. George', 'Zona'),
  ('Fairway', 'Sección'), ('Camino Viejo', 'Zona'),
  ('Paseo Palermo', 'Sección'), ('Palermo Dolfina', 'Sección'), ('Palermo Balvanera', 'Sección'),
  ('Palermo Soho', 'Sección'), ('Privada Palermo', 'Sección'), ('Sección Palermo', 'Sección'),
  ('Fundadores', 'Sección'), ('Toscana', 'Sección'), ('Laurel', 'Sección'), ('Los Olivos', 'Sección'),
  ('Rambla', 'Sección'), ('Cerro Pelón', 'Zona'), ('Colindancia', 'Zona'), ('Avenida Principal', 'Zona'),
  ('Túneles', 'Zona'), ('Camino Real de Balvanera', 'Zona'), ('Circuito Balvanera', 'Zona'),
  ('Lago del Caballo', 'Zona'), ('Loma', 'Zona'), ('Milpas', 'Zona'), ('20 Hectáreas', 'Zona'),
  ('Rancho Guadalupe de Alba', 'Zona'), ('Anitas', 'Zona')
ON CONFLICT (nombre) DO NOTHING;
