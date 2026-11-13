// Lectura del Excel de nómina BPCC (semanal "2610 Nomina BPCC P44.xlsx" /
// quincenal "2610 Quincena 20 BPCC.xlsx") para HR › Nómina.
//
// Solo se usa la hoja BPCC: un renglón por colaborador con su número, nombre,
// "CENTRO DE COSTOS" (texto libre, informativo — el Área real sale de
// cfg.colaboradores), TOTAL PERCEPCIONES y el neto (semanal: TOTAL APAGAR;
// quincenal: NETO A PAGAR).
//
// Periodo → mes (mismo criterio del tablero "Nómina BPCC 2026"):
//  - Semana ISO n (lun–dom; sem 1 de 2026 = 29-dic-2025) → mes de su jueves
//    (mayoría de días). Oct-2026 = semanas 40–44.
//  - Quincena n → mes ceil(n/2); 1–15 o 16–fin de mes.
import * as XLSX from 'xlsx'

export type TipoNomina = 'Semanal' | 'Quincenal'

export type RenglonNomina = {
  no_empleado: string        // sin ceros a la izquierda
  nombre: string
  cc_archivo: string
  percepciones: number
  neto: number
}

export type NominaLeida = {
  tipo: TipoNomina
  anio: number
  periodo: number
  fecha_inicio: string       // YYYY-MM-DD
  fecha_fin: string
  mes: string                // YYYY-MM-01
  renglones: RenglonNomina[]
  total_percepciones: number
  total_neto: number
  avisos: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => d.toISOString().slice(0, 10)
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
const num = (v: unknown) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''))
  return isFinite(n) ? n : 0
}
export const normNoEmpleado = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '')

/** Lunes de la semana ISO `semana` del año ISO `anio` (UTC). */
export function lunesSemanaISO(anio: number, semana: number): Date {
  const ene4 = new Date(Date.UTC(anio, 0, 4))
  const dow = (ene4.getUTCDay() + 6) % 7          // 0 = lunes
  const lunes1 = new Date(ene4.getTime() - dow * 86400000)
  return new Date(lunes1.getTime() + (semana - 1) * 7 * 86400000)
}

export function periodoFechas(tipo: TipoNomina, anio: number, periodo: number) {
  if (tipo === 'Semanal') {
    const ini = lunesSemanaISO(anio, periodo)
    const fin = new Date(ini.getTime() + 6 * 86400000)
    const jue = new Date(ini.getTime() + 3 * 86400000)
    const mes = `${jue.getUTCFullYear()}-${String(jue.getUTCMonth() + 1).padStart(2, '0')}-01`
    return { fecha_inicio: iso(ini), fecha_fin: iso(fin), mes }
  }
  const m = Math.ceil(periodo / 2)                // 1..12
  const primera = periodo % 2 === 1
  const ini = new Date(Date.UTC(anio, m - 1, primera ? 1 : 16))
  const fin = primera ? new Date(Date.UTC(anio, m - 1, 15)) : new Date(Date.UTC(anio, m, 0))
  return { fecha_inicio: iso(ini), fecha_fin: iso(fin), mes: `${anio}-${String(m).padStart(2, '0')}-01` }
}

/** Último día del mes de `mes` (YYYY-MM-01). */
export function finDeMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return iso(new Date(Date.UTC(y, m, 0)))
}

/** Tipo / periodo / año a partir del nombre del archivo. */
export function infoDesdeNombre(nombre: string): { tipo: TipoNomina | null; periodo: number | null; anio: number | null; yymm: string | null } {
  const base = nombre.replace(/\.[^.]+$/, '')
  const pref = base.match(/^\s*(\d{2})(\d{2})\b/)
  const anio = pref ? 2000 + Number(pref[1]) : null
  const q = base.match(/quincena\s*(\d{1,2})/i)
  if (q) return { tipo: 'Quincenal', periodo: Number(q[1]), anio, yymm: pref ? pref[1] + pref[2] : null }
  const s = base.match(/\bP\s*(\d{1,2})\b/i)
  if (s) return { tipo: 'Semanal', periodo: Number(s[1]), anio, yymm: pref ? pref[1] + pref[2] : null }
  return { tipo: null, periodo: null, anio, yymm: pref ? pref[1] + pref[2] : null }
}

export function leerNominaExcel(buf: ArrayBuffer, nombreArchivo: string, anioDefault: number): NominaLeida {
  const wb = XLSX.read(buf, { type: 'array' })
  const hoja = wb.SheetNames.find(n => norm(n) === 'BPCC')
  if (!hoja) throw new Error('El archivo no tiene la hoja "BPCC"')
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null })

  const hIdx = rows.slice(0, 15).findIndex(r => (r ?? []).some(c => norm(c) === 'TOTAL PERCEPCIONES'))
  if (hIdx < 0) throw new Error('No se encontró el encabezado "TOTAL PERCEPCIONES" en la hoja BPCC')
  const h = (rows[hIdx] ?? []).map(norm)
  const col = (...nombres: string[]) => h.findIndex(x => nombres.includes(x))
  const iNo   = Math.max(col('NO.', 'NO', 'CODIGO DE EMPLEADO', 'CÓDIGO DE EMPLEADO', 'NO. EMPLEADO'), 0)
  const iCC   = h.findIndex(x => x.startsWith('CENTRO'))
  const iPerc = col('TOTAL PERCEPCIONES')
  const iNeto = col('TOTAL APAGAR', 'TOTAL A PAGAR', 'NETO A PAGAR')
  if (iNeto < 0) throw new Error('No se encontró la columna de neto (TOTAL APAGAR / NETO A PAGAR)')
  const iPat = col('APELLIDO PATERNO'), iMat = col('APELLIDO MATERNO'), iNom = col('NOMBRE (S)', 'NOMBRE(S)', 'NOMBRE')

  const info = infoDesdeNombre(nombreArchivo)
  const tipo: TipoNomina = info.tipo ?? (h.includes('NETO A PAGAR') ? 'Quincenal' : 'Semanal')
  if (!info.periodo) throw new Error('No se pudo leer el periodo del nombre del archivo (se espera "… P44" o "Quincena 20")')
  const anio = info.anio ?? anioDefault
  const avisos: string[] = []

  const renglones: RenglonNomina[] = []
  for (const r of rows.slice(hIdx + 1)) {
    if (!r) continue
    const no = String(r[iNo] ?? '').trim()
    if (!/^\d+$/.test(no)) continue
    const nombre = iPat >= 0
      ? [r[iPat], r[iMat], r[iNom]].map(v => String(v ?? '').trim()).filter(Boolean).join(' ')
      : String(r[iNom] ?? '').trim()
    renglones.push({
      no_empleado: normNoEmpleado(no),
      nombre,
      cc_archivo: iCC >= 0 ? norm(r[iCC]) : '',
      percepciones: r2(num(r[iPerc])),
      neto: r2(num(r[iNeto])),
    })
  }
  if (renglones.length === 0) throw new Error('La hoja BPCC no tiene renglones de colaboradores')

  const fechas = periodoFechas(tipo, anio, info.periodo)
  if (info.yymm && info.yymm !== fechas.mes.slice(2, 4) + fechas.mes.slice(5, 7)) {
    avisos.push(`El prefijo del archivo (${info.yymm}) no coincide con el mes calculado del periodo (${fechas.mes.slice(0, 7)}); revisa el mes antes de guardar.`)
  }
  const negativos = renglones.filter(x => x.neto < 0)
  if (negativos.length) avisos.push(`${negativos.length} colaborador(es) con neto negativo.`)

  return {
    tipo, anio, periodo: info.periodo, ...fechas, renglones,
    total_percepciones: r2(renglones.reduce((a, x) => a + x.percepciones, 0)),
    total_neto: r2(renglones.reduce((a, x) => a + x.neto, 0)),
    avisos,
  }
}
