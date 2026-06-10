-- RLS para golf.recibos_golf_pagos y hip.ctrl_pagos_formas
-- Ambas tablas se crearon en 20260505100000 sin políticas;
-- el insert desde CobrarCuotaModal falla con
-- "new row violates row level security policy".

-- ── Golf: recibos_golf_pagos ─────────────────────────────────
ALTER TABLE golf.recibos_golf_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recibos_golf_pagos_select" ON golf.recibos_golf_pagos;
CREATE POLICY "recibos_golf_pagos_select"
  ON golf.recibos_golf_pagos FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "recibos_golf_pagos_insert" ON golf.recibos_golf_pagos;
CREATE POLICY "recibos_golf_pagos_insert"
  ON golf.recibos_golf_pagos FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "recibos_golf_pagos_update" ON golf.recibos_golf_pagos;
CREATE POLICY "recibos_golf_pagos_update"
  ON golf.recibos_golf_pagos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "recibos_golf_pagos_delete" ON golf.recibos_golf_pagos;
CREATE POLICY "recibos_golf_pagos_delete"
  ON golf.recibos_golf_pagos FOR DELETE
  TO authenticated
  USING (true);

-- ── Hípico: ctrl_pagos_formas (mismo problema, misma migración) ──
ALTER TABLE hip.ctrl_pagos_formas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctrl_pagos_formas_select" ON hip.ctrl_pagos_formas;
CREATE POLICY "ctrl_pagos_formas_select"
  ON hip.ctrl_pagos_formas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ctrl_pagos_formas_insert" ON hip.ctrl_pagos_formas;
CREATE POLICY "ctrl_pagos_formas_insert"
  ON hip.ctrl_pagos_formas FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "ctrl_pagos_formas_update" ON hip.ctrl_pagos_formas;
CREATE POLICY "ctrl_pagos_formas_update"
  ON hip.ctrl_pagos_formas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ctrl_pagos_formas_delete" ON hip.ctrl_pagos_formas;
CREATE POLICY "ctrl_pagos_formas_delete"
  ON hip.ctrl_pagos_formas FOR DELETE
  TO authenticated
  USING (true);
