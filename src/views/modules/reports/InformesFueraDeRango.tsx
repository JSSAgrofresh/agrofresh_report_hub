import { useMemo } from 'react'
import { colorDeIngrediente, resumenResidual } from '@/features/reportes'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import type { RangoResidual } from '@/features/reportes'
import { formatDecimalCL } from '@/lib/locale'
import styles from './InformesFueraDeRango.module.css'

const nf = new Intl.NumberFormat('es-CL')
const dec = (n: number) => formatDecimalCL(n, 2)
const con = (n: number) => `${n > 0 ? '+' : ''}${dec(n)}`

interface Props {
  informes: InformeConPuntos[]
  especie: string
  /** Franjas de la tabla para la especie elegida; `null` si no hay especie o la tabla no la trae. */
  limites: Record<string, RangoResidual> | null
}

/**
 * «Informes fuera de rango» de la Vista de límites (modo Límites residuales): cuántos informes tienen
 * al menos un analito fuera de su franja fija, qué % es del total y, por analito, cuánto se pasa.
 */
export function InformesFueraDeRango({ informes, especie, limites }: Props) {
  const r = useMemo(() => (limites ? resumenResidual(informes, limites) : null), [informes, limites])

  if (!limites || !r) {
    return (
      <section className={styles.tarjeta} aria-label="Informes fuera de rango">
        <span className={styles.etiqueta}>Informes fuera de rango · límite residual</span>
        <p className={styles.aviso}>
          {especie.trim()
            ? `La tabla de límites residuales no trae la especie «${especie}».`
            : 'Elige una especie en los filtros para evaluar los informes contra su límite residual: cada especie tiene límites distintos.'}
        </p>
      </section>
    )
  }

  const pct = r.informes ? (r.informesFuera / r.informes) * 100 : 0
  return (
    <section className={styles.tarjeta} aria-label="Informes fuera de rango">
      <div className={styles.izq}>
        <span className={styles.etiqueta}>Informes fuera de rango · límite residual</span>
        <div className={styles.numero}>
          <b>{nf.format(r.informesFuera)}</b>
          <span>de {nf.format(r.informes)} informe{r.informes === 1 ? '' : 's'}</span>
        </div>
        <span className={styles.pill}>{formatDecimalCL(pct, 1)}% del total</span>
        <p className={styles.nota}>
          Un informe cuenta como fuera de rango si al menos uno de sus analitos queda sobre el máximo o bajo el mínimo de la tabla.
        </p>
      </div>
      <div className={styles.derecha}>
        {r.porAnalito.length === 0 ? (
          <p className={styles.aviso}>Ningún analito de estos informes tiene límite en la tabla para {especie}.</p>
        ) : (
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Analito</th>
                <th>Límite residual</th>
                <th>Resultados fuera</th>
                <th>% fuera</th>
                <th>Desvío promedio</th>
                <th>Mayor desvío</th>
              </tr>
            </thead>
            <tbody>
              {r.porAnalito.map((a) => {
                const p = a.evaluados ? (a.fuera / a.evaluados) * 100 : 0
                const color = colorDeIngrediente(a.codigo)
                return (
                  <tr key={a.codigo}>
                    <td><i style={{ background: color }} aria-hidden="true" /><b>{a.codigo}</b></td>
                    <td>{dec(a.limite.min)} – {dec(a.limite.max)} ppm</td>
                    <td>{nf.format(a.fuera)} de {nf.format(a.evaluados)}</td>
                    <td>
                      <span className={styles.barra} aria-hidden="true"><span style={{ width: `${Math.min(100, p * 2.2)}%`, background: color }} /></span>
                      {formatDecimalCL(p, 0)}%
                    </td>
                    <td>{a.fuera ? `± ${dec(a.desvioPromedio)} ppm` : '—'}</td>
                    <td>{a.fuera ? `${con(a.mayorDesvio)} ppm` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
