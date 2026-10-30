'use client'

// Detalle opcional del recibo CFE por periodo. Alimenta las alertas del
// Informe por Servicio (factor de potencia, demanda, lectura estimada).
export type DetalleCFE = {
  demanda_max_kw: string; factor_potencia: string; cargo_fp: string; bonif_fp: string
  subtotal: string; iva: string; dap: string; tipo_lectura: string
}

export const DETALLE_CFE_VACIO: DetalleCFE = {
  demanda_max_kw: '', factor_potencia: '', cargo_fp: '', bonif_fp: '',
  subtotal: '', iva: '', dap: '', tipo_lectura: '',
}

const num = (s: string) => (s !== '' && !isNaN(Number(s)) ? Number(s) : null)

export const detalleCFEPayload = (d: DetalleCFE) => ({
  demanda_max_kw:  num(d.demanda_max_kw),
  factor_potencia: num(d.factor_potencia),
  cargo_fp:        num(d.cargo_fp),
  bonif_fp:        num(d.bonif_fp),
  subtotal:        num(d.subtotal),
  iva:             num(d.iva),
  dap:             num(d.dap),
  tipo_lectura:    d.tipo_lectura || null,
})

const CAMPOS: { k: keyof DetalleCFE; label: string; step?: string }[] = [
  { k: 'demanda_max_kw',  label: 'Demanda máx. (kW)' },
  { k: 'factor_potencia', label: 'Factor de potencia (%)' },
  { k: 'cargo_fp',        label: 'Cargo por FP ($)' },
  { k: 'bonif_fp',        label: 'Bonificación por FP ($)' },
  { k: 'subtotal',        label: 'Subtotal ($)' },
  { k: 'iva',             label: 'IVA ($)' },
  { k: 'dap',             label: 'DAP ($)' },
]

export default function CamposCFE({ value, onChange }: {
  value: DetalleCFE
  onChange: (k: keyof DetalleCFE, v: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {CAMPOS.map(c => (
        <div key={c.k}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.label}</label>
          <input className="input" type="number" step="0.01"
            style={{ fontSize: 12, height: 28, padding: '3px 6px', textAlign: 'right' }}
            value={value[c.k]} onChange={e => onChange(c.k, e.target.value)} />
        </div>
      ))}
      <div>
        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Tipo de lectura</label>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '3px 6px' }}
          value={value.tipo_lectura} onChange={e => onChange('tipo_lectura', e.target.value)}>
          <option value="">—</option>
          <option>Medida</option>
          <option>Estimada</option>
        </select>
      </div>
    </div>
  )
}
