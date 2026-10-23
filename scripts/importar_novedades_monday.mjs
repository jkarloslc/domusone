// Importa el export de Monday "Parte de Novedades Vigilancia" a ctrl.vig_*
//
//   node scripts/importar_novedades_monday.mjs <archivo.xlsx>            # simulacro (no escribe)
//   node scripts/importar_novedades_monday.mjs <archivo.xlsx> --apply    # escribe en Supabase
//   MONDAY_COOKIE='...' node scripts/importar_novedades_monday.mjs --fotos   # migra fotos a Storage
//
// Requiere la migración 20261023120000_vigilancia_novedades.sql ya ejecutada (para --apply).
// Es idempotente: partes por fecha, novedades/comentarios por id_monday.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

// ── Env (.env.local) ─────────────────────────────────────────────────────────
for (const l of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ctrl = sb.schema('ctrl'), cfg = sb.schema('cfg'), cat = sb.schema('cat')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const FOTOS = args.includes('--fotos')
const file = args.find(a => a.endsWith('.xlsx'))

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

// ── Fotos: Monday → Storage (usa un token de API personal de Monday) ─────────
// Monday > avatar > Developers > My access tokens. El ID del archivo viene en la URL (resources/<id>/).
if (FOTOS) {
  const token = process.env.MONDAY_TOKEN
  if (!token) { console.error('Falta MONDAY_TOKEN (token de API personal de Monday)'); process.exit(1) }
  const gql = async ids => {
    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2025-04' },
      body: JSON.stringify({ query: `query { assets(ids: [${ids.join(',')}]) { id public_url } }` }),
    })
    const j = await r.json()
    if (j.errors || !j.data) throw new Error(JSON.stringify(j.errors ?? j).slice(0, 300))
    return new Map(j.data.assets.map(a => [String(a.id), a.public_url]))
  }
  const { data } = await ctrl.from('vig_novedad_evidencias').select('id, url').like('url', '%monday.com%').limit(6000)
  const pend = (data ?? []).map(e => ({ ...e, asset: e.url.match(/resources\/(\d+)\//)?.[1] })).filter(e => e.asset)
  console.log(`${pend.length} fotos pendientes de migrar`)
  let ok = 0, fail = 0
  const falla = (id, msg) => { fail++; if (fail <= 5) console.error('Falló', id, msg) }
  for (const lote of chunk(pend, 50)) {
    let urls
    try { urls = await gql([...new Set(lote.map(e => e.asset))]) } catch (e) { console.error('API Monday:', e.message); process.exit(1) }
    await Promise.all(lote.map(async ev => {
      try {
        const pub = urls.get(ev.asset); if (!pub) throw new Error('Archivo no encontrado en Monday')
        const r = await fetch(pub); if (r.status !== 200) throw new Error(`HTTP ${r.status}`)
        const buf = Buffer.from(await r.arrayBuffer())
        const ext = (ev.url.split('?')[0].split('.').pop() || 'jpg').toLowerCase()
        const path = `vigilancia-novedades/monday/${ev.id}_${ev.asset}.${ext}`
        const up = await sb.storage.from('domusone-files').upload(path, buf, { contentType: r.headers.get('content-type') ?? 'image/jpeg', upsert: true })
        if (up.error) throw up.error
        const url = sb.storage.from('domusone-files').getPublicUrl(path).data.publicUrl
        const { error } = await ctrl.from('vig_novedad_evidencias').update({ url, url_origen: ev.url }).eq('id', ev.id)
        if (error) throw error
        ok++
      } catch (e) { falla(ev.id, e.message) }
    }))
    if ((ok + fail) % 500 < 50) console.log(`  ${ok + fail}/${pend.length} (ok ${ok}, fallidas ${fail})`)
  }
  console.log(`Migradas ${ok}, fallidas ${fail}`)
  process.exit(0)
}

if (!file) { console.error('Uso: node scripts/importar_novedades_monday.mjs <archivo.xlsx> [--apply]'); process.exit(1) }

// ── Normalización de catálogos ───────────────────────────────────────────────
const TIPOS = {
  'cierre o apertura': 'Apertura / Cierre', 'acceso / control': 'Acceso / Control', 'sin especificar': 'Otros', 'otros': 'Otros',
  'cfe': 'CFE', 'recorrido': 'Recorrido', 'notificacion': 'Notificación', 'mantenimiento': 'Mantenimiento',
  'apoyo a residente': 'Apoyo a Residente', 'activacion de alarma': 'Activación de Alarma',
  'recorrido de seguridad publica': 'Recorrido de Seguridad Pública', 'fallas electricas': 'Falla Eléctrica',
  'persona sospechosa': 'Persona Sospechosa', 'incendio': 'Incendio', 'perro suelto': 'Perro Suelto',
  'dotacion de cajero': 'Dotación de Cajero', 'accidente': 'Accidente', 'luminarias': 'Luminarias',
  'fuga de agua': 'Fuga de Agua', 'ingreso de caballo': 'Ingreso de Caballo', 'mudanzas': 'Mudanza',
  'investigacion': 'Investigación', 'ruidos': 'Ruidos', 'robo': 'Robo', 'arbol caido': 'Árbol Caído', 'plumas': 'Plumas',
  'internet': 'Internet', 'recoleccion de basura': 'Recolección de Basura', 'inundacion': 'Inundación',
  'operativo': 'Operativo', 'evento': 'Evento', 'seg. perimetral': 'Seguridad Perimetral', 'camaras': 'Cámaras',
  'nuevo ingreso': 'Nuevo Ingreso', 'ssalida de lena': 'Salida de Leña', 'aterrizaje': 'Aterrizaje',
  'salida fuera de horario': 'Salida Fuera de Horario',
}
const tipoNombre = t => {
  const k = norm(t).replace('incendio', 'incendio')
  return TIPOS[k] ?? TIPOS[k.replace(/^incendi.*/, 'incendio')] ?? 'Otros'
}

// Reglas ordenadas [regex sobre texto normalizado, nombre del catálogo]
const UBIC_REGLAS = [
  [/planta|plata trat/, 'Planta de Tratamiento'], [/plaza comercial/, 'Plaza Comercial Paseo Palermo'],
  [/glorieta/, 'Glorieta de St. George'], [/linderos/, 'Linderos Panorámica'], [/villas cordillera/, 'Villas Cordillera'],
  [/villas san andrew/, 'St. Andrew Old'], [/caseta cordillera/, 'Caseta Cordillera'], [/caseta principal/, 'Caseta Principal'],
  [/proveedores|provedores/, 'Puerta de Proveedores'], [/slida cordillera|^cordillera$/, 'Cordillera'], [/cordil+ea ii|cordillera ii/, 'Cordillera II'],
  [/circuito agaves/, 'Circuito Agaves'], [/circuito (fairway|farway)|fairway|farway/, 'Fairway'], [/circuito balvanera|^circuito$/, 'Circuito Balvanera'],
  [/camino real/, 'Camino Real de Balvanera'], [/camino viejo/, 'Camino Viejo'], [/agaves/, 'Agaves'], [/panoramica|panoramica/, 'Panorámica'],
  [/aguada/, 'Aguada'], [/andrew/, 'St. Andrew Old'], [/st\.? george|san george/, 'St. George'], [/windsor/, 'Windsor Court'],
  [/hipico/, 'Hípico'], [/caballerizas/, 'Caballerizas'], [/polo/, 'Canchas de Polo'], [/patron/, "Patron's"],
  [/palermo dolfina/, 'Palermo Dolfina'], [/palermo balvanera/, 'Palermo Balvanera'], [/palermo soho/, 'Palermo Soho'],
  [/privada palermo/, 'Privada Palermo'], [/paseo palermo/, 'Paseo Palermo'], [/palermo/, 'Sección Palermo'],
  [/avenida principal/, 'Avenida Principal'], [/tunel/, 'Túneles'], [/alzada/, 'Alzada'], [/cajero/, 'Cajero'],
  [/tee de pr|te de pr|t de pr/, 'Tee de Práctica'], [/hoyo 19/, 'Hoyo 19'], [/hoyo de tepetate/, 'Hoyo de Tepetate'], [/campo de golf/, 'Campo de Golf'],
  [/cerro pelon/, 'Cerro Pelón'], [/fundadores/, 'Fundadores'], [/colindancia/, 'Colindancia'], [/toscana/, 'Toscana'], [/pozo/, 'Pozos'],
  [/laurel/, 'Laurel'], [/hacienda/, 'Hacienda'], [/rancho guadalupe/, 'Rancho Guadalupe de Alba'], [/anitas/, 'Anitas'],
  [/milpas/, 'Milpas'], [/20 hectareas/, '20 Hectáreas'], [/casa balvanera/, 'Casa Balvanera'], [/loma/, 'Loma'],
  [/lago del caballo/, 'Lago del Caballo'], [/olivos/, 'Los Olivos'], [/rambla/, 'Rambla'], [/almacen/, 'Almacén'],
  [/cachas de futbol|canchas de futbol/, 'Canchas de Fútbol'], [/^adm$|oficinas/, 'Oficinas'], [/estacionamiento/, 'Estacionamiento'],
  [/^general$/, 'General'], [/^cordillera/, 'Cordillera'],
]
const mapUbic = token => {
  const k = norm(token).replace(/\.$/, '')
  if (!k) return null
  for (const [re, nombre] of UBIC_REGLAS) if (re.test(k)) return nombre
  return undefined // no reconocida
}

// ── Utilidades de fecha/hora ─────────────────────────────────────────────────
const serialAISO = n => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }
const MESES_EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 }
const fechaDeNombre = name => {
  const m = norm(name).match(/(\d{1,2}) de (?:de )?([a-z]+) (?:del? )?(\d{4})/)
  if (!m || !MESES[m[2]]) return null
  return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}
const parseHora = v => {
  if (v === '' || v == null) return null
  if (typeof v === 'number') { const mins = Math.round((v % 1) * 1440); return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)
  if (!m) return null
  let h = Number(m[1]); const ap = m[3]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0
  return h > 23 ? null : `${String(h).padStart(2, '0')}:${m[2]}`
}
const parseCreatedAt = s => {
  const m = String(s).match(/(\d{1,2})\/([A-Za-z]+)\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i)
  if (!m || !MESES_EN[m[2].toLowerCase()]) return null
  let h = Number(m[4]); if (m[7].toUpperCase() === 'PM' && h < 12) h += 12; if (m[7].toUpperCase() === 'AM' && h === 12) h = 0
  return `${m[3]}-${String(MESES_EN[m[2].toLowerCase()]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[5]}:${m[6]}-06:00`
}
const resultado = v => {
  const k = norm(v); if (!k) return null
  if (k.includes('escalado')) return 'Escalado'; if (k.includes('pendiente')) return 'Pendiente'
  if (k.includes('atendido')) return 'Atendido'; if (k.includes('sin novedad')) return 'Sin Novedad'; return null
}
const criticidad = v => { const k = norm(v); return k.startsWith('critic') ? 'Crítica' : k === 'alta' ? 'Alta' : k === 'media' ? 'Media' : 'Baja' }
const turno = v => { const k = norm(v); return k.startsWith('di') ? 'Diurno' : k.startsWith('mix') ? 'Mixto' : k.startsWith('noc') ? 'Nocturno' : null }
const urls = v => String(v ?? '').split(',').map(s => s.trim()).filter(s => s.startsWith('http'))

// ── Lectura del Excel ────────────────────────────────────────────────────────
const wb = XLSX.readFile(file)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
const updates = wb.Sheets.updates ? XLSX.utils.sheet_to_json(wb.Sheets.updates, { header: 1, defval: '' }).slice(2) : []

const partes = new Map() // fecha -> parte fusionada
const subs = []
const idMondayAFecha = new Map()
let actual = null, descartadosSinFecha = 0, subsSinParte = 0
for (const r of rows) {
  const esMes = r[0] && /^[A-ZÁÉÍÓÚ]+ 20\d\d$/.test(String(r[0])) && !r[1]
  if (esMes || r[0] === 'Name' || r[0] === 'Subitems' || (!r[0] && !r[1])) continue
  if (r[0]) { // parte
    const fecha = typeof r[3] === 'number' ? serialAISO(r[3]) : fechaDeNombre(r[0])
    if (!fecha) { actual = null; descartadosSinFecha++; continue }
    actual = fecha
    if (r[17]) idMondayAFecha.set(String(r[17]), fecha)
    const estado = norm(r[7]).includes('cerrado') ? 'Enviado/Cerrado' : 'Borrador'
    const p = partes.get(fecha) ?? { fecha, personal: new Set(), resumen: [], status: estado, id_monday: r[17] ? Number(r[17]) : null }
    String(r[8]).split(',').map(s => s.trim()).filter(Boolean).forEach(n => p.personal.add(n))
    if (String(r[9]).trim()) p.resumen.push(String(r[9]).trim())
    p.responsable ??= String(r[4]).trim() || null
    p.supervisor ??= String(r[5]).trim() || null
    p.destinatarios ??= String(r[6]).trim() || null
    p.n_vehiculos_adv ??= r[10] === '' ? null : Number(r[10]); p.n_empl_adv ??= r[11] === '' ? null : Number(r[11]); p.n_empl_bitacora ??= r[12] === '' ? null : Number(r[12])
    if (estado === 'Enviado/Cerrado') p.status = estado
    partes.set(fecha, p)
  } else if (r[1]) { // novedad (subitem)
    if (!actual) { subsSinParte++; continue }
    subs.push({ fecha: actual, r })
  }
}

// ── Catálogos y lotes en BD ──────────────────────────────────────────────────
const { data: tiposDb, error: eT } = await cfg.from('vig_tipos_novedad').select('id, nombre')
const { data: ubicDb } = await cfg.from('vig_ubicaciones').select('id, nombre')
if (eT) console.warn('⚠ No se pudo leer cfg.vig_tipos_novedad (¿migración sin ejecutar?):', eT.message)
const tipoId = Object.fromEntries((tiposDb ?? []).map(t => [t.nombre, t.id]))
const ubicId = Object.fromEntries((ubicDb ?? []).map(u => [u.nombre, u.id]))
const { data: lotesDb } = await cat.from('lotes').select('id, cve_lote').limit(5000)
const lotePorClave = new Map()
for (const l of lotesDb ?? []) if (l.cve_lote && !/-000$/.test(l.cve_lote)) lotePorClave.set(norm(l.cve_lote), l.id)
const reLote = /\b([a-z0-9]{2,4}-\d{2,4})\b/gi
const buscaLote = txt => { for (const m of String(txt).matchAll(reLote)) { const id = lotePorClave.get(norm(m[1])); if (id) return id } return null }

const { data: colDb } = await cfg.from('colaboradores').select('id, nombre, apellido_paterno, apellido_materno').eq('puesto', 'Vigilancia')
const colPorNombre = new Map((colDb ?? []).map(c => [norm([c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ')), c.id]))

// ── Construcción de novedades ────────────────────────────────────────────────
const noReconocidas = new Map(), tiposDefault = new Map()
let conLote = 0, conUbic = 0, sinUbicNiLote = 0, nFotos = 0
const novedades = subs.map(({ fecha, r }) => {
  const tn = tipoNombre(r[4])
  if (!(norm(r[4]) in TIPOS) && !/incendi/.test(norm(r[4]))) tiposDefault.set(r[4], (tiposDefault.get(r[4]) ?? 0) + 1)
  let desc = String(r[5]).trim()
  const ubic = new Set(), extra = []
  for (const tok of String(r[6]).split(',')) {
    const n = mapUbic(tok)
    if (n) ubic.add(n); else if (n === undefined) { extra.push(tok.trim()); noReconocidas.set(tok.trim(), (noReconocidas.get(tok.trim()) ?? 0) + 1) }
  }
  if (extra.length) desc += `${desc ? '\n' : ''}[Ubicación original: ${extra.join(', ')}]`
  const id_lote_fk = buscaLote(`${r[1]} ${r[5]} ${r[6]}`)
  if (id_lote_fk) conLote++; if (ubic.size) conUbic++; if (!ubic.size && !id_lote_fk) sinUbicNiLote++
  const res = resultado(r[8])
  const status = ['Abierto', 'En curso', 'Cerrado'].find(s => norm(s) === norm(r[9])) ?? (res === 'Pendiente' ? 'En curso' : 'Cerrado')
  const fotos = [...urls(r[11]), ...urls(r[14])]; nFotos += fotos.length
  return {
    fecha, ubic: [...ubic], fotos,
    fila: {
      id_monday: r[15] ? Number(r[15]) : null, turno: turno(r[2]), hora: parseHora(r[3]), tipo: tn,
      titulo: String(r[1]).trim().slice(0, 300), descripcion: desc || null, accion_tomada: String(r[7]).trim() || null,
      resultado: res, status, criticidad: criticidad(r[10]), hora_salida: parseHora(r[12]), desc_salida: String(r[13]).trim() || null, id_lote_fk,
    },
  }
})

// ── Seguimiento (hoja updates) ───────────────────────────────────────────────
let sinParteUpdates = 0
const seguimiento = updates.filter(u => u[6] && u[9]).map(u => {
  const fecha = idMondayAFecha.get(String(u[0])) ?? fechaDeNombre(u[1])
  if (!fecha || !partes.has(fecha)) { sinParteUpdates++; return null }
  return { fecha, usuario: String(u[4]).trim() || null, comentario: String(u[6]).trim(), id_monday: Number(u[9]), created_at: parseCreatedAt(u[5]) }
}).filter(Boolean)

// ── Reporte ──────────────────────────────────────────────────────────────────
const rep = (t, v) => console.log(t.padEnd(46), v)
console.log(`\n=== ${APPLY ? 'APLICANDO' : 'SIMULACRO'} ===`)
rep('Partes (fecha única, fusionando duplicados)', partes.size)
rep('Partes descartados (sin fecha reconocible)', descartadosSinFecha)
rep('Personal de turno (nombres distintos)', new Set([...partes.values()].flatMap(p => [...p.personal])).size)
rep('Novedades', novedades.length)
rep('  con ubicación(es) reconocida(s)', conUbic)
rep('  con lote (clave cve_lote en el texto)', conLote)
rep('  sin ubicación ni lote', sinUbicNiLote)
rep('  tipos no mapeados (→ Otros)', [...tiposDefault.entries()].map(e => e.join('×')).join(', ') || 0)
rep('Fotos (URLs de Monday)', nFotos)
rep('Seguimientos importables / sin parte', `${seguimiento.length} / ${sinParteUpdates}`)
rep('Subitems sin parte', subsSinParte)
if (noReconocidas.size) console.log('Ubicaciones NO reconocidas (se conservan en la descripción):', [...noReconocidas.entries()].map(e => e.join('×')).join(' | '))
if (!APPLY) { console.log('\nSimulacro: no se escribió nada. Usa --apply para importar.'); process.exit(0) }
if (eT) process.exit(1)

// ── Escritura ────────────────────────────────────────────────────────────────
const faltaTipo = novedades.find(n => !tipoId[n.fila.tipo]); if (faltaTipo) { console.error('Tipo sin catálogo:', faltaTipo.fila.tipo); process.exit(1) }

const parteIds = {}
for (const lote of chunk([...partes.values()], 200)) {
  const { data, error } = await ctrl.from('vig_partes').upsert(lote.map(p => ({
    fecha: p.fecha, responsable: p.responsable, supervisor: p.supervisor, destinatarios: p.destinatarios, status: p.status,
    resumen: p.resumen.join('\n') || null, n_vehiculos_adv: p.n_vehiculos_adv, n_empl_adv: p.n_empl_adv, n_empl_bitacora: p.n_empl_bitacora,
    enviado_at: p.status === 'Enviado/Cerrado' ? `${p.fecha}T23:59:00-06:00` : null, captured_by: 'Importación Monday', id_monday: p.id_monday,
  })), { onConflict: 'fecha', ignoreDuplicates: true }).select('id, fecha')
  if (error) { console.error('partes:', error.message); process.exit(1) }
  data.forEach(d => (parteIds[d.fecha] = d.id))
}
// Partes que ya existían (ignoreDuplicates no los devuelve)
const { data: todos } = await ctrl.from('vig_partes').select('id, fecha').in('fecha', [...partes.keys()].slice(0, 1000))
;(todos ?? []).forEach(d => (parteIds[d.fecha] = d.id))
const nuevosPartes = new Set(Object.keys(parteIds)) // personal solo para partes sin personal aún
const { data: conPersonal } = await ctrl.from('vig_parte_personal').select('id_parte_fk').in('id_parte_fk', Object.values(parteIds)).limit(20000)
const yaTienen = new Set((conPersonal ?? []).map(x => x.id_parte_fk))
const personalRows = [...partes.values()].flatMap(p => yaTienen.has(parteIds[p.fecha]) ? [] :
  [...p.personal].map(n => ({ id_parte_fk: parteIds[p.fecha], nombre: n, id_colaborador_fk: colPorNombre.get(norm(n)) ?? null })))
for (const c of chunk(personalRows, 500)) { const { error } = await ctrl.from('vig_parte_personal').insert(c); if (error) { console.error('personal:', error.message); process.exit(1) } }
rep('Personal insertado', personalRows.length)

const { data: yaImp } = await ctrl.from('vig_novedades').select('id_monday').not('id_monday', 'is', null).limit(20000)
const importadas = new Set((yaImp ?? []).map(x => Number(x.id_monday)))
const pendientes = novedades.filter(n => !n.fila.id_monday || !importadas.has(n.fila.id_monday))
let insNov = 0
for (const c of chunk(pendientes, 150)) {
  const { data, error } = await ctrl.from('vig_novedades').insert(c.map(n => {
    const { tipo, ...f } = n.fila
    return { ...f, id_parte_fk: parteIds[n.fecha], id_tipo_fk: tipoId[tipo], captured_by: 'Importación Monday' }
  })).select('id, id_monday')
  if (error) { console.error('novedades:', error.message); process.exit(1) }
  const porMonday = new Map(data.map(d => [Number(d.id_monday), d.id]))
  const ub = [], ev = []
  c.forEach((n, i) => {
    const id = n.fila.id_monday ? porMonday.get(n.fila.id_monday) : data[i]?.id
    if (!id) return
    n.ubic.forEach(u => ubicId[u] && ub.push({ id_novedad_fk: id, id_ubicacion_fk: ubicId[u] }))
    n.fotos.forEach(url => ev.push({ id_novedad_fk: id, url, url_origen: url }))
  })
  if (ub.length) { const { error: e } = await ctrl.from('vig_novedad_ubicaciones').insert(ub); if (e) { console.error('ubicaciones:', e.message); process.exit(1) } }
  if (ev.length) { const { error: e } = await ctrl.from('vig_novedad_evidencias').insert(ev); if (e) { console.error('evidencias:', e.message); process.exit(1) } }
  insNov += data.length
}
rep('Novedades insertadas', insNov)

const { data: yaSeg } = await ctrl.from('vig_seguimiento').select('id_monday').not('id_monday', 'is', null).limit(20000)
const segImp = new Set((yaSeg ?? []).map(x => Number(x.id_monday)))
const segNuevos = seguimiento.filter(s => !segImp.has(s.id_monday)).map(s => ({ id_parte_fk: parteIds[s.fecha], usuario: s.usuario, comentario: s.comentario, id_monday: s.id_monday, ...(s.created_at ? { created_at: s.created_at } : {}) }))
if (segNuevos.length) { const { error } = await ctrl.from('vig_seguimiento').insert(segNuevos); if (error) { console.error('seguimiento:', error.message); process.exit(1) } }
rep('Seguimientos insertados', segNuevos.length)
console.log('\nListo. Las fotos siguen apuntando a Monday; para migrarlas a Storage usa --fotos con MONDAY_COOKIE.')
