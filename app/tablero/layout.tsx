import DashLayout from '@/components/layout/DashLayout'

/** Cualquier usuario autenticado puede usar Mi Tablero (sin filtro de módulo). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashLayout>{children}</DashLayout>
}
