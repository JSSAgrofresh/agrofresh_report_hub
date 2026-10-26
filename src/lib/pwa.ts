/** Registra el service worker (lo que permite instalar el sistema como app). Solo en la versión publicada:
 * en desarrollo (`npm run dev`) no se registra para no confundir con cachés. Si falla, el sistema sigue igual. */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  })
}
