-- Permite DELETE en hip.ctrl_asignaciones para usuarios autenticados
-- (la tabla ya tiene RLS "FOR ALL" pero le faltaba el GRANT de tabla)
GRANT DELETE ON hip.ctrl_asignaciones TO authenticated;
