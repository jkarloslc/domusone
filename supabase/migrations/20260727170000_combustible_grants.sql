-- Fix: ctrl.vales_combustible y ctrl.cargas_combustible se crearon sin GRANT
-- (20260508180000_combustible_tables.sql). Las cargas no se insertaban:
-- "permission denied for sequence cargas_combustible_id_seq".

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vales_combustible  TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vales_combustible_id_seq   TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.cargas_combustible TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.cargas_combustible_id_seq  TO authenticated, service_role;
