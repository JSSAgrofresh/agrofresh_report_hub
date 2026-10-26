import { useEffect, useState } from 'react'
import { obtenerClientes, type ClientesPeriodo } from '../lib/monitoreo'

/** Los clientes (y comerciales) que se conectaron en el período, con su tiempo. Se actualiza cada 20 s con la pantalla a la vista. */
export function useClientes(dias: number) {
  const [datos, setDatos] = useState<ClientesPeriodo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const leer = () =>
      obtenerClientes(dias)
        .then((r) => { if (vivo) { setDatos(r); setError(null) } })
        .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer.') })
    void leer()
    const id = window.setInterval(() => { if (!document.hidden) void leer() }, 20000)
    return () => { vivo = false; window.clearInterval(id) }
  }, [dias])
  return { datos: datos?.dias === dias ? datos : null, error }
}
