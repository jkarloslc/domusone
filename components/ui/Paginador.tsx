'use client'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

// Paginación en cliente: primera / anterior / números / siguiente / última.
// `page` es base 0. No se renderiza si solo hay una página.
export default function Paginador({ page, pageSize, totalItems, onChange }: {
  page: number; pageSize: number; totalItems: number; onChange: (page: number) => void
}) {
  const total = Math.max(1, Math.ceil(totalItems / pageSize))
  if (total <= 1) return null

  // Ventana de hasta 5 números centrada en la página actual.
  const ini = Math.max(0, Math.min(page - 2, total - 5))
  const nums = Array.from({ length: Math.min(5, total) }, (_, i) => ini + i)
  const desde = page * pageSize + 1
  const hasta = Math.min(totalItems, (page + 1) * pageSize)

  const btn = (disabled: boolean, onClick: () => void, child: React.ReactNode, title: string) => (
    <button className="btn-secondary" style={{ padding: '5px 9px', minWidth: 30 }}
      disabled={disabled} onClick={onClick} title={title}>{child}</button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {desde}–{hasta} de {totalItems} · Pág. {page + 1} de {total}
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {btn(page === 0, () => onChange(0), <ChevronsLeft size={13} />, 'Primera')}
        {btn(page === 0, () => onChange(page - 1), <ChevronLeft size={13} />, 'Anterior')}
        {nums.map(n => (
          <button key={n} className={n === page ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '5px 9px', minWidth: 30, fontSize: 12 }} onClick={() => onChange(n)}>{n + 1}</button>
        ))}
        {btn(page >= total - 1, () => onChange(page + 1), <ChevronRight size={13} />, 'Siguiente')}
        {btn(page >= total - 1, () => onChange(total - 1), <ChevronsRight size={13} />, 'Última')}
      </div>
    </div>
  )
}
