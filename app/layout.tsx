import type { Metadata } from 'next'
import './globals.css'
import { ConfigProvider } from '@/lib/ConfigContext'

export const metadata: Metadata = {
  title: 'DomusOne',
  description: 'Sistema de administración residencial',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ConfigProvider>
          {children}
        </ConfigProvider>
      </body>
    </html>
  )
}
