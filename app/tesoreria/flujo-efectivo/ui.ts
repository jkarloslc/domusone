import React from 'react'

export const inputStyle: React.CSSProperties = {
  width: '100%', font: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 8,
  border: '1px solid #e2e8f0', background: '#fff', color: 'var(--text-primary)',
}
export const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase',
  color: '#7a8aa3', fontWeight: 700, marginBottom: 6,
}
export const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em',
  color: '#64748b', fontWeight: 700, padding: '9px 10px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
  whiteSpace: 'nowrap',
}
export const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }
export const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', textAlign: 'right' }
