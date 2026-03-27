'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { LogIn, Loader, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { signIn, authUser, loading } = useAuth()
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [signing, setSigning]   = useState(false)

  // Si ya está autenticado, redirigir
  useEffect(() => {
    if (!loading && authUser) router.replace('/lotes')
  }, [authUser, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Ingresa tu correo y contraseña'); return }
    setSigning(true); setError('')
    const err = await signIn(email, password)
    if (err) {
      setError(err.includes('Invalid') ? 'Correo o contraseña incorrectos' : err)
      setSigning(false)
    } else {
      router.replace('/lotes')
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <Loader size={24} className="animate-spin" style={{ color: 'var(--blue)' }} />
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f1f5f9 50%, #e0f2fe 100%)',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>

        {/* Logo / Título */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo-domusone.jpg"
            alt="DomusOne"
            style={{ height: 100, width: 'auto', marginBottom: 4, mixBlendMode: 'multiply', display: 'block', margin: '0 auto 4px' }}
          />
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Sistema de Administración Residencial
          </div>
        </div>

        {/* Card de login */}
        <div style={{
          background: '#ffffff', borderRadius: 16, padding: '32px',
          boxShadow: '0 4px 24px rgba(37,99,235,0.08), 0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>
            Iniciar Sesión
          </h2>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Correo electrónico</label>
              <input
                className="input"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={signing}
              style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 14, marginTop: 4 }}>
              {signing
                ? <><Loader size={14} className="animate-spin" /> Entrando…</>
                : <><LogIn size={14} /> Entrar</>
              }
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          Acceso restringido · Solo usuarios autorizados
        </div>
      </div>
    </div>
  )
}
