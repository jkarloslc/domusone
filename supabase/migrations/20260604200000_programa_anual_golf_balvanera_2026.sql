-- =============================================================
-- PROGRAMA ANUAL DE MANTENIMIENTO — CAMPO DE GOLF BALVANERA 2026
-- Fuente: Resumen_Reportes_Balvanera_Nov2025_Mar2026.xlsx
-- Generado: 2026-06-04
-- =============================================================
-- ANTES DE EJECUTAR, obtener los IDs reales con:
--   SELECT id, nombre FROM cfg.centros_costo ORDER BY nombre;
--   SELECT id, nombre FROM cfg.areas       ORDER BY nombre;
--   SELECT id, nombre FROM cfg.frentes     ORDER BY nombre;
-- Sustituir los NULL de las variables DO $$ por los IDs correctos.
-- =============================================================

DO $$
DECLARE
  v_cc       INTEGER := NULL;  -- ← id_centro_costo Campo de Golf
  v_greens   INTEGER := NULL;  -- ← id área Greens
  v_fairways INTEGER := NULL;  -- ← id área Fairways / Rough / Bordos
  v_tees     INTEGER := NULL;  -- ← id área Mesas de Salida
  v_bunkers  INTEGER := NULL;  -- ← id área Trampas de Arena
  v_arbolado INTEGER := NULL;  -- ← id área Arbolado
  v_lago     INTEGER := NULL;  -- ← id área Lago / Hoyo 12
  v_general  INTEGER := NULL;  -- ← id área General / Campo completo
  v_resp     TEXT    := 'Superintendente de Cancha';
BEGIN

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 1 — JARDINERÍA: MANEJO DE GREENS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Control de Thatch — Groomer Greens',
  2026, 'Jardinería', 'Semanal', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Tratamiento semanal de thatch en todos los greens con máquina Groomer. '
  'Doble pasada (2×) en greens con acumulación alta. '
  'Jun–Ago (lluvias torrenciales): escalar a 3 pasadas/semana por crecimiento acelerado. '
  'Alternar dirección de corte para uniformidad superficial. '
  'Coordinar con Mataway (corte vertical) mensual durante temporada de lluvias.',
  true, 'programa_golf_2026'
),
(
  'Fertilización Iron Pro — Greens',
  2026, 'Jardinería', 'Quincenal', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Aplicación quincenal de Iron Pro para mantenimiento de color verde intenso en greens. '
  'Dosificación: 150–200 gr/15 lts agua. '
  'Jun–Ago (lluvias): mantener frecuencia — el hierro se lixivia con precipitaciones frecuentes. '
  'No mezclar con fungicidas cúpricos en el mismo tanque.',
  true, 'programa_golf_2026'
),
(
  'Topdressing Arena Fina Sílica — Greens',
  2026, 'Jardinería', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Aplicación mensual de arena fina/sílica en greens para nivelación, mejora de drenaje y control de thatch. '
  'Cantidad según condición visual de cada green (9 aplicaciones registradas en Nov 2025–Jun 2026). '
  'Incorporar con groomer o rastrillar uniformemente post-aplicación. '
  'Jun–Ago: confirmar que el drenaje base no esté saturado antes de agregar arena.',
  true, 'programa_golf_2026'
),
(
  'Fertilización Mayor Greens — Floranid Master / Sulfamin 45',
  2026, 'Jardinería', 'Mensual', 3,
  '2026-03-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Fertilización mayor en greens con alternancia mensual: '
  '(A) Floranid Master Twin Eagle: 150 kg/ha — fertilización premium de crecimiento. '
  '(B) Sulfamin 45: 150 kg/ha — fertilización + recuperación de áreas desgastadas. '
  'Jun–Ago (lluvias): preferir formulaciones de liberación lenta para reducir lixiviado. '
  'Ajustar dosis según análisis foliar o condición visual.',
  true, 'programa_golf_2026'
),
(
  'Tapones Pasto Bent — Hoyos 2 y 3 (Control Bermuda)',
  2026, 'Jardinería', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Relleno continuo de parches de Bermuda en greens H2 y H3 con tapones de Bent XTREME 7 del vivero. '
  'Problemática MUY ALTA: Bermuda invade y deforma superficie de putting. '
  'Proceso: remover Bermuda → preparar cama → insertar tapones → topdress arena → riego intensivo 14 días. '
  'Jun–Ago (lluvias): la Bermuda corre más agresivamente con calor+humedad — '
  'duplicar inspección; intervenir dentro de las 48 hrs de detectar nuevo parche.',
  true, 'programa_golf_2026'
),
(
  'Aireación / Aerificación — Greens',
  2026, 'Jardinería', 'Trimestral', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Aerificación de greens para descompactación, mejora de drenaje y prevención de capa negra (black layer). '
  'Hoyos prioritarios: 3, 7, 9, 17 (historial de exceso de humedad). '
  'Post-aerificación: arena sílica + Yeso si hay sodio + Aminoácidos Bio Turf para recuperación. '
  'ALERTA CAPA NEGRA: si se detecta olor a H₂S o raíces <3 cm de longitud, '
  'escalar a aerificación de emergencia fuera del programa trimestral.',
  true, 'programa_golf_2026'
);

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 2 — JARDINERÍA: FAIRWAYS, ROUGH Y MESAS DE SALIDA
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Fertilización Fairways / Rough — Sulfamin 45',
  2026, 'Jardinería', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_fairways, v_cc, v_resp,
  'Fertilización mensual de fairways y rough con Sulfamin 45 a 150 kg/ha. '
  'Complementar con DAP (Diammonium Phosphate) en áreas con baja densidad foliar. '
  'Jun–Ago (lluvias): dividir dosis en 2 aplicaciones quincenales para reducir lavado y pérdida por escorrentía.',
  true, 'programa_golf_2026'
),
(
  'Control Thatch — Fairways y Rough',
  2026, 'Jardinería', 'Quincenal', 1,
  '2026-01-01', '2026-12-31',
  v_fairways, v_cc, v_resp,
  'Tratamiento quincenal de thatch en fairways con Groomer o Mataway según nivel de acumulación. '
  'Mataway (corte vertical) cuando capa de thatch supera 1.5 cm. '
  'Jun–Ago (lluvias): escalar a semanal por crecimiento acelerado; '
  'aplicar Mataway mensual durante toda la temporada.',
  true, 'programa_golf_2026'
),
(
  'Recuperación Mesas de Salida — Hoyos 3, 5 y 12',
  2026, 'Jardinería', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_tees, v_cc, v_resp,
  'Proyecto continuo de recuperación de mesas de salida par-3 con desgaste muy alto (H3, H5, H12). '
  'Acciones mensuales: Sulfamin 45 (150 kg/ha) + tapones de pasto + rotación de posiciones de salida. '
  'Restricción de juego en zonas en recuperación cuando sea posible. '
  'Jun–Ago: suelo blando post-lluvia = daño acelerado por pisoteo — '
  'señalizar y restringir tees en recuperación activa.',
  true, 'programa_golf_2026'
);

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 3 — FUMIGACIÓN: CONTROL DE ENFERMEDADES FÚNGICAS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Control Fungicida Rotativo — Greens y Fairways',
  2026, 'Fumigación', 'Quincenal', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Programa de rotación fungicida para prevención de Rhizoctonia, Dollar Spot y otras enfermedades. '
  'Rotación de 5 productos (cambiar en cada aplicación para evitar resistencias): '
  '1) Tilt (Propiconazol): 25–50 ml/15 lts agua. '
  '2) Amistar (Azoxistrobina): 25–50 gr/bomba. '
  '3) Sportak (Procloraz): 25–50 ml/15 lts agua. '
  '4) Daconil 2787 (Clorotalonil): 100–150 gr/15 lts agua. '
  '5) Manzate 200 (Mancozeb): 150–200 gr/15 lts agua — especialista Rhizoctonia. '
  'JUN–AGO (lluvias torrenciales 3–4×/semana): ESCALAR A SEMANAL (cada 7–10 días). '
  'Aplicar preferentemente la mañana ANTES de lluvia pronosticada. '
  'Atención especial: bordos sombreados, hoyos 2 y 3 (poca luz solar).',
  true, 'programa_golf_2026'
),
(
  'Control Rhizoctonia Intensivo — Temporada Lluvias',
  2026, 'Fumigación', 'Mensual', 6,
  '2026-06-01', '2026-10-31',
  v_greens, v_cc, v_resp,
  'Control específico intensificado de Rhizoctonia solani durante temporada de lluvias. '
  'Condición de RIESGO MÁXIMO: temperatura >25°C + humedad alta + sombra = brote inminente. '
  'Síntomas: manchas café/amarillas irregulares, micelio blanco en bordes tempranos. '
  'PROTOCOLO JUN–AGO: '
  'Aplicar Manzate 200 (150–200 gr/15 lts) o Amistar (25–50 gr/bomba) cada 7–10 días. '
  'Rotar con Tilt o Sportak en cada segunda aplicación. '
  'Enfoque especial: bordos y greens sombreados (H2, H3); fairways de H7 y H17.',
  true, 'programa_golf_2026'
),
(
  'Control Dollar Spot (Sclerotinia) — Temporada Fría',
  2026, 'Fumigación', 'Mensual', 11,
  '2026-11-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Control de Dollar Spot (Sclerotinia homeocarpa) durante temporada fría-húmeda (Nov–Mar). '
  'Síntomas: manchas circulares color paja de 2–5 cm en greens. '
  'Rotación de productos: Quick Silver (4–4.5 ml/15 lts) → Daconil (100–150 gr/15 lts) → Sportak (30 ml/15 lts). '
  'Reducir nitrógeno foliar en picos de infección. '
  'Historial: activo en H1 y greens superiores, Dic 2025–Mar 2026.',
  true, 'programa_golf_2026'
),
(
  'Control Fairy Ring (Anillo de Hadas)',
  2026, 'Fumigación', 'Trimestral', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Control preventivo y curativo de Fairy Ring. Historial positivo: H9. '
  'Tratamiento curativo: Amistar (30 gr/15 lts) + Tilt (25 ml/15 lts) en mezcla. '
  'Complementar con perforación profunda y aplicación de Yuccah para mejorar penetración. '
  'Jun–Ago (lluvias): alta prevalencia — incrementar inspección visual a semanal.',
  true, 'programa_golf_2026'
),
(
  'Control Musgo y Pasto de Agua — Temporada Fría',
  2026, 'Fumigación', 'Mensual', 11,
  '2026-11-01', '2026-12-31',
  v_general, v_cc, v_resp,
  'Control de musgo y pasto de agua en greens, área de práctica y zonas sombreadas. '
  'Producto principal: Quick Silver (4–4.5 ml/15 lts agua). '
  'Alternativa: jabón potásico + Trimec Azul. '
  'Zonas prioritarias: H15 y área de práctica (historial Nov 2025–Feb 2026). '
  'Solución estructural complementaria: poda de árboles para aumentar entrada de luz solar.',
  true, 'programa_golf_2026'
);

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 4 — FUMIGACIÓN: CONTROL DE MALEZA
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Control Continuo Trébol — Banvel 12-24 (Fairways/Rough/Bordos)',
  2026, 'Fumigación', 'Semanal', 1,
  '2026-01-01', '2026-12-31',
  v_fairways, v_cc, v_resp,
  'Control continuo de trébol blanco/rojo en fairways, rough y bordos — aplicación más frecuente del programa. '
  'Producto: Banvel 12-24 (dicamba) — dosificación según área afectada. '
  'NO aplicar en greens ni tees. '
  'JUN–AGO (lluvias): el trébol se propaga agresivamente con calor+humedad — '
  'mantener programa semanal; ampliar cobertura a bordes de caminos y rough externo. '
  'Historial: 10+ menciones en el reporte — es la problemática más recurrente del campo.',
  true, 'programa_golf_2026'
),
(
  'Control Maleza Hoja Ancha — Trimec / Trimec Azul',
  2026, 'Fumigación', 'Quincenal', 1,
  '2026-01-01', '2026-12-31',
  v_fairways, v_cc, v_resp,
  'Control de maleza de hoja ancha en fairways, rough y bordos. '
  'Producto: Trimec / Trimec Azul — dosificación: 90 ml/15 lts agua. '
  'Aplicar en alternancia o combinación con Banvel 12-24 según tipo de maleza dominante. '
  'JUN–AGO (lluvias): aplicar cada 10 días (vs 14 días en temporada seca). '
  'No aplicar bajo lluvia activa ni inmediatamente antes de lluvia intensa.',
  true, 'programa_golf_2026'
),
(
  'Control Kikuyo — Greens y Área de Práctica',
  2026, 'Fumigación', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Control de invasión de pasto Kikuyo en greens y área de práctica. '
  'Historial: Quinclorac fue suspendido temporalmente — continuar con control MANUAL hasta nueva indicación agronómica. '
  'JUN–AGO (lluvias): el Kikuyo corre muy agresivo con calor+humedad. '
  'Remoción manual semanal en temporada de lluvias. '
  'Quinclorac: reanudar solo con autorización del agrónomo responsable.',
  true, 'programa_golf_2026'
),
(
  'Control Plantas Leñosas — Orillas y Mesas de Salida',
  2026, 'Fumigación', 'Trimestral', 1,
  '2026-01-01', '2026-12-31',
  v_arbolado, v_cc, v_resp,
  'Control de plantas leñosas y arbustos invasores en orillas de mesas de salida y bordos. '
  'Producto: Tordon XT — 150 ml/15 lts agua. Aplicación dirigida con pincel en plantas individuales. '
  'Precaución extrema: no contactar pasto deseable ni árboles ornamentales. '
  'Jun–Ago (lluvias): crecimiento acelerado — inspección mensual para detectar rebrotes.',
  true, 'programa_golf_2026'
);

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 5 — FUMIGACIÓN: CONTROL DE PLAGAS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Control Gallina Ciega — Allectus 3G (Hoyos 7 y 18)',
  2026, 'Fumigación', 'Trimestral', 5,
  '2026-05-01', '2026-10-31',
  v_general, v_cc, v_resp,
  'Control de gallina ciega (Phyllophaga spp.) en hoyos 7 y 18. '
  'Producto: Allectus 3G (imidacloprid + bifentrina) granulado — 3–5 gr/m². '
  'Aplicar con esparcidor granulado; incorporar con riego inmediato post-aplicación. '
  'JUN–AGO (lluvias): PICO DE ACTIVIDAD — adultos ovipositan en suelo húmedo. '
  'ESCALAR A MENSUAL de Jun a Sep. '
  'Señal de daño: manchas café/muertas que se levantan como tapete. '
  'Primera aplicación preventiva en mayo antes del inicio de lluvias.',
  true, 'programa_golf_2026'
),
(
  'Control Gusano Cogollero — Sevin 80',
  2026, 'Fumigación', 'Mensual', 5,
  '2026-05-01', '2026-10-31',
  v_general, v_cc, v_resp,
  'Control de gusano cogollero (Spodoptera frugiperda) y orugas defoliadoras. '
  'Producto: Sevin 80 (carbarilo) — 100 gr/15 lts agua. '
  'JUN–AGO (lluvias): los adultos (palomillas) aumentan actividad con humedad alta. '
  'Monitoreo semanal al amanecer: buscar orugas enrolladas en pasto. '
  'Aplicar al detectar daño o presencia de adultos. '
  'Alternativa para infestaciones severas: Decis Forte.',
  true, 'programa_golf_2026'
),
(
  'Control Mosquitos y Larvas — Lago Hoyo 12',
  2026, 'Fumigación', 'Semanal', 2,
  '2026-02-01', '2026-11-30',
  v_lago, v_cc, v_resp,
  'Control de mosquitos y larvas acuáticas en lago del hoyo 12. '
  'Tratamiento: Cloro (hipoclorito) mínimo 3 ppm + insecticida en superficie. '
  'Frecuencia base: 2–3 aplicaciones/semana en picos. '
  'JUN–AGO (lluvias): ALERTA MÁXIMA — nivel del lago sube, hay estancamientos. '
  'Incrementar a 3 aplicaciones/semana mínimo. '
  'Monitorear turbidez — el cloro se consume más rápido con agua nueva por escorrentía. '
  'Complemento biológico recomendado: BTi (Bacillus thuringiensis israelensis) en temporada de lluvias.',
  true, 'programa_golf_2026'
),
(
  'Control General de Insectos — Hormigas y Plagas Secundarias',
  2026, 'Fumigación', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_general, v_cc, v_resp,
  'Control preventivo-curativo de plagas secundarias: hormigas, chicharritas, nematodos. '
  'Productos según plaga: Decis Forte, Confidor, Sevin 80. '
  'Zonas prioritarias para hormigas: H10 y área de práctica. '
  'Registrar plaga, hoyo, área y producto en cada intervención. '
  'Jun–Ago: los insectos buscan zonas altas al inundarse — incrementar inspección en bordos.',
  true, 'programa_golf_2026'
);

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 6 — JARDINERÍA: ENMIENDAS Y MEJORAMIENTO DE SUELO
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Aplicación Yeso (Gypsum) — Zonas de Drenaje Problemático',
  2026, 'Jardinería', 'Trimestral', 1,
  '2026-01-01', '2026-12-31',
  v_general, v_cc, v_resp,
  'Aplicación de yeso agrícola para mejora de drenaje y reducción de suelo sódico. '
  'Dosificación: 150 kg/ha en zonas afectadas. '
  'Hoyos prioritarios: 3, 7, 9, 17 (historial de exceso de humedad y riesgo de capa negra). '
  'JUN–AGO (lluvias): aplicar UNA VEZ antes del inicio de lluvias (fin de mayo). '
  'Segunda aplicación si persiste compactación o se detecta olor a H₂S (indicador de capa negra). '
  'Incorporar con aerificación cuando sea posible para mayor penetración.',
  true, 'programa_golf_2026'
),
(
  'Tratamiento Zonas Hidrófobas — Yuccah',
  2026, 'Jardinería', 'Mensual', 4,
  '2026-04-01', '2026-10-31',
  v_greens, v_cc, v_resp,
  'Tratamiento de zonas hidrófobas (repelentes al agua) con humectante Yuccah. '
  'Dosificación: 250 ml/15 lts agua. H15 como zona prioritaria históricamente identificada. '
  'PARADOJA EN LLUVIAS: las zonas hidrófobas PUEDEN PERSISTIR aunque llueva — '
  'el agua corre superficialmente sin penetrar. Inspeccionar específicamente. '
  'Verificar penetración con prueba de infiltración (verter agua y medir velocidad de absorción).',
  true, 'programa_golf_2026'
),
(
  'Mejoramiento de Suelo — Aminoácidos Bio Turf Organics',
  2026, 'Jardinería', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Aplicación mensual de bioestimulante Aminoácidos Bio Turf Organics para acondicionamiento de suelo. '
  'Dosificación: 150 gr/15 lts agua. '
  'Aplicar post-aerificación para aprovechar canales de aireación y maximizar absorción. '
  'Combinar con Yuccah para mejor penetración radical. '
  'Jun–Ago: los aminoácidos refuerzan raíces bajo estrés por encharcamiento intermitente.',
  true, 'programa_golf_2026'
);

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 7 — OBRA CIVIL E INFRAESTRUCTURA
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Reparación Bunkers — Membranas y Geotextil',
  2026, 'Obra Civil', 'Semestral', 1,
  '2026-01-01', '2026-12-31',
  v_bunkers, v_cc, v_resp,
  'Revisión semestral y reparación de membranas/geotextil en trampas de arena. '
  'Hoyos con daño confirmado: 7, 12 y 18 (membranas expuestas, piedra volcánica desplazada). '
  'Proceso: inspección completa → evaluación de erosión → reparación de membrana → '
  'reposición de piedra volcánica → renivelación de arena. '
  'Jun–Ago (lluvias): los bunkers son vulnerables a erosión por escorrentía — '
  'inspección adicional post-lluvia torrencial (>20 mm en <2 hrs).',
  true, 'programa_golf_2026'
),
(
  'Revisión y Mantenimiento Sistema de Riego',
  2026, 'Obra Civil', 'Semestral', 1,
  '2026-01-01', '2026-12-31',
  v_general, v_cc, v_resp,
  'Revisión integral del sistema de riego: aspersores, válvulas, bomba y red de tuberías. '
  'Hoyos con historial de fallas: 2, 8–16, 14 (bombas y tuberías, Nov 2025–Feb 2026). '
  'Actividades: prueba de cobertura, reparación de cabezales, ajuste de presión, '
  'lubricación de válvulas y revisión de tarjetas de control. '
  'ANTES DE JUN (fin de mayo): reducir programación de riego al mínimo preventivo. '
  'Calibrar interrupción automática en días de lluvia (sensor o protocolo manual).',
  true, 'programa_golf_2026'
),
(
  'Poda Selectiva Arbolado — Apertura de Ventanas de Luz',
  2026, 'Jardinería', 'Trimestral', 1,
  '2026-01-01', '2026-12-31',
  v_arbolado, v_cc, v_resp,
  'Poda selectiva de árboles para abrir ventanas de luz y mejorar condición del pasto. '
  'Hoyos prioritarios: 2 y 3 (sombra excesiva contribuye a Rhizoctonia y musgo). '
  'H16: magnolias con muérdago (Viscum) — remoción manual + tratamiento químico del tocón. '
  'Poda de formación; NO despunte radical en especies ornamentales maduras. '
  'Jun–Ago: crecimiento acelerado — evaluar si se requiere poda correctiva adicional.',
  true, 'programa_golf_2026'
),
(
  'Mantenimiento Calidad Agua — Lago Hoyo 12',
  2026, 'Otro', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_lago, v_cc, v_resp,
  'Mantenimiento integral de calidad de agua del lago H12. '
  'Monitoreo mensual: nivel, turbidez, pH y cloro libre (mínimo 3 ppm). '
  'Control de algas: algicida o sulfato de cobre si se detecta proliferación. '
  'JUN–AGO (lluvias): el lago recibe escorrentía con herbicidas y nutrientes de fairways. '
  'Turbidez alta por sedimentos: dejar sedimentar antes de clorar. '
  'Riesgo de desbordamiento: revisar nivel y limpieza de canal de salida mensualmente.',
  true, 'programa_golf_2026'
);

-- ═══════════════════════════════════════════════════════════════
-- BLOQUE 8 — TEMPORADA DE LLUVIAS: PROGRAMAS ESPECIALES JUN–AGO
-- ═══════════════════════════════════════════════════════════════
-- Contexto: lluvias torrenciales 3–4 veces/semana + temperatura alta.
-- Estos programas complementan y refuerzan los anteriores durante el período crítico.

INSERT INTO ctrl.programas_mantenimiento
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio,
   fecha_inicio, fecha_fin,
   id_area_fk, id_centro_costo_fk,
   responsable, descripcion, activo, created_by)
VALUES

(
  'Protocolo Drenaje Emergente — Temporada Lluvias (Jun–Ago)',
  2026, 'Jardinería', 'Semanal', 6,
  '2026-06-01', '2026-08-31',
  v_general, v_cc, v_resp,
  'Protocolo de inspección y acción rápida para gestión de drenaje con lluvias torrenciales. '
  'HOYOS CRÍTICOS: 3, 7, 9 y 17 — inspección diaria post-lluvia. '
  'Acciones por evento de lluvia: '
  '1) Inspección visual de encharcamientos (0–2 hrs post-lluvia). '
  '2) Habilitación de canales de drenaje si hay bloqueos. '
  '3) Registro de duración y hoyo afectado. '
  '4) Si encharcamiento >4 hrs: aerificación emergente + Yeso (150 kg/ha). '
  '5) ALERTA CAPA NEGRA: olor a H₂S o raíces <3 cm → aerificación profunda inmediata + consulta agronómica.',
  true, 'programa_golf_2026'
),
(
  'Monitoreo y Control Poa Annua — Temporada Lluvias',
  2026, 'Jardinería', 'Mensual', 5,
  '2026-05-01', '2026-09-30',
  v_greens, v_cc, v_resp,
  'Control de Poa annua en greens — especialmente mitad superior del campo (activo desde mayo 2026, excepto H4). '
  'Estrategia preventiva: manejo estricto de riego (no irrigar en exceso), '
  'evitar cortes muy bajos, mantener nitrógeno moderado. '
  'JUN–AGO (lluvias): la Poa prolifera con suelo constantemente húmedo. '
  'Control cultural como primera línea. Herbicidas selectivos en greens solo con autorización agronómica.',
  true, 'programa_golf_2026'
),
(
  'Corte Vertical Mataway — Intensificación Temporada Lluvias',
  2026, 'Jardinería', 'Mensual', 6,
  '2026-06-01', '2026-08-31',
  v_greens, v_cc, v_resp,
  'Tratamiento mensual con Mataway (corte vertical) en greens durante temporada de lluvias. '
  'El crecimiento acelerado por calor+lluvia incrementa la acumulación de thatch. '
  'El corte vertical mejora la penetración de fungicidas y fertilizantes. '
  'Complementar con topdressing de arena fina post-Mataway. '
  'Programar 48–72 hrs antes de una ventana seca pronosticada para recuperación.',
  true, 'programa_golf_2026'
),
(
  'Recuperación Post-Torneo — Greens',
  2026, 'Jardinería', 'Mensual', 1,
  '2026-01-01', '2026-12-31',
  v_greens, v_cc, v_resp,
  'Protocolo de recuperación de greens dañados por torneos (marcas de pintura, pisoteo intenso). '
  'Historial: marcas de pintura sintética en todos los greens post-torneo. '
  'PREVENCIÓN: exigir uso de pintura vegetal, talco o harina en lugar de pinturas sintéticas. '
  'RECUPERACIÓN: Iron Pro + fertilización localizada + riego de recuperación 14 días. '
  'Aplicar según calendario de torneos del club.',
  true, 'programa_golf_2026'
);

END $$;
