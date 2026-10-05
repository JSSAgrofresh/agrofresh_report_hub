import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { desbloquearEdicion } from '@/features/envioInformes'
import { HttpError } from '@/services/http/client'
import styles from './EnvioInformes.module.css'

interface DesbloqueoEdicionProps {
  onDesbloqueado: () => void
  onCerrar: () => void
}

/** Pide la contraseña del administrador principal para habilitar el laboratorio
 * y los datos leídos del PDF. Vale solo mientras la pantalla siga abierta. */
export function DesbloqueoEdicion({ onDesbloqueado, onCerrar }: DesbloqueoEdicionProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function confirmar() {
    setTrabajando(true)
    setError(null)
    try {
      await desbloquearEdicion(password)
      onDesbloqueado()
    } catch (e) {
      setError(e instanceof HttpError && e.message ? e.message : 'No se pudo habilitar. Intenta de nuevo.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal
      titulo="Habilitar edición"
      subtitulo="Laboratorio, Sold To, Ship To y especie vienen del informe."
      onCerrar={onCerrar}
      pie={
        <>
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={confirmar} disabled={trabajando || !password}>
            {trabajando ? 'Comprobando…' : 'Habilitar'}
          </Button>
        </>
      }
    >
      <p className={styles.modalTexto}>
        Por ahora el laboratorio es siempre AGROFRESH y los datos se leen solos del PDF. Solo el administrador
        principal puede corregirlos a mano.
      </p>
      <label className={styles.campoModal}>
        <span>Contraseña del administrador principal</span>
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
  )
}
