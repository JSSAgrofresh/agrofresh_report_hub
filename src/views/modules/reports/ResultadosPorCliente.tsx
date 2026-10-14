import { useMemo } from 'react'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import { fueraPorCliente } from '@/features/reportes/lib/fueraDeRangoResumen'
import styles from './ResultadosPorCliente.module.css'

interface Props {
  informes: InformeConPuntos[]
  /** Botón «Solo fuera de rango»: sin los «dentro» ni los clientes sin nada fuera. */
  soloFuera: boolean
  /** Clic en un cliente: lo deja como filtro. */
  onElegirCliente?: (cliente: string) => void
}

/**
 * «Resultados por cliente» (Vista de límites, límites residuales): una barra por cliente con sus informes bajo el límite
 * (celeste), sobre el límite (rojo) y dentro (verde tenue). Va primero quien tiene MÁS informes fuera de rango: lo
 * tenue de los «dentro» deja que se note el descenso.
 */
export function ResultadosPorCliente({ informes, soloFuera, onElegirCliente }: Props) {
  const filas = useMemo(() => fueraPorCliente(informes, soloFuera), [informes, soloFuera])
  const mayor = Math.max(1, ...filas.map((f) => f.total))

  return (
    <div>
      <ul className={styles.leyenda} aria-label="Leyenda">
        <li><i className={styles.bajo} />Bajo el límite</li>
        <li><i className={styles.sobre} />Sobre el límite</li>
        {!soloFuera && <li><i className={styles.dentro} />Dentro del límite</li>}
      </ul>
      {filas.length === 0 ? (
        <p className={styles.vacio}>
          {soloFuera ? 'Ningún informe quedó fuera de rango con estos filtros.' : 'No hay informes con límite en la tabla con estos filtros.'}
        </p>
      ) : (
        <ol className={styles.lista}>
          {filas.map((f) => (
            <li key={f.cliente} className={styles.fila}>
              <button type="button" className={styles.nombre} title={`Filtrar por ${f.cliente}`} onClick={() => onElegirCliente?.(f.cliente)}>
                {f.cliente}
              </button>
              <span
                className={styles.barra}
                role="img"
                aria-label={`${f.cliente}: ${f.bajo} bajo el límite, ${f.sobre} sobre el límite${soloFuera ? '' : `, ${f.dentro} dentro`}`}
              >
                <i className={styles.bajo} style={{ width: `${(f.bajo / mayor) * 100}%` }}>{f.bajo || ''}</i>
                <i className={styles.sobre} style={{ width: `${(f.sobre / mayor) * 100}%` }}>{f.sobre || ''}</i>
                {!soloFuera && <i className={styles.dentro} style={{ width: `${(f.dentro / mayor) * 100}%` }}>{f.dentro || ''}</i>}
              </span>
              <span className={styles.total}>
                <b>{f.fuera}</b> fuera{soloFuera ? '' : ` de ${f.total}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
