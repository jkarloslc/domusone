-- ═══════════════════════════════════════════════════════════════════
-- RLS para cfg.rol_tipos_op
-- La migración anterior creó la tabla y el GRANT, pero sin RLS + policy
-- Supabase devuelve set vacío cuando RLS está activo sin policy → el filtro no aplica
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE cfg.rol_tipos_op ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rol_tipos_op_select_authenticated"
  ON cfg.rol_tipos_op
  FOR SELECT
  USING (true);
