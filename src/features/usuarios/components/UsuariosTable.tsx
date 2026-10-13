import { AREAS } from '@/constants/areas'
import { CORREO_MAESTRO } from '../api/usuariosStore'
import { iniciales, resumenAccesos } from '../lib/lista'
import { etiquetaAcceso } from '../permisos'
import type { TipoAcceso, Usuario } from '../types'
import styles from './UsuariosTable.module.css'

/** Color de la cuenta (avatar y etiqueta): el de su área si la tiene; si no, uno por tipo de cuenta. */
const COLOR_TIPO: Record<TipoAcceso, string> = {
  admin_general: '#4f8f1f',
  gerencia: '#6d6d2b',
  admin_area: '#3a8a52',
  analista: '#2e9e8a',
  muestreador: '#5b7f95',
  cliente: '#2467b3',
}

function colorDe(u: Usuario): string {
  if (u.tipoAcceso !== 'cliente' && u.area && AREAS[u.area]) return AREAS[u.area].colorPrimario
  return COLOR_TIPO[u.tipoAcceso]
}

interface UsuariosTableProps {
  usuarios: Usuario[]
  onEditar: (usuario: Usuario) => void
  onEliminar: (usuario: Usuario) => void
  /** Genera una contraseña nueva de un solo uso, para alguien que perdió la
   * suya. Cierra además sus sesiones abiertas. */
  onRestablecer: (usuario: Usuario) => void
  /** Texto cuando no hay nada que mostrar (por defecto, «No hay usuarios todavía.»). */
  vacio?: string
}

const MAX_CHIPS = 3

export function UsuariosTable({ usuarios, onEditar, onEliminar, onRestablecer, vacio }: UsuariosTableProps) {
  if (usuarios.length === 0) {
    return <p className={styles.vacio}>{vacio ?? 'No hay usuarios todavía.'}</p>
  }

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Tipo de cuenta</th>
            <th>Qué ve</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const esMaestro = u.email === CORREO_MAESTRO
            const color = colorDe(u)
            const accesos = resumenAccesos(u)
            return (
              <tr key={u.id}>
                <td>
                  <div className={styles.persona}>
                    <span className={styles.avatar} style={{ background: color }} aria-hidden="true">
                      {iniciales(u.nombre)}
                    </span>
                    <span className={styles.datos}>
                      <strong className={styles.nombre}>{u.nombre}</strong>
                      <span className={styles.correo}>{u.email}</span>
                      {u.clienteNombre && (
                        <span className={styles.cliente}>
                          {u.clienteNombre}
                          {u.plantaNombre && <span className={styles.planta}> · {u.plantaNombre}</span>}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td>
                  <span className={styles.tipo} style={{ color, background: `${color}1a`, borderColor: `${color}55` }}>
                    {etiquetaAcceso(u)}
                  </span>
                </td>
                <td>
                  <div className={styles.accesos}>
                    {accesos.slice(0, MAX_CHIPS).map((a) => (
                      <span key={a} className={styles.acceso}>{a}</span>
                    ))}
                    {accesos.length > MAX_CHIPS && (
                      <span className={styles.accesoMas} title={accesos.slice(MAX_CHIPS).join(' · ')}>
                        +{accesos.length - MAX_CHIPS}
                      </span>
                    )}
                    {accesos.length === 0 && <span className={styles.sinDato}>Sin accesos</span>}
                  </div>
                </td>
                <td>
                  <div className={styles.acciones}>
                    <button className={styles.boton} onClick={() => onEditar(u)}>
                      Editar
                    </button>
                    <button className={styles.botonSuave} onClick={() => onRestablecer(u)}>
                      Restablecer clave
                    </button>
                    <button
                      className={styles.botonEliminar}
                      onClick={() => onEliminar(u)}
                      disabled={esMaestro}
                      title={esMaestro ? 'El usuario maestro no se puede eliminar' : 'Eliminar usuario'}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
