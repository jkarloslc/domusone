export default function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      width: '100%',
    }}>
      <div
        className="animate-spin"
        style={{
          width: 28,
          height: 28,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--blue)',
          borderRadius: '50%',
        }}
      />
    </div>
  )
}
