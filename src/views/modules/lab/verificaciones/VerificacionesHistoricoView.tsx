import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import { descargarHistoricoExcel, historico, NOMBRE_SECCION, SECCIONES } from '@/features/verificaciones'
import type { Registro, Seccion as SeccionId } from '@/features/verificaciones'
import { Veredicto, VeredictoDia } from './componentes'
import styles from './Verificaciones.module.css'

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip)

const COLOR_SERIE = '#1C7FA6'
const COLOR_GRILLA = '#e1e5dc'
const COLOR_EJE = '#77837b'
const COLOR_LIMITE = '#b0271f'

/**
 * El histórico de verificaciones.
 *
 * En el Excel esto eran siete hojas que había que abrir una por una, y la de
 * resumen tiraba de todas con `INDEX`/`MATCH`. Acá es una sola consulta: el
 * resumen de arriba y, debajo, las tendencias de las mediciones que de verdad
 * derivan con el tiempo —el voltaje de la perla y el output del detector—,
 * que es donde se ve venir un problema antes de que el criterio se rompa.
 */

function ultimosDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}-${mes}`
}

interface GraficoProps {
  titulo: string
  nota: string
  etiquetas: string[]
  valores: (number | null)[]
  minimo?: number
  maximo?: number
  decimales: number
}

/** Una serie con sus dos líneas de criterio. Las líneas son planas y
 * discontinuas a propósito: son un umbral, no otra medición. */
function Grafico({ titulo, nota, etiquetas, valores, minimo, maximo, decimales }: GraficoProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const chart = useRef<Chart | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()
    const limite = (valor: number) => ({
      label: 'Criterio',
      data: etiquetas.map(() => valor),
      borderColor: COLOR_LIMITE,
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
    })
    chart.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: etiquetas,
        datasets: [
          {
            label: titulo,
            data: valores,
            borderColor: COLOR_SERIE,
            backgroundColor: `${COLOR_SERIE}1F`,
            borderWidth: 2,
            pointRadius: valores.length > 60 ? 0 : 3,
            pointHoverRadius: 5,
            spanGaps: true,
            tension: 0.25,
            fill: true,
          },
          ...(minimo !== undefined ? [limite(minimo)] : []),
          ...(maximo !== undefined ? [limite(maximo)] : []),
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
              label: (ctx) =>
                `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(decimales) ?? '—'}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: COLOR_EJE, maxTicksLimit: 10, autoSkip: true } },
          y: { grid: { color: COLOR_GRILLA }, border: { display: false }, ticks: { color: COLOR_EJE } },
        },
      },
    })
    return () => chart.current?.destroy()
  }, [titulo, etiquetas, valores, minimo, maximo, decimales])

  return (
    <Card>
      <h3 className={styles.seccionTitulo}>{titulo}</h3>
      <p className={styles.seccionNota}>{nota}</p>
      <div className={styles.grafico}>
        <canvas ref={ref} />
      </div>
    </Card>
  )
}

export function VerificacionesHistoricoView() {
  const navigate = useNavigate()
  const [desde, setDesde] = useState(() => ultimosDias(60))
  const [hasta, setHasta] = useState('')
  const [dias, setDias] = useState<Registro[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Cambiar el rango dispara una consulta nueva; `vigente` descarta la
  // respuesta de la anterior si llega tarde.
  useEffect(() => {
    let vigente = true
    historico(desde || undefined, hasta || undefined)
      .then((filas) => {
        if (!vigente) return
        setError(null)
        setDias(filas)
      })
      .catch(() => {
        if (!vigente) return
        setDias([])
        setError('No se pudo cargar el histórico. ¿Está el backend arriba?')
      })
    return () => {
      vigente = false
    }
  }, [desde, hasta])

  const etiquetas = useMemo(() => (dias ?? []).map((d) => fechaCorta(d.fecha)), [dias])
  const voltajes = useMemo(() => (dias ?? []).map((d) => d.detector.voltaje_perla), [dias])
  const outputs = useMemo(() => (dias ?? []).map((d) => d.detector.output_detector), [dias])

  // El orden del resumen es al revés que el de los gráficos: una tendencia se
  // lee del pasado al presente, pero una lista de días se busca por el último.
  const filas = useMemo(() => [...(dias ?? [])].reverse(), [dias])
  const conProblemas = filas.filter((d) => d.resultado === 'No aceptable').length

  return (
    <div className={styles.wrap}>
      <Header
        title="Histórico de verificaciones"
        description="Todos los días registrados, con el veredicto de cada sección y las tendencias del detector."
        acciones={
          <>
            <Button variant="secondary" onClick={() => navigate(ROUTES.agrofreshLabVerificaciones)}>
              Volver al día
            </Button>
            <Button
              variant="secondary"
              onClick={() => void descargarHistoricoExcel(desde || undefined, hasta || undefined)}
              disabled={!filas.length}
            >
              Descargar Excel
            </Button>
          </>
        }
      />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.filtros}>
        <label className={styles.campo}>
          <span className={styles.etiqueta}>Desde</span>
          <input
            type="date"
            className={cn(styles.input, styles.inputCorto)}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className={styles.campo}>
          <span className={styles.etiqueta}>Hasta</span>
          <input
            type="date"
            className={cn(styles.input, styles.inputCorto)}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        {dias && (
          <span className={styles.estadoGuardado}>
            {filas.length} día(s)
            {conProblemas > 0 && ` · ${conProblemas} con algo no aceptable`}
          </span>
        )}
      </div>

      {dias && dias.length > 0 && (
        <div className={styles.graficos}>
          <Grafico
            titulo="Voltaje de la perla (V)"
            nota="Se degrada con el uso: la tendencia avisa antes de que el criterio se rompa."
            etiquetas={etiquetas}
            valores={voltajes}
            minimo={0}
            maximo={1}
            decimales={3}
          />
          <Grafico
            titulo="Output del detector"
            nota="Criterio 19 a 22. Un desplazamiento sostenido suele preceder a un cambio de perla."
            etiquetas={etiquetas}
            valores={outputs}
            minimo={19}
            maximo={22}
            decimales={1}
          />
        </div>
      )}

      <Card className={styles.seccion}>
        <div className={styles.seccionCabecera}>
          <h3 className={styles.seccionTitulo}>Resumen diario</h3>
          <p className={styles.seccionNota}>
            Haz clic en un día para abrirlo. Los veredictos se recalculan con los criterios vigentes,
            así que apretar una tolerancia también revisa la historia.
          </p>
        </div>
        <div className={styles.seccionCuerpo}>
          {!dias ? (
            <p className={styles.vacio}>Cargando…</p>
          ) : filas.length === 0 ? (
            <p className={styles.vacio}>No hay verificaciones registradas en este rango.</p>
          ) : (
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    {SECCIONES.map((id: SeccionId) => (
                      <th key={id}>{NOMBRE_SECCION[id]}</th>
                    ))}
                    <th>Resultado del día</th>
                    <th>Revisado por</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((d) => (
                    <tr
                      key={d.fecha}
                      className={cn(
                        styles.filaEnlace,
                        d.resultado === 'No aceptable' && styles.filaMal,
                      )}
                      onClick={() => navigate(`${ROUTES.agrofreshLabVerificaciones}?fecha=${d.fecha}`)}
                    >
                      <td className={styles.celdaEquipo}>{d.fecha}</td>
                      {SECCIONES.map((id: SeccionId) => (
                        <td key={id}>
                          <Veredicto resultado={d.resultados_seccion[id]} />
                        </td>
                      ))}
                      <td>
                        <VeredictoDia resultado={d.resultado} />
                      </td>
                      <td className={styles.criterio}>{d.revisado_por || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
