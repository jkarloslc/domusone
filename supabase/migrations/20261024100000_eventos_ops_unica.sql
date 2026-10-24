-- Una OP solo puede estar vinculada a un evento (y una sola vez).
CREATE UNIQUE INDEX IF NOT EXISTS uq_eventos_ops_op ON ctrl.eventos_ops(id_op_fk);
