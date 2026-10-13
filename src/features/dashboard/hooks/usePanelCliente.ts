import { useEffect, useState } from 'react'
import type { AsyncStatus } from '@/types'
import { fetchPanelCliente } from '../api/panelClienteApi'
import type { PanelCliente } from '../types'

/** Las cifras del Panel general de un cliente: se piden una vez al abrir el panel. */
export function usePanelCliente(activo: boolean) {
  const [datos, setDatos] = useState<PanelCliente | null>(null)
  const [status, setStatus] = useState<AsyncStatus>(activo ? 'loading' : 'idle')

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    fetchPanelCliente()
      .then((data) => {
        if (cancelado) return
        setDatos(data)
        setStatus('success')
      })
      .catch(() => {
        if (!cancelado) setStatus('error')
      })
    return () => { cancelado = true }
  }, [activo])

  return { datos, status }
}
