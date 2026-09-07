const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const ESPECIALES_10_19 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function decenasATexto(n: number): string {
  if (n < 10) return UNIDADES[n]
  if (n < 20) return ESPECIALES_10_19[n - 10]
  if (n === 20) return 'VEINTE'
  const d = Math.floor(n / 10)
  const u = n % 10
  if (d === 2) return u === 0 ? 'VEINTE' : 'VEINTI' + UNIDADES[u]
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`
}

function centenasATexto(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const base = CENTENAS[c]
  return resto === 0 ? base : `${base} ${decenasATexto(resto)}`.trim()
}

function grupoATexto(n: number): string {
  if (n === 0) return ''
  if (n < 100) return decenasATexto(n)
  return centenasATexto(n)
}

function enteroATexto(n: number): string {
  if (n === 0) return 'CERO'
  const millones = Math.floor(n / 1000000)
  const miles    = Math.floor((n % 1000000) / 1000)
  const resto    = n % 1000

  const partes: string[] = []
  if (millones > 0) partes.push(millones === 1 ? 'UN MILLON' : `${grupoATexto(millones)} MILLONES`)
  if (miles > 0)     partes.push(miles === 1 ? 'MIL' : `${grupoATexto(miles)} MIL`)
  if (resto > 0)     partes.push(grupoATexto(resto))
  return partes.join(' ').trim()
}

/** Convierte un monto a su representación en letras para pesos mexicanos, ej. "UN MIL DOSCIENTOS PESOS 50/100 M.N." */
export function montoALetras(valor: number): string {
  const abs      = Math.abs(valor)
  const entero   = Math.floor(abs)
  const centavos = Math.round((abs - entero) * 100)
  const centavosStr = String(centavos).padStart(2, '0')
  return `${enteroATexto(entero)} PESOS ${centavosStr}/100 M.N.`
}
