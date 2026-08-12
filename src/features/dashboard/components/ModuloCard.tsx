import type { ComponentType, SVGProps } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { IconAudit, IconConverter, IconReports, IconTrace } from '@/components/ui/icons'
import type { ModuloInfo } from '@/constants/modules'
import styles from './ModuloCard.module.css'

const ESTADO: Record<ModuloInfo['estado'], { texto: string; tono: 'success' | 'warning' | 'neutral' }> = {
  disponible: { texto: 'Disponible', tono: 'success' },
  en_preparacion: { texto: 'En preparación', tono: 'warning' },
  proximamente: { texto: 'Próximamente', tono: 'neutral' },
}

const ICONO_MODULO: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  audit: IconAudit,
  trace: IconTrace,
  converter: IconConverter,
  reports: IconReports,
}

export function ModuloCard({ modulo, indice = 0 }: { modulo: ModuloInfo; indice?: number }) {
  const estado = ESTADO[modulo.estado]
  const disponible = modulo.estado === 'disponible'
  const Icono = ICONO_MODULO[modulo.id]

  const contenido = (
    <Card className={styles.card} style={{ animationDelay: `${indice * 45}ms` }}>
      <div className={styles.cabecera}>
        <div className={styles.icono}>
          <Icono />
        </div>
        <Badge tone={estado.tono}>{estado.texto}</Badge>
      </div>
      <h3 className={styles.nombre}>{modulo.nombre}</h3>
      <p className={styles.descripcion}>{modulo.descripcion}</p>
      <span className={styles.accion}>{disponible ? 'Abrir módulo' : 'No disponible todavía'}</span>
    </Card>
  )

  if (!disponible) return <div className={styles.deshabilitado}>{contenido}</div>
  return (
    <Link to={modulo.ruta} className={styles.link}>
      {contenido}
    </Link>
  )
}
