-- ============================================================
-- Locales: vínculo opcional de un arrendatario con un socio del
-- catálogo de miembros (golf.cat_socios), para reutilizar sus datos
-- fiscales (golf.cat_socios_datos_fiscales) al facturar en vez de
-- capturarlos a mano cada vez.
--
-- Cuando el arrendatario tiene vínculo, el ticket POS generado desde
-- Locales (app/locales/cobranza/CobrarModal.tsx y page.tsx,
-- handleTicketPOS) marca golf.ctrl_ventas.id_socio_fk/es_socio con el
-- socio vinculado — el modal de facturar (abrirFacturarPOS, ya
-- existente) precarga el RFC/régimen fiscal/uso CFDI automáticamente,
-- mismo mecanismo que ya usan las ventas nativas de Golf.
--
-- Sin vínculo (la mayoría), el ticket queda igual que hoy — el
-- usuario sigue usando "Público en General" al facturar.
-- 2026-09-02
-- ============================================================

ALTER TABLE ctrl.loc_arrendatarios
  ADD COLUMN IF NOT EXISTS id_socio_fk INTEGER REFERENCES golf.cat_socios(id);
