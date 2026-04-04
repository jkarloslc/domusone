'use client'
import { useEffect, useState } from 'react'
import { dbCfg, supabase } from '@/lib/supabase'
import { useConfig } from '@/lib/ConfigContext'
import { Settings, Save, Loader, CheckCircle, Upload, Image } from 'lucide-react'

type Row = { id: number; clave: string; valor: string | null; tipo: string; grupo: string; etiqueta: string | null; descripcion: string | null }

const GRUPOS: Record<string, string> = {
  organizacion: 'Organización',
  apariencia:   'Apariencia',
  sistema:      'Sistema',
  correo:       'Servidor de Correo (SMTP)',
}

export default function ConfiguracionPage() {
  const { reload } = useConfig()
  const [rows, setRows]         = useState<Row[]>([])
  const [values, setValues]     = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [debugMsg, setDebugMsg] = useState('')

  useEffect(() => {
    dbCfg.from('configuracion').select('*').order('grupo').order('id')
      .then(({ data, error, status }) => {
        if (error) { setDebugMsg(`ERROR ${status}: ${error.message}`); setLoading(false); return }
        if (!data || data.length === 0) { setDebugMsg(`Sin datos. Status: ${status}`); setLoading(false); return }
        const r = data as Row[]
        setRows(r)
        const v: Record<string, string> = {}
        r.forEach(row => { v[row.clave] = row.valor ?? '' })
        setValues(v)
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    for (const row of rows) {
      await dbCfg.from('configuracion').update({ valor: values[row.clave] ?? '' }).eq('id', row.id)
    }
    setSaving(false); setSaved(true); reload()
    setTimeout(() => setSaved(false), 3000)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const ext      = file.name.split('.').pop()
    const filename = `logo_${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('logos')
      .upload(filename, file, { upsert: true, contentType: file.type })

    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filename)
    const url = urlData.publicUrl

    // Guardar en BD
    await dbCfg.from('configuracion').update({ valor: url }).eq('clave', 'org_logo_url')
    setValues(v => ({ ...v, org_logo_url: url }))
    setUploading(false)
    reload()
  }

  const grupos = [...new Set(rows.map(r => r.grupo))]

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out', maxWidth: 700 }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Settings size={16} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sistema</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>Configuración</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Parámetros generales de la aplicación</p>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? <><Loader size={13} className="animate-spin" /> Guardando…</>
            : saved ? <><CheckCircle size={13} /> Guardado</>
            : <><Save size={13} /> Guardar Cambios</>}
        </button>
      </div>

      {debugMsg && (
        <div style={{ padding: '10px 14px', marginBottom: 20, borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
          background: debugMsg.startsWith('ERROR') ? 'rgba(239,68,68,0.1)' : '#f0fdf4',
          border: `1px solid ${debugMsg.startsWith('ERROR') ? 'rgba(239,68,68,0.3)' : '#bbf7d0'}`,
          color: debugMsg.startsWith('ERROR') ? '#dc2626' : '#15803d' }}>
          {debugMsg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <Loader size={18} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        grupos.map(grupo => (
          <div key={grupo} className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {GRUPOS[grupo] ?? grupo}
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {rows.filter(r => r.grupo === grupo).map(row => (
                <div key={row.clave} style={{
                  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16,
                  padding: '12px 20px', borderBottom: '1px solid #f8fafc', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{row.etiqueta ?? row.clave}</div>
                    {row.descripcion && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{row.descripcion}</div>}
                  </div>
                  <div>
                    {row.tipo === 'imagen' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Preview del logo */}
                        {values[row.clave] ? (
                          <img src={values[row.clave]} alt="Logo" style={{ height: 48, maxWidth: 140, objectFit: 'contain', borderRadius: 6, border: '1px solid #e2e8f0', padding: 4, background: '#fff' }} />
                        ) : (
                          <div style={{ width: 80, height: 48, borderRadius: 6, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                            <Image size={18} style={{ color: '#cbd5e1' }} />
                          </div>
                        )}
                        <label style={{ cursor: 'pointer' }}>
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                          <span className="btn-secondary" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            {uploading ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
                            {uploading ? 'Subiendo…' : values[row.clave] ? 'Cambiar logo' : 'Subir logo'}
                          </span>
                        </label>
                        {values[row.clave] && (
                          <button className="btn-ghost" style={{ fontSize: 11, color: '#dc2626' }}
                            onClick={async () => {
                              await dbCfg.from('configuracion').update({ valor: '' }).eq('clave', 'org_logo_url')
                              setValues(v => ({ ...v, org_logo_url: '' }))
                              reload()
                            }}>
                            Quitar
                          </button>
                        )}
                      </div>
                    ) : row.tipo === 'color' ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={values[row.clave] || '#2563eb'}
                          onChange={e => setValues(v => ({ ...v, [row.clave]: e.target.value }))}
                          style={{ width: 36, height: 32, padding: 2, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} />
                        <input className="input" value={values[row.clave] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [row.clave]: e.target.value }))}
                          style={{ fontFamily: 'monospace', maxWidth: 120 }} />
                      </div>
                    ) : row.tipo === 'password' ? (
                      <input className="input" type="password" value={values[row.clave] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [row.clave]: e.target.value }))}
                        placeholder="••••••••" autoComplete="new-password" />
                    ) : (
                      <input className="input" value={values[row.clave] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [row.clave]: e.target.value }))}
                        placeholder={row.descripcion ?? ''} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {saved && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, padding: '12px 20px',
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8,
          color: '#15803d', fontSize: 13, fontWeight: 500, animation: 'slideUp 0.3s ease-out' }}>
          <CheckCircle size={15} /> Configuración guardada correctamente
        </div>
      )}
    </div>
  )
}
