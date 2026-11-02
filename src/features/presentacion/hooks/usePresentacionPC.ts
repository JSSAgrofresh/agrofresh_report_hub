import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { cerrarPresentacion, sincronizarPresentacion } from '../api'
import type { EstadoPresentacion } from '../api'

const CADA_MS = 1000

/**
 * El lado del computador. La presentación vive en un iframe del mismo origen y le avisa a este marco su
 * estado (`postMessage`); este hook se lo cuenta al servidor cada segundo y, de vuelta, recibe las órdenes
 * que el teléfono dejó y se las pasa al iframe. Esa llamada es también su «latido»: mientras llegue, el
 * teléfono ve la presentación abierta.
 */
export function usePresentacionPC(iframe: RefObject<HTMLIFrameElement | null>) {
  const [controlConectado, setControlConectado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const estado = useRef<EstadoPresentacion | null>(null)
  const ultimaSeq = useRef(-1) // -1 = recién abierta: no se ejecutan las órdenes de la vez anterior

  useEffect(() => {
    let vivo = true
    let pronto: number | null = null
    let enCurso = false
    let enVuelo: Promise<unknown> = Promise.resolve()
    const latir = async () => {
      if (enCurso) return
      enCurso = true
      try {
        const llamada = sincronizarPresentacion(estado.current, ultimaSeq.current)
        enVuelo = llamada.catch(() => undefined)
        const r = await llamada
        if (!vivo) return
        ultimaSeq.current = r.seq
        setControlConectado(r.control_conectado)
        setError(null)
        for (const c of r.comandos) {
          iframe.current?.contentWindow?.postMessage({ tipo: 'cmd', cmd: c.tipo, datos: c.datos }, window.location.origin)
        }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo hablar con el servidor.')
      } finally {
        enCurso = false
      }
    }
    // Cuando la presentación cambia de estado se lo cuenta al servidor enseguida, sin esperar al próximo latido:
    // así el teléfono ve el cambio casi al instante.
    const alMensaje = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframe.current?.contentWindow) return
      const m = e.data as { tipo?: string; estado?: EstadoPresentacion } | null
      if (m?.tipo !== 'estado' || !m.estado) return
      const cambio = JSON.stringify(m.estado) !== JSON.stringify(estado.current)
      estado.current = m.estado
      if (cambio && pronto === null) pronto = window.setTimeout(() => { pronto = null; void latir() }, 150)
    }
    window.addEventListener('message', alMensaje)
    void latir()
    const cada = window.setInterval(() => void latir(), CADA_MS)
    return () => {
      vivo = false
      if (pronto !== null) window.clearTimeout(pronto)
      window.clearInterval(cada)
      window.removeEventListener('message', alMensaje)
      // Se avisa del cierre DESPUÉS de que termine la llamada en curso: si no, esa llamada «reabriría» la presentación.
      void enVuelo.then(() => cerrarPresentacion()).catch(() => undefined)
    }
  }, [iframe])

  return { controlConectado, error }
}
