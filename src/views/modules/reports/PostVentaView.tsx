import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { AREAS } from '@/constants/areas'
import { AreaHero } from '@/features/dashboard'
import {
  cacheListaCargas,
  descargarOriginalCarga,
  descargarPdfCarga,
  eliminarCargasTrace,
  generarInformeCarga,
  listarCargasTrace,
  verCargaTrace,
} from '@/features/postventa'
import type { CargaTrace, ResumenCargaTrace } from '@/features/postventa'
import { HttpError } from '@/services/http/client'
import { useInformesCostoKilo } from '@/features/costoKilo'
import { ReporteAccutab } from './ReporteAccutab'
import { TablaInformesAccutab } from './TablaInformesAccutab'
import styles from './ReporteAccutab.module.css'

const mensaje = (err: unknown, alterno: string) =>
  err instanceof HttpError ? `El backend respondió con un error (${err.status}).` : alterno

/** Reportes de Post Venta (Accu-Tab) para el equipo: el mismo reporte que ve el cliente, más lo que solo hace el equipo (generar y eliminar informes). */
export function PostVentaView() {
  const [cargas, setCargas] = useState<ResumenCargaTrace[] | null>(() => cacheListaCargas.leer('equipo') ?? null)
  const { informes: costoKilo } = useInformesCostoKilo('equipo')
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState<string | null>(null)
  // El informe que se abre desde la tabla de abajo: se le pasa al reporte como el primero de su lista.
  const [pedida, setPedida] = useState<{ carpeta: string } | null>(null)

  const recargar = useCallback(async () => {
    try {
      const lista = await listarCargasTrace()
      cacheListaCargas.guardar('equipo', lista)
      setCargas(lista)
    } catch (err) {
      setCargas((previas) => previas ?? [])
      setError(mensaje(err, 'No se pudo conectar con el backend. Revisa que esté corriendo.'))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar()
  }, [recargar])

  async function generarInforme(carpeta: string) {
    setGenerando(carpeta)
    try {
      await generarInformeCarga(carpeta)
      await recargar()
    } catch (err) {
      setError(mensaje(err, 'No se pudo generar el informe.'))
    } finally {
      setGenerando(null)
    }
  }

  async function eliminar(carpetas: string[]) {
    try {
      const r = await eliminarCargasTrace(carpetas)
      if (r.fallidas.length) setError(`${r.fallidas.length} informe(s) ya no existían.`)
      await recargar()
    } catch (err) {
      setError(mensaje(err, 'No se pudieron eliminar los informes.'))
    }
  }

  const accionesDe = useCallback(
    (c: ResumenCargaTrace, carga: CargaTrace | null) => (
      <>
        {c.tiene_pdf ? (
          <button type="button" className={styles.accionPrincipal} onClick={() => void descargarPdfCarga(c.carpeta)}>
            Descargar informe PDF
          </button>
        ) : (
          <button type="button" disabled={generando === c.carpeta} onClick={() => void generarInforme(c.carpeta)}>
            {generando === c.carpeta ? 'Generando…' : 'Generar informe'}
          </button>
        )}
        {(carga?.archivos ?? []).map((nombre) => (
          <button key={nombre} type="button" onClick={() => void descargarOriginalCarga(c.carpeta, nombre)}>
            {nombre}
          </button>
        ))}
        <button
          type="button"
          className={styles.accionPeligro}
          onClick={() => {
            if (window.confirm(`¿Eliminar este informe? Se borra del servidor y no se puede deshacer.`)) void eliminar([c.carpeta])
          }}
        >
          Eliminar
        </button>
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generando],
  )

  return (
    <div>
      <AreaHero
        area={AREAS.postventa}
        titulo="Accu-Tab · pH y ORP"
        descripcion="Seguimiento de los equipos en planta: la evolución del pH y del ORP carga a carga."
      />
      {cargas === null ? (
        <Skeleton />
      ) : (
        <ReporteAccutab
          cargas={cargas}
          verCarga={verCargaTrace}
          accionesDe={accionesDe}
          mostrarOrigen
          costoKilo={{ informes: costoKilo, modo: 'equipo' }}
          error={error}
          pedida={pedida}
          vacio={{
            titulo: 'Aún no hay ningún análisis guardado',
            descripcion:
              'Abre Trace, carga los archivos de pH y ORP del pendrive del equipo, completa los datos del informe y usa «Guardar en el servidor». Los correos con datos AccuTab también se procesan automáticamente.',
          }}
          pie={(filtradas) => (
            <TablaInformesAccutab cargas={filtradas} generando={generando} onElegir={(carpeta) => setPedida({ carpeta })} onGenerar={(c) => void generarInforme(c)} onEliminar={(c) => void eliminar(c)} />
          )}
        />
      )}
    </div>
  )
}
