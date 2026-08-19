import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatDateTimeCL } from '@/lib/locale'
import { eliminarArchivo, listarArchivos, subirArchivos, urlDescarga } from '@/features/storage'
import type { ArchivoStorage } from '@/features/storage'
import styles from './StorageView.module.css'

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StorageView() {
  const [archivos, setArchivos] = useState<ArchivoStorage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const refrescar = useCallback(async () => {
    try {
      setArchivos(await listarArchivos())
      setError(null)
    } catch {
      setError('No se pudo conectar con el backend.')
    }
  }, [])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  async function subir(lista: FileList | File[]) {
    const archivosArray = Array.from(lista)
    if (archivosArray.length === 0) return
    setSubiendo(true)
    setError(null)
    try {
      await subirArchivos(archivosArray)
      await refrescar()
    } catch {
      setError('No se pudo subir el archivo. Revisa que el backend esté corriendo.')
    } finally {
      setSubiendo(false)
    }
  }

  async function eliminar(nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? Esto lo borra de la carpeta Storage del servidor.`)) return
    try {
      await eliminarArchivo(nombre)
      await refrescar()
    } catch {
      setError('No se pudo eliminar el archivo.')
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    subir(e.dataTransfer.files)
  }

  return (
    <div>
      <Header
        title="Storage"
        description="Archivos guardados en el servidor de AgroFresh. Arrastra un archivo para subirlo."
      />

      <Card>
        <div
          className={cn(styles.zona, arrastrando && styles.zonaActiva)}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files && subir(e.target.files)}
          />
          <p className={styles.zonaTexto}>
            {subiendo ? 'Subiendo…' : 'Arrastra archivos aquí, o haz clic para elegirlos'}
          </p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {archivos === null ? (
          <p className={styles.estado}>Cargando…</p>
        ) : archivos.length === 0 ? (
          <p className={styles.estado}>Todavía no hay archivos.</p>
        ) : (
          <div className={styles.tablaCaja}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Tamaño</th>
                  <th>Modificado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {archivos.map((a) => (
                  <tr key={a.nombre}>
                    <td className={styles.nombre}>{a.nombre}</td>
                    <td className={styles.mono}>{formatoTamano(a.tamano_bytes)}</td>
                    <td className={styles.mono}>{formatDateTimeCL(a.modificado)}</td>
                    <td className={styles.acciones}>
                      <a className={styles.boton} href={urlDescarga(a.nombre)} target="_blank" rel="noreferrer">
                        Descargar
                      </a>
                      <button className={styles.botonEliminar} onClick={() => eliminar(a.nombre)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
