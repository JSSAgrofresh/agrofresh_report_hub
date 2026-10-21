import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/features/auth'
import { CORREO_MAESTRO } from '@/features/usuarios'
import { PanelIngresoInformes } from './PanelIngresoInformes'
import { HistorialCargas } from './HistorialCargas'
import { PendientesIngesta } from './PendientesIngesta'
import styles from './IngestaInicio.module.css'

interface Props {
  cargando: boolean
  error: string | null
  onArchivo: (archivo: File) => void
}

/**
 * La carga manual de siempre: las dos formas de cargar (Excel y PDF por el Converter), lo que quedó
 * pendiente, y el historial de cargas con su botón para deshacer.
 */
function CargaManual({ cargando, error, onArchivo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  // Pendientes e historial se releen entre sí: deshacer una carga borra sus
  // pendientes, y reintentar pendientes cambia los conteos de las cargas.
  const [version, setVersion] = useState(0)
  const refrescar = () => setVersion((v) => v + 1)

  return (
    <>
      <div className={styles.opciones}>
        <section className={styles.opcion} aria-labelledby="opcion-excel">
          <div className={styles.opcionCab}>
            <span className={`${styles.opcionIcono} ${styles.iconoExcel}`} aria-hidden="true">
              XLS
            </span>
            <div>
              <h2 id="opcion-excel" className={styles.opcionTitulo}>
                Excel de resultados
              </h2>
              <p className={styles.opcionTexto}>
                Una planilla con muchos informes. Antes de cargar revisas Sold To, Ship To, Especie
                y Variedad.
              </p>
            </div>
          </div>
          <button
            type="button"
            className={`${styles.zona} ${arrastrando ? styles.zonaActiva : ''}`}
            disabled={cargando}
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrando(true)
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastrando(false)
              const f = e.dataTransfer.files[0]
              if (f) onArchivo(f)
            }}
            onClick={() => inputRef.current?.click()}
          >
            {cargando ? (
              <span className={styles.zonaCargando}>Analizando archivo…</span>
            ) : (
              <>
                <span className={styles.zonaPrincipal}>Arrastra el Excel aquí</span>
                <span className={styles.zonaSecundaria}>o haz clic para elegirlo · .xlsx</span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) onArchivo(f)
            }}
          />
          {error && <p className={styles.error}>{error}</p>}
        </section>

        <section className={styles.opcion} aria-labelledby="opcion-pdf">
          <div className={styles.opcionCab}>
            <span className={`${styles.opcionIcono} ${styles.iconoPdf}`} aria-hidden="true">
              PDF
            </span>
            <div>
              <h2 id="opcion-pdf" className={styles.opcionTitulo}>
                Informes PDF de laboratorio
              </h2>
              <p className={styles.opcionTexto}>
                Los informes tal como llegan del laboratorio. Cada PDF se lee y se convierte en un
                informe.
              </p>
            </div>
          </div>
          <ul className={styles.labs}>
            <li>Quiteca</li>
            <li>Diagnofruit</li>
            <li>ALS / Corthorn</li>
          </ul>
          <Link to={ROUTES.converter} className={styles.btnConverter}>
            Abrir el Converter →
          </Link>
        </section>
      </div>

      <PendientesIngesta version={version} onCambio={refrescar} ocultarSiVacio />
      <HistorialCargas version={version} onCambio={refrescar} />
    </>
  )
}

/**
 * La puerta de entrada de todo lo que llega a la base. El administrador principal ve el panel de Ingreso de
 * informes (correo, solicitudes, cifras) con la carga manual en su última pestaña; el resto, la carga manual.
 */
export function IngestaInicio(props: Props) {
  const { user } = useAuth()
  const veCorreo = user?.tipoAcceso === 'admin_general' && user.email.toLowerCase() === CORREO_MAESTRO

  if (veCorreo) return <PanelIngresoInformes cargaManual={<CargaManual {...props} />} />

  return (
    <div className={styles.root}>
      <header className={styles.cabecera}>
        <div className={styles.eyebrow}>Ingreso de informes</div>
        <h1 className={styles.titulo}>Carga de resultados</h1>
        <p className={styles.intro}>
          Todo lo que entra a la base pasa por acá. Cada informe se revisa contra Listados antes de
          guardarse, y cada carga queda registrada para poder deshacerla.
        </p>
      </header>

      <CargaManual {...props} />
    </div>
  )
}
