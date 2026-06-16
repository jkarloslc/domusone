-- Convierte nombres de clasificacion a tipo oración (primera letra mayúscula, resto minúsculas)
UPDATE cfg.clasificacion
SET nombre = upper(left(lower(nombre), 1)) || substring(lower(nombre), 2)
WHERE nombre <> upper(left(lower(nombre), 1)) || substring(lower(nombre), 2);

-- Agrega "Condominio" si no existe
INSERT INTO cfg.clasificacion (nombre, activo)
SELECT 'Condominio', true
WHERE NOT EXISTS (
  SELECT 1 FROM cfg.clasificacion WHERE lower(nombre) = 'condominio'
);
