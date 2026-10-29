import { useEffect, useRef } from 'react'
import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js'
import type { ChartConfiguration, Plugin } from 'chart.js'
import { COLOR_KG, fmt } from '@/features/costoKilo'
import styles from './SeccionCostoKilo.module.css'

Chart.register(CategoryScale, LinearScale, BarController, BarElement, LineController, LineElement, PointElement, Legend, Tooltip)

const COLOR_GRILLA = '#eceef2'
const COLOR_EJE = '#9ca3af'

export interface LineaCostoKilo {
  nombre: string
  valores: number[]
  color: string
  /** Línea punteada, sin puntos (la carga inicial de solución madre). */
  punteada?: boolean
}

/**
 * Los kilos de fruta de cada día en barras (eje de la izquierda) y, encima, las líneas de lo que se usó ese día
 * (eje de la derecha: no tienen la misma escala). Un día parcial (primero, último o con pocas lecturas) va más tenue.
 */
export function GraficoCostoKilo({
  titulo,
  etiquetas,
  kg,
  parciales,
  lineas,
  unidadLineas,
  decimales = 1,
}: {
  titulo: string
  etiquetas: string[]
  kg: number[]
  parciales: boolean[]
  lineas: LineaCostoKilo[]
  unidadLineas: string
  decimales?: number
}) {
  const lienzo = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!lienzo.current) return
    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: etiquetas,
        datasets: [
          {
            type: 'bar',
            label: 'KG FRUTA PROCESO',
            data: kg,
            backgroundColor: parciales.map((p) => (p ? `${COLOR_KG}88` : COLOR_KG)),
            borderRadius: 4,
            yAxisID: 'y',
            order: 2,
          },
          ...lineas.map((l) => ({
            type: 'line' as const,
            label: l.nombre,
            data: l.valores,
            borderColor: l.color,
            backgroundColor: l.color,
            borderWidth: l.punteada ? 2.5 : 2,
            borderDash: l.punteada ? [2, 5] : undefined,
            pointRadius: l.punteada ? 0 : 3,
            pointHoverRadius: 5,
            tension: 0,
            yAxisID: 'y1',
            order: 1,
          })),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              color: '#4b5563',
              font: { size: 12 },
              // El cuadrito de la leyenda lleva el borde de la línea: con la línea punteada se veía como un manchón.
              generateLabels: (chart) =>
                Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item) => ({ ...item, lineDash: [], lineWidth: 0, strokeStyle: 'transparent' })),
            },
          },
          tooltip: {
            callbacks: {
              label: (c) => (c.datasetIndex === 0 ? `Fruta proceso: ${fmt(c.parsed.y, 0)} kg` : `${c.dataset.label}: ${fmt(c.parsed.y, decimales)} ${unidadLineas}`),
              afterBody: (items) => (parciales[items[0]?.dataIndex ?? -1] ? ['Día parcial: no tiene las 24 horas de lecturas'] : []),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: COLOR_EJE, autoSkip: true, maxRotation: 0 } },
          y: { position: 'left', beginAtZero: true, grid: { color: COLOR_GRILLA }, border: { display: false }, ticks: { color: COLOR_EJE }, title: { display: true, text: 'kg de fruta', color: COLOR_EJE } },
          y1: { position: 'right', beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { color: COLOR_EJE }, title: { display: true, text: unidadLineas, color: COLOR_EJE } },
        },
      },
    }
    // El valor de cada barra, dentro de ella y en blanco, como la plantilla del cliente.
    const valoresEnBarras: Plugin = {
      id: 'valoresEnBarras',
      afterDatasetsDraw(chart) {
        const { ctx } = chart
        const meta = chart.getDatasetMeta(0)
        ctx.save()
        ctx.fillStyle = '#fff'
        ctx.font = '600 11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        meta.data.forEach((elemento, i) => {
          const barra = (elemento as BarElement).getProps(['x', 'base', 'y', 'width'], true)
          if (barra.x == null || barra.y == null || barra.base == null) return
          if (barra.base - barra.y < 22 || (barra.width ?? 0) < 38) return
          ctx.fillText(fmt(kg[i], 0), barra.x, barra.base - 6)
        })
        ctx.restore()
      },
    }
    const grafico = new Chart(lienzo.current, { ...config, plugins: [valoresEnBarras] })
    return () => grafico.destroy()
  }, [etiquetas, kg, parciales, lineas, unidadLineas, decimales])

  return (
    <div className={styles.grafico}>
      <h3 className={styles.graficoTitulo}>{titulo}</h3>
      <div className={styles.lienzo}>
        <canvas ref={lienzo} />
      </div>
    </div>
  )
}
