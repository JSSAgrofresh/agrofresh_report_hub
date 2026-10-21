import { useEffect, useRef } from 'react'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import type { ChartConfiguration } from 'chart.js'
import { dias, semanaCorta } from '@/features/correoInformes'
import type { PanelIngreso } from '@/features/correoInformes'
import styles from './GraficoDemora.module.css'

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend, Filler)

const VERDE = '#226b53'
const TINTA = '#16201b'
const REJILLA = '#e1e5dc'
const COLORES_LAB: Record<string, string> = { Quiteca: '#2f7fb8', ALS: '#9a6bd1', Diagnofruit: '#d9822b', AgroFresh: '#6dad3c' }

/**
 * La demora de los informes semana a semana: cuántos días hábiles pasan desde que la solicitud sale al
 * laboratorio hasta que su informe llega al correo. La línea gruesa es la mediana de cada semana, la
 * punteada su tendencia, y cada laboratorio va en su color.
 */
export function GraficoDemora({ tendencia }: { tendencia: PanelIngreso['tendencia'] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current || tendencia.puntos.length === 0) return
    const etiquetas = tendencia.puntos.map((p) => semanaCorta(p.semana))
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: etiquetas,
        datasets: [
          {
            label: 'Mediana semanal',
            data: tendencia.puntos.map((p) => p.mediana),
            borderColor: VERDE,
            backgroundColor: 'rgba(34, 107, 83, 0.10)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: VERDE,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.25,
            fill: true,
          },
          ...(tendencia.recta.length >= 2
            ? [{
                label: 'Tendencia',
                data: tendencia.recta,
                borderColor: TINTA,
                borderDash: [6, 5],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
              }]
            : []),
          ...tendencia.laboratorios.map((lab) => ({
            label: lab,
            data: tendencia.puntos.map((p) => p.por_laboratorio[lab] ?? null),
            borderColor: COLORES_LAB[lab] ?? '#77837b',
            backgroundColor: COLORES_LAB[lab] ?? '#77837b',
            borderWidth: 1.5,
            pointRadius: 3,
            spanGaps: true,
            tension: 0.25,
            fill: false,
          })),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: TINTA } },
          tooltip: {
            backgroundColor: TINTA,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (items) => `Semana del ${items[0]?.label ?? ''}`,
              label: (item) => ` ${item.dataset.label}: ${dias(item.parsed.y)}`,
              afterBody: (items) => {
                const n = tendencia.puntos[items[0]?.dataIndex ?? 0]?.n
                return n ? [`${n} informe${n === 1 ? '' : 's'} esa semana`] : []
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#77837b' } },
          y: {
            beginAtZero: true,
            grid: { color: REJILLA },
            ticks: { color: '#77837b', callback: (v) => `${v} d` },
            title: { display: true, text: 'Días hábiles', color: '#77837b' },
          },
        },
      },
    }
    const chart = new Chart(ref.current, config)
    return () => chart.destroy()
  }, [tendencia])

  if (tendencia.puntos.length === 0) {
    return <p className={styles.vacio}>Todavía no hay informes con su demora calculada. Aparecerán cuando lleguen informes de solicitudes que salieron por el sistema.</p>
  }
  return (
    <div className={styles.caja}>
      <canvas ref={ref} role="img" aria-label="Demora de los informes por semana, en días hábiles" />
    </div>
  )
}
