import { useState } from 'react'
import type { FormEvent } from 'react'
import { verificarClave } from '@/features/auth/api/authApi'
import { Modal } from './Modal'
import styles from './EliminarConClave.module.css'

interface EliminarConClaveProps {
  /** Texto del botón: «Eliminar», «Quitar muestra»… */
  etiqueta: string
  /** Título y detalle del diálogo de confirmación. */
  titulo: string
  descripcion: string
  /** Lo que se hace una vez que la clave fue correcta. */
  onConfirmar: () => Promise<void> | void
  className?: string
}

/**
 * Botón de acción destructiva, con marco de línea punteada, que pide la
 * contraseña de quien lo aprieta antes de hacer nada. Pensado para lo que solo
 * el administrador principal puede hacer y no se deshace.
 */
export function EliminarConClave({ etiqueta, titulo, descripcion, onConfirmar, className }: EliminarConClaveProps) {
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  function cerrar() {
    if (trabajando) return
    setAbierto(false)
    setClave('')
    setError(null)
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!clave) return
    setTrabajando(true)
    setError(null)
    try {
      await verificarClave(clave)
    } catch {
      setError('Contraseña incorrecta.')
      setTrabajando(false)
      return
    }
    try {
      await onConfirmar()
      setAbierto(false)
      setClave('')
    } catch {
      setError('No se pudo completar la acción.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <>
      <button type="button" className={`${styles.punteado} ${className ?? ''}`} onClick={() => setAbierto(true)}>
        {etiqueta}
      </button>
      {abierto && (
        <Modal
          titulo={titulo}
          subtitulo={descripcion}
          onCerrar={cerrar}
          pie={
            <>
              <button type="button" className={styles.cancelar} onClick={cerrar} disabled={trabajando}>
                Cancelar
              </button>
              <button type="submit" form="eliminar-con-clave" className={styles.confirmar} disabled={!clave || trabajando}>
                {trabajando ? 'Verificando…' : etiqueta}
              </button>
            </>
          }
        >
          <form id="eliminar-con-clave" onSubmit={(e) => void confirmar(e)} className={styles.formulario}>
            <label htmlFor="eliminar-con-clave-input">Ingresa tu contraseña para confirmar</label>
            <input
              id="eliminar-con-clave-input"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
            {error && <p role="alert" className={styles.error}>{error}</p>}
          </form>
        </Modal>
      )}
    </>
  )
}
