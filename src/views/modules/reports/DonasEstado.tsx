import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import type { DonaAnalito } from '@/features/reportes/lib/estadoPatogenos'
import { InfoTip } from '@/components/ui/InfoTip'
import styles from './DonasEstado.module.css'

const R = 15.9155 // circunferencia = 100: cada punto del trazo es un 1 %

/** Una torta (anillo) en SVG: los trozos parten arriba y siguen a la derecha; el centro dice cuánto está bien. */
function Anillo({ dona, burbujas }: { dona: DonaAnalito; burbujas?: boolean }) {
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
      {burbujas &&
        trozos.map((t, i) => {
          const largo = parte(t.cantidad)
          if (largo < 4) return null
          const inicio = trozos.slice(0, i).reduce((suma, x) => suma + parte(x.cantidad), 0)
          const angulo = ((inicio + largo / 2) / 100) * 2 * Math.PI - Math.PI / 2
          const x = 21 + R * Math.cos(angulo)
          const y = 21 + R * Math.sin(angulo)
          return (
            <g key={`b-${t.clave}${t.texto}`} className={styles.burbuja}>
              <circle cx={x} cy={y} r={largo >= 99.5 ? 5.8 : 4.6} />
              <text x={x} y={y + 1.1} textAnchor="middle">{`${Math.round(largo)}%`}</text>
            </g>
          )
        })}
      {!burbujas && (
      <text className={`${styles.centro} ${dona.porcentajeBien === 100 ? styles.centroChico : ''}`} x="21" y="22.4" textAnchor="middle">
        {dona.porcentajeBien === null ? '—' : `${dona.porcentajeBien}%`}
      </text>
      )}
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
  /** Cada trozo lleva su porcentaje en una burbuja blanca sobre el anillo, y el centro queda vacío. */
  burbujas?: boolean
}

/**
 * Tortas de estado por analito: en cada una, qué porcentaje de los informes está bien (verde) y cuánto no. Siempre
 * visibles (no dependen del interruptor de los gráficos de línea de tiempo).
 */
export function DonasEstado({ titulo, ayuda, donas, pie, centro, burbujas }: Props) {
  if (donas.length === 0) return null
  return (
    <Card>
      <h3 className={styles.titulo}>
        {titulo}
        <InfoTip>{ayuda}</InfoTip>
      </h3>
      <div className={styles.rejilla}>
        {donas.map((d) => (
          <figure key={d.nombre} className={styles.dona}>
            <figcaption className={styles.nombre}>{d.nombre}</figcaption>
            <Anillo dona={d} burbujas={burbujas} />
            {!burbujas && <span className={styles.centroTexto}>{centro}</span>}
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
