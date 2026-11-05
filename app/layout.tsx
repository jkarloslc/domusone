import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { ConfigProvider } from '@/lib/ConfigContext'
import { AuthProvider } from '@/lib/AuthContext'
import RootDashWrapper from '@/components/layout/RootDashWrapper'

// El título de la pestaña depende del dominio: golf-one.mx → Golf-One, el resto → DomusOne
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0].toLowerCase()
  const esClub = host === 'golf-one.mx' || host.endsWith('.golf-one.mx')
  return esClub
    ? { title: 'Golf-One', description: 'Sistema de administración de club de golf' }
    : { title: 'DomusOne', description: 'Sistema de administración residencial' }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <ConfigProvider>
            <RootDashWrapper>
              {children}
            </RootDashWrapper>
          </ConfigProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
