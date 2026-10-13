import { MODULOS } from '@/constants/modules'
import { ModuloCard } from '@/features/dashboard'
import { modulosPermitidos } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import styles from './AccesosCliente.module.css'

/** Los módulos de un cliente que no están ya en el panel: ahora Report y Storage, que tienen su propia entrada. */
const IDS_ACCESOS = ['reports', 'storage']

/**
 * Accesos del portal de cliente: una tarjeta por módulo que su cuenta puede abrir. Reemplaza al Report
 * incrustado en el Panel general (el Report ya está en el menú; el panel lo arma el administrador).
 */
export function AccesosCliente({ usuario }: { usuario: Usuario }) {
  const permitidos = new Set(modulosPermitidos(usuario).map((m) => m.id))
  const modulos = MODULOS.filter((m) => IDS_ACCESOS.includes(m.id) && permitidos.has(m.id))
  if (modulos.length === 0) return null
  return (
    <div className={styles.rejilla}>
      {modulos.map((m, i) => (
        <ModuloCard key={m.id} modulo={m} indice={i} />
      ))}
    </div>
  )
}
