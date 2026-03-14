import type { Metadata } from 'next'
import './globals.css'
import { ConfigProvider } from '@/lib/ConfigContext'
import { AuthProvider } from '@/lib/AuthContext'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'DomusOne',
  description: 'Sistema de administración residencial',
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
