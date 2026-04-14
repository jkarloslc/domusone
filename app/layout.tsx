import type { Metadata } from 'next'
import './globals.css'
import { ConfigProvider } from '@/lib/ConfigContext'
import { AuthProvider } from '@/lib/AuthContext'

export const metadata: Metadata = {
  title: 'DomusOne',
  description: 'Sistema de administración residencial',
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
            {children}
          </ConfigProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
