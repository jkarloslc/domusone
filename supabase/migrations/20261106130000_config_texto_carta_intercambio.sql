-- Texto base de las cartas de intercambio (editable en Configuración > Golf)
INSERT INTO cfg.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion) VALUES
  ('golf_intercambio_texto_carta',
   E'Por medio de la presente, Balvanera Golf, Polo & Country Club se complace en presentar a su distinguido socio y, en su caso, a sus acompañantes, quienes visitarán sus instalaciones en la fecha indicada.\n\nHacemos constar que el portador cuenta con los derechos plenos de socio activo de este club y que la presente carta tiene una vigencia de 30 días naturales a partir de su fecha de elaboración.\n\nAgradecemos de antemano las atenciones y cortesías que se brinden a nuestro asociado y quedamos a sus apreciables órdenes para cualquier intercambio recíproco.',
   'textarea', 'golf', 'Texto base de la carta de intercambio',
   'Texto que se precarga en cada carta nueva (se puede editar por carta). No afecta cartas ya guardadas.')
ON CONFLICT (clave) DO NOTHING;
