import * as XLSX from 'xlsx'
import { agruparPorArea } from './agrupaArea'
import { explicaDiferencia, type SaldosFila } from '@/lib/saldosFlujo'

/** banda = renglón de subtotal CC · Área; no suma en los totales. */
export type FilaResumen = { nombre: string; ppto: number; real: number; banda?: boolean }
export type SeccionResumen = {
  ingresos: string; egresos: string; balance: string
  ing: FilaResumen[]; egr: FilaResumen[]
}

/** Excel de la vista Resumen (Presupuestado vs Real) tal como se ve en pantalla. */
export function exportarResumenExcel({ titulo, secciones, netoLabel, archivo, saldos }: {
  titulo: string; secciones: SeccionResumen[]; netoLabel: string; archivo: string
  /** Flujo de Efectivo: saldo inicial arriba y saldo final / real / diferencia al pie (columna Real). */
  saldos?: SaldosFila | null
}) {
  const aoa: (string | number | null)[][] = [
    [titulo], [],
    ['Partida', 'Presupuestado', 'Real', 'Variación', '% Ejercido'],
  ]
  if (saldos) aoa.push(['SALDO INICIAL', null, saldos.inicial], [])
  const pct = (real: number, ppto: number) => ppto > 0 ? real / ppto : null
  const suma = (rows: FilaResumen[], k: 'ppto' | 'real') => rows.reduce((s, r) => s + (r.banda ? 0 : r[k]), 0)
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
  if (saldos) aoa.push([],
    ['SALDO FINAL (saldo inicial + flujo neto, todas las partidas)', null, saldos.final],
    ['SALDO REAL EN BANCO', null, saldos.real],
    ['DIFERENCIA SIN CONCILIAR (saldo real − saldo calculado)', null, saldos.diferencia],
    ...(explicaDiferencia(saldos) ? [[explicaDiferencia(saldos)!]] : []))

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

/** Egresos en vista Detalle: renglón de banda CC · Área + sus partidas con sangría. */
export function lineasEgresoPorArea<T extends { nombre: string; pptoVal: number; realVal: number; id_centro_costo_fk: number | null; id_area_fk: number | null }>(
  rows: T[], nombreCC: (id: number) => string, nombreArea: (id: number) => string,
): FilaResumen[] {
  return agruparPorArea(rows, nombreCC, nombreArea).flatMap(b => [
    { nombre: b.label, ppto: b.rows.reduce((s, r) => s + r.pptoVal, 0), real: b.rows.reduce((s, r) => s + r.realVal, 0), banda: true },
    ...b.rows.map(r => ({ nombre: `    ${r.nombre}`, ppto: r.pptoVal, real: r.realVal })),
  ])
}
