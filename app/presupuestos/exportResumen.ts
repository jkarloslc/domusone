import * as XLSX from 'xlsx'

export type FilaResumen = { nombre: string; ppto: number; real: number }
export type SeccionResumen = {
  ingresos: string; egresos: string; balance: string
  ing: FilaResumen[]; egr: FilaResumen[]
}

/** Excel de la vista Resumen (Presupuestado vs Real) tal como se ve en pantalla. */
export function exportarResumenExcel({ titulo, secciones, netoLabel, archivo }: {
  titulo: string; secciones: SeccionResumen[]; netoLabel: string; archivo: string
}) {
  const aoa: (string | number | null)[][] = [
    [titulo], [],
    ['Partida', 'Presupuestado', 'Real', 'Variación', '% Ejercido'],
  ]
  const pct = (real: number, ppto: number) => ppto > 0 ? real / ppto : null
  const suma = (rows: FilaResumen[], k: 'ppto' | 'real') => rows.reduce((s, r) => s + r[k], 0)
  const linea = (nombre: string, ppto: number, real: number) =>
    aoa.push([nombre, ppto, real, real - ppto, pct(real, ppto)])
  const bloque = (label: string, rows: FilaResumen[]) => {
    if (rows.length === 0) return
    aoa.push([label.toUpperCase()])
    rows.forEach(r => linea(r.nombre, r.ppto, r.real))
    linea(`Total ${label}`, suma(rows, 'ppto'), suma(rows, 'real'))
  }
  const todosIng: FilaResumen[] = []
  const todosEgr: FilaResumen[] = []
  secciones.forEach(s => {
    if (s.ing.length === 0 && s.egr.length === 0) return
    bloque(s.ingresos, s.ing); bloque(s.egresos, s.egr)
    if (s.ing.length > 0 && s.egr.length > 0)
      linea(s.balance, suma(s.ing, 'ppto') - suma(s.egr, 'ppto'), suma(s.ing, 'real') - suma(s.egr, 'real'))
    aoa.push([])
    todosIng.push(...s.ing); todosEgr.push(...s.egr)
  })
  if (todosIng.length > 0 && todosEgr.length > 0)
    linea(netoLabel, suma(todosIng, 'ppto') - suma(todosEgr, 'ppto'), suma(todosIng, 'real') - suma(todosEgr, 'real'))

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 46 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
  Object.keys(ws).forEach(k => {
    if (k[0] === '!' || typeof ws[k].v !== 'number') return
    ws[k].z = k.startsWith('E') ? '0%' : '#,##0;-#,##0;"-"'
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
  XLSX.writeFile(wb, `${archivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
