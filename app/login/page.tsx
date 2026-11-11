'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getHomeRouteByRole, useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { LogIn, Loader, Eye, EyeOff, X } from 'lucide-react'

export default function LoginPage() {
  const { signIn, authUser, loading } = useAuth()
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [signing, setSigning]   = useState(false)
  // Marca Golf-One solo cuando se entra por golf-one.mx (se resuelve en el cliente)
  const [esClub, setEsClub]     = useState(false)
  const [verAviso, setVerAviso] = useState(false)
  const [aviso, setAviso]       = useState('')
  useEffect(() => {
    const h = window.location.hostname.toLowerCase()
    setEsClub(h === 'golf-one.mx' || h.endsWith('.golf-one.mx'))
  }, [])

  // Si ya está autenticado, redirigir a la ruta correcta según rol
  useEffect(() => {
    if (!loading && authUser) router.replace(getHomeRouteByRole(authUser.rolReal))
  }, [authUser, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Ingresa tu correo y contraseña'); return }
    setSigning(true); setError('')
    const err = await signIn(email, password)
    if (err) {
      setError(err.includes('Invalid') ? 'Correo o contraseña incorrectos' : err)
      setSigning(false)
    }
    // La redirección la maneja el useEffect cuando authUser se actualiza
  }

  const recuperar = async () => {
    setError(''); setAviso('')
    if (!email) { setError('Escribe tu correo y vuelve a dar clic en “¿Olvidaste tu contraseña?”'); return }
    setSigning(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/cambiar-password`,
    })
    setSigning(false)
    if (error) { setError(error.message); return }
    setAviso('Si el correo está registrado, te llegará un enlace para definir una nueva contraseña.')
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
      position: 'relative',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>

        {/* Logo / Título */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo-domusone.jpg"
            alt="DomusOne"
            style={{ height: 100, width: 'auto', marginBottom: 4, mixBlendMode: 'multiply', display: 'block', margin: '0 auto 4px' }}
          />
          {esClub && (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em', margin: '4px 0 2px' }}>
              Golf-One
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Administración Club de Golf y Fraccionamiento
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

          {aviso && (
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontSize: 13, marginBottom: 16 }}>
              {aviso}
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

            <button type="button" onClick={recuperar} disabled={signing}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--blue)', textDecoration: 'underline', alignSelf: 'center' }}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          Acceso restringido · Solo usuarios autorizados
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 16, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: '0 20px' }}>
        Un software de Asesoría en Sistemas y Administración JK SAS de CV
        <div style={{ marginTop: 4 }}>
          <button type="button" onClick={() => setVerAviso(true)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--blue)', textDecoration: 'underline' }}>
            Aviso de Privacidad
          </button>
        </div>
      </div>

      {verAviso && (
        <div onClick={() => setVerAviso(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Aviso de Privacidad"
            style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Aviso de Privacidad</h3>
              <button type="button" onClick={() => setVerAviso(false)} aria-label="Cerrar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', textAlign: 'left' }}>
              <p><strong>Responsable.</strong> Asesoría en Sistemas y Administración JK SAS de CV (en adelante, “el Responsable”), titular de la plataforma DomusOne / Golf-One, es responsable del tratamiento de sus datos personales, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).</p>
              <p><strong>Datos que se recaban.</strong> Datos de identificación y contacto (nombre, correo electrónico, teléfono, domicilio), datos de acceso a la plataforma, datos relacionados con lotes, membresías, cuotas y pagos, y datos fiscales para facturación.</p>
              <p><strong>Finalidades.</strong> Administrar el acceso y uso de la plataforma; gestionar la relación con propietarios, socios, residentes, proveedores y colaboradores; cobranza, facturación y conciliación de pagos; control de accesos y seguridad; comunicación de avisos operativos; y cumplimiento de obligaciones legales y contractuales.</p>
              <p><strong>Transferencias.</strong> Sus datos no se transferirán a terceros sin su consentimiento, salvo a autoridades competentes cuando la ley lo exija y a proveedores de servicios necesarios para la operación de la plataforma (alojamiento, facturación electrónica y similares), quienes están obligados a guardar confidencialidad.</p>
              <p><strong>Medidas de seguridad.</strong> Se mantienen medidas administrativas, técnicas y físicas para proteger sus datos contra daño, pérdida, alteración, acceso o tratamiento no autorizado.</p>
              <p><strong>Derechos ARCO.</strong> Usted puede acceder, rectificar o cancelar sus datos personales, oponerse a su tratamiento y revocar su consentimiento, solicitándolo por escrito a la administración de su club o fraccionamiento, o al Responsable.</p>
              <p><strong>Cambios al aviso.</strong> El presente aviso puede modificarse; cualquier cambio se dará a conocer en esta plataforma.</p>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
              <button type="button" className="btn-primary" onClick={() => setVerAviso(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
