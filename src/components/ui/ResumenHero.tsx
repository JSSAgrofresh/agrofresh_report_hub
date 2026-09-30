import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import styles from './ResumenHero.module.css'

const nf = new Intl.NumberFormat('es-CL')
const RADIO = 52
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

/** Sube de 0 al valor con una curva suave; sin animación si el usuario la
 * prefiere reducida. */
function useContarHasta(objetivo: number): number {
  const [valor, setValor] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const id = requestAnimationFrame(() => setValor(objetivo))
      return () => cancelAnimationFrame(id)
    }
    let id = 0
    let inicio = 0
    const paso = (t: number) => {
      if (!inicio) inicio = t
      const p = Math.min(1, (t - inicio) / 900)
      setValor(objetivo * (1 - Math.pow(1 - p, 3)))
      if (p < 1) id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [objetivo])
  return valor
}

export interface SegmentoHero {
  clave: string
  texto: string
  n: number
  color: string
  tinta: string
  fondo: string
}

interface Props {
  /** «SOLICITUDES CONCRETADAS» */
  etiqueta: string
  /** 0-100: lo que llena el anillo */
  porcentaje: number
  /** la cifra grande: «30» */
  cifra: number
  /** «de 123 emitidas» */
  cifraSub: string
  descripcion?: string
  segmentos: SegmentoHero[]
  ariaLabel: string
}

/** La cifra grande de una pantalla: un anillo que se llena, el número que sube
 * animado y, al lado, cómo se reparte el total entre sus estados. */
export function ResumenHero({ etiqueta, porcentaje, cifra, cifraSub, descripcion, segmentos, ariaLabel }: Props) {
  const id = useId().replace(/:/g, '')
  const animado = useContarHasta(porcentaje)
  const total = segmentos.reduce((s, x) => s + x.n, 0)

  return (
    <section className={styles.tarjeta} aria-label={ariaLabel}>
      <div className={styles.principal}>
        <div className={styles.anillo}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id={`anillo${id}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6dad3c" />
                <stop offset="100%" stopColor="#1b7f5c" />
              </linearGradient>
            </defs>
            <circle className={styles.pista} cx="60" cy="60" r={RADIO} />
            <circle
              className={styles.progreso}
              style={{ stroke: `url(#anillo${id})` }}
              cx="60"
              cy="60"
              r={RADIO}
              strokeDasharray={CIRCUNFERENCIA}
              strokeDashoffset={CIRCUNFERENCIA * (1 - animado / 100)}
            />
          </svg>
          <span className={styles.cifra} role="img" aria-label={`${Math.round(porcentaje)}%`}>
            {Math.round(animado)}<small>%</small>
          </span>
        </div>
        <div className={styles.texto}>
          <span className={styles.etiqueta}>{etiqueta}</span>
          <span className={styles.grande}>
            {nf.format(cifra)}
            <small> {cifraSub}</small>
          </span>
          {descripcion && <span className={styles.sub}>{descripcion}</span>}
        </div>
      </div>

      <div className={styles.detalle}>
        <div className={styles.barra} role="img" aria-label={ariaLabel}>
          {segmentos.map((s) => (s.n > 0 ? <span key={s.clave} style={{ flexGrow: s.n, background: s.color }} /> : null))}
        </div>
        <ul className={styles.estados}>
          {segmentos.map((s) => (
            <li key={s.clave} style={{ '--c': s.color, '--fondo': s.fondo, '--tinta': s.tinta } as CSSProperties}>
              <b>{nf.format(s.n)}</b>
              <span>{s.texto}</span>
              <em>{total ? Math.round((s.n / total) * 100) : 0}%</em>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
