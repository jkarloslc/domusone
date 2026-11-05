import { NextResponse, type NextRequest } from 'next/server'

/**
 * Separación de dominios:
 *   - domusone.app  → Fraccionamiento
 *   - golf-one.mx   → Club (Golf, Hípico, Hospitality, Polo, Locales)
 *
 * Una ruta que pertenece al otro dominio se redirige (307) conservando el
 * subdominio de tenant (ej. balvanera.) y el path/query.
 *
 * APAGADO por defecto: solo actúa si DOMAIN_SPLIT=on en las variables de
 * entorno (Vercel). Sin la bandera ambos dominios sirven todo.
 *
 * OJO: esto solo separa RUTAS. Los datos y permisos por rol siguen siendo los
 * mismos; los módulos compartidos (hr, capex, presupuestos…) que deban mostrar
 * solo datos de su lado se filtran en cada página (ver header x-dominio).
 */

const DOMINIO_FRACC = 'domusone.app'
const DOMINIO_CLUB = 'golf-one.mx'

// Primer segmento de la URL → a qué dominio pertenece. Lo no listado = ambos.
const SOLO_CLUB = new Set(['golf', 'hipico', 'hospitality', 'polo', 'locales'])

const SOLO_FRACC = new Set([
  'residencial', 'lotes', 'propietarios', 'cobranza', 'facturas', 'escrituras',
  'contratos', 'afectaciones', 'construcciones', 'accesos', 'incidencias',
  'comunicados', 'vigilancia-extras', 'vigilancia-novedades',
])

// Compartidos (referencia; cualquier segmento no listado arriba también pasa):
// inicio, login, tablero, dashboards, compras, tesoreria, ingresos,
// presupuestos, capex, reportes, catalogos, hr, usuarios, configuracion,
// vehiculos, equipo-flota, herramientas

type Dominio = 'club' | 'fraccionamiento'

function detectar(host: string): { dominio: Dominio; prefijo: string } | null {
  const h = host.split(':')[0].toLowerCase()
  for (const [base, dominio] of [
    [DOMINIO_CLUB, 'club'],
    [DOMINIO_FRACC, 'fraccionamiento'],
  ] as const) {
    if (h === base) return { dominio, prefijo: '' }
    if (h.endsWith('.' + base)) return { dominio, prefijo: h.slice(0, -base.length) } // incluye el punto final
  }
  return null // localhost, *.vercel.app, etc. → no se toca
}

export function middleware(req: NextRequest) {
  if (process.env.DOMAIN_SPLIT !== 'on') return NextResponse.next()

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  const info = detectar(host)
  if (!info) return NextResponse.next()

  const primero = req.nextUrl.pathname.split('/').filter(Boolean)[0]

  const fueraDeDominio =
    (info.dominio === 'fraccionamiento' && primero && SOLO_CLUB.has(primero)) ||
    (info.dominio === 'club' && primero && SOLO_FRACC.has(primero))

  if (fueraDeDominio) {
    const destino = req.nextUrl.clone()
    destino.hostname = info.prefijo + (info.dominio === 'club' ? DOMINIO_FRACC : DOMINIO_CLUB)
    destino.port = ''
    destino.protocol = 'https:'
    return NextResponse.redirect(destino, 307)
  }

  // Informa a las páginas/APIs desde qué dominio se está navegando
  const headers = new Headers(req.headers)
  headers.set('x-dominio', info.dominio)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Excluye assets de Next, API y cualquier archivo estático (con extensión)
  matcher: ['/((?!_next/static|_next/image|api|.*\\..*).*)'],
}
