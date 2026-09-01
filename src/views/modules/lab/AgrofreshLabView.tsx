import { useCallback, useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import { useNavigate } from 'react-router-dom'
import { HttpError } from '@/services/http/client'
import {
  cruzarConMuestra,
  listarSolicitudes,
  parsearGC,
  parsearGCCompleto,
} from '@/features/emitir'
import type { DetalleGC, MuestraGC, Solicitud } from '@/features/emitir'
import { PanelIngreso } from './PanelIngreso'
import { TablaSolicitudes } from './TablaSolicitudes'
import { DetalleGCModal } from './DetalleGCModal'
import { SolicitudFichaModal } from './SolicitudFichaModal'
import { ConfiguracionInformeModal } from './ConfiguracionInformeModal'
import styles from './AgrofreshLabView.module.css'

/**
 * AgroFresh Lab: lo que pasa con una muestra desde que entra al laboratorio.
 *
 * 1. Ingreso de muestras — llega la muestra, se escanea su solicitud y el
 *    número pegado en el tubo, y se cruzan. Ese cruce queda guardado: el GC
 *    corre esa noche y los resultados se procesan al día siguiente.
 * 2. Resultados del GC — se suelta el archivo y listo. No hay que emparejar
 *    nada, porque el número de muestra es el mismo código que trae el archivo.
 */
export function AgrofreshLabView() {
  const navigate = useNavigate()
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  const [errorSolicitudes, setErrorSolicitudes] = useState<string | null>(null)
  const [sinSolicitudes, setSinSolicitudes] = useState(false)
  const [solicitudEnFicha, setSolicitudEnFicha] = useState<Solicitud | null>(null)
  const [mostrarConfiguracion, setMostrarConfiguracion] = useState(false)

  const [muestrasGC, setMuestrasGC] = useState<MuestraGC[] | null>(null)
  const [nombreArchivoGC, setNombreArchivoGC] = useState<string | null>(null)
  const [archivoGC, setArchivoGC] = useState<File | null>(null)
  const [cargandoGC, setCargandoGC] = useState(false)
  const [errorGC, setErrorGC] = useState<string | null>(null)
  const [arrastrandoGC, setArrastrandoGC] = useState(false)
  const [detalleGC, setDetalleGC] = useState<DetalleGC | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const refrescarSolicitudes = useCallback(async () => {
    try {
      setSolicitudes(await listarSolicitudes())
      setErrorSolicitudes(null)
      setSinSolicitudes(false)
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        setSinSolicitudes(true)
        setErrorSolicitudes(null)
        setSolicitudes([])
      } else {
        setErrorSolicitudes('No se pudo conectar con el backend.')
      }
    }
  }, [])

  useEffect(() => {
    refrescarSolicitudes()
  }, [refrescarSolicitudes])

  /** Guarda el cruce y refresca, para que la fila pase a verde al instante. */
  const cruzar = useCallback(
    async (solicitud: Solicitud, codigoMuestra: string | null) => {
      await cruzarConMuestra(solicitud.archivo, codigoMuestra)
      await refrescarSolicitudes()
    },
    [refrescarSolicitudes],
  )

  async function subirGC(archivo: File) {
    setCargandoGC(true)
    setErrorGC(null)
    try {
      setMuestrasGC(await parsearGC(archivo))
      setNombreArchivoGC(archivo.name)
      setArchivoGC(archivo)
    } catch (e) {
      setErrorGC(e instanceof HttpError ? e.message : 'No se pudo leer el archivo. ¿Es el reporte del GC?')
      setMuestrasGC(null)
      setNombreArchivoGC(null)
      setArchivoGC(null)
    } finally {
      setCargandoGC(false)
    }
  }

  async function verDetalleGC() {
    if (!archivoGC) return
    setCargandoDetalle(true)
    setErrorGC(null)
    try {
      setDetalleGC(await parsearGCCompleto(archivoGC))
    } catch {
      setErrorGC('No se pudo leer el detalle del archivo.')
    } finally {
      setCargandoDetalle(false)
    }
  }

  function onDropGC(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrandoGC(false)
    const archivo = e.dataTransfer.files[0]
    if (archivo) void subirGC(archivo)
  }

  return (
    <div>
      <Header
        title="Ingreso al laboratorio"
        description="Recibe la muestra, crúzala con su solicitud y sube el resultado del GC."
        acciones={
          <button type="button" className={styles.botonChico} onClick={() => setMostrarConfiguracion(true)}>
            Configurar informe
          </button>
        }
      />

      <Card className={styles.seccion}>
        <div className={styles.seccionCabecera}>
          <h3>
            <span className={styles.numero}>1</span> Ingreso de muestras
          </h3>
          <button type="button" className={styles.botonChico} onClick={refrescarSolicitudes}>
            Actualizar
          </button>
        </div>
        <p className={styles.ayudaSeccion}>
          Escanea la solicitud impresa y el número pegado en la muestra. El cruce queda guardado:
          cuando llegue el resultado del GC, cada vial va a encontrar su solicitud solo.
        </p>

        {errorSolicitudes && <p className={styles.error}>{errorSolicitudes}</p>}

        {sinSolicitudes ? (
          <div className={styles.avisoCarpeta}>
            <p>Todavía no hay solicitudes de AGROFRESH creadas.</p>
            <Button variant="secondary" onClick={() => navigate(ROUTES.tomaMuestrasNueva)}>
              Ir a Nueva solicitud
            </Button>
          </div>
        ) : (
          <>
            <PanelIngreso
              solicitudes={solicitudes}
              onCruzar={(s, codigo) => cruzar(s, codigo)}
              onVerFicha={setSolicitudEnFicha}
            />

            <div className={styles.separador} />

            <TablaSolicitudes
              solicitudes={solicitudes}
              onVerFicha={setSolicitudEnFicha}
              onQuitarCruce={(s) => {
                if (!confirm(`¿Quitar la muestra ${s.codigo_muestra} de esta solicitud?`)) return
                void cruzar(s, null)
              }}
            />
          </>
        )}
      </Card>

      <Card className={styles.seccion}>
        <div className={styles.seccionCabecera}>
          <h3>
            <span className={styles.numero}>2</span> Resultados del GC
          </h3>
          {archivoGC && (
            <button
              type="button"
              className={styles.botonChico}
              onClick={() => void verDetalleGC()}
              disabled={cargandoDetalle}
            >
              {cargandoDetalle ? 'Leyendo…' : 'Ver detalle'}
            </button>
          )}
        </div>
        <p className={styles.ayudaSeccion}>
          Suelta el reporte del GC. No hay que emparejar nada: cada vial encuentra su solicitud por
          el número de muestra que ya se escaneó al recibirla.
        </p>

        <div
          className={cn(styles.zona, arrastrandoGC && styles.zonaActiva)}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrandoGC(true)
          }}
          onDragLeave={() => setArrastrandoGC(false)}
          onDrop={onDropGC}
        >
          <input
            type="file"
            id="gc-input"
            hidden
            onChange={(e) => e.target.files?.[0] && void subirGC(e.target.files[0])}
          />
          <label htmlFor="gc-input" className={styles.zonaTexto}>
            {cargandoGC
              ? 'Leyendo…'
              : nombreArchivoGC
                ? `Cargado: ${nombreArchivoGC} — ${muestrasGC?.length ?? 0} vial(es). Arrastra otro para reemplazar.`
                : 'Arrastra aquí el reporte de texto del GC, o haz clic para elegirlo'}
          </label>
        </div>
        {errorGC && <p className={styles.error}>{errorGC}</p>}
      </Card>

      {detalleGC && (
        <DetalleGCModal
          detalle={detalleGC}
          nombreArchivo={nombreArchivoGC}
          onCerrar={() => setDetalleGC(null)}
        />
      )}
      {solicitudEnFicha && (
        <SolicitudFichaModal solicitud={solicitudEnFicha} onCerrar={() => setSolicitudEnFicha(null)} />
      )}
      {mostrarConfiguracion && <ConfiguracionInformeModal onCerrar={() => setMostrarConfiguracion(false)} />}
    </div>
  )
}
