import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth'
import { cambiarServicioReport, obtenerFunciones } from '@/features/funciones'
import type { EstadoFunciones, ServicioReport } from '@/features/funciones'
import { CORREO_MAESTRO } from '@/features/usuarios'
import { HttpError } from '@/services/http/client'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './FuncionesPanel.module.css'

const DETALLE: Record<ServicioReport['clave'], string> = {
  linea_proceso: 'Lo de siempre.',
  actimist: 'Informes de Actimist (su propio listado de Sold To y Ship To).',
  ecofog: 'Informes de Ecofog (su propio listado de Sold To y Ship To).',
  ryd: 'Ensayos propios de AgroFresh (usan el listado de Línea de proceso).',
}

/**
 * Administración General → Funciones.
 *
 * Qué tipos de servicio muestra Report. De fábrica solo Línea de proceso: lo cargado de los demás
 * queda guardado, pero no aparece en Report hasta encenderlo acá. Encender o apagar pide la
 * contraseña del administrador principal (el servidor también la exige).
 */
export function FuncionesPanel() {
  const { user } = useAuth()
  const esPrincipal = user?.tipoAcceso === 'admin_general' && user.email.toLowerCase() === CORREO_MAESTRO
  const [estado, setEstado] = useState<EstadoFunciones | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [elegido, setElegido] = useState<ServicioReport | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    let cancelado = false
    obtenerFunciones()
      .then((e) => { if (!cancelado) setEstado(e) })
      .catch((e: unknown) => {
        if (!cancelado) setErrorCarga(e instanceof HttpError ? e.message : 'No se pudieron leer las funciones.')
      })
    return () => { cancelado = true }
  }, [])

  function cerrar() {
    setElegido(null)
    setPassword('')
    setError(null)
  }

  async function confirmar() {
    if (!elegido) return
    setTrabajando(true)
    setError(null)
    try {
      setEstado(await cambiarServicioReport(elegido.clave, !elegido.activo, password))
      cerrar()
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'No se pudo cambiar. Intenta de nuevo.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <section className={styles.panel} aria-label="Funciones">
      <div className={styles.tarjeta}>
        <h2 className={styles.titulo}>Report: tipos de servicio que se muestran</h2>
        <p className={styles.texto}>
          Report muestra solo los tipos de servicio encendidos. Lo que se cargue de los demás queda guardado y no se
          pierde: aparece en Report cuando se enciende. Esto no cambia Auditoría interna, Solicitudes e informes ni
          Envío de informes.
        </p>

        {errorCarga && <p className={styles.error} role="alert">{errorCarga}</p>}
        {!estado && !errorCarga && <Skeleton style={{ width: '100%', height: 120 }} />}

        {estado?.migracion_pendiente && (
          <p className={styles.aviso} role="status">
            Falta correr la migración 0055 en el servidor: mientras tanto Report muestra todo lo cargado, sin separar
            por tipo de servicio.
          </p>
        )}

        {estado && (
          <ul className={styles.lista}>
            {estado.report.servicios.map((s) => (
              <li key={s.clave} className={styles.fila}>
                <span className={styles.nombre}>
                  {s.etiqueta}
                  <small>{DETALLE[s.clave]}</small>
                </span>
                <span className={`${styles.estado} ${s.activo ? styles.encendido : styles.apagado}`}>
                  {s.activo ? 'Se muestra en Report' : 'No se muestra'}
                </span>
                <Button
                  variant="secondary"
                  disabled={!esPrincipal}
                  title={esPrincipal ? undefined : 'Solo el administrador principal puede cambiarlo'}
                  aria-label={`${s.activo ? 'Ocultar' : 'Mostrar'} ${s.etiqueta} en Report`}
                  onClick={() => setElegido(s)}
                >
                  {s.activo ? 'Ocultar' : 'Mostrar'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {estado?.report.cambiado_por && estado.report.cambiado_en && (
          <p className={styles.pie}>Último cambio: {estado.report.cambiado_por}, {fechaHora(estado.report.cambiado_en)}</p>
        )}
        {!esPrincipal && estado && (
          <p className={styles.pie}>Solo el administrador principal puede cambiar estas funciones, con su contraseña.</p>
        )}
      </div>

      {elegido && (
        <Modal
          titulo={`${elegido.activo ? 'Ocultar' : 'Mostrar'} ${elegido.etiqueta} en Report`}
          onCerrar={cerrar}
          pie={
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button onClick={() => void confirmar()} disabled={trabajando || !password}>
                {trabajando ? 'Guardando…' : elegido.activo ? 'Ocultar' : 'Mostrar'}
              </Button>
            </>
          }
        >
          <p className={styles.texto}>
            {elegido.activo
              ? `Report dejará de mostrar lo de ${elegido.etiqueta}. Los datos siguen guardados.`
              : `Report empezará a mostrar lo de ${elegido.etiqueta}, junto con los demás servicios encendidos.`}
          </p>
          <label className={styles.campoClave}>
            <span>Tu contraseña, para confirmar</span>
            <input
              type="password"
              data-foco
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && password && !trabajando) void confirmar() }}
            />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </Modal>
      )}
    </section>
  )
}
