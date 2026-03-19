'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, Loader, X, ExternalLink } from 'lucide-react'

const BUCKET = 'domusone-files'

type Props = {
  values:   string[]
  onChange: (urls: string[]) => void
  folder:   string
  label?:   string
  max?:     number
}

export default function MultiImageUpload({ values, onChange, folder, label, max = 5 }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (values.length + files.length > max) { setError(`Máximo ${max} imágenes`); return }
    setUploading(true); setError('')

    const newUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(filename, file, { upsert: true, contentType: file.type })
      if (!upErr) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
        newUrls.push(data.publicUrl)
      }
    }
    onChange([...values, ...newUrls])
    setUploading(false)
  }

  const handleRemove = async (url: string) => {
    const path = url.split(`/${BUCKET}/`)[1]
    if (path) await supabase.storage.from(BUCKET).remove([path])
    onChange(values.filter(v => v !== url))
  }

  return (
    <div>
      {label && <label className="label" style={{ marginBottom: 6 }}>{label}</label>}

      {/* Grid de imágenes */}
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {values.map((url, i) => (
            <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
              <img src={url} alt={`img-${i}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 7, border: '1px solid #e2e8f0' }} />
              <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                <a href={url} target="_blank" rel="noopener noreferrer"
                  style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(37,99,235,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ExternalLink size={10} style={{ color: '#fff' }} />
                </a>
                <button onClick={() => handleRemove(url)}
                  style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(220,38,38,0.85)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={10} style={{ color: '#fff' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botón upload */}
      {values.length < max && (
        <label style={{ cursor: uploading ? 'not-allowed' : 'pointer', display: 'block' }}>
          <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12, border: '1px dashed #94a3b8', background: '#fff', color: 'var(--blue)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
            {uploading ? <><Loader size={13} className="animate-spin" /> Subiendo…</> : <><Upload size={13} /> Agregar imágenes ({values.length}/{max})</>}
          </div>
        </label>
      )}
      {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>}
    </div>
  )
}
