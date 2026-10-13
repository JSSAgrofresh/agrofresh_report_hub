import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconoArchivo, IconoCarpeta } from './IconoArchivo'
import { descargarInformeCliente, listarInformesCliente, verInformeCliente } from '@/features/storage'
import type { EntradaStorage } from '@/features/storage'
import styles from './InformesClienteView.module.css'

/** «2026-10-13» -> «13-10-2026»; cualquier otro nombre queda como está. */
function nombreVisible(nombre: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nombre)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : nombre
}

/**
 * Storage de una cuenta de cliente: una sola carpeta, la de SU Ship To, con los informes en PDF.
 * El servidor no le deja salir de ahí (`informes_cliente.py`); acá solo se navega.
 */
export function InformesClienteView() {
  const [ruta, setRuta] = useState('')
  const [entradas, setEntradas] = useState<EntradaStorage[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    listarInformesCliente(ruta)
      .then((l) => {
        if (!vigente) return
        setError(null)
        // En la raíz con una sola carpeta (su Ship To) se entra directo.
        if (!ruta && l.entradas.length === 1 && l.entradas[0].tipo === 'carpeta') {
          setRuta(l.entradas[0].ruta)
          return
        }
        setEntradas(l.entradas)
      })
      .catch(() => {
        if (!vigente) return
        setEntradas([])
        setError('No pudimos leer tus informes. Intenta de nuevo en unos minutos.')
      })
    return () => {
      vigente = false
    }
  }, [ruta])

  const partes = ruta.split('/').filter(Boolean)
  const carpetas = (entradas ?? []).filter((e) => e.tipo === 'carpeta')
  const archivos = (entradas ?? []).filter((e) => e.tipo !== 'carpeta')

  return (
    <section className={styles.wrap} aria-label="Tus informes">
      <header>
        <h1 className={styles.titulo}>Informes</h1>
        <p className={styles.nota}>Los informes de laboratorio de tu sucursal, ordenados por fecha de muestreo.</p>
      </header>

      <Card>
        <nav className={styles.migas} aria-label="Ubicación">
          <button type="button" onClick={() => { setEntradas(null); setRuta('') }} disabled={partes.length <= 1}>Inicio</button>
          {partes.map((p, i) => (
            <span key={`${i}-${p}`}>
              <span aria-hidden="true"> / </span>
              <button
                type="button"
                disabled={i === partes.length - 1}
                onClick={() => { setEntradas(null); setRuta(partes.slice(0, i + 1).join('/')) }}
              >
                {nombreVisible(p)}
              </button>
            </span>
          ))}
        </nav>

        {error && <p className={styles.error}>{error}</p>}
        {entradas === null ? (
          <Skeleton />
        ) : entradas.length === 0 && !error ? (
          <p className={styles.vacio}>Todavía no hay informes en esta carpeta.</p>
        ) : (
          <>
            {carpetas.length > 0 && (
              <ul className={styles.carpetas}>
                {carpetas.map((e) => (
                  <li key={e.ruta}>
                    <button type="button" className={styles.tarjetaCarpeta} onClick={() => { setEntradas(null); setRuta(e.ruta) }}>
                      <IconoCarpeta grande />
                      <span className={styles.nombreCarpeta}>{nombreVisible(e.nombre)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {archivos.length > 0 && (
              <ul className={styles.archivos}>
                {archivos.map((e) => (
                  <li key={e.ruta} className={styles.fila}>
                    <IconoArchivo nombre={e.nombre} />
                    <span className={styles.archivo} title={e.nombre}>{e.nombre}</span>
                    <span className={styles.acciones}>
                      <button type="button" onClick={() => void verInformeCliente(e.ruta)}>Ver</button>
                      <button type="button" onClick={() => void descargarInformeCliente(e.ruta)}>Descargar</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </section>
  )
}
