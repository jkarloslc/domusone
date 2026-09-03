'use client'
import { useEffect, useState } from 'react'
import { dbGolf } from '@/lib/supabase'

// Select simple de producto POS (golf.cat_productos_pos), acotado a un centro de
// venta — es la fuente real de clasificación (concepto de ingreso + clave SAT) que
// usan los tickets de cobranza recurrente. El concepto de ingreso directo se
// conserva aparte como respaldo si no hay producto configurado.
export default function ProductoPosSelect({ idCentroFk, value, onChange, style, placeholder = '— Sin producto (usa el concepto directo) —' }: {
  idCentroFk: number | null
  value: number | null
  onChange: (id: number | null) => void
  style?: React.CSSProperties
  placeholder?: string
}) {
  const [productos, setProductos] = useState<{ id: number; nombre: string }[]>([])

  useEffect(() => {
    if (!idCentroFk) { setProductos([]); return }
    dbGolf.from('cat_productos_pos').select('id, nombre')
      .eq('id_centro_fk', idCentroFk).eq('activo', true).order('nombre')
      .then(({ data }) => setProductos((data as { id: number; nombre: string }[] | null) ?? []))
  }, [idCentroFk])

  return (
    <select className="select" style={style} value={value ?? ''} disabled={!idCentroFk}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  )
}
