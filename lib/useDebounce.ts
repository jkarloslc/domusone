import { useState, useEffect } from 'react'

/**
 * Retrasa la actualización de un valor hasta que el usuario
 * deje de escribir por `delay` ms. Evita queries en cada tecla.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
