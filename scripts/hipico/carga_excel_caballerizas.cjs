// Genera la migración de carga inicial de caballerizas (Hípico) desde el Excel
// "Caballerizas_por_mes_v2.xlsx" (Tablas Master). Uso:
//   node scripts/hipico/carga_excel_caballerizas.cjs <excel> <salida.sql> [--dry]
// (ejecutar desde la raíz del repo; usa node_modules/xlsx)
// --dry: la migración termina con RAISE EXCEPTION (rollback) mostrando el reporte.
const path = require('path')
const fs = require('fs')
const X = require(path.join(process.env.DOMUS_ROOT || process.cwd(), 'node_modules', 'xlsx'))

const [excel, salida, flag] = process.argv.slice(2)
if (!excel || !salida) { console.error('uso: node carga_excel_caballerizas.cjs <excel> <salida.sql> [--dry]'); process.exit(1) }
const DRY = flag === '--dry'

// Nombre en el Excel → hip.cat_arrendatarios.id (verificado contra producción 2026-11-12)
const IDS = {
  'Alan Rodriguez': 7, 'Alvaro Gonzalez': 14, 'Fernanda Garay': 10, 'German Nava': 3,
  'Jaime García': 13, 'Mariana Estrada': 12, 'Miguel Chavez': 15, 'Ricardo Junquera': 5,
  'Rocio Yuren': 2, 'Saúl Corona': 6, 'Saúl Medina': 4, 'Sofia Flores': 11, 'Yunuen Vazquez': 9,
}
const NO_RENTA = new Set(['fomento', 'desafio', 'evento', 'training'])

const wb = X.readFile(excel)
const rows = X.utils.sheet_to_json(wb.Sheets['Tablas Master'], { header: 1, raw: true, defval: null })

// §1 Censo (primeras filas, antes de la sección 2)
const idx2 = rows.findIndex(r => typeof r[0] === 'string' && r[0].startsWith('2. Cargos'))
const cen = []
for (const r of rows.slice(0, idx2)) {
  if (IDS[r[0]] === undefined) continue
  if (typeof r[2] !== 'number') throw new Error(`Cuota no numérica para ${r[0]}`)
  for (let m = 0; m < 10; m++) {
    const v = r[3 + m]
    cen.push(`(${IDS[r[0]]},${m + 1},${typeof v === 'number' ? v : 0},${r[2]})`)
  }
}
if (cen.length !== 130) throw new Error(`Censo esperado 130 celdas, hay ${cen.length}`)

// §3 Depósitos
const idx3 = rows.findIndex(r => typeof r[0] === 'string' && r[0].startsWith('3. Tabla 3'))
const dep = []
for (const r of rows.slice(idx3 + 1)) {
  if (r[0] == null || r[0] === 'Fecha' || typeof r[1] !== 'number') continue
  const quien = String(r[2] ?? '').trim()
  if (NO_RENTA.has(quien)) continue
  if (IDS[quien] === undefined) {
    if (typeof r[2] === 'number') continue // fila de total
    throw new Error(`Arrendatario desconocido en depósitos: ${quien}`)
  }
  let f = r[0]
  if (typeof f === 'number') { const d = X.SSF.parse_date_code(f); f = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` }
  else { const [d, m, y] = String(f).split('/'); f = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` }
  dep.push(`('${f}'::date,${r[1]},${IDS[quien]})`)
}
if (dep.length !== 115) throw new Error(`Depósitos de renta esperados 115, hay ${dep.length}`)

const plantilla = fs.readFileSync(path.join(__dirname, 'carga_excel_caballerizas.template.sql'), 'utf8')
const sql = plantilla
  .replace('__DRY__', DRY ? 'true' : 'false')
  .replace('__CEN__', cen.join(',\n    '))
  .replace('__DEP__', dep.join(',\n    '))
fs.writeFileSync(salida, sql)
console.log(`OK ${salida} · censo ${cen.length} · depósitos ${dep.length} · dry=${DRY}`)
