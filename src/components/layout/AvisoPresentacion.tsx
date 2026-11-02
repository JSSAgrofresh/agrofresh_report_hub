import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/features/auth'
import { useEstadoPresentacion } from '@/features/presentacion'
import styles from './AvisoPresentacion.module.css'

const SILENCIO_MS = 10 * 60 * 1000

/**
 * El aviso del teléfono: cuando el administrador general abre la presentación en su computador, en su teléfono
 * (pantalla angosta) sale una píldora «Presentación abierta · Controlar» que lleva al control remoto. Se ve solo
 * mientras la presentación siga abierta, y se puede callar por 10 minutos (o hasta recargar la pantalla). No es una
 * notificación del sistema (la campana la verían todos los administradores): se arma sola al leer el estado.
 */
export function AvisoPresentacion() {
  const { user } = useAuth()
  const esAdmin = user?.tipoAcceso === 'admin_general'
  const [angosta, setAngosta] = useState(() => window.matchMedia?.('(max-width: 900px)').matches ?? false)
  const [silenciado, setSilenciado] = useState(false)
  const temporizador = useRef<number | null>(null)
  const { datos } = useEstadoPresentacion({ activo: esAdmin && angosta })

  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 900px)')
    if (!mq) return
    const alCambiar = () => setAngosta(mq.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])

  useEffect(() => () => { if (temporizador.current) window.clearTimeout(temporizador.current) }, [])

  if (!esAdmin || !angosta || !datos?.activa || silenciado) return null

  const callar = () => {
    setSilenciado(true)
    temporizador.current = window.setTimeout(() => setSilenciado(false), SILENCIO_MS)
  }

  return (
    <div className={styles.aviso} role="status">
      <Link className={styles.enlace} to={ROUTES.presentacionControl}>
        <i aria-hidden="true" />
        <span><strong>Presentación abierta</strong> en tu computador</span>
        <b>Controlar →</b>
      </Link>
      <button type="button" className={styles.cerrar} onClick={callar} aria-label="Ocultar este aviso por 10 minutos">×</button>
    </div>
  )
}
