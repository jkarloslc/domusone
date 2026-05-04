import DashLayout from '@/components/layout/DashLayout'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashLayout modulo="golf-recibos">{children}</DashLayout>
}
