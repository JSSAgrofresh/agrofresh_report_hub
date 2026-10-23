import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { etiquetaAcceso, iniciales } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import styles from './MenuUsuario.module.css'

/** Avatar de la burbuja: al tocarlo abre los datos de la cuenta (Sold To, Ship To y, en un comercial, sus plantas). */
export function MenuUsuario({ user, vistaPrevia, onSalir }: { user: Usuario; vistaPrevia?: boolean; onSalir: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const zona = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (zona.current && !zona.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const comercial = user.tipoAcceso === 'comercial'
  const plantas = user.plantasAsignadas ?? []
  return (
    <div className={styles.zona} ref={zona}>
      <button type="button" className={styles.disparador} aria-expanded={abierto} aria-haspopup="dialog" onClick={() => setAbierto((v) => !v)} title="Ver los datos de tu cuenta">
        <span className={styles.iniciales} aria-hidden="true">{iniciales(user.nombre)}</span>
        <span className={styles.nombre}>{user.nombre}</span>
        <span className={styles.flecha} aria-hidden="true">▾</span>
      </button>
      {abierto && (
        <div className={styles.panel} role="dialog" aria-label="Datos de la cuenta">
          <div className={styles.cab}>
            <span className={styles.iniciales} aria-hidden="true">{iniciales(user.nombre)}</span>
            <div>
              <strong>{user.nombre}</strong>
              <span>{user.email}</span>
              <span className={styles.rol}>{vistaPrevia ? 'Vista previa de cliente' : etiquetaAcceso(user)}</span>
            </div>
          </div>
          {vistaPrevia ? (
            <p className={styles.aviso}>Estás viendo el portal de clientes con tu cuenta de administración: aquí aparecen los datos de todos los clientes.</p>
          ) : comercial ? (
            <div className={styles.datos}>
              <dl className={styles.dato}>
                <dt>Tus plantas</dt>
                <dd>
                  {plantas.length === 0 ? (
                    'Sin plantas asignadas'
                  ) : (
                    <ul className={styles.lista}>
                      {plantas.map((p) => (
                        <li key={`${p.clienteNombre}|${p.plantaNombre ?? ''}`}>
                          {p.plantaNombre ?? 'Todas las sucursales'}
                          <small>{p.clienteNombre}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </dl>
            </div>
          ) : (
            <div className={styles.datos}>
              <dl className={styles.dato}>
                <dt>Sold To</dt>
                <dd>{user.clienteNombre ?? user.nombre}</dd>
              </dl>
              <dl className={styles.dato}>
                <dt>Ship To</dt>
                <dd>{user.plantaNombre ?? 'Todas las sucursales de tu Sold To'}</dd>
              </dl>
            </div>
          )}
          <div className={styles.acciones}>
            {vistaPrevia && (
              <Link to={ROUTES.dashboard} className={`${styles.boton} ${styles.principal}`} onClick={() => setAbierto(false)}>
                Volver a la vista normal
              </Link>
            )}
            <button type="button" className={styles.boton} onClick={onSalir}>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
