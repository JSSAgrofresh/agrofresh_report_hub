import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import type { DonaAnalito } from '@/features/reportes/lib/estadoPatogenos'
import styles from './DonasEstado.module.css'

const R = 15.9155 // circunferencia = 100: cada punto del trazo es un 1 %

/** Una torta (anillo) en SVG: los trozos parten arriba y siguen a la derecha; el centro dice cuánto está bien. */
function Anillo({ dona }: { dona: DonaAnalito }) {
  const trozos = dona.tajadas.filter((t) => t.cantidad > 0)
  const parte = (cantidad: number) => (cantidad / dona.total) * 100
  return (
    <svg className={styles.anillo} viewBox="0 0 42 42" role="img" aria-label={descripcion(dona)}>
      <circle className={styles.fondo} cx="21" cy="21" r={R} />
      {trozos.map((t, i) => {
        const largo = parte(t.cantidad)
        const inicio = trozos.slice(0, i).reduce((suma, x) => suma + parte(x.cantidad), 0)
        const hueco = trozos.length > 1 ? 0.6 : 0
        return (
          <circle
            key={t.clave + t.texto}
            className={styles.trozo}
            cx="21"
            cy="21"
            r={R}
            stroke={t.color}
            strokeDasharray={`${Math.max(largo - hueco, 0.01)} ${100 - largo + hueco}`}
            strokeDashoffset={25 - inicio}
          >
            <title>{`${t.texto}: ${t.cantidad} de ${dona.total}`}</title>
          </circle>
        )
      })}
      <text className={`${styles.centro} ${dona.porcentajeBien === 100 ? styles.centroChico : ''}`} x="21" y="22.4" textAnchor="middle">
        {dona.porcentajeBien === null ? '—' : `${dona.porcentajeBien}%`}
      </text>
    </svg>
  )
}

function descripcion(d: DonaAnalito): string {
  return `${d.nombre}: ${d.tajadas.map((t) => `${t.texto} ${t.cantidad} de ${d.total}`).join(', ')}`
}

interface Props {
  titulo: string
  /** Una línea que explica cómo leer las tortas. */
  ayuda: ReactNode
  donas: DonaAnalito[]
  /** Lo que va bajo las tortas (por ejemplo, la tabla de límites). */
  pie?: ReactNode
  /** Qué dice el número del centro (por ejemplo «sin detección» o «en nivel óptimo»). */
  centro: string
}

/**
 * Tortas de estado por analito: en cada una, qué porcentaje de los informes está bien (verde) y cuánto no. Siempre
 * visibles (no dependen del interruptor de los gráficos de línea de tiempo).
 */
export function DonasEstado({ titulo, ayuda, donas, pie, centro }: Props) {
  if (donas.length === 0) return null
  return (
    <Card>
      <h3 className={styles.titulo}>{titulo}</h3>
      <p className={styles.ayuda}>{ayuda}</p>
      <div className={styles.rejilla}>
        {donas.map((d) => (
          <figure key={d.nombre} className={styles.dona}>
            <figcaption className={styles.nombre}>{d.nombre}</figcaption>
            <Anillo dona={d} />
            <span className={styles.centroTexto}>{centro}</span>
            <ul className={styles.leyenda}>
              {d.tajadas.map((t) => (
                <li key={t.clave + t.texto}>
                  <i style={{ background: t.color }} aria-hidden="true" />
                  <span>{t.texto}</span>
                  <b>
                    {t.cantidad}
                    <small> ({d.total > 0 ? Math.round((t.cantidad / d.total) * 100) : 0}%)</small>
                  </b>
                </li>
              ))}
            </ul>
            <span className={styles.total}>{d.total} informe{d.total === 1 ? '' : 's'}</span>
          </figure>
        ))}
      </div>
      {pie}
    </Card>
  )
}
