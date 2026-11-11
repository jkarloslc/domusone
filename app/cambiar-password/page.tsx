'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getHomeRouteByRole, useAuth } from '@/lib/AuthContext'
import { KeyRound, Loader, Eye, EyeOff, CheckCircle } from 'lucide-react'

/**
 * Definir / cambiar contraseña.
 * - Llega aquí el link de recuperación de Supabase (sesión tipo recovery).
 * - También la usa un usuario ya logueado desde el Sidebar.
 * Ruta pública (sin DashLayout) — ver PUBLIC_PATHS en RootDashWrapper.
 */
export default function CambiarPasswordPage() {
  const router = useRouter()
  const { authUser } = useAuth()
  const [haySesion, setHaySesion] = useState<boolean | null>(null)
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true
    // El token del link puede tardar un instante en procesarse
    const revisar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (vivo) setHaySesion(!!session)
    }
    revisar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (vivo && session) setHaySesion(true)
    })
    return () => { vivo = false; subscription.unsubscribe() }
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (pass1.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (pass1 !== pass2) { setError('Las contraseñas no coinciden'); return }
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password: pass1 })
    setGuardando(false)
    if (error) {
      setError(error.message.includes('different from the old')
        ? 'La nueva contraseña debe ser distinta a la anterior'
        : error.message)
      return
    }
    setListo(true)
  }

  const irAInicio = () => {
    router.replace(authUser ? getHomeRouteByRole(authUser.rolReal) : '/')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f1f5f9 50%, #e0f2fe 100%)',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo-domusone.jpg" alt="DomusOne"
            style={{ height: 80, width: 'auto', mixBlendMode: 'multiply', display: 'block', margin: '0 auto' }} />
        </div>

        <div style={{
          background: '#fff', borderRadius: 16, padding: 32,
          boxShadow: '0 4px 24px rgba(37,99,235,0.08), 0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} /> Cambiar contraseña
          </h2>

          {haySesion === null && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Loader size={20} className="animate-spin" style={{ color: 'var(--blue)' }} />
            </div>
          )}

          {haySesion === false && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              El enlace expiró o ya se usó. Solicita uno nuevo desde la pantalla de inicio de sesión
              con <strong>“¿Olvidaste tu contraseña?”</strong>.
              <button className="btn-primary" onClick={() => router.replace('/login')}
                style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
                Ir a iniciar sesión
              </button>
            </div>
          )}

          {haySesion && listo && (
            <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-primary)' }}>
              <CheckCircle size={36} style={{ color: '#15803d', marginBottom: 10 }} />
              <div>Tu contraseña se actualizó correctamente.</div>
              <button className="btn-primary" onClick={irAInicio}
                style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}>
                Continuar
              </button>
            </div>
          )}

          {haySesion && !listo && (
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <div>
                <label className="label">Nueva contraseña</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={ver ? 'text' : 'password'} value={pass1}
                    onChange={e => setPass1(e.target.value)} autoComplete="new-password" autoFocus
                    placeholder="Mínimo 8 caracteres" style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setVer(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    {ver ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Confirmar contraseña</label>
                <input className="input" type={ver ? 'text' : 'password'} value={pass2}
                  onChange={e => setPass2(e.target.value)} autoComplete="new-password" />
              </div>
              <button type="submit" className="btn-primary" disabled={guardando}
                style={{ width: '100%', justifyContent: 'center', padding: 10, fontSize: 14, marginTop: 4 }}>
                {guardando ? <><Loader size={14} className="animate-spin" /> Guardando…</> : 'Guardar contraseña'}
              </button>
              {authUser && (
                <button type="button" className="btn-ghost" onClick={irAInicio}
                  style={{ width: '100%', justifyContent: 'center' }}>
                  Cancelar
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
