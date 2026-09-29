import { useEffect, useState } from 'react'
import { HttpError } from '@/services/http/client'
import { tipoDeArchivo } from '@/features/storage'
import type { EntradaStorage } from '@/features/storage'
import { Dialogo } from './Dialogo'
import { IconoArchivo } from './IconoArchivo'
import styles from './VistaPrevia.module.css'

const LIMITE_TEXTO = 200_000

type Contenido =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; url: string | null; texto: string | null; recortado: boolean }

interface VistaPreviaProps {
  entrada: EntradaStorage
  abrir: (ruta: string) => Promise<{ blob: Blob; nombre: string | null }>
  onDescargar: () => void
  onCerrar: () => void
}

/** Muestra imágenes, PDF y texto sin bajarlos al disco. Lo demás ofrece descargar. */
export function VistaPrevia({ entrada, abrir, onDescargar, onCerrar }: VistaPreviaProps) {
  const tipo = tipoDeArchivo(entrada.nombre)
  const [contenido, setContenido] = useState<Contenido>({ estado: 'cargando' })

  useEffect(() => {
    if (!tipo.vista) return
    let vigente = true
    let url: string | null = null
    abrir(entrada.ruta)
      .then(async ({ blob }) => {
        if (!vigente) return
        if (tipo.vista === 'texto') {
          const texto = await blob.slice(0, LIMITE_TEXTO).text()
          if (vigente) setContenido({ estado: 'listo', url: null, texto, recortado: blob.size > LIMITE_TEXTO })
        } else {
          // El servidor puede devolver «octet-stream»: sin el tipo correcto el
          // navegador descarga el PDF en vez de mostrarlo.
          url = URL.createObjectURL(new Blob([blob], { type: tipo.mime }))
          setContenido({ estado: 'listo', url, texto: null, recortado: false })
        }
      })
      .catch((e) => {
        if (vigente) {
          setContenido({
            estado: 'error',
            mensaje: e instanceof HttpError && e.message ? e.message : 'No se pudo abrir el archivo.',
          })
        }
      })
    return () => {
      vigente = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [abrir, entrada.ruta, tipo.vista, tipo.mime])

  return (
    <Dialogo
      titulo={entrada.nombre}
      ancho="amplio"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className={styles.boton} onClick={onCerrar}>
            Cerrar
          </button>
          <button type="button" className={styles.primario} onClick={onDescargar}>
            Descargar
          </button>
        </>
      }
    >
      {!tipo.vista ? (
        <div className={styles.sin}>
          <IconoArchivo nombre={entrada.nombre} grande />
          <p>No hay vista previa para este tipo de archivo. Puedes descargarlo para abrirlo.</p>
        </div>
      ) : contenido.estado === 'cargando' ? (
        <div className={styles.cargando}>
          <span className={styles.giro} aria-hidden /> Abriendo…
        </div>
      ) : contenido.estado === 'error' ? (
        <p className={styles.error}>{contenido.mensaje}</p>
      ) : contenido.url && tipo.vista === 'imagen' ? (
        <img className={styles.imagen} src={contenido.url} alt={entrada.nombre} />
      ) : contenido.url ? (
        <iframe className={styles.pdf} src={contenido.url} title={entrada.nombre} />
      ) : (
        <>
          <pre className={styles.texto}>{contenido.texto}</pre>
          {contenido.recortado && <p className={styles.nota}>Se muestra solo el comienzo del archivo.</p>}
        </>
      )}
    </Dialogo>
  )
}
