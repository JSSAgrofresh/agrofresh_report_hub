import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { HttpError } from '@/services/http/client'
import { cambiarPassword } from '../api/authApi'
import { useAuth } from '../hooks/useAuth'
import styles from './CambiarPassword.module.css'

const LARGO_MINIMO = 10

/**
 * Cambio obligatorio de contraseña.
 *
 * Se muestra en vez del sistema cuando la contraseña actual se la puso un
 * administrador: esa clave la escuchó al menos una persona más, así que no
 * puede quedar como la definitiva.
 *
 * Al cambiarla, el backend cierra todas las otras sesiones de la cuenta y
 * deja viva solo esta. Es lo correcto si el motivo del cambio es que alguien
 * cree que se la vieron.
 */
export function CambiarPassword() {
  const { user, logout, refrescar } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (nueva !== repetida) {
      setError('Las dos contraseñas nuevas no coinciden.')
      return
    }
    if (nueva.length < LARGO_MINIMO) {
      setError(`La contraseña nueva debe tener al menos ${LARGO_MINIMO} caracteres.`)
      return
    }
    if (nueva === actual) {
      setError('La contraseña nueva tiene que ser distinta de la temporal.')
      return
    }
    setError(null)
    setGuardando(true)
    try {
      await cambiarPassword(actual, nueva)
      await refrescar()
    } catch (err) {
      setError(
        err instanceof HttpError ? err.message : 'No se pudo cambiar la contraseña. Intenta de nuevo.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={styles.pantalla}>
      <form className={styles.tarjeta} onSubmit={onSubmit}>
        <h1 className={styles.titulo}>Elige tu contraseña</h1>
        <p className={styles.texto}>
          La que estás usando te la asignó un administrador, así que la conoce alguien más.
          Cámbiala por una tuya para entrar a {user?.nombre ? 'tu cuenta' : 'el sistema'}.
        </p>

        <label className={styles.campo}>
          <span>Contraseña temporal</span>
          <input
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className={styles.campo}>
          <span>Contraseña nueva</span>
          <input
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            required
            minLength={LARGO_MINIMO}
          />
          <small>
            Mínimo {LARGO_MINIMO} caracteres. Una frase que recuerdes sirve mejor que una palabra
            corta con símbolos.
          </small>
        </label>
        <label className={styles.campo}>
          <span>Repite la nueva</span>
          <input
            type="password"
            autoComplete="new-password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            required
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <Button type="submit" disabled={guardando} className={styles.boton}>
          {guardando ? 'Guardando…' : 'Guardar y entrar'}
        </Button>
        <button type="button" className={styles.salir} onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}
