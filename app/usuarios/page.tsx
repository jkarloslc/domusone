'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Plus, Edit2, Save, Loader, X, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

type Usuario = { id: string; nombre: string; rol: string; activo: boolean; created_at: string; email?: string }

const ROLES = [
  { value: 'superadmin',        label: 'Super Administrador',   desc: 'Acceso total incluyendo Usuarios, Config y eliminación de registros' },
  { value: 'admin',             label: 'Administrador',         desc: 'Acceso completo a todos los módulos operativos. Sin acceso a Usuarios ni Config.' },
  { value: 'usuarioadmin',      label: 'Administrador (Op.)',   desc: 'Igual que Admin sin acceso a Mantenimiento' },
  { value: 'usuariomantto',     label: 'Administrador (Mant.)', desc: 'Igual que Admin sin acceso a Tesorería' },
  { value: 'fraccionamiento',   label: 'Fraccionamiento',       desc: 'Acceso amplio operativo: residencial, compras, tesorería, reportes' },
  { value: 'atencion_residentes', label: 'Atención a Residentes', desc: 'Lotes, propietarios, contratos, escrituras, incidencias, reportes' },
  { value: 'cobranza',          label: 'Cobranza',               desc: 'Lotes y propietarios en consulta, cobranza, facturas, reportes' },
  { value: 'tesoreria',         label: 'Tesorería',              desc: 'Módulo de tesorería y CXP, reportes' },
  { value: 'compras',           label: 'Compras',                desc: 'Requisiciones, cotizaciones, OC, OP, artículos, proveedores, CXP' },
  { value: 'compras_supervisor',label: 'Supervisor de Compras',  desc: 'Todo compras + autorización de cotizaciones, OC y requisiciones' },
  { value: 'almacen',           label: 'Almacén',                desc: 'Recepciones, transferencias, artículos, inventario' },
  { value: 'mantenimiento',     label: 'Mantenimiento',          desc: 'Órdenes de trabajo y proyectos de mantenimiento' },
  { value: 'vigilancia',        label: 'Vigilancia',             desc: 'Accesos, incidencias, lotes y propietarios en consulta' },
  { value: 'seguridad',         label: 'Seguridad',              desc: 'Accesos, incidencias y requisiciones en consulta' },
]

export default function UsuariosPage() {
  const { authUser } = useAuth()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]   = useState<Usuario | null>(null)

  const fetchData = async () => {
    setLoading(true)
    // Cargar usuarios + emails de auth.users via RPC o join
    const { data } = await supabase.schema('cfg' as any)
      .from('usuarios').select('*').order('created_at')
    setUsuarios(data as Usuario[] ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Solo superadmin puede ver esta página
  if (authUser?.rol !== 'superadmin') {
    return (
      <div style={{ padding: '32px 36px' }}>
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>🔒 Acceso exclusivo para Super Administrador</div>
      </div>
    )
  }


  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Users size={16} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sistema</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Usuarios</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Gestión de accesos y roles</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={14} /> Nuevo Usuario
        </button>
      </div>

      {/* Guía de roles */}
   
   <!--<div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {ROLES.map(r => (
          <div key={r.value} className="card" style={{ padding: '10px 14px', minWidth: 140 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', marginBottom: 2 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.desc}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Status</th>
              <th>Desde</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead><!--

          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}><Loader size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--blue)' }} /></td></tr>
            ) : usuarios.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin usuarios registrados</td></tr>
            ) : usuarios.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.nombre}</td>
                <td>
                  <span className="badge badge-libre">{ROLES.find(r => r.value === u.rol)?.label ?? u.rol}</span>
                </td>
                <td>
                  {u.activo
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#15803d' }}><CheckCircle size={12} /> Activo</span>
                    : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#dc2626' }}><XCircle size={12} /> Inactivo</span>
                  }
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {new Date(u.created_at).toLocaleDateString('es-MX')}
                </td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(u); setModalOpen(true) }}>
                    <Edit2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && <UsuarioModal usuario={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
    </div>
  )
}

function UsuarioModal({ usuario, onClose, onSaved }: { usuario: Usuario | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !usuario
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    nombre:   usuario?.nombre ?? '',
    rol:      usuario?.rol ?? 'accesos',
    activo:   usuario?.activo ?? true,
    email:    '',
    password: '',
  })

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (isNew && (!form.email || !form.password)) { setError('Email y contraseña son obligatorios'); return }
    setSaving(true); setError('')

    try {
      if (isNew) {
        // Crear usuario en Supabase Auth
        const { data: authData, error: authErr } = await supabase.auth.admin
          ? { data: null, error: { message: 'Usa el panel de Supabase para crear usuarios' } }
          : { data: null, error: { message: 'Crea el usuario desde Supabase → Authentication → Users, luego asígnale rol aquí' } }

        if (authErr) { setError(authErr.message); setSaving(false); return }
      } else {
        // Actualizar nombre, rol y status
        const { error: err } = await supabase.schema('cfg' as any).from('usuarios')
          .update({ nombre: form.nombre.trim(), rol: form.rol, activo: form.activo })
          .eq('id', usuario.id)
        if (err) { setError(err.message); setSaving(false); return }
      }
      setSaving(false); onSaved()
    } catch (e: any) {
      setError(e.message); setSaving(false)
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
            {isNew ? 'Nuevo Usuario' : `Editar: ${usuario.nombre}`}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {isNew && (
            <div style={{ padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1d4ed8' }}>
              <strong>Para crear un nuevo usuario:</strong><br />
              1. Ve a Supabase → Authentication → Users → Add user<br />
              2. Crea el usuario con email y contraseña<br />
              3. Copia el UUID generado<br />
              4. Ejecuta en SQL Editor:<br />
              <code style={{ display: 'block', marginTop: 6, padding: '6px 8px', background: '#dbeafe', borderRadius: 4, fontSize: 11 }}>
                INSERT INTO cfg.usuarios (id, nombre, rol, activo)<br />
                VALUES ('UUID', 'Nombre', 'rol', true);
              </code>
            </div>
          )}

          {!isNew && (
            <>
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.nombre} onChange={set('nombre')} />
              </div>
              <div>
                <label className="label">Rol</label>
                <select className="select" value={form.rol} onChange={set('rol')}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={form.activo ? 'true' : 'false'}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          {!isNew && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
