import { useEffect, useState } from 'react'
import { obtenerFotoCruce } from '@/features/emitir'

interface FotoCruceProps {
  archivo: string
  alt: string
  className?: string
  /** Cambia cuando se reemplaza la foto, para volver a bajarla. */
  version?: number
}

/** La foto de un cruce. Se baja con el token y se muestra desde una URL local:
 * un <img src> directo al backend no lleva la sesión y daría 401. */
export function FotoCruce({ archivo, alt, className, version = 0 }: FotoCruceProps) {
  const [estado, setEstado] = useState<{ clave: string; url: string | null } | null>(null)
  const clave = `${archivo}|${version}`

  useEffect(() => {
    let cancelado = false
    let local: string | null = null
    obtenerFotoCruce(archivo)
      .then((blob) => {
        if (cancelado) return
        local = URL.createObjectURL(blob)
        setEstado({ clave, url: local })
      })
      .catch(() => !cancelado && setEstado({ clave, url: null }))
    return () => {
      cancelado = true
      if (local) URL.revokeObjectURL(local)
    }
  }, [archivo, clave])

  if (estado?.clave !== clave) return <p>Cargando foto…</p>
  if (!estado.url) return <p>No se pudo cargar la foto.</p>
  return <img src={estado.url} alt={alt} className={className} />
}
