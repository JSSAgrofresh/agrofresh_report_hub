import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { IconArchivoPlano, IconCarpeta } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import {
  eliminarArchivo,
  eliminarCarpeta,
  fechaHora,
  formatoTamano,
  listarCarpeta,
  renombrarArchivo,
  rutaPdfArchivo,
} from '@/features/auditoriaInterna'
import type { ContenidoCarpeta } from '@/features/auditoriaInterna'
import { descargarArchivo } from '@/services/http/descargar'
import styles from './CarpetasView.module.css'

/**
 * Carpetas de auditoría: los PDF que Converter guarda en el bucket "auditoria"
 * de R2, como <laboratorio>/<ship to>/<archivo>.pdf. Las carpetas nacen con su
 * primer informe; no existe ninguna vacía. Cualquiera con el módulo mira y
 * descarga; borrar y renombrar es solo del admin general, y la carpeta raíz no
 * se puede borrar.
 */
export function CarpetasView() {
  const { user } = useAuth()
  const puedeEditar = user ? esAdminGeneral(user) : false

  const [ruta, setRuta] = useState('')
  const [contenido, setContenido] = useState<ContenidoCarpeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // Subir este número vuelve a leer la carpeta (tras borrar o renombrar).
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarCarpeta(ruta)
      .then((c) => {
        if (cancelado) return
        setContenido(c)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setContenido(null)
        setError(e instanceof Error ? e.message : 'No se pudo abrir la carpeta.')
      })
    return () => {
      cancelado = true
    }
  }, [ruta, recarga])

  async function ejecutar(accion: () => Promise<unknown>) {
    setOcupado(true)
    try {
      await accion()
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupado(false)
    }
  }

  function borrarCarpeta(nombre: string, rutaCarpeta: string) {
    if (!window.confirm(`¿Borrar la carpeta «${nombre}» con todos los informes que tiene adentro? No se puede deshacer.`)) return
    void ejecutar(() => eliminarCarpeta(rutaCarpeta))
  }

  function borrarArchivo(nombre: string, rutaArchivo: string) {
    if (!window.confirm(`¿Borrar «${nombre}»? No se puede deshacer.`)) return
    void ejecutar(() => eliminarArchivo(rutaArchivo))
  }

  function renombrar(nombre: string, rutaArchivo: string) {
    const nuevo = window.prompt('Nuevo nombre del archivo', nombre.replace(/\.pdf$/i, ''))
    if (!nuevo || !nuevo.trim()) return
    void ejecutar(() => renombrarArchivo(rutaArchivo, nuevo.trim()))
  }

  const migas = ruta ? ruta.split('/') : []
  const vacia = contenido && contenido.carpetas.length === 0 && contenido.archivos.length === 0

  return (
    <div>
      <Header
        title="Carpetas de auditoría"
        description="Los informes en PDF, ordenados por laboratorio y ship to. Cada carpeta aparece cuando llega su primer informe."
      />

      <nav className={styles.migas} aria-label="Ruta">
        <button type="button" onClick={() => setRuta('')} className={cn(!ruta && styles.migaActiva)}>
          auditoria
        </button>
        {migas.map((nombre, i) => (
          <span key={i} className={styles.migaGrupo}>
            <span className={styles.migaSeparador}>/</span>
            <button
              type="button"
              onClick={() => setRuta(migas.slice(0, i + 1).join('/'))}
              className={cn(i === migas.length - 1 && styles.migaActiva)}
            >
              {nombre}
            </button>
          </span>
        ))}
      </nav>

      {error && <p className={styles.error}>⚠ {error}</p>}

      {contenido && (
        <Card className={styles.lista}>
          {vacia ? (
            <p className={styles.vacio}>
              {ruta
                ? 'Esta carpeta está vacía.'
                : 'Todavía no hay informes. Las carpetas se crean solas cuando se sube el primer informe desde Converter.'}
            </p>
          ) : (
            <ul>
              {contenido.carpetas.map((c) => (
                <li key={c.ruta} className={styles.fila}>
                  <button type="button" className={styles.entrada} onClick={() => setRuta(c.ruta)}>
                    <IconCarpeta className={styles.icono} />
                    <span className={styles.nombre}>{c.nombre}</span>
                  </button>
                  {puedeEditar && (
                    <button type="button" className={styles.accion} disabled={ocupado} onClick={() => borrarCarpeta(c.nombre, c.ruta)}>
                      Borrar
                    </button>
                  )}
                </li>
              ))}
              {contenido.archivos.map((a) => (
                <li key={a.ruta} className={styles.fila}>
                  <button
                    type="button"
                    className={styles.entrada}
                    title="Descargar"
                    onClick={() => void descargarArchivo(rutaPdfArchivo(a.ruta), a.nombre)}
                  >
                    <IconArchivoPlano className={styles.icono} />
                    <span className={styles.nombre}>{a.nombre}</span>
                  </button>
                  <span className={styles.detalle}>
                    {a.numero_solicitud && <span className={styles.ot}>{a.numero_solicitud}</span>}
                    <span>{a.fecha_envio ? `Enviado ${fechaHora(a.fecha_envio)}` : 'Sin fecha de envío'}</span>
                    <span>{formatoTamano(a.tamano_bytes)}</span>
                  </span>
                  {puedeEditar && (
                    <span className={styles.acciones}>
                      <button type="button" className={styles.accion} disabled={ocupado} onClick={() => renombrar(a.nombre, a.ruta)}>
                        Renombrar
                      </button>
                      <button type="button" className={styles.accion} disabled={ocupado} onClick={() => borrarArchivo(a.nombre, a.ruta)}>
                        Borrar
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
