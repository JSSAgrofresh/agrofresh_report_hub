import { useRef, useState } from 'react'
import { ROUTES } from '@/constants/routes'
import { usePresentacionPC } from '@/features/presentacion'
import styles from './PresentacionView.module.css'

/**
 * La presentación del sistema, a pantalla completa (Administración General → Funciones → «Abrir presentación»).
 * Vive en un iframe del mismo origen (`/deck/index.html`) y, mientras esté abierta, el teléfono con la misma cuenta
 * la maneja desde `/presentacion/control`. Solo el administrador general.
 */
export function PresentacionView() {
  const marco = useRef<HTMLIFrameElement>(null)
  const { controlConectado, error } = usePresentacionPC(marco)
  const [copiado, setCopiado] = useState(false)
  const enlaceControl = `${window.location.origin}${ROUTES.presentacionControl}`

  const copiar = () => {
    navigator.clipboard?.writeText(enlaceControl).then(
      () => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1600) },
      () => undefined,
    )
  }

  return (
    <div className={styles.pantalla}>
      <header className={styles.barra}>
        <a className={styles.volver} href={ROUTES.adminAdministracionGeneral}>← Administración General</a>
        <strong className={styles.titulo}>Presentación del sistema</strong>
        <span className={styles.espacio} />
        <span className={controlConectado ? styles.conectado : styles.esperando} role="status">
          <i aria-hidden="true" />
          {controlConectado ? 'Teléfono conectado' : 'Sin teléfono'}
        </span>
        {!controlConectado && (
          <button type="button" className={styles.copiar} onClick={copiar} title={enlaceControl}>
            {copiado ? 'Enlace copiado' : 'Copiar enlace del control'}
          </button>
        )}
      </header>
      {error && <p className={styles.error} role="alert">Sin conexión con el control remoto: {error}</p>}
      <iframe ref={marco} className={styles.marco} src="/deck/index.html" title="Presentación del sistema" />
    </div>
  )
}
