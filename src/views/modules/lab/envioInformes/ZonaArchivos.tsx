import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { IconUpload } from '@/components/ui/icons'
import styles from './EnvioInformes.module.css'

interface ZonaArchivosProps {
  onAgregar: (archivos: File[]) => void
  deshabilitado?: boolean
  leyendo?: boolean
}

/** Arrastrar o elegir los PDF de los informes. Se pueden soltar varios de una
 * vez: cada uno se lee y queda como un correo aparte. */
export function ZonaArchivos({ onAgregar, deshabilitado, leyendo }: ZonaArchivosProps) {
  const entrada = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)
  const bloqueada = deshabilitado || leyendo

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setEncima(false)
    if (!bloqueada && e.dataTransfer.files.length) onAgregar(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      className={`${styles.zona} ${encima ? styles.zonaEncima : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!bloqueada) setEncima(true) }}
      onDragLeave={() => setEncima(false)}
      onDrop={alSoltar}
    >
      <IconUpload className={styles.zonaIcono} aria-hidden="true" />
      <p className={styles.zonaTitulo}>
        {leyendo ? 'Leyendo los informes…' : 'Arrastra aquí los informes en PDF'}
      </p>
      <p className={styles.zonaAyuda}>
        Puedes subir varios a la vez. De cada uno se leen el Sold To, el Ship To y la especie para elegir la lista.
      </p>
      <button
        type="button"
        className={styles.botonSecundario}
        disabled={bloqueada}
        onClick={() => entrada.current?.click()}
      >
        Elegir archivos
      </button>
      <input
        ref={entrada}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        hidden
        aria-label="Informes en PDF"
        onChange={(e) => {
          if (e.target.files) onAgregar(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}
