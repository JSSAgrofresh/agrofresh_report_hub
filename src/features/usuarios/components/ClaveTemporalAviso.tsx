import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { UsuarioCreado } from '../api/usuariosStore'
import styles from './ClaveTemporalAviso.module.css'

/**
 * La contraseña de un solo uso, recién generada.
 *
 * Se muestra una vez y nunca más: el sistema guarda su huella, no la
 * contraseña, así que ni el backend puede volver a decir cuál era. Si se
 * cierra esta ventana sin anotarla, hay que generar otra — que es
 * exactamente lo que se espera de un sistema que no guarda contraseñas.
 */
export function ClaveTemporalAviso({ creado, onCerrar }: { creado: UsuarioCreado; onCerrar: () => void }) {
  const [copiada, setCopiada] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(creado.passwordTemporal)
      setCopiada(true)
    } catch {
      // Navegador sin permiso al portapapeles: la contraseña está a la vista
      // igual, se puede escribir a mano.
      setCopiada(false)
    }
  }

  return (
    <div className={styles.fondo} onClick={onCerrar}>
      <div className={styles.caja} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.titulo}>Contraseña para {creado.usuario.nombre}</h3>
        <p className={styles.texto}>
          Dísela a <strong>{creado.usuario.email}</strong>. El sistema le va a pedir que la cambie
          la primera vez que entre.
        </p>

        <div className={styles.clave}>
          <code>{creado.passwordTemporal}</code>
          <button type="button" className={styles.copiar} onClick={() => void copiar()}>
            {copiada ? 'Copiada' : 'Copiar'}
          </button>
        </div>

        <p className={styles.aviso}>
          Anótala ahora. No se guarda en ninguna parte y no se puede volver a ver: si se pierde,
          hay que generar otra.
        </p>

        <Button onClick={onCerrar}>Listo, ya la anoté</Button>
      </div>
    </div>
  )
}
