import { useEffect, useRef, useState } from 'react'
import { obtenerEstadoPresentacion } from '../api'
import type { RespuestaEstado } from '../api'

/**
 * Lee cada tanto cómo va la presentación. `control` = es el control remoto (late cada segundo y avisa al
 * computador que hay un teléfono); sin eso es solo el aviso flotante (cada 6 s, y solo con la pestaña a la vista).
 */
export function useEstadoPresentacion(opciones: { control?: boolean; cadaMs?: number; activo?: boolean } = {}) {
  const { control = false, cadaMs = control ? 1000 : 6000, activo = true } = opciones
  const [datos, setDatos] = useState<RespuestaEstado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)

  useEffect(() => {
    if (!activo) return
    let vivo = true
    const leer = async () => {
      if (enCurso.current || document.hidden) return
      enCurso.current = true
      try {
        const r = await obtenerEstadoPresentacion(control)
        if (!vivo) return
        setDatos(r)
        setError(null)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer la presentación.')
      } finally {
        enCurso.current = false
      }
    }
    void leer()
    const cada = window.setInterval(() => void leer(), cadaMs)
    document.addEventListener('visibilitychange', leer)
    return () => {
      vivo = false
      window.clearInterval(cada)
      document.removeEventListener('visibilitychange', leer)
    }
  }, [control, cadaMs, activo])

  return { datos, error, setDatos }
}
