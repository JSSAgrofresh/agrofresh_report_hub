import { useRef, useState } from 'react'
import styles from './IframeModule.module.css'

interface IframeModuleProps {
  src: string
  titulo: string
}

/**
 * Embebe un módulo HTML autónomo (Trace, Converter) tal cual, sin tocar su
 * archivo en disco. Al cargar, oculta el header propio del módulo inyectando
 * una hoja de estilos en su documento (mismo origen, por eso es posible) para
 * que se sienta parte del shell en vez de una página aparte.
 */
export function IframeModule({ src, titulo }: IframeModuleProps) {
  const [cargando, setCargando] = useState(true)
  const ref = useRef<HTMLIFrameElement>(null)

  function onLoad() {
    const doc = ref.current?.contentDocument
    if (doc) {
      const style = doc.createElement('style')
      style.textContent = '.top.noprint, header.top { display: none !important; }'
      doc.head.appendChild(style)
    }
    setCargando(false)
  }

  return (
    <div className={styles.wrap}>
      {cargando && <div className={styles.cargando}>Cargando {titulo}…</div>}
      <iframe
        ref={ref}
        src={src}
        title={titulo}
        className={styles.iframe}
        onLoad={onLoad}
      />
    </div>
  )
}
