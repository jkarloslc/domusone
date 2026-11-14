'use client'
import { useEffect, useState } from 'react'
import { dbCfg, supabase } from '@/lib/supabase'
import { useConfig } from '@/lib/ConfigContext'
import { Settings, Save, Loader, CheckCircle, Upload, Image } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

type Row = { id: number; clave: string; valor: string | null; tipo: string; grupo: string; etiqueta: string | null; descripcion: string | null }

const GRUPOS: Record<string, string> = {
  organizacion: 'Organización',
  apariencia:   'Apariencia',
  sistema:      'Sistema',
  correo:       'Servidor de Correo (SMTP)',
  fiscal:       'Datos Fiscales del Emisor (CFDI)',
  pac:          'PAC — Proveedor Autorizado de Certificación',
  cobranza:     'Cobranza — Arranque Operativo por Módulo',
  golf:         'Golf',
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

  const grupos = Array.from(new Set(rows.map(r => r.grupo)))

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out', maxWidth: 700 }}>

      <PageHeader
        variant="xl"
        icon={Settings}
        eyebrowLabel="Sistema"
        title="Configuración"
        subtitle="Parámetros generales de la aplicación"
        actions={<button className="btn-primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? <><Loader size={13} className="animate-spin" /> Guardando…</>
            : saved ? <><CheckCircle size={13} /> Guardado</>
            : <><Save size={13} /> Guardar Cambios</>}
        </button>}
      />

      {debugMsg && (
        <div style={{ padding: '10px 14px', marginBottom: 20, borderRadius: 6, fontSize: 12, fontVariantNumeric: 'tabular-nums',
          background: '#F4F5F7',
          border: '1px solid #E6E8EB', borderLeft: `3px solid ${debugMsg.startsWith('ERROR') ? '#C23B3B' : '#1F7A50'}`,
          color: debugMsg.startsWith('ERROR') ? '#C23B3B' : '#1F7A50' }}>
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
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E6E8EB', background: '#F8F9FA' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {GRUPOS[grupo] ?? grupo}
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {rows.filter(r => r.grupo === grupo).map(row => (
                <div key={row.clave} style={{
                  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16,
                  padding: '12px 20px', borderBottom: '1px solid #F8F9FA', alignItems: 'center',
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
                          <img src={values[row.clave]} alt="Logo" style={{ height: 48, maxWidth: 140, objectFit: 'contain', borderRadius: 6, border: '1px solid #E6E8EB', padding: 4, background: '#fff' }} />
                        ) : (
                          <div style={{ width: 80, height: 48, borderRadius: 6, border: '1px dashed #C9CCD3', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FA' }}>
                            <Image size={18} style={{ color: '#C9CCD3' }} />
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
                          <button className="btn-ghost" style={{ fontSize: 11, color: '#C23B3B' }}
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
                        <input type="color" value={values[row.clave] || '#1C1D21'}
                          onChange={e => setValues(v => ({ ...v, [row.clave]: e.target.value }))}
                          style={{ width: 36, height: 32, padding: 2, background: '#fff', border: '1px solid #E6E8EB', borderRadius: 6, cursor: 'pointer' }} />
                        <input className="input" value={values[row.clave] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [row.clave]: e.target.value }))}
                          style={{ fontVariantNumeric: 'tabular-nums', maxWidth: 120 }} />
                      </div>
                    ) : row.tipo === 'textarea' ? (
                      <textarea className="input" rows={9} value={values[row.clave] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [row.clave]: e.target.value }))}
                        style={{ resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }} />
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
          background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #1F7A50', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8,
          color: '#1F7A50', fontSize: 13, fontWeight: 500, animation: 'slideUp 0.3s ease-out' }}>
          <CheckCircle size={15} /> Configuración guardada correctamente
        </div>
      )}
    </div>
  )
}
