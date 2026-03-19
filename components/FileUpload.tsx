'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, Loader, X, FileText, Image, ExternalLink } from 'lucide-react'

type Props = {
  value:      string | null | undefined      // URL actual
  onChange:   (url: string | null) => void   // callback con nueva URL
  accept:     'image' | 'pdf' | 'any'
  folder:     string                         // subcarpeta en el bucket
  label?:     string
  preview?:   boolean                        // mostrar preview de imagen
}

const BUCKET = 'domusone-files'

export default function FileUpload({ value, onChange, accept, folder, label, preview = true }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')

  const acceptAttr =
    accept === 'image' ? 'image/*' :
    accept === 'pdf'   ? 'application/pdf' :
    'image/*,application/pdf'

  const isImage = (url: string) =>
    /\.(png|jpg|jpeg|gif|webp)$/i.test(url)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')

    const ext      = file.name.split('.').pop()
    const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filename, file, { upsert: true, contentType: file.type })

    if (upErr) { setError(upErr.message); setUploading(false); return }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
    onChange(data.publicUrl)
    setUploading(false)
  }

  const handleRemove = async () => {
    if (!value) return
    // Extraer path del bucket desde la URL pública
    const path = value.split(`/${BUCKET}/`)[1]
    if (path) await supabase.storage.from(BUCKET).remove([path])
    onChange(null)
  }

  return (
    <div>
      {label && <label className="label" style={{ marginBottom: 6 }}>{label}</label>}

      {/* Preview / archivo actual */}
      {value && (
        <div style={{
          marginBottom: 8, padding: '10px 12px',
          background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10
        }}>
          {preview && isImage(value) ? (
            <img src={value} alt="preview" style={{ height: 60, maxWidth: 120, objectFit: 'cover', borderRadius: 5 }} />
          ) : (
            <div style={{ width: 36, height: 36, background: '#dbeafe', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isImage(value) ? <Image size={16} style={{ color: 'var(--blue)' }} /> : <FileText size={16} style={{ color: 'var(--blue)' }} />}
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value.split('/').pop()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <a href={value} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={11} /> Ver
            </a>
            <button className="btn-ghost" onClick={handleRemove} style={{ padding: '4px 8px', fontSize: 11, color: '#dc2626' }}>
              <X size={11} /> Quitar
            </button>
          </div>
        </div>
      )}

      {/* Botón de upload */}
      <label style={{ cursor: uploading ? 'not-allowed' : 'pointer', display: 'block' }}>
        <input type="file" accept={acceptAttr} onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 7, fontSize: 12,
          border: '1px dashed #94a3b8',
          background: uploading ? '#f8fafc' : '#fff',
          color: uploading ? 'var(--text-muted)' : 'var(--blue)',
          fontFamily: 'var(--font-body)', fontWeight: 500,
          transition: 'all 0.15s',
        }}>
          {uploading
            ? <><Loader size={13} className="animate-spin" /> Subiendo…</>
            : <><Upload size={13} /> {value ? 'Reemplazar archivo' : 'Subir archivo'}</>
          }
        </div>
      </label>

      {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>}
    </div>
  )
}
