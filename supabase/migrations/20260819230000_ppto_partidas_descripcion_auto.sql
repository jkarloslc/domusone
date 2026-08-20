-- Homologa Descripción = Tipo + Módulo (auto-generado desde app/presupuestos/partidas/page.tsx)
UPDATE ctrl.ppto_partidas
SET descripcion = INITCAP(tipo) || ' ' || modulo
WHERE descripcion IS DISTINCT FROM (INITCAP(tipo) || ' ' || modulo);
