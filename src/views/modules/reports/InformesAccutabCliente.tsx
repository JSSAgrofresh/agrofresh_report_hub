import { useCallback, useEffect, useMemo, useState } from 'react'
import { AREAS } from '@/constants/areas'
import { useAuth } from '@/features/auth'
import { puedeSimular, useSimulacion } from '@/features/simulacion'
import { Skeleton } from '@/components/ui/Skeleton'
import { cacheListaCargas, descargarPdfCliente, listarInformesCliente, verInformeCliente, verPdfCliente } from '@/features/postventa'
import type { CargaTrace, ResumenCargaTrace } from '@/features/postventa'
import { PortalHero } from '@/views/dashboard/PortalHero'
import { useInformesCostoKilo } from '@/features/costoKilo'
import { ReporteAccutab } from './ReporteAccutab'
import styles from './ReporteAccutab.module.css'

/**
 * Portal de cliente (y comercial): sus informes Accu-Tab con el mismo reporte que ve el equipo de Post Venta.
 * El servidor ya entrega solo lo de esta cuenta; acá solo se filtra y se ordena.
 */
export function InformesAccutabCliente() {
  const { user } = useAuth()
  const { accutab: simulacion } = useSimulacion()
  // Solo quien puede simular ve informes simulados (los prende desde Report); un cliente nunca.
  const simulado = puedeSimular(user) ? simulacion : null
  // Lo de la vez anterior se dibuja de inmediato y se actualiza por detrás.
  const [previo] = useState(() => cacheListaCargas.leer('cliente'))
  const [reales, setInformes] = useState<ResumenCargaTrace[] | null>(previo ?? null)
  const informes = simulado ? simulado.informes : reales
  const [error, setError] = useState<string | null>(null)
  const { informes: costoKilo } = useInformesCostoKilo('cliente', !simulado)

  useEffect(() => {
    let vigente = true
    listarInformesCliente()
      .then((l) => {
        cacheListaCargas.guardar('cliente', l)
        if (vigente) setInformes(l)
      })
      .catch(() => {
        if (!vigente || previo) return
        setInformes([])
        setError('No pudimos cargar tus informes. Intenta de nuevo en unos minutos.')
      })
    return () => {
      vigente = false
    }
    // `previo` solo se lee al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Un informe simulado trae sus mediciones de memoria; uno real las pide al servidor.
  const verCarga = useCallback(
    (carpeta: string): Promise<CargaTrace> => {
      const propia = simulado?.detalle(carpeta)
      return propia ? Promise.resolve(propia) : verInformeCliente(carpeta)
    },
    [simulado],
  )

  const accionesDe = useCallback(
    (c: ResumenCargaTrace) =>
      simulado ? (
        <span className={styles.simulado}>Informe simulado · sin PDF</span>
      ) : (
        <>
          <button type="button" onClick={() => void verPdfCliente(c.carpeta)}>
            Ver informe
          </button>
          <button type="button" className={styles.accionPrincipal} onClick={() => void descargarPdfCliente(c.carpeta)}>
            Descargar PDF
          </button>
        </>
      ),
    [simulado],
  )

  const todas = useMemo(() => informes ?? [], [informes])
  if (informes === null) return <Skeleton />

  return (
    <ReporteAccutab
      cargas={todas}
      verCarga={verCarga}
      accionesDe={accionesDe}
      costoKilo={{ informes: costoKilo, modo: 'cliente' }}
      error={simulado ? null : error}
      aviso={
        simulado ? (
          <p className={styles.nota} role="status">
            🧪 Informes simulados: no son reales y no existen en el servidor. Se apagan al volver a los datos reales en Report o al recargar.
          </p>
        ) : undefined
      }
    />
  )
}

/** Accu-Tab dentro de la «Vista de cliente»: el mismo encabezado con la foto de Accu-Tab que ve el cliente, y debajo su reporte. */
export function VistaClienteAccutab() {
  return (
    <div>
      <PortalHero
        etiqueta="Vista previa de cliente"
        titulo="Hola, todos los clientes"
        descripcion="Así se ven los informes Accu-Tab en el portal. Con tu cuenta de administración aparecen los de todos los clientes y sucursales."
        fondo={AREAS.postventa.fondo}
      />
      <InformesAccutabCliente />
    </div>
  )
}
