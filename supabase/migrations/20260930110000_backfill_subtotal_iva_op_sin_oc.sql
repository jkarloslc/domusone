-- OP sin OC y sin desglose: clasificación por tipo_gasto acordada 2026-09-30.
-- Grava 16% -> subtotal = monto/1.16. Exento (o con deducciones, se deja al monto
-- pleno) -> subtotal = monto, iva = 0. Nómina y rubros no listados quedan NULL
-- (Comparativo usa el monto tal cual). Idempotente: solo filas con subtotal NULL.
UPDATE comp.ordenes_pago
   SET subtotal = ROUND(monto / 1.16, 2),
       iva      = monto - ROUND(monto / 1.16, 2)
 WHERE subtotal IS NULL AND id_oc_fk IS NULL AND monto IS NOT NULL
   AND tipo_gasto IN (
     'Mantto. de Instalaciones e Infraestructura','Renta de Mobiliario y Equipo',
     'Servicios de Vigilancia','Pagos a Personal Externo','Publicidad y Utilitarios',
     'Telefonía / Internet','Desazolves','Asesoría');

UPDATE comp.ordenes_pago
   SET subtotal = monto, iva = 0
 WHERE subtotal IS NULL AND id_oc_fk IS NULL AND monto IS NOT NULL
   AND tipo_gasto IN (
     'Electricidad','Combustible','Seguros','Alimento para Caballos',
     'Pipas de Agua','Depósitos en Garantía (Fianzas)','Perimetrales');
