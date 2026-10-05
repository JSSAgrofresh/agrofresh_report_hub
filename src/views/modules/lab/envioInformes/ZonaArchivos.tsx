import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { tamanoLegible } from '@/features/envioInformes'
import { IconUpload } from '@/components/ui/icons'
import styles from './EnvioInformes.module.css'

interface ZonaArchivosProps {
  archivos: File[]
  onChange: (archivos: File[]) => void
  deshabilitado?: boolean
}

const ACEPTADOS = '.pdf,.xlsx,.xls,.csv,.zip,.png,.jpg,.jpeg,.docx'

/** Arrastrar o elegir los archivos del informe. Un PDF repetido (mismo nombre y
 * tamaño) no se agrega dos veces. */
export function ZonaArchivos({ archivos, onChange, deshabilitado }: ZonaArchivosProps) {
  const entrada = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)

  function agregar(nuevos: FileList | File[]) {
    const lista = [...archivos]
    for (const f of Array.from(nuevos)) {
      if (!lista.some((x) => x.name === f.name && x.size === f.size)) lista.push(f)
    }
    onChange(lista)
  }

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setEncima(false)
    if (!deshabilitado && e.dataTransfer.files.length) agregar(e.dataTransfer.files)
  }

  return (
    <div>
      <div
        className={`${styles.zona} ${encima ? styles.zonaEncima : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!deshabilitado) setEncima(true) }}
        onDragLeave={() => setEncima(false)}
        onDrop={alSoltar}
      >
        <IconUpload className={styles.zonaIcono} aria-hidden="true" />
        <p className={styles.zonaTitulo}>Arrastra aquí el informe del laboratorio</p>
        <p className={styles.zonaAyuda}>PDF principalmente; también Excel, imágenes o ZIP. Hasta 20 MB cada uno.</p>
        <button
          type="button"
          className={styles.botonSecundario}
          disabled={deshabilitado}
          onClick={() => entrada.current?.click()}
        >
          Elegir archivos
        </button>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={ACEPTADOS}
          hidden
          aria-label="Archivos del informe"
          onChange={(e) => {
            if (e.target.files) agregar(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {archivos.length > 0 && (
        <ul className={styles.archivos}>
          {archivos.map((f) => (
            <li key={`${f.name}-${f.size}`} className={styles.archivo}>
              <span className={styles.archivoTipo}>{(f.name.split('.').pop() ?? '').toUpperCase().slice(0, 4)}</span>
              <span className={styles.archivoNombre}>{f.name}</span>
              <span className={styles.archivoPeso}>{tamanoLegible(f.size)}</span>
              <button
                type="button"
                className={styles.chipQuitar}
                onClick={() => onChange(archivos.filter((x) => x !== f))}
                aria-label={`Quitar ${f.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
