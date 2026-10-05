import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cambiarModoEnvio } from '@/features/envioInformes'
import type { EstadoEnvio } from '@/features/envioInformes'
import { HttpError } from '@/services/http/client'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './EnvioInformes.module.css'

interface ModoSistemaProps {
  estado: EstadoEnvio
  onCambio: (estado: EstadoEnvio) => void
}

/** El botón de arriba: dice en qué modo está el sistema y deja cambiarlo.
 * Pasar a producción pide la contraseña, porque desde ahí los envíos llegan a
 * clientes de verdad. Volver a prueba es inmediato. */
export function ModoSistema({ estado, onCambio }: ModoSistemaProps) {
  const [abierto, setAbierto] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const enProduccion = estado.modo === 'produccion'

  function cerrar() {
    setAbierto(false)
    setPassword('')
    setError(null)
  }

  async function confirmar() {
    setTrabajando(true)
    setError(null)
    try {
      onCambio(await cambiarModoEnvio(enProduccion ? 'prueba' : 'produccion', password))
      cerrar()
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'No se pudo cambiar el modo. Intenta de nuevo.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.modo} ${enProduccion ? styles.modoProduccion : styles.modoPrueba}`}
        onClick={() => setAbierto(true)}
        aria-label={`${enProduccion ? 'Sistema en producción' : 'Sistema en prueba'}. Cambiar modo`}
      >
        <span className={styles.modoPunto} aria-hidden="true" />
        {enProduccion ? 'Sistema en producción' : 'Sistema en prueba'}
      </button>

      {abierto && (
        <Modal
          titulo={enProduccion ? 'Volver a modo prueba' : 'Pasar a producción'}
          subtitulo={
            estado.modo_cambiado_por && estado.modo_cambiado_en
              ? `Último cambio: ${estado.modo_cambiado_por}, ${fechaHora(estado.modo_cambiado_en)}`
              : undefined
          }
          onCerrar={cerrar}
          pie={
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button onClick={confirmar} disabled={trabajando || (!enProduccion && !password)}>
                {trabajando ? 'Cambiando…' : enProduccion ? 'Volver a prueba' : 'Pasar a producción'}
              </Button>
            </>
          }
        >
          {enProduccion ? (
            <p className={styles.modalTexto}>
              Los correos volverán a llegar solo a {estado.destinatarios_prueba.join(' y ')}, con «(PRUEBA)» en el
              asunto. Nada saldrá a clientes.
            </p>
          ) : (
            <>
              <p className={styles.modalTexto}>
                En producción cada envío llega a la lista de distribución del cliente, sin «(PRUEBA)». Hasta ahora todo
                lo que se envió llegó solo a {estado.destinatarios_prueba.join(' y ')}.
              </p>
              <label className={styles.campoModal}>
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
            </>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </Modal>
      )}
    </>
  )
}
