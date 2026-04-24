'use client'
import { useState, useEffect } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { Plus, ChevronLeft, Edit2, Trash2, MapPin, Tag } from 'lucide-react'

type Lugar = { id: number; nombre: string; capacidad: number | null; descripcion: string | null; activo: boolean }
type TipoEvento = { id: number; nombre: string; color: string; activo: boolean }

export default function CatalogosPage() {
  const [tab, setTab] = useState<'lugares' | 'tipos'>('lugares')

  // ── Lugares ───────────────────────────────────────────────
  const [lugares, setLugares] = useState<Lugar[]>([])
  const [lugarForm, setLugarForm] = useState({ nombre: '', capacidad: '' as number | '', descripcion: '' })
  const [editLugar, setEditLugar] = useState<Lugar | null>(null)
  const [showLugar, setShowLugar] = useState(false)
  const [errL, setErrL] = useState('')

  const loadLugares = () => dbCtrl.from('cat_lugares').select('*').order('nombre').then(({ data }: any) => setLugares(data ?? []))
  useEffect(() => { loadLugares() }, [])

  const saveLugar = async () => {
    if (!lugarForm.nombre.trim()) { setErrL('Nombre requerido'); return }
    setErrL('')
    const payload = { nombre: lugarForm.nombre.trim(), capacidad: lugarForm.capacidad || null, descripcion: lugarForm.descripcion || null, activo: true }
    if (editLugar) {
      await dbCtrl.from('cat_lugares').update(payload).eq('id', editLugar.id)
    } else {
      await dbCtrl.from('cat_lugares').insert(payload)
    }
    setShowLugar(false); setEditLugar(null)
    setLugarForm({ nombre: '', capacidad: '', descripcion: '' })
    loadLugares()
  }

  const toggleActivoLugar = async (l: Lugar) => {
    await dbCtrl.from('cat_lugares').update({ activo: !l.activo }).eq('id', l.id)
    loadLugares()
  }

  // ── Tipos de evento ───────────────────────────────────────
  const [tipos, setTipos] = useState<TipoEvento[]>([])
  const [tipoForm, setTipoForm] = useState({ nombre: '', color: '#9333ea' })
  const [editTipo, setEditTipo] = useState<TipoEvento | null>(null)
  const [showTipo, setShowTipo] = useState(false)
  const [errT, setErrT] = useState('')

  const loadTipos = () => dbCtrl.from('cat_tipos_evento').select('*').order('nombre').then(({ data }: any) => setTipos(data ?? []))
  useEffect(() => { loadTipos() }, [])

  const saveTipo = async () => {
    if (!tipoForm.nombre.trim()) { setErrT('Nombre requerido'); return }
    setErrT('')
    const payload = { nombre: tipoForm.nombre.trim(), color: tipoForm.color, activo: true }
    if (editTipo) {
      await dbCtrl.from('cat_tipos_evento').update(payload).eq('id', editTipo.id)
    } else {
      await dbCtrl.from('cat_tipos_evento').insert(payload)
    }
    setShowTipo(false); setEditTipo(null)
    setTipoForm({ nombre: '', color: '#9333ea' })
    loadTipos()
  }

  const toggleActivoTipo = async (t: TipoEvento) => {
    await dbCtrl.from('cat_tipos_evento').update({ activo: !t.activo }).eq('id', t.id)
    loadTipos()
  }

  const TAB_STYLE = (active: boolean) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    background: active ? '#9333ea' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>
      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <a href="/hospitality" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
          <ChevronLeft size={15} /> Hospitality
        </a>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Catálogos</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--surface-800)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button style={TAB_STYLE(tab === 'lugares')} onClick={() => setTab('lugares')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} /> Lugares / Salones</span>
        </button>
        <button style={TAB_STYLE(tab === 'tipos')} onClick={() => setTab('tipos')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Tag size={13} /> Tipos de Evento</span>
        </button>
      </div>

      {/* ── LUGARES ── */}
      {tab === 'lugares' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Lugares / Salones</div>
            <button className="btn-primary" onClick={() => { setEditLugar(null); setLugarForm({ nombre: '', capacidad: '', descripcion: '' }); setErrL(''); setShowLugar(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, background: '#9333ea' }}>
              <Plus size={14} /> Nuevo lugar
            </button>
          </div>

          {showLugar && (
            <div className="card" style={{ background: '#faf5ff', border: '1px solid #e9d5ff', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9333ea', marginBottom: 12 }}>
                {editLugar ? 'Editar lugar' : 'Nuevo lugar'}
              </div>
              {errL && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{errL}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Nombre *</label>
                  <input className="input" value={lugarForm.nombre} onChange={e => setLugarForm(f => ({ ...f, nombre: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Capacidad</label>
                  <input className="input" type="number" value={lugarForm.capacidad} onChange={e => setLugarForm(f => ({ ...f, capacidad: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Descripción</label>
                <input className="input" value={lugarForm.descripcion} onChange={e => setLugarForm(f => ({ ...f, descripcion: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={() => { setShowLugar(false); setEditLugar(null) }} style={{ fontSize: 12 }}>Cancelar</button>
                <button className="btn-primary" onClick={saveLugar} style={{ fontSize: 12, background: '#9333ea' }}>Guardar</button>
              </div>
            </div>
          )}

          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                  {['Nombre', 'Capacidad', 'Descripción', 'Activo', ''].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lugares.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin lugares registrados</td></tr>
                ) : lugares.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{l.nombre}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{l.capacidad ?? '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{l.descripcion ?? '—'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <button onClick={() => toggleActivoLugar(l)} style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: l.activo ? '#f0fdf4' : '#fef2f2', color: l.activo ? '#16a34a' : '#dc2626',
                      }}>{l.activo ? 'Activo' : 'Inactivo'}</button>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <button className="btn-ghost" onClick={() => { setEditLugar(l); setLugarForm({ nombre: l.nombre, capacidad: l.capacidad ?? '', descripcion: l.descripcion ?? '' }); setErrL(''); setShowLugar(true) }} style={{ padding: '4px 8px' }}>
                        <Edit2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TIPOS DE EVENTO ── */}
      {tab === 'tipos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Tipos de Evento</div>
            <button className="btn-primary" onClick={() => { setEditTipo(null); setTipoForm({ nombre: '', color: '#9333ea' }); setErrT(''); setShowTipo(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, background: '#9333ea' }}>
              <Plus size={14} /> Nuevo tipo
            </button>
          </div>

          {showTipo && (
            <div className="card" style={{ background: '#faf5ff', border: '1px solid #e9d5ff', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9333ea', marginBottom: 12 }}>
                {editTipo ? 'Editar tipo' : 'Nuevo tipo'}
              </div>
              {errT && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{errT}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Nombre *</label>
                  <input className="input" value={tipoForm.nombre} onChange={e => setTipoForm(f => ({ ...f, nombre: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Color</label>
                  <input type="color" value={tipoForm.color} onChange={e => setTipoForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: '100%', height: 38, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={() => { setShowTipo(false); setEditTipo(null) }} style={{ fontSize: 12 }}>Cancelar</button>
                <button className="btn-primary" onClick={saveTipo} style={{ fontSize: 12, background: '#9333ea' }}>Guardar</button>
              </div>
            </div>
          )}

          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                  {['Nombre', 'Color', 'Activo', ''].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tipos.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin tipos registrados</td></tr>
                ) : tipos.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, fontWeight: 700, background: t.color + '22', color: t.color }}>
                        {t.nombre}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: t.color, border: '2px solid ' + t.color + '55' }} />
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <button onClick={() => toggleActivoTipo(t)} style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: t.activo ? '#f0fdf4' : '#fef2f2', color: t.activo ? '#16a34a' : '#dc2626',
                      }}>{t.activo ? 'Activo' : 'Inactivo'}</button>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <button className="btn-ghost" onClick={() => { setEditTipo(t); setTipoForm({ nombre: t.nombre, color: t.color }); setErrT(''); setShowTipo(true) }} style={{ padding: '4px 8px' }}>
                        <Edit2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
