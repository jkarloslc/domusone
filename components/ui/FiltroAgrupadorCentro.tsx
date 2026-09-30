'use client'
import { AgrupadorIngreso, CentroIngresoAgr, agrupadoresUsados, centrosDeAgrupador } from '@/lib/centrosIngreso'

/**
 * Par de filtros Agrupador → Centro de Ingreso. Las opciones de centro se
 * muestran como "Agrupador/Centro de Ingreso" y se acotan al agrupador elegido.
 * Si no hay agrupadores capturados solo muestra el filtro de centro.
 */
export default function FiltroAgrupadorCentro({
  centros, agrupadores, filtroAgr, setFiltroAgr, filtroCentro, setFiltroCentro,
  textoTodos = 'Todos los centros', minWidth = 200,
}: {
  centros: CentroIngresoAgr[]
  agrupadores: AgrupadorIngreso[]
  filtroAgr: string
  setFiltroAgr: (v: string) => void
  filtroCentro: string
  setFiltroCentro: (v: string) => void
  textoTodos?: string
  minWidth?: number
}) {
  const usados = agrupadoresUsados(agrupadores, centros)
  const hayAgr = usados.length > 0
  const visibles = centrosDeAgrupador(centros, filtroAgr)
  return (
    <>
      {hayAgr && (
        <select className="select" style={{ minWidth: 170 }} value={filtroAgr}
          onChange={e => { setFiltroAgr(e.target.value); setFiltroCentro('') }}>
          <option value="">Todos los agrupadores</option>
          {usados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          {centros.some(c => !c.id_agrupador_fk) && <option value="sin">Sin agrupador</option>}
        </select>
      )}
      <select className="select" style={{ minWidth }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
        <option value="">{textoTodos}</option>
        {visibles.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
    </>
  )
}
