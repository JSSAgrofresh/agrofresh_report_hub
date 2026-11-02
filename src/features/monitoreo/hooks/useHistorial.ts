import { useEffect, useState } from 'react'
import { obtenerHistorial, type HistorialMonitoreo } from '../lib/monitoreo'

/** Las conexiones de los últimos días (una barra por día) y el tiempo acumulado de los clientes. Se actualiza cada minuto con la pantalla a la vista. */
export function useHistorial(dias = 30) {
  const [datos, setDatos] = useState<HistorialMonitoreo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const leer = () =>
      obtenerHistorial(dias)
        .then((r) => { if (vivo) { setDatos(r); setError(null) } })
        .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el historial.') })
    void leer()
    const id = window.setInterval(() => { if (!document.hidden) void leer() }, 60000)
    return () => { vivo = false; window.clearInterval(id) }
  }, [dias])
  return { datos, error }
}
