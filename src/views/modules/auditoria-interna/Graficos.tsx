import { useEffect, useRef } from 'react'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import type { ClienteTop, PuntoSemana, Totales } from '@/features/auditoriaInterna'

Chart.register(ArcElement, DoughnutController, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** Crea el gráfico al montar y lo destruye al desmontar o al cambiar los datos:
 * un canvas no admite dos Chart a la vez. */
function useGrafico(
  construir: (canvas: HTMLCanvasElement) => Chart,
  dependencias: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = construir(ref.current)
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias)
  return ref
}

const nf = new Intl.NumberFormat('es-CL')

export function GraficoEstado({ totales }: { totales: Totales }) {
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: ['Concretadas', 'PDF cargado, sin resultados en Report', 'Pendientes'],
          datasets: [
            {
              data: [totales.concretadas, totales.sinReport, totales.pendientes],
              backgroundColor: [cssVar('--color-ok', '#2f7d32'), cssVar('--color-warning', '#b4531f'), '#c9d0c4'],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '66%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${nf.format(Number(c.raw))}` } },
          },
        },
      }),
    [totales.concretadas, totales.sinReport, totales.pendientes],
  )
  return <canvas ref={ref} role="img" aria-label="Solicitudes emitidas según su estado" />
}

export function GraficoSemanas({ puntos }: { puntos: PuntoSemana[] }) {
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: puntos.map((p) => p.etiqueta),
          datasets: [
            { label: 'Emitidas', data: puntos.map((p) => p.emitidas), backgroundColor: '#2a78d6', borderRadius: 3 },
            {
              label: 'Concretadas',
              data: puntos.map((p) => p.concretadas),
              backgroundColor: cssVar('--color-ok', '#2f7d32'),
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: cssVar('--color-border', '#e1e5dc') } },
            x: { grid: { display: false }, ticks: { maxRotation: 60, font: { size: 10 } } },
          },
        },
      }),
    [puntos],
  )
  return <canvas ref={ref} role="img" aria-label="Solicitudes emitidas y concretadas por semana" />
}

export function GraficoClientes({ clientes }: { clientes: ClienteTop[] }) {
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: clientes.map((c) => c.cliente),
          datasets: [
            { label: 'Solicitudes', data: clientes.map((c) => c.solicitudes), backgroundColor: '#2a78d6', borderRadius: 3 },
            {
              label: 'Concretadas',
              data: clientes.map((c) => c.concretadas),
              backgroundColor: cssVar('--color-ok', '#2f7d32'),
              borderRadius: 3,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: cssVar('--color-border', '#e1e5dc') } },
            y: { grid: { display: false }, ticks: { font: { size: 11 } } },
          },
        },
      }),
    [clientes],
  )
  return <canvas ref={ref} role="img" aria-label="Clientes con más solicitudes" />
}
