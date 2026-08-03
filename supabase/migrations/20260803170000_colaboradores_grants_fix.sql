-- Fix: cfg.colaboradores se creó sin GRANT explícito → "permission denied for table colaboradores"
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.colaboradores TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE cfg.colaboradores_id_seq TO authenticated;
