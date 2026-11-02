import { useEffect, useState } from 'react'
import { obtenerTop, type QuienTop, type TopMonitoreo } from '../lib/monitoreo'

/** Lo que más se hizo en el período (acciones, personas y pantallas), para personal, clientes o todos. Se actualiza cada minuto. */
export function useTop(dias: number, quien: QuienTop) {
  const [datos, setDatos] = useState<TopMonitoreo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const leer = () =>
      obtenerTop(dias, quien)
        .then((r) => { if (vivo) { setDatos(r); setError(null) } })
        .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer.') })
    void leer()
    const id = window.setInterval(() => { if (!document.hidden) void leer() }, 60000)
    return () => { vivo = false; window.clearInterval(id) }
  }, [dias, quien])
  return { datos: datos?.dias === dias && datos.quien === quien ? datos : null, error }
}
