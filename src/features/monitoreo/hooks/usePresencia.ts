import { useEffect, useRef } from 'react'
import { dispositivoDe, enviarLatido, SEGUNDOS_PAUSA } from '../lib/monitoreo'

const SEGUNDOS_ENTRE_LATIDOS = 60
/** Entre dos latidos «por interacción» tiene que pasar al menos esto (para no inundar al servidor). */
const SEGUNDOS_MINIMO_ENTRE_LATIDOS = 10

/** «Sigo aquí», con detalle: un latido por minuto (y al cambiar de pantalla) que dice en qué pantalla está, si
 * tocó algo hace poco, si la pestaña está a la vista, desde qué aparato y con qué versión. Cuando la persona vuelve
 * a tocar algo tras 3 min de pausa avisa de inmediato, para que el monitoreo la vea activa sin esperar. Si falla no pasa nada. */
export function usePresencia(ruta: string, activo: boolean) {
  const ultimaInteraccion = useRef(0)
  const ultimoLatido = useRef(0)

  useEffect(() => {
    if (!activo) return
    if (ultimaInteraccion.current === 0) ultimaInteraccion.current = Date.now() // al abrir cuenta como «recién tocó»
    const instalada = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
    const dispositivo = dispositivoDe(navigator.userAgent, window.screen?.width ?? window.innerWidth, instalada)
    const version = __BUILD__

    const latir = () => {
      ultimoLatido.current = Date.now()
      enviarLatido({
        ruta,
        inactivo_segundos: Math.round((Date.now() - ultimaInteraccion.current) / 1000),
        visible: !document.hidden,
        dispositivo,
        version,
      }).catch(() => undefined)
    }

    const alInteractuar = () => {
      const estabaEnPausa = Date.now() - ultimaInteraccion.current > SEGUNDOS_PAUSA * 1000
      ultimaInteraccion.current = Date.now()
      if (estabaEnPausa && Date.now() - ultimoLatido.current > SEGUNDOS_MINIMO_ENTRE_LATIDOS * 1000) latir()
    }
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    eventos.forEach((e) => window.addEventListener(e, alInteractuar, { passive: true, capture: true }))

    latir()
    const cada = window.setInterval(latir, SEGUNDOS_ENTRE_LATIDOS * 1000)
    document.addEventListener('visibilitychange', latir)
    return () => {
      window.clearInterval(cada)
      document.removeEventListener('visibilitychange', latir)
      eventos.forEach((e) => window.removeEventListener(e, alInteractuar, { capture: true }))
    }
  }, [ruta, activo])
}
