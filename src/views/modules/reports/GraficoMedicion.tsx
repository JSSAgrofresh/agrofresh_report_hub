import { useEffect, useRef } from 'react'
import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js'
import type { ChartConfiguration } from 'chart.js'
import styles from './ReporteAccutab.module.css'

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip)

const COLOR_GRILLA = '#eceef2'
const COLOR_EJE = '#9ca3af'

function fmt(v: number | null | undefined, dec: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/** Una serie de mediciones (pH o ORP) con sus límites del informe como líneas de referencia. pH y ORP nunca
 * comparten gráfico: no tienen la misma escala. */
export function GraficoMedicion({
  titulo,
  unidad,
  etiquetas,
  valores,
  color,
  decimales,
  limiteMin,
  limiteMax,
}: {
  titulo: string
  unidad?: string
  etiquetas: string[]
  valores: (number | null)[]
  color: string
  decimales: number
  limiteMin?: number | null
  limiteMax?: number | null
}) {
  const lienzo = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!lienzo.current) return
    const limite = (v: number) => ({
      label: 'Límite',
      data: etiquetas.map(() => v),
      borderColor: COLOR_EJE,
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
    })
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: etiquetas,
        datasets: [
          {
            label: titulo,
            data: valores,
            borderColor: color,
            backgroundColor: `${color}14`,
            borderWidth: 1.75,
            pointRadius: valores.length > 60 ? 0 : 3,
            pointHoverRadius: 4,
            spanGaps: true,
            tension: 0.25,
            fill: true,
          },
          ...(limiteMin != null ? [limite(limiteMin)] : []),
          ...(limiteMax != null ? [limite(limiteMax)] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label === 'Límite' ? 'Límite' : titulo}: ${fmt(c.parsed.y, decimales)}${unidad ? ` ${unidad}` : ''}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: COLOR_EJE, maxTicksLimit: 6, autoSkip: true, maxRotation: 0 } },
          y: { grid: { color: COLOR_GRILLA }, border: { display: false }, ticks: { color: COLOR_EJE } },
        },
      },
    }
    const grafico = new Chart(lienzo.current, config)
    return () => grafico.destroy()
  }, [titulo, unidad, etiquetas, valores, color, decimales, limiteMin, limiteMax])

  return (
    <div className={styles.grafico}>
      <h3 className={styles.graficoTitulo}>
        {titulo}
        {unidad && <span> {unidad}</span>}
      </h3>
      <div className={styles.lienzo}>
        <canvas ref={lienzo} />
      </div>
    </div>
  )
}
