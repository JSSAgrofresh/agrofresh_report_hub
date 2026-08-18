import type { ComponentType, CSSProperties, SVGProps } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { IconConverter, IconDataCore, IconIngest, IconReports, IconTrace } from '@/components/ui/icons'
import type { ModuloInfo } from '@/constants/modules'
import styles from './ModuloCard.module.css'

const ESTADO: Record<ModuloInfo['estado'], { texto: string; tono: 'success' | 'warning' | 'neutral' }> = {
  disponible: { texto: 'Disponible', tono: 'success' },
  en_preparacion: { texto: 'En preparación', tono: 'warning' },
  proximamente: { texto: 'Próximamente', tono: 'neutral' },
}

const ICONO_MODULO: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  datacore: IconDataCore,
  trace: IconTrace,
  converter: IconConverter,
  ingest: IconIngest,
  reports: IconReports,
}

interface ModuloCardProps {
  modulo: ModuloInfo
  indice?: number
  /** color de acento del área (icono); si no se pasa usa el verde por defecto */
  acento?: string
}

export function ModuloCard({ modulo, indice = 0, acento }: ModuloCardProps) {
  const estado = ESTADO[modulo.estado]
  const disponible = modulo.estado === 'disponible'
  const Icono = ICONO_MODULO[modulo.id]

  const estiloCard: CSSProperties = {
    animationDelay: `${indice * 45}ms`,
    ...(acento ? ({ '--acento-tarjeta': acento } as CSSProperties) : {}),
  }

  const contenido = (
    <Card className={styles.card} style={estiloCard}>
      <div className={styles.cabecera}>
        <div
          className={styles.icono}
          style={acento ? { background: `${acento}1f`, color: acento } : undefined}
        >
          <Icono />
        </div>
        <Badge tone={estado.tono}>{estado.texto}</Badge>
      </div>
      <h3 className={styles.nombre}>{modulo.nombre}</h3>
      <p className={styles.descripcion}>{modulo.descripcion}</p>
      <span className={styles.accion} style={acento && disponible ? { color: acento } : undefined}>
        {disponible ? 'Abrir módulo' : 'No disponible todavía'}
      </span>
    </Card>
  )

  if (!disponible) return <div className={styles.deshabilitado}>{contenido}</div>
  return (
    <Link to={modulo.ruta} className={styles.link}>
      {contenido}
    </Link>
  )
}
