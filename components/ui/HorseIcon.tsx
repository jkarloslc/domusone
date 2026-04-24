// Ícono de caballo SVG — no disponible en lucide-react v0.383
export default function HorseIcon({ size = 20, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {/* Cuerpo */}
      <path d="M5 17c0 2 1.5 3 3 3s3-1 3-3v-5" />
      {/* Lomo */}
      <path d="M11 12c1-3 4-4 5-4h1.5c.8 0 1.5.7 1.5 1.5v1c0 .8-.4 1.5-1 2L17 14" />
      {/* Cuello y cabeza */}
      <path d="M11 12c-1-2-1-4 0-6 1-1.5 3-2 4-1l1.5 1" />
      {/* Patas delanteras */}
      <path d="M8 12v5M11 12v5" />
      {/* Cola */}
      <path d="M5 14c-1 0-2 .5-2 2" />
      {/* Oreja */}
      <path d="M14 6l1-2" />
    </svg>
  )
}
