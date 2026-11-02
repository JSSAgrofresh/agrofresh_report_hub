import { useEffect, useState } from 'react'
import { obtenerClientes, type ClientesPeriodo, type OrdenClientes } from '../lib/monitoreo'

/** Los clientes (y comerciales) que se conectaron en el período, con su tiempo. Se actualiza cada 20 s con la pantalla a la vista.
 * `dias: 0` es todo el historial; `orden: 'tiempo'` los pone del que más tiempo estuvo conectado al que menos. */
export function useClientes(dias: number, orden: OrdenClientes = 'tiempo') {
  const [datos, setDatos] = useState<ClientesPeriodo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const leer = () =>
      obtenerClientes(dias, orden)
        .then((r) => { if (vivo) { setDatos(r); setError(null) } })
        .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer.') })
    void leer()
    const id = window.setInterval(() => { if (!document.hidden) void leer() }, 20000)
    return () => { vivo = false; window.clearInterval(id) }
  }, [dias, orden])
  return { datos: datos?.dias === dias && datos.orden === orden ? datos : null, error }
}
