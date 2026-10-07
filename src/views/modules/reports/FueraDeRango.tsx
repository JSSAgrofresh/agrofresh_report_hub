import { useMemo, useState } from 'react'
import {
  agrupar,
  clasificar,
  contar,
  pctFuera,
  type Criterio,
  type Dimension,
} from '../../../features/reportes/lib/fueraDeRango'
import type { Analito, LimiteAnalito, Observacion } from '../../../features/reportes'
import styles from './FueraDeRango.module.css'

const DIMENSIONES: { clave: Dimension; texto: string }[] = [
  { clave: 'analito', texto: 'Analito' },
  { clave: 'cliente', texto: 'Cliente' },
  { clave: 'laboratorio', texto: 'Laboratorio' },
  { clave: 'servicio', texto: 'Servicio' },
]

const fmt = (n: number) => n.toLocaleString('es-CL')
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`)

interface Props {
  observaciones: Observacion[]
  analitos: Analito[]
  limites: LimiteAnalito[]
  sigma: number
}

/** Qué porcentaje de los resultados cae fuera de rango, con cada número reconstruible. */
export default function FueraDeRango({ observaciones, analitos, limites, sigma }: Props) {
  const hayLimites = limites.length > 0
  const [criterioElegido, setCriterio] = useState<Criterio | null>(null)
  const criterio: Criterio = criterioElegido ?? (hayLimites ? 'limite' : 'control')
  const [dim, setDim] = useState<Dimension>('analito')

  const { clasificados, nd } = useMemo(() => {
    const c = clasificar(observaciones, { criterio, analitos, limites, sigma })
    const sinValor = observaciones.filter((o) => o.ingrediente && o.ppm == null).length
    return { clasificados: c, nd: sinValor }
  }, [observaciones, criterio, analitos, limites, sigma])

  const total = useMemo(() => contar(clasificados, nd), [clasificados, nd])
  const filas = useMemo(() => agrupar(clasificados, dim), [clasificados, dim])
  const evaluados = total.dentro + total.sobre + total.bajo
  const fuera = total.sobre + total.bajo
  const maxN = Math.max(1, ...filas.map((f) => f.n))
  const dimTexto = DIMENSIONES.find((d) => d.clave === dim)?.texto ?? ''

  return (
    <section className={styles.tarjeta} aria-label="Resultados fuera de rango">
      <header className={styles.cabecera}>
        <div>
          <h3>Resultados fuera de rango</h3>
          <p>
            {criterio === 'limite'
              ? 'Contra el límite residual cargado de cada analito (por especie y servicio).'
              : `Contra los límites de control de cada analito: promedio ± ${sigma}σ de los resultados filtrados (mínimo 3 por analito).`}
          </p>
        </div>
        <div className={styles.selector} role="group" aria-label="Criterio">
          <button type="button" className={criterio === 'limite' ? styles.activo : ''} onClick={() => setCriterio('limite')}>
            Límite del analito
          </button>
          <button type="button" className={criterio === 'control' ? styles.activo : ''} onClick={() => setCriterio('control')}>
            Límite de control
          </button>
        </div>
      </header>

      {criterio === 'limite' && !hayLimites && (
        <p className={styles.aviso}>
          Aún no hay límites residuales cargados (se cargan en Report → Gestionar analitos): todos los resultados salen
          «sin límite». Usa «Límite de control» mientras tanto.
        </p>
      )}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>Fuera de rango</span>
          <b className={styles.rojo}>{pct(pctFuera(total))}</b>
          <small>{fmt(fuera)} de {fmt(evaluados)} evaluados</small>
        </div>
        <div className={styles.kpi}>
          <span>Sobre el límite</span>
          <b>{fmt(total.sobre)}</b>
        </div>
        <div className={styles.kpi}>
          <span>Bajo el límite</span>
          <b>{fmt(total.bajo)}</b>
        </div>
        <div className={styles.kpi}>
          <span>No evaluables</span>
          <b>{fmt(total.sin_limite + total.nd)}</b>
          <small>{fmt(total.sin_limite)} sin límite · {fmt(total.nd)} no detectados</small>
        </div>
      </div>

      <div className={styles.verPor}>
        <span>Ver por</span>
        <div className={styles.selector} role="group" aria-label="Ver por">
          {DIMENSIONES.map((d) => (
            <button key={d.clave} type="button" className={dim === d.clave ? styles.activo : ''} onClick={() => setDim(d.clave)}>
              {d.texto}
            </button>
          ))}
        </div>
      </div>

      {filas.length === 0 ? (
        <p className={styles.vacio}>No hay resultados numéricos con estos filtros.</p>
      ) : (
        <ul className={styles.filas}>
          {filas.map((f) => (
            <li key={f.clave}>
              <span className={styles.nombre} title={f.clave}>{f.clave}</span>
              <div className={styles.barra} style={{ width: `${(f.n / maxN) * 100}%` }} title={`${fmt(f.n)} resultados`}>
                <i className={styles.dentro} style={{ flex: f.dentro }} />
                <i className={styles.sobre} style={{ flex: f.sobre }} />
                <i className={styles.bajo} style={{ flex: f.bajo }} />
                <i className={styles.sinLimite} style={{ flex: f.sin_limite }} />
              </div>
              <b className={styles.pct}>{pct(f.pctFuera)}</b>
              <span className={styles.n}>{fmt(f.sobre + f.bajo)} / {fmt(f.evaluados)}</span>
            </li>
          ))}
        </ul>
      )}

      <ul className={styles.leyenda}>
        <li><i className={styles.dentro} />Dentro</li>
        <li><i className={styles.sobre} />Sobre</li>
        <li><i className={styles.bajo} />Bajo</li>
        <li><i className={styles.sinLimite} />Sin límite</li>
      </ul>

      <details className={styles.como}>
        <summary>¿Cómo se calcula?</summary>
        <p>
          % fuera de rango = (sobre + bajo) ÷ evaluados = ({fmt(total.sobre)} + {fmt(total.bajo)}) ÷ {fmt(evaluados)}
          {' '}= {pct(pctFuera(total))}. Evaluados = dentro + sobre + bajo ({fmt(total.dentro)} + {fmt(total.sobre)} + {fmt(total.bajo)}).
        </p>
        <p>
          Quedan fuera del cálculo, sin darse por «dentro»: {fmt(total.sin_limite)} resultado(s) {criterio === 'limite' ? 'sin límite cargado' : 'de analitos con menos de 3 resultados'} y {fmt(total.nd)} sin valor numérico (no detectados). Ver por «{dimTexto}» solo reparte los mismos resultados.
        </p>
      </details>
    </section>
  )
}
