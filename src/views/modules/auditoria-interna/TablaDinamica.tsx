import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { LABS_PIVOTE, TIPOS_PIVOTE, camposTituloTabla, pivotePorMes } from '@/features/auditoriaInterna'
import type { CeldaLab, FilaPivote, FiltrosSolicitudes, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { colorDeTipo } from './coloresTipo'
import styles from './TablaDinamica.module.css'

const nf = new Intl.NumberFormat('es-CL')
const pct = (n: number) => `${Math.round(n)}%`

/** Las cantidades, con un tinte que crece con el valor (contra el mayor de su
 * columna): se ve de un vistazo dónde se concentra el trabajo. */
function Cantidad({ valor, maximo, clase }: { valor: number; maximo: number; clase: string }) {
  if (valor === 0) return <span className={styles.cero}>–</span>
  return (
    <span className={`${styles.cantidad} ${clase}`} style={{ '--r': maximo ? valor / maximo : 0 } as CSSProperties}>
      {nf.format(valor)}
    </span>
  )
}

/** El reparto entre los dos laboratorios: los dos % y una barra de dos colores. */
function Reparto({ c }: { c: CeldaLab }) {
  if (c.total === 0) return <span className={styles.cero}>–</span>
  return (
    <div className={styles.reparto} title={`Quiteca ${pct(c.pctQuiteca)} · Agrofresh ${pct(c.pctAgrofresh)}`}>
      <div className={styles.repartoTextos}>
        <b className={styles.tq}>{pct(c.pctQuiteca)}</b>
        <b className={styles.ta}>{pct(c.pctAgrofresh)}</b>
      </div>
      <div className={styles.repartoBarra} role="img" aria-label={`Quiteca ${pct(c.pctQuiteca)}, Agrofresh ${pct(c.pctAgrofresh)}`}>
        <span className={styles.bq} style={{ width: `${c.pctQuiteca}%` }} />
        <span className={styles.ba} style={{ width: `${c.pctAgrofresh}%` }} />
      </div>
    </div>
  )
}

/**
 * La tabla dinámica: análisis por mes y, al tocar un mes, por semana. Tiene dos
 * grupos (Línea de proceso, Actimist), cada uno con la cantidad de Quiteca y de
 * Agrofresh y cómo se reparten en %. El cambio mes ↔ semana desliza las filas.
 */
export function TablaDinamica({ solicitudes, filtros }: { solicitudes: SolicitudAuditoria[]; filtros: FiltrosSolicitudes }) {
  const pivote = useMemo(() => pivotePorMes(solicitudes), [solicitudes])
  const [mes, setMes] = useState<string | null>(null)
  const [sentido, setSentido] = useState<'entra' | 'vuelve'>('entra')

  // Si los filtros dejan sin ese mes, se vuelve a la vista por mes.
  const mesActual = mes ? pivote.meses.find((m) => m.clave === mes) ?? null : null
  const enSemanas = mesActual !== null
  const filas: FilaPivote[] = mesActual ? pivote.semanas[mesActual.clave] : pivote.meses
  const totales: Record<string, CeldaLab> = mesActual ? mesActual.tipos : pivote.totales

  function abrir(clave: string) {
    setSentido('entra')
    setMes(clave)
  }
  function volver() {
    setSentido('vuelve')
    setMes(null)
  }

  useEffect(() => {
    if (!enSemanas) return
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && volver()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [enSemanas])

  const maximos = Object.fromEntries(
    TIPOS_PIVOTE.map((t) => [
      t,
      {
        quiteca: Math.max(0, ...filas.map((f) => f.tipos[t].quiteca)),
        agrofresh: Math.max(0, ...filas.map((f) => f.tipos[t].agrofresh)),
      },
    ]),
  )

  return (
    <section className={styles.tarjeta} aria-label="Análisis por mes y por semana">
      <header className={styles.cabecera}>
        <div className={styles.titulos}>
          <nav className={styles.migas} aria-label="Ubicación">
            <button type="button" onClick={volver} disabled={!enSemanas} className={enSemanas ? styles.migaLink : styles.migaActual}>
              Por mes
            </button>
            {mesActual && (
              <>
                <span aria-hidden="true">›</span>
                <span className={styles.migaActual} aria-current="page">{mesActual.etiqueta}</span>
              </>
            )}
          </nav>
          <h3>{mesActual ? `Semanas de ${mesActual.etiqueta}` : 'Análisis por mes'}</h3>
          <p className={styles.alcance} aria-label="Filtros de la tabla">
            {camposTituloTabla(filtros).map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </p>
          <p>
            {mesActual
              ? 'Cuántos análisis hizo cada laboratorio en cada semana (de lunes a domingo).'
              : 'Toca un mes para verlo por semana. Los % son el reparto entre Quiteca y Agrofresh.'}
          </p>
        </div>
        <div className={styles.lado}>
          <ul className={styles.leyenda}>
            {LABS_PIVOTE.map((l) => (
              <li key={l.clave}><i className={l.clave === 'quiteca' ? styles.bq : styles.ba} />{l.texto}</li>
            ))}
          </ul>
          {enSemanas && (
            <button type="button" className={styles.volver} onClick={volver}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 3 5 8l5 5" />
              </svg>
              Volver a meses
            </button>
          )}
        </div>
      </header>

      {filas.length === 0 ? (
        <p className={styles.vacio}>No hay solicitudes de Quiteca ni de Agrofresh con fecha, con los filtros actuales.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th rowSpan={2} className={styles.colPeriodo} scope="col">{enSemanas ? 'Semana' : 'Mes'}</th>
                {TIPOS_PIVOTE.map((t) => (
                  <th key={t} colSpan={3} scope="colgroup" className={styles.grupo} style={{ '--tipo': colorDeTipo(t) } as CSSProperties}>
                    <span>{t}</span>
                    <small>{nf.format(totales[t].total)} análisis</small>
                  </th>
                ))}
              </tr>
              <tr>
                {TIPOS_PIVOTE.map((t) => (
                  <ColumnasLab key={t} tipo={t} />
                ))}
              </tr>
            </thead>
            <tbody key={mesActual?.clave ?? 'meses'} className={sentido === 'entra' ? styles.entra : styles.vuelve}>
              {filas.map((f, i) => {
                const vacia = TIPOS_PIVOTE.every((t) => f.tipos[t].total === 0)
                const clicable = !enSemanas && !vacia
                return (
                  <tr
                    key={f.clave}
                    className={`${styles.fila} ${clicable ? styles.clicable : ''} ${vacia ? styles.filaVacia : ''}`}
                    style={{ '--i': i } as CSSProperties}
                    onClick={clicable ? () => abrir(f.clave) : undefined}
                  >
                    <th scope="row" className={styles.colPeriodo}>
                      {clicable ? (
                        <button type="button" className={styles.botonMes} onClick={(e) => { e.stopPropagation(); abrir(f.clave) }} aria-label={`Ver ${f.etiqueta} por semana`}>
                          <span>{f.etiqueta}</span>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m6 3 5 5-5 5" />
                          </svg>
                        </button>
                      ) : (
                        <span className={styles.periodo}>
                          <span>{f.etiqueta}</span>
                          {f.rango && <small>{f.rango}</small>}
                        </span>
                      )}
                    </th>
                    {TIPOS_PIVOTE.map((t) => (
                      <CeldasTipo key={t} c={f.tipos[t]} max={maximos[t]} />
                    ))}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className={styles.colPeriodo}>{enSemanas ? `Total ${mesActual?.etiqueta}` : 'Total'}</th>
                {TIPOS_PIVOTE.map((t) => (
                  <CeldasTipo key={t} c={totales[t]} max={null} />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

function ColumnasLab({ tipo }: { tipo: string }) {
  return (
    <>
      <th scope="col" className={`${styles.sub} ${styles.primeraDelGrupo}`}><i className={styles.bq} />Quiteca</th>
      <th scope="col" className={styles.sub}><i className={styles.ba} />Agrofresh</th>
      <th scope="col" className={styles.sub} aria-label={`% de ${tipo}`}>%</th>
    </>
  )
}

function CeldasTipo({ c, max }: { c: CeldaLab; max: { quiteca: number; agrofresh: number } | null }) {
  const m = max ?? { quiteca: c.total, agrofresh: c.total }
  return (
    <>
      <td className={`${styles.num} ${styles.primeraDelGrupo}`}><Cantidad valor={c.quiteca} maximo={m.quiteca} clase={styles.cq} /></td>
      <td className={styles.num}><Cantidad valor={c.agrofresh} maximo={m.agrofresh} clase={styles.ca} /></td>
      <td className={styles.colReparto}><Reparto c={c} /></td>
    </>
  )
}
