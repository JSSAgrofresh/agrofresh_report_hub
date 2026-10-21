import { dias } from '@/features/correoInformes'
import type { CajaDemora } from '@/features/correoInformes'
import styles from './GraficoCajas.module.css'

const COLORES: Record<string, string> = { QUITECA: '#2f7fb8', ALS: '#9a6bd1', DIAGNOFRUIT: '#d9822b', AGROFRESH: '#6dad3c' }
const ANCHO = 560
const ALTO = 300
const M = { arriba: 16, derecha: 16, abajo: 40, izquierda: 48 }

function colorDe(lab: string): string {
  return COLORES[lab.toUpperCase()] ?? '#6b7a73'
}

/** Un valor «redondo» de tope para el eje (1, 2, 5, 10…). */
function topeDe(max: number): number {
  const base = Math.max(1, Math.ceil(max))
  const paso = base <= 5 ? 1 : base <= 12 ? 2 : base <= 30 ? 5 : 10
  return Math.ceil(base / paso) * paso
}

/**
 * Diagrama de caja de la demora por laboratorio: la caja va del primer al tercer cuartil, la línea gruesa es la
 * mediana, la punteada el promedio, los bigotes llegan al dato más lejano que no es atípico y los puntos sueltos
 * son los informes que tardaron mucho más (o mucho menos) que lo normal. Cada punto gris es un informe.
 */
export function GraficoCajas({ cajas }: { cajas: CajaDemora[] }) {
  if (cajas.length === 0) return <p className={styles.vacio}>Todavía no hay informes con su demora medida.</p>
  const tope = topeDe(Math.max(...cajas.map((c) => c.maximo)))
  const ancho = ANCHO - M.izquierda - M.derecha
  const alto = ALTO - M.arriba - M.abajo
  const y = (v: number) => M.arriba + alto - (v / tope) * alto
  const banda = ancho / cajas.length
  const caja = Math.min(70, banda * 0.5)
  const marcas = Array.from({ length: 5 }, (_, i) => (tope / 4) * i)

  return (
    <svg className={styles.svg} viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Diagrama de caja de la demora de los informes por laboratorio">
      {marcas.map((m) => (
        <g key={m}>
          <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(m)} y2={y(m)} className={styles.rejilla} />
          <text x={M.izquierda - 6} y={y(m) + 4} textAnchor="end" className={styles.eje}>
            {Number.isInteger(m) ? m : m.toFixed(1)} d
          </text>
        </g>
      ))}
      <text transform={`translate(12 ${M.arriba + alto / 2}) rotate(-90)`} textAnchor="middle" className={styles.eje}>
        Días hábiles
      </text>
      {cajas.map((c, i) => {
        const cx = M.izquierda + banda * i + banda / 2
        const color = colorDe(c.laboratorio)
        const x0 = cx - caja / 2
        const resumen = `${c.laboratorio}: ${c.n} informes · mediana ${dias(c.mediana)} · promedio ${dias(c.media)} · de ${dias(c.minimo)} a ${dias(c.maximo)}`
        return (
          <g key={c.laboratorio} data-testid={`caja-${c.laboratorio}`}>
            <title>{resumen}</title>
            {c.n >= 4 ? (
              <>
                <line x1={cx} x2={cx} y1={y(c.bigote_alto)} y2={y(c.q3)} stroke={color} strokeWidth={2} />
                <line x1={cx} x2={cx} y1={y(c.q1)} y2={y(c.bigote_bajo)} stroke={color} strokeWidth={2} />
                <line x1={cx - caja / 4} x2={cx + caja / 4} y1={y(c.bigote_alto)} y2={y(c.bigote_alto)} stroke={color} strokeWidth={2} />
                <line x1={cx - caja / 4} x2={cx + caja / 4} y1={y(c.bigote_bajo)} y2={y(c.bigote_bajo)} stroke={color} strokeWidth={2} />
                <rect x={x0} y={y(c.q3)} width={caja} height={Math.max(2, y(c.q1) - y(c.q3))} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2} />
                <line x1={x0} x2={x0 + caja} y1={y(c.mediana)} y2={y(c.mediana)} stroke={color} strokeWidth={3} />
                <line x1={x0} x2={x0 + caja} y1={y(c.media)} y2={y(c.media)} stroke={color} strokeWidth={2} strokeDasharray="5 3" />
              </>
            ) : (
              <line x1={x0} x2={x0 + caja} y1={y(c.mediana)} y2={y(c.mediana)} stroke={color} strokeWidth={3} />
            )}
            {c.valores.map((v, k) => (
              <circle
                key={k}
                cx={cx + ((k % 5) - 2) * (caja / 8)}
                cy={y(v)}
                r={c.atipicos.includes(v) ? 4 : 2.5}
                fill={c.atipicos.includes(v) ? 'none' : color}
                stroke={color}
                strokeWidth={c.atipicos.includes(v) ? 2 : 0}
                fillOpacity={0.8}
              />
            ))}
            <text x={cx} y={ALTO - 20} textAnchor="middle" className={styles.etiqueta}>
              {c.laboratorio}
            </text>
            <text x={cx} y={ALTO - 6} textAnchor="middle" className={styles.eje}>
              {c.n} {c.n === 1 ? 'informe' : 'informes'} · mediana {dias(c.mediana)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
