import { Badge } from '@/components/ui/Badge'
import { CORREO_MAESTRO } from '../api/usuariosStore'
import { etiquetaAcceso } from '../permisos'
import type { Usuario } from '../types'
import styles from './UsuariosTable.module.css'

const TONO: Record<Usuario['tipoAcceso'], 'success' | 'warning' | 'neutral'> = {
  admin_general: 'success',
  admin_area: 'warning',
  cliente: 'neutral',
}

interface UsuariosTableProps {
  usuarios: Usuario[]
  onEditar: (usuario: Usuario) => void
  onEliminar: (usuario: Usuario) => void
}

export function UsuariosTable({ usuarios, onEditar, onEliminar }: UsuariosTableProps) {
  if (usuarios.length === 0) {
    return <p className={styles.vacio}>No hay usuarios todavía.</p>
  }

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Acceso</th>
            <th>Cliente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const esMaestro = u.email === CORREO_MAESTRO
            return (
              <tr key={u.id}>
                <td className={styles.nombre}>{u.nombre}</td>
                <td className={styles.correo}>{u.email}</td>
                <td>
                  <Badge tone={TONO[u.tipoAcceso]}>{etiquetaAcceso(u)}</Badge>
                </td>
                <td className={styles.cliente}>
                  {u.clienteNombre ?? '—'}
                  {u.plantaNombre && <span className={styles.planta}> · {u.plantaNombre}</span>}
                </td>
                <td className={styles.acciones}>
                  <button className={styles.boton} onClick={() => onEditar(u)}>
                    Editar
                  </button>
                  <button
                    className={styles.botonEliminar}
                    onClick={() => onEliminar(u)}
                    disabled={esMaestro}
                    title={esMaestro ? 'El usuario maestro no se puede eliminar' : 'Eliminar usuario'}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
