-- Agrega "Gas LP" como tipo de servicio en el catálogo (mismo patrón que CFE/Agua)

ALTER TABLE ctrl.servicios_catalogo DROP CONSTRAINT IF EXISTS servicios_catalogo_tipo_servicio_check;
ALTER TABLE ctrl.servicios_catalogo ADD CONSTRAINT servicios_catalogo_tipo_servicio_check CHECK (
  tipo_servicio IN ('CFE', 'Agua', 'Gas LP')
);
