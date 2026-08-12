import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { ModuloInfo } from '@/constants/modules'
import styles from './ModuloCard.module.css'

const ESTADO: Record<ModuloInfo['estado'], { texto: string; tono: 'success' | 'warning' | 'neutral' }> = {
  disponible: { texto: 'Disponible', tono: 'success' },
  en_preparacion: { texto: 'En preparación', tono: 'warning' },
  proximamente: { texto: 'Próximamente', tono: 'neutral' },
}

export function ModuloCard({ modulo }: { modulo: ModuloInfo }) {
  const estado = ESTADO[modulo.estado]
  const disponible = modulo.estado === 'disponible'

  const contenido = (
    <Card className={styles.card}>
      <div className={styles.cabecera}>
        <h3>{modulo.nombre}</h3>
        <Badge tone={estado.tono}>{estado.texto}</Badge>
      </div>
      <p className={styles.descripcion}>{modulo.descripcion}</p>
      <span className={styles.accion}>{disponible ? 'Abrir módulo →' : 'No disponible todavía'}</span>
    </Card>
  )

  if (!disponible) return <div className={styles.deshabilitado}>{contenido}</div>
  return (
    <Link to={modulo.ruta} className={styles.link}>
      {contenido}
    </Link>
  )
}
