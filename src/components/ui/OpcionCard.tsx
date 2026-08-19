import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import styles from './OpcionCard.module.css'

interface OpcionCardProps {
  icono: ReactNode
  titulo: string
  descripcion: string
  ruta?: string
  disponible?: boolean
  etiquetaNoDisponible?: string
}

export function OpcionCard({
  icono,
  titulo,
  descripcion,
  ruta,
  disponible = true,
  etiquetaNoDisponible = 'En preparación',
}: OpcionCardProps) {
  const contenido = (
    <Card className={styles.card}>
      <div className={styles.cabecera}>
        <div className={styles.icono}>{icono}</div>
        <Badge tone={disponible ? 'success' : 'neutral'}>{disponible ? 'Disponible' : etiquetaNoDisponible}</Badge>
      </div>
      <h3 className={styles.titulo}>{titulo}</h3>
      <p className={styles.descripcion}>{descripcion}</p>
      <span className={styles.accion}>{disponible ? 'Abrir' : 'No disponible todavía'}</span>
    </Card>
  )

  if (!disponible || !ruta) return <div className={styles.deshabilitado}>{contenido}</div>
  return (
    <Link to={ruta} className={styles.link}>
      {contenido}
    </Link>
  )
}
