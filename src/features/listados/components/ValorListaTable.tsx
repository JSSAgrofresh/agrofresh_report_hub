import { Badge } from '@/components/ui/Badge'
import type { ValorLista } from '../lib/tipos'
import styles from './ValorListaTable.module.css'

interface ValorListaTableProps {
  valores: ValorLista[]
  onEditar: (valor: ValorLista) => void
  onCambiarEstado: (valor: ValorLista) => void
  onEliminar: (valor: ValorLista) => void
}

export function ValorListaTable({ valores, onEditar, onCambiarEstado, onEliminar }: ValorListaTableProps) {
  if (valores.length === 0) {
    return <p className={styles.vacio}>No hay valores que calcen con la búsqueda.</p>
  }

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Valor</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {valores.map((v) => (
            <tr key={v.id}>
              <td className={styles.nombre}>{v.valor}</td>
              <td>
                <Badge tone={v.activo ? 'success' : 'neutral'}>{v.activo ? 'Activo' : 'Inactivo'}</Badge>
                {v.es_estandar && <Badge tone="success">Estándar</Badge>}
                {v.fusionado_en_id && <Badge tone="warning">Asignado</Badge>}
              </td>
              <td className={styles.acciones}>
                <button className={styles.boton} onClick={() => onEditar(v)}>
                  Editar
                </button>
                <button className={styles.boton} onClick={() => onCambiarEstado(v)}>
                  {v.activo ? 'Desactivar' : 'Activar'}
                </button>
                {/* Eliminar acá es DEFINITIVO -a diferencia de "Desactivar", no queda
                    disponible para re-homogenizar-. Por eso solo se ofrece para
                    variedades estándar vacías (sin valores asignados); un valor
                    crudo nunca se borra desde acá -si sobra, se desactiva, o se
                    deja sin asignar para que vuelva a aparecer en Homogenizar-. */}
                {!v.fusionado_en_id && v.es_estandar && (
                  <button className={styles.botonPeligro} onClick={() => onEliminar(v)}>
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
