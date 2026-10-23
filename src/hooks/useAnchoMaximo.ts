import { useSyncExternalStore } from 'react'

/** `true` cuando la ventana mide `px` de ancho o menos (teléfono, tablet chica). En un entorno sin `matchMedia` (tests) es siempre `false`. */
export function useAnchoMaximo(px: number): boolean {
  const consulta = `(max-width: ${px}px)`
  return useSyncExternalStore(
    (avisar) => {
      const m = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(consulta) : null
      m?.addEventListener?.('change', avisar)
      return () => m?.removeEventListener?.('change', avisar)
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(consulta).matches : false),
    () => false,
  )
}

/** `true` cuando se cumple una media query (p. ej. teléfono acostado). En un entorno sin `matchMedia` (tests) es siempre `false`. */
export function useMediaQuery(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(consulta) : null
      m?.addEventListener?.('change', avisar)
      return () => m?.removeEventListener?.('change', avisar)
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(consulta).matches : false),
    () => false,
  )
}
