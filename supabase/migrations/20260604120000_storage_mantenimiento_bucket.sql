-- Crea bucket 'mantenimiento' y habilita acceso público para uploads desde el cliente anon
-- Error: "new row violates row-level security policy" al subir imagen en modal de vehículos/maquinaria

INSERT INTO storage.buckets (id, name, public)
VALUES ('mantenimiento', 'mantenimiento', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Permitir SELECT (lectura pública)
DROP POLICY IF EXISTS "mantenimiento_select" ON storage.objects;
CREATE POLICY "mantenimiento_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mantenimiento');

-- Permitir INSERT (upload) desde anon y authenticated
DROP POLICY IF EXISTS "mantenimiento_insert" ON storage.objects;
CREATE POLICY "mantenimiento_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'mantenimiento');

-- Permitir UPDATE (upsert) desde anon y authenticated
DROP POLICY IF EXISTS "mantenimiento_update" ON storage.objects;
CREATE POLICY "mantenimiento_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'mantenimiento');

-- Permitir DELETE
DROP POLICY IF EXISTS "mantenimiento_delete" ON storage.objects;
CREATE POLICY "mantenimiento_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'mantenimiento');
