import { Badge } from '@/components/ui/Badge'
import type { Cliente } from '../lib/tipos'
import styles from './CatalogoTable.module.css'

interface ClientesTableProps {
  clientes: Cliente[]
  onEditar: (cliente: Cliente) => void
  onNuevaSucursal: (cliente: Cliente) => void
}

export function ClientesTable({ clientes, onEditar, onNuevaSucursal }: ClientesTableProps) {
  if (clientes.length === 0) {
    return <p className={styles.vacio}>No hay clientes que calcen con la búsqueda.</p>
  }

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Sold To</th>
            <th>N° Sold To</th>
            <th>RUT</th>
            <th>Sucursales</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td className={styles.nombre}>{c.nombre}</td>
              <td className={styles.mono}>{c.codigo_sap ?? '—'}</td>
              <td className={styles.mono}>{c.rut ?? '—'}</td>
              <td>{c.total_plantas}</td>
              <td>
                <Badge tone={c.activo ? 'success' : 'neutral'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
              </td>
              <td className={styles.acciones}>
                <button className={styles.boton} onClick={() => onNuevaSucursal(c)}>
                  + Ship To
                </button>
                <button className={styles.boton} onClick={() => onEditar(c)}>
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
