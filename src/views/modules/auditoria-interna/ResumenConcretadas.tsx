import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Totales } from '@/features/auditoriaInterna'
import { ESTADOS, ORDEN_ESTADOS } from './estados'
import styles from './ResumenConcretadas.module.css'

const nf = new Intl.NumberFormat('es-CL')
const RADIO = 52
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

/** Sube de 0 al valor con una curva suave; sin animación si el usuario la
 * prefiere reducida. Cuando el valor cambia (filtros), parte desde donde estaba. */
function useContarHasta(objetivo: number): number {
  const [valor, setValor] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const id = requestAnimationFrame(() => setValor(objetivo))
      return () => cancelAnimationFrame(id)
    }
    let id = 0
    let inicio = 0
    let desde = 0
    const paso = (t: number) => {
      if (!inicio) {
        inicio = t
        desde = 0
      }
      const p = Math.min(1, (t - inicio) / 900)
      setValor(desde + (objetivo - desde) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [objetivo])
  return valor
}

const CANTIDAD = (t: Totales, e: (typeof ORDEN_ESTADOS)[number]) =>
  e === 'concretada' ? t.concretadas : e === 'sin_report' ? t.sinReport : t.pendientes

/** La cifra grande de Auditoría interna: qué parte de lo emitido ya se concretó,
 * con un anillo que se llena, y abajo el reparto entre los tres estados. */
export function ResumenConcretadas({ totales: t }: { totales: Totales }) {
  const animado = useContarHasta(t.porcentajeConcretado)
  const entero = Math.round(animado)

  return (
    <section className={styles.tarjeta} aria-label="Resumen de solicitudes concretadas">
      <div className={styles.principal}>
        <div className={styles.anillo}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="anilloConcretadas" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6dad3c" />
                <stop offset="100%" stopColor="#1b7f5c" />
              </linearGradient>
            </defs>
            <circle className={styles.pista} cx="60" cy="60" r={RADIO} />
            <circle
              className={styles.progreso}
              cx="60"
              cy="60"
              r={RADIO}
              strokeDasharray={CIRCUNFERENCIA}
              strokeDashoffset={CIRCUNFERENCIA * (1 - animado / 100)}
            />
          </svg>
          <span className={styles.cifra} role="img" aria-label={`${Math.round(t.porcentajeConcretado)}% concretadas`}>
            {entero}<small>%</small>
          </span>
        </div>
        <div className={styles.texto}>
          <span className={styles.etiqueta}>Solicitudes concretadas</span>
          <span className={styles.grande}>
            {nf.format(t.concretadas)}
            <small> de {nf.format(t.emitidas)} emitidas</small>
          </span>
          <span className={styles.sub}>Con su PDF guardado y sus resultados ya en Report.</span>
        </div>
      </div>

      <div className={styles.detalle}>
        <div className={styles.barra} role="img" aria-label="Estado de las solicitudes emitidas">
          {ORDEN_ESTADOS.map((e) => {
            const n = CANTIDAD(t, e)
            return n > 0 ? <span key={e} style={{ flexGrow: n, background: ESTADOS[e].color }} /> : null
          })}
        </div>
        <ul className={styles.estados}>
          {ORDEN_ESTADOS.map((e) => {
            const n = CANTIDAD(t, e)
            return (
              <li key={e} style={{ '--c': ESTADOS[e].color, '--fondo': ESTADOS[e].fondo, '--tinta': ESTADOS[e].tinta } as CSSProperties}>
                <b>{nf.format(n)}</b>
                <span>{ESTADOS[e].texto}</span>
                <em>{t.emitidas ? Math.round((n / t.emitidas) * 100) : 0}%</em>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
