'use client'
import { Printer, Download } from 'lucide-react'

// Lee configuración desde Supabase una sola vez por sesión
let cachedConfig: { org_nombre?: string; org_subtitulo?: string; org_logo_url?: string } = {}

async function getConfig() {
  if (cachedConfig.org_nombre) return cachedConfig
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await sb.schema('cfg' as any).from('configuracion')
      .select('clave, valor')
      .in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
    ;(data ?? []).forEach((r: any) => { cachedConfig[r.clave as keyof typeof cachedConfig] = r.valor ?? '' })
  } catch {}
  return cachedConfig
}

export function PrintBar({ title, count, reportTitle }: { title: string; count: number; reportTitle?: string }) {

  const handlePrint = async () => {
    const cfg = await getConfig()

    // Construir encabezado HTML
    const logoHtml = cfg.org_logo_url
      ? `<img src="${cfg.org_logo_url}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : ''
    const headerHtml = `
      <div id="print-header" style="display:flex;align-items:center;gap:16px;padding-bottom:12px;margin-bottom:12px;border-bottom:2px solid #2563eb;">
        ${logoHtml}
        <div>
          <div style="font-size:16px;font-weight:700;color:#0f172a;">${cfg.org_nombre ?? ''}</div>
          ${cfg.org_subtitulo ? `<div style="font-size:11px;color:#64748b;">${cfg.org_subtitulo}</div>` : ''}
          ${reportTitle ? `<div style="font-size:13px;font-weight:600;color:#2563eb;margin-top:2px;">${reportTitle}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right;font-size:10px;color:#94a3b8;">
          ${new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}<br/>
          ${count} registros
        </div>
      </div>
    `

    const style = document.createElement('style')
    style.id = 'print-override'
    style.innerHTML = `
      @media print {
        body * { visibility: hidden !important; }
        #reporte-print-area, #reporte-print-area * { visibility: visible !important; }
        #print-header { visibility: visible !important; }
        #reporte-print-area {
          position: fixed !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important;
          background: white !important;
          padding: 16px !important;
        }
        #reporte-print-area table {
          font-size: 11px !important;
          width: 100% !important;
          border-collapse: collapse !important;
        }
        #reporte-print-area th, #reporte-print-area td {
          padding: 5px 8px !important;
          border: 1px solid #cbd5e1 !important;
          color: #0f172a !important;
          background: white !important;
        }
        #reporte-print-area thead th {
          background: #f1f5f9 !important;
          font-weight: 700 !important;
          font-size: 10px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.04em !important;
        }
        @page { margin: 1.2cm; size: landscape; }
      }
    `
    document.head.appendChild(style)

    // Marcar la card como zona imprimible e inyectar encabezado
    const table = document.getElementById('reporte-table')
    if (table) {
      const card = table.closest('.card') as HTMLElement | null
      if (card) {
        card.id = 'reporte-print-area'
        // Insertar encabezado al inicio
        const headerDiv = document.createElement('div')
        headerDiv.id   = 'print-header-injected'
        headerDiv.innerHTML = headerHtml
        card.insertBefore(headerDiv, card.firstChild)
      }
    }

    window.print()

    setTimeout(() => {
      document.getElementById('print-override')?.remove()
      document.getElementById('print-header-injected')?.remove()
      const area = document.getElementById('reporte-print-area')
      if (area) area.removeAttribute('id')
    }, 1500)
  }

  const handleCSV = () => {
    const table = document.getElementById('reporte-table')
    if (!table) return
    const rows = Array.from(table.querySelectorAll('tr'))
    const csv  = rows.map(row =>
      Array.from(row.querySelectorAll('th, td'))
        .map(cell => `"${(cell as HTMLElement).innerText.replace(/"/g, '""').replace(/\n/g, ' ')}"`)
        .join(',')
    ).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${title}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{count}</strong> registros
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-secondary" onClick={handleCSV} style={{ fontSize: 12 }}>
          <Download size={13} /> Exportar CSV
        </button>
        <button className="btn-secondary" onClick={handlePrint} style={{ fontSize: 12 }}>
          <Printer size={13} /> Imprimir
        </button>
      </div>
    </div>
  )
}
