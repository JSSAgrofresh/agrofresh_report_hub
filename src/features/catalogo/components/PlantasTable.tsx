import { Badge } from '@/components/ui/Badge'
import type { Planta } from '../lib/tipos'
import styles from './CatalogoTable.module.css'

interface PlantasTableProps {
  plantas: Planta[]
  onEditar: (planta: Planta) => void
}

export function PlantasTable({ plantas, onEditar }: PlantasTableProps) {
  if (plantas.length === 0) {
    return <p className={styles.vacio}>No hay sucursales que calcen con la búsqueda.</p>
  }

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Ship To</th>
            <th>Sold To</th>
            <th>N° Ship To</th>
            <th>Ciudad</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {plantas.map((p) => (
            <tr key={p.id}>
              <td className={styles.nombre}>{p.nombre}</td>
              <td className={styles.clienteCol}>{p.cliente_nombre}</td>
              <td className={styles.mono}>{p.codigo_sap ?? '—'}</td>
              <td>{p.ciudad ?? '—'}</td>
              <td>
                <Badge tone={p.activo ? 'success' : 'neutral'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
              </td>
              <td className={styles.acciones}>
                <button className={styles.boton} onClick={() => onEditar(p)}>
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
