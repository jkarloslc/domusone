-- ── Tablas propias de Mantenimiento (Fraccionamiento) ────────────────────────
-- Vehículos y Maquinaria, Equipo y Herramienta, Combustible y Servicios.
-- Las tablas ACTUALES (equipos, herramientas, vales_combustible, servicios_*…)
-- se quedan intactas, ligadas a OP/Capex/Servicios y pasan a ser del lado Golf.
-- Las nuevas (sufijo _mantto) nacen VACÍAS y con sus PROPIAS relaciones:
-- cada FK interna apunta a la tabla _mantto correspondiente; los catálogos
-- compartidos (cfg.areas, cfg.centros_costo, cfg.marcas_vehiculos) y
-- comp.ordenes_pago se referencian igual que en las originales.
--
-- Se clonan: columnas, defaults, CHECK, UNIQUE/PK, índices, comentarios.
-- Cada columna con secuencia recibe una secuencia NUEVA (folios/ids arrancan en 1).
-- RLS: una política "<tabla>_all" solo para authenticated (sin anon).
-- GRANT: authenticated CRUD + service_role SELECT.

DO $mig$
DECLARE
  mapa  text[][] := ARRAY[
    ['cfg',  'equipos',                    'equipos_mantto'],
    ['cfg',  'herramientas',               'herramientas_mantto'],
    ['comp', 'combustible_movimientos',    'combustible_movimientos_mantto'],
    ['ctrl', 'bitacora_equipos',           'bitacora_equipos_mantto'],
    ['ctrl', 'bitacora_equipo_evidencias', 'bitacora_equipo_evidencias_mantto'],
    ['ctrl', 'bitacora_equipo_ops',        'bitacora_equipo_ops_mantto'],
    ['ctrl', 'bitacora_uso_equipos',       'bitacora_uso_equipos_mantto'],
    ['ctrl', 'vales_combustible',          'vales_combustible_mantto'],
    ['ctrl', 'cargas_combustible',         'cargas_combustible_mantto'],
    ['ctrl', 'prestamos_herramientas',     'prestamos_herramientas_mantto'],
    ['ctrl', 'mantenimiento_herramientas', 'mantenimiento_herramientas_mantto'],
    ['ctrl', 'servicios_catalogo',         'servicios_catalogo_mantto'],
    ['ctrl', 'servicios_puntos_conexion',  'servicios_puntos_conexion_mantto'],
    ['ctrl', 'servicios_registros',        'servicios_registros_mantto']
  ];
  i      int;
  sch    text;
  viejo  text;
  nuevo  text;
  r      record;
  def    text;
  j      int;
  seq    text;
BEGIN
  -- 1) Estructura + secuencias propias
  FOR i IN 1 .. array_length(mapa, 1) LOOP
    sch := mapa[i][1]; viejo := mapa[i][2]; nuevo := mapa[i][3];

    EXECUTE format(
      'CREATE TABLE %I.%I (LIKE %I.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING GENERATED INCLUDING IDENTITY INCLUDING COMMENTS)',
      sch, nuevo, sch, viejo);

    FOR r IN
      SELECT a.attname AS col
        FROM pg_attrdef d
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
       WHERE d.adrelid = format('%I.%I', sch, nuevo)::regclass
         AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%'
    LOOP
      seq := nuevo || '_' || r.col || '_seq';
      EXECUTE format('CREATE SEQUENCE %I.%I OWNED BY %I.%I.%I', sch, seq, sch, nuevo, r.col);
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT nextval(%L)',
                     sch, nuevo, r.col, format('%I.%I', sch, seq));
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO authenticated', sch, seq);
    END LOOP;
  END LOOP;

  -- 2) Llaves foráneas: se copian de la tabla original; las que apuntan a una
  --    tabla del módulo se redirigen a su equivalente _mantto.
  FOR i IN 1 .. array_length(mapa, 1) LOOP
    sch := mapa[i][1]; viejo := mapa[i][2]; nuevo := mapa[i][3];
    FOR r IN
      SELECT conname, pg_get_constraintdef(oid) AS d
        FROM pg_constraint
       WHERE conrelid = format('%I.%I', sch, viejo)::regclass AND contype = 'f'
    LOOP
      def := r.d;
      FOR j IN 1 .. array_length(mapa, 1) LOOP
        def := replace(def,
                       'REFERENCES ' || mapa[j][1] || '.' || mapa[j][2] || '(',
                       'REFERENCES ' || mapa[j][1] || '.' || mapa[j][3] || '(');
      END LOOP;
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', sch, nuevo, r.conname, def);
    END LOOP;
  END LOOP;

  -- 3) RLS + permisos
  FOR i IN 1 .. array_length(mapa, 1) LOOP
    sch := mapa[i][1]; nuevo := mapa[i][3];
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', sch, nuevo);
    EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
                   nuevo || '_all', sch, nuevo);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO authenticated', sch, nuevo);
    EXECUTE format('GRANT SELECT ON %I.%I TO service_role', sch, nuevo);
  END LOOP;
END
$mig$;
