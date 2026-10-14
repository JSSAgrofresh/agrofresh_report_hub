import { useMemo } from 'react'
import { colorDeIngrediente, limitesDeInforme, resumenResidual } from '@/features/reportes'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import type { RangoResidual } from '@/features/reportes'
import { formatDecimalCL } from '@/lib/locale'
import styles from './InformesFueraDeRango.module.css'

const nf = new Intl.NumberFormat('es-CL')
const dec = (n: number) => formatDecimalCL(n, 2)
const con = (n: number) => `${n > 0 ? '+' : ''}${dec(n)}`
const pct = (n: number, de: number) => `${formatDecimalCL(de ? (n / de) * 100 : 0, 1)}%`

function textoLimite(rangos: RangoResidual[]): { texto: string; titulo?: string } {
  if (rangos.length === 1) return { texto: `${dec(rangos[0].min)} – ${dec(rangos[0].max)} ppm` }
  const min = Math.min(...rangos.map((r) => r.min))
  const max = Math.max(...rangos.map((r) => r.max))
  return {
    texto: `${dec(min)} – ${dec(max)} ppm · según especie`,
    titulo: rangos.map((r) => `${dec(r.min)} – ${dec(r.max)} ppm`).join('  |  '),
  }
}

interface Props {
  informes: InformeConPuntos[]
}

/**
 * «Informes fuera de rango» de la Vista de límites (modo Límites residuales). Cada informe se juzga con los límites
 * de SU propia especie (tabla fija del laboratorio): no hace falta elegir una especie. Cuenta cuántos informes tienen
 * al menos un analito sobre el máximo o bajo el mínimo, con su porcentaje, y por analito cuántos resultados quedan
 * sobre y bajo el límite, el desvío promedio y el mayor desvío.
 */
export function InformesFueraDeRango({ informes }: Props) {
  const r = useMemo(() => resumenResidual(informes, limitesDeInforme), [informes])

  if (r.informesEvaluados === 0) {
    return (
      <section className={styles.tarjeta} aria-label="Informes fuera de rango">
        <span className={styles.etiqueta}>Informes fuera de rango · límite residual</span>
        <p className={styles.aviso}>
          {r.informes === 0
            ? 'No hay informes con estos filtros.'
            : 'La especie de estos informes no está en la tabla de límites residuales (o ninguno de sus analitos tiene límite).'}
        </p>
      </section>
    )
  }

  const totEval = r.porAnalito.reduce((t, a) => t + a.evaluados, 0)
  const totSobre = r.porAnalito.reduce((t, a) => t + a.sobre, 0)
  const totBajo = r.porAnalito.reduce((t, a) => t + a.bajo, 0)
  const totFuera = totSobre + totBajo
  return (
    <section className={styles.tarjeta} aria-label="Informes fuera de rango">
      <div className={styles.izq}>
        <span className={styles.etiqueta}>Informes fuera de rango · límite residual</span>
        <div className={styles.numero}>
          <b>{nf.format(r.informesFuera)}</b>
          <span>de {nf.format(r.informesEvaluados)} informe{r.informesEvaluados === 1 ? '' : 's'}</span>
        </div>
        <span className={styles.pill}>{pct(r.informesFuera, r.informesEvaluados)} del total</span>
        <dl className={styles.desglose}>
          <div className={styles.sobre}>
            <dt>Sobre el límite</dt>
            <dd><b>{nf.format(r.informesSobre)}</b> informe{r.informesSobre === 1 ? '' : 's'} · {pct(r.informesSobre, r.informesEvaluados)}</dd>
          </div>
          <div className={styles.bajo}>
            <dt>Bajo el límite</dt>
            <dd><b>{nf.format(r.informesBajo)}</b> informe{r.informesBajo === 1 ? '' : 's'} · {pct(r.informesBajo, r.informesEvaluados)}</dd>
          </div>
        </dl>
        <p className={styles.nota}>
          Cada informe se evalúa con los límites de su propia especie. Cuenta como fuera de rango si al menos uno de sus analitos queda sobre el máximo o bajo el mínimo.
          {r.informesSinLimite > 0 && ` ${nf.format(r.informesSinLimite)} informe${r.informesSinLimite === 1 ? '' : 's'} sin límite en la tabla no se evalúa${r.informesSinLimite === 1 ? '' : 'n'}.`}
        </p>
      </div>
      <div className={styles.derecha}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Analito</th>
              <th>Límite residual</th>
              <th>Evaluados</th>
              <th>Sobre el límite</th>
              <th>Bajo el límite</th>
              <th>Fuera de rango</th>
              <th>Desvío promedio</th>
              <th>Mayor desvío</th>
            </tr>
          </thead>
          <tbody>
            {r.porAnalito.map((a) => {
              const color = colorDeIngrediente(a.codigo)
              const lim = textoLimite(a.rangos)
              return (
                <tr key={a.codigo}>
                  <td><i style={{ background: color }} aria-hidden="true" /><b>{a.codigo}</b></td>
                  <td title={lim.titulo}>{lim.texto}</td>
                  <td>{nf.format(a.evaluados)}</td>
                  <td className={a.sobre ? styles.cSobre : undefined}>{nf.format(a.sobre)} · {pct(a.sobre, a.evaluados)}</td>
                  <td className={a.bajo ? styles.cBajo : undefined}>{nf.format(a.bajo)} · {pct(a.bajo, a.evaluados)}</td>
                  <td>
                    <span className={styles.barra} aria-hidden="true"><span style={{ width: `${Math.min(100, (a.evaluados ? a.fuera / a.evaluados : 0) * 220)}%`, background: color }} /></span>
                    {nf.format(a.fuera)} · {pct(a.fuera, a.evaluados)}
                  </td>
                  <td>{a.fuera ? `± ${dec(a.desvioPromedio)} ppm` : '—'}</td>
                  <td>{a.fuera ? `${con(a.mayorDesvio)} ppm` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td />
              <td>{nf.format(totEval)}</td>
              <td>{nf.format(totSobre)} · {pct(totSobre, totEval)}</td>
              <td>{nf.format(totBajo)} · {pct(totBajo, totEval)}</td>
              <td>{nf.format(totFuera)} · {pct(totFuera, totEval)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
