import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth'
import { cambiarGraficosInformes, cambiarServicioReport, cambiarTemaCliente, cambiarTemaCuenta, obtenerFunciones } from '@/features/funciones'
import type { EstadoFunciones, ServicioReport, TemaCliente, TemaCuenta } from '@/features/funciones'
import { EstiloPorCuenta } from './EstiloPorCuenta'
import { NOMBRE_TEMA } from './nombreTema'
import type { DestinoTema } from './EstiloPorCuenta'
import { CORREO_MAESTRO } from '@/features/usuarios'
import { HttpError } from '@/services/http/client'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './FuncionesPanel.module.css'

const TEMAS: { id: TemaCliente; nombre: string; detalle: string }[] = [
  { id: 'basico', nombre: 'Básico', detalle: 'El de siempre: fondo con color, tarjetas de vidrio y encabezado con foto.' },
  { id: 'sobrio', nombre: 'Sobrio', detalle: 'Minimalista: fondo liso, tarjetas blancas con borde fino y un solo color de acento.' },
]

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
  /** El valor al que se quiere pasar el interruptor de los gráficos; `null` = no se está cambiando. */
  const [cambioGraficos, setCambioGraficos] = useState<boolean | null>(null)
  /** El estilo al que se quiere pasar el dashboard de clientes; `null` = no se está cambiando. */
  const [cambioTema, setCambioTema] = useState<TemaCliente | null>(null)
  /** Un estilo para un tipo de cuenta o una cuenta; `tema: null` = quitar la regla. */
  const [cambioCuenta, setCambioCuenta] = useState<{ destino: DestinoTema; tema: TemaCuenta | null; descripcion: string } | null>(null)
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
    setCambioGraficos(null)
    setCambioTema(null)
    setCambioCuenta(null)
    setPassword('')
    setError(null)
  }

  async function confirmar() {
    if (!elegido && cambioGraficos === null && cambioTema === null && !cambioCuenta) return
    setTrabajando(true)
    setError(null)
    try {
      setEstado(
        cambioCuenta
          ? await cambiarTemaCuenta(cambioCuenta.destino, cambioCuenta.tema, password)
          : elegido
          ? await cambiarServicioReport(elegido.clave, !elegido.activo, password)
          : cambioTema !== null
            ? await cambiarTemaCliente(cambioTema, password)
            : await cambiarGraficosInformes(cambioGraficos as boolean, password),
      )
      cerrar()
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'No se pudo cambiar. Intenta de nuevo.')
    } finally {
      setTrabajando(false)
    }
  }

  const graficos = estado?.graficos_informes
  // Lo que dice el cuadro de confirmación: un servicio o el interruptor de los gráficos.
  const confirmacion = cambioCuenta
    ? {
        titulo: cambioCuenta.tema
          ? `Dejar el estilo «${NOMBRE_TEMA[cambioCuenta.tema]}» para ${cambioCuenta.descripcion}`
          : `Quitar el estilo propio de ${cambioCuenta.descripcion}`,
        boton: cambioCuenta.tema ? 'Dejar este estilo' : 'Quitar la regla',
        texto: cambioCuenta.tema
          ? 'Lo verán desde su próxima carga. Una regla por cuenta gana a la de su tipo, y esa al predeterminado.'
          : 'Volverá a ver el estilo de su tipo de cuenta (o el predeterminado).',
      }
    : cambioTema !== null
    ? {
        titulo: `Dejar el estilo ${TEMAS.find((t) => t.id === cambioTema)?.nombre} para los clientes`,
        boton: 'Dejar como predeterminado',
        texto: 'Los clientes y comerciales verán su dashboard con este estilo desde su próxima carga. Tú puedes ver ambos desde la Vista de cliente.',
      }
    : elegido
    ? {
        titulo: `${elegido.activo ? 'Ocultar' : 'Mostrar'} ${elegido.etiqueta} en Report`,
        boton: elegido.activo ? 'Ocultar' : 'Mostrar',
        texto: elegido.activo
          ? `Report dejará de mostrar lo de ${elegido.etiqueta}. Los datos siguen guardados.`
          : `Report empezará a mostrar lo de ${elegido.etiqueta}, junto con los demás servicios encendidos.`,
      }
    : cambioGraficos !== null
      ? {
          titulo: `${cambioGraficos ? 'Mostrar' : 'Ocultar'} los gráficos de ALS y Diagnofruit`,
          boton: cambioGraficos ? 'Mostrar' : 'Ocultar',
          texto: cambioGraficos
            ? 'Report mostrará la línea de tiempo y la serie de tiempo de ALS y Diagnofruit, además de su tabla.'
            : 'Report dejará de mostrar los gráficos de ALS y Diagnofruit: quedará solo la tabla.',
        }
      : null

  return (
    <section className={styles.panel} aria-label="Funciones">
      <div className={styles.tarjeta}>
        <h2 className={styles.titulo}>Report: tipos de servicio que se muestran</h2>
        <p className={styles.texto}>
          Report muestra solo los tipos de servicio encendidos. Lo que se cargue de los demás queda guardado y no se
          pierde: aparece en Report cuando se enciende. Esto no cambia el Panel de control interno, Solicitudes e informes ni
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

      {estado && (
        <div className={styles.tarjeta}>
          <h2 className={styles.titulo}>Report: gráficos de ALS y Diagnofruit</h2>
          <p className={styles.texto}>
            Con ALS o Diagnofruit elegido, Report puede mostrar una línea de tiempo y una serie de tiempo además de la tabla.
            Apagados, no se ven y queda solo la tabla. Vale para todas las cuentas, clientes incluidos.
          </p>
          <ul className={styles.lista}>
            <li className={styles.fila}>
              <span className={styles.nombre}>
                Línea de tiempo y serie de tiempo
                <small>En «stand-by» de fábrica: se encienden cuando se quieran usar.</small>
              </span>
              <span className={`${styles.estado} ${graficos?.activo ? styles.encendido : styles.apagado}`}>
                {graficos?.activo ? 'Se muestran en Report' : 'No se muestran'}
              </span>
              <Button
                variant="secondary"
                disabled={!esPrincipal}
                title={esPrincipal ? undefined : 'Solo el administrador principal puede cambiarlo'}
                aria-label={`${graficos?.activo ? 'Ocultar' : 'Mostrar'} los gráficos de ALS y Diagnofruit en Report`}
                onClick={() => setCambioGraficos(!graficos?.activo)}
              >
                {graficos?.activo ? 'Ocultar' : 'Mostrar'}
              </Button>
            </li>
          </ul>
          {graficos?.cambiado_por && graficos.cambiado_en && (
            <p className={styles.pie}>Último cambio: {graficos.cambiado_por}, {fechaHora(graficos.cambiado_en)}</p>
          )}
        </div>
      )}

      {estado && (
        <div className={styles.tarjeta}>
          <h2 className={styles.titulo}>Estilo del dashboard de clientes y comerciales</h2>
          <p className={styles.texto}>
            Elige el estilo predeterminado y, más abajo, déjale uno distinto a un tipo de cuenta o a una cuenta en particular (a un comercial incluso el marco interno de siempre). Quien tenga la función «Vista de cliente» puede
            cambiar entre los dos estilos desde esa vista para compararlos, sin afectar a nadie.
          </p>
          <ul className={styles.lista}>
            {TEMAS.map((t) => {
              const activo = (estado.tema_cliente?.valor ?? 'basico') === t.id
              return (
                <li key={t.id} className={styles.fila}>
                  <span className={styles.nombre}>
                    {t.nombre}
                    <small>{t.detalle}</small>
                  </span>
                  <span className={`${styles.estado} ${activo ? styles.encendido : styles.apagado}`}>
                    {activo ? 'Lo ven los clientes' : 'Desactivado'}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={!esPrincipal || activo}
                    title={esPrincipal ? undefined : 'Solo el administrador principal puede cambiarlo'}
                    aria-label={`Dejar el estilo ${t.nombre} para los clientes`}
                    onClick={() => setCambioTema(t.id)}
                  >
                    Dejar este
                  </Button>
                </li>
              )
            })}
          </ul>
          {estado.temas_cuenta && (
            <EstiloPorCuenta
              temas={estado.temas_cuenta}
              predeterminado={estado.tema_cliente?.valor ?? 'basico'}
              puedeCambiar={esPrincipal}
              onCambiar={(destino, tema, descripcion) => setCambioCuenta({ destino, tema, descripcion })}
            />
          )}
          {estado.tema_cliente?.cambiado_por && estado.tema_cliente.cambiado_en && (
            <p className={styles.pie}>Último cambio: {estado.tema_cliente.cambiado_por}, {fechaHora(estado.tema_cliente.cambiado_en)}</p>
          )}
        </div>
      )}

      {confirmacion && (
        <Modal
          titulo={confirmacion.titulo}
          onCerrar={cerrar}
          pie={
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button onClick={() => void confirmar()} disabled={trabajando || !password}>
                {trabajando ? 'Guardando…' : confirmacion.boton}
              </Button>
            </>
          }
        >
          <p className={styles.texto}>{confirmacion.texto}</p>
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
