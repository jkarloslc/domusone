import DashLayout from '@/components/layout/DashLayout'
export default function Layout({ children }: { children: React.ReactNode }) {
  // 'lotes' es el módulo de acceso mínimo — cualquier rol residencial lo tiene
  return <DashLayout modulo="lotes">{children}</DashLayout>
}
