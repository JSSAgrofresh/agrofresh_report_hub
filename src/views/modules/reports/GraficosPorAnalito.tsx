import { useEffect, useMemo, useRef } from 'react'
import { Chart } from 'chart.js'
import type { ChartConfiguration, TooltipItem } from 'chart.js'
import { colorDeIngrediente, posicionResidual, resumenResidual } from '@/features/reportes'
import { resaltarFranja } from '@/features/reportes'
import type { RangoResidual } from '@/features/reportes'
import type { DatasetFranja } from '@/features/reportes/lib/resaltarFranja'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import { formatDateCL, formatDecimalCL } from '@/lib/locale'
import styles from './GraficosPorAnalito.module.css'

interface Colores {
  borde: string
  superficie: string
  texto: string
  suave: string
  peligro: string
}

interface Props {
  informes: InformeConPuntos[]
  /** Los analitos a graficar (uno por gráfico). */
  analitos: string[]
  /** Franjas fijas de la tabla para la especie elegida; `null` si no hay (no se dibuja franja). */
  limites: Record<string, RangoResidual> | null
  unidad: string
  colores: Colores
  /** Clic en un punto: abre el mismo detalle que el gráfico grande. */
  onAbrir: (informe: InformeConPuntos) => void
  /** El informe que se está viendo: su punto va más grande y con borde oscuro. */
  destacado?: number
  titulo?: string
}

/** Un informe con el resultado de un analito (los informes que no lo traen se dejan fuera). */
function puntosDe(informes: InformeConPuntos[], codigo: string) {
  return informes.flatMap((inf) =>
    inf.puntos
      .filter((p) => p.ingrediente === codigo && p.ppm != null)
      .map((p) => ({ inf, ppm: p.ppm as number })),
  )
}

function GraficoAnalito({
  codigo, informes, limite, unidad, colores, onAbrir, fuera, evaluados, destacado,
}: {
  codigo: string
  informes: InformeConPuntos[]
  limite: RangoResidual | null
  unidad: string
  colores: Colores
  onAbrir: (informe: InformeConPuntos) => void
  fuera: number
  evaluados: number
  destacado?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const alAbrir = useRef(onAbrir)
  useEffect(() => {
    alAbrir.current = onAbrir
  }, [onAbrir])
  const puntos = useMemo(() => puntosDe(informes, codigo), [informes, codigo])
  const color = colorDeIngrediente(codigo)

  useEffect(() => {
    if (!ref.current) return
    const veces = new Map<number, number>()
    puntos.forEach((p) => veces.set(p.inf.solicitudId, (veces.get(p.inf.solicitudId) ?? 0) + 1))
    const visto = new Map<number, number>()
    const etiquetas = puntos.map((p) => {
      const fecha = p.inf.fecha ? formatDateCL(p.inf.fecha) : 'Sin fecha'
      if ((veces.get(p.inf.solicitudId) ?? 0) < 2) return fecha
      const n = (visto.get(p.inf.solicitudId) ?? 0) + 1
      visto.set(p.inf.solicitudId, n)
      return `${fecha} · ${n}`
    })
    const inicioDeFecha = etiquetas.map((e, i) => i === 0 || e !== etiquetas[i - 1])
    const lim = limite ? { [codigo]: limite } : null
    const fueraDe = (ppm: number) => (lim ? (posicionResidual(codigo, ppm, lim) ?? 'dentro') !== 'dentro' : false)

    const resaltada = { current: false }
    const valores = puntos.map((p) => p.ppm)
    const techo = Math.max(...valores, limite?.max ?? 0)
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: etiquetas,
        datasets: [
          {
            label: codigo,
            data: valores,
            showLine: false,
            borderWidth: 0,
            pointRadius: puntos.map((p) => (p.inf.solicitudId === destacado ? 10 : 6)),
            pointHoverRadius: 11,
            pointHitRadius: 10,
            pointBackgroundColor: color,
            pointBorderColor: puntos.map((p) => (fueraDe(p.ppm) ? colores.peligro : p.inf.solicitudId === destacado ? colores.texto : colores.superficie)),
            pointBorderWidth: puntos.map((p) => (fueraDe(p.ppm) ? 3.5 : p.inf.solicitudId === destacado ? 3 : 2)),
          },
          ...(limite
            ? [
                { label: `${codigo} mín`, data: valores.map(() => limite.min), borderColor: `${color}99`, borderWidth: 1.4, borderDash: [6, 4], pointRadius: 0, pointHitRadius: 0 },
                { label: `${codigo} máx`, data: valores.map(() => limite.max), borderColor: `${color}99`, borderWidth: 1.4, borderDash: [6, 4], pointRadius: 0, pointHitRadius: 0, fill: 1, backgroundColor: `${color}1a` },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item: TooltipItem<'line'>) => item.datasetIndex === 0,
            callbacks: {
              title: (items) => {
                const p = puntos[items[0]?.dataIndex ?? -1]
                return p ? `${p.inf.nroSolicitud} · ${etiquetas[items[0].dataIndex]}` : ''
              },
              label: (ctx: TooltipItem<'line'>) => `${codigo}: ${formatDecimalCL(ctx.raw as number, 4)}`,
            },
          },
        },
        scales: {
          x: {
            offset: true,
            ticks: { autoSkip: false, font: { size: 10 }, maxRotation: 90, minRotation: 90, callback: (_v, i) => (inicioDeFecha[i] ? etiquetas[i] : '') },
            grid: { display: true, color: (c) => (inicioDeFecha[c.index] ? colores.borde : 'transparent') },
          },
          y: {
            min: 0,
            suggestedMax: techo * 1.12,
            grid: { color: colores.borde },
            ticks: { callback: (v) => formatDecimalCL(Number(v), 2), font: { size: 10 } },
            title: { display: true, text: unidad, font: { size: 11 }, color: colores.suave },
          },
        },
        onHover: (_evt, elementos, c) => {
          const sobre = elementos.some((e) => e.datasetIndex === 0)
          c.canvas.style.cursor = sobre ? 'pointer' : 'default'
          if (sobre === resaltada.current) return
          resaltada.current = sobre
          resaltarFranja(c.data.datasets as unknown as DatasetFranja[], 1, sobre ? codigo : null, () => color)
          c.update('none')
        },
        onClick: (_evt, elementos) => {
          const idx = elementos[0]?.index
          if (idx != null && puntos[idx]) alAbrir.current(puntos[idx].inf)
        },
      },
    }
    const chart = new Chart(ref.current, config)
    return () => chart.destroy()
  }, [puntos, limite, codigo, color, colores, unidad, destacado])

  return (
    <article className={styles.tarjeta} aria-label={`Gráfico de ${codigo}`}>
      <header className={styles.cabecera}>
        <span className={styles.nombre}><i style={{ background: color }} aria-hidden="true" />{codigo}</span>
        {limite ? (
          <span className={styles.limite}>Límite {formatDecimalCL(limite.min, 2)} – {formatDecimalCL(limite.max, 2)} {unidad}</span>
        ) : (
          <span className={styles.limite}>Sin límite en la tabla para esta especie</span>
        )}
        {limite && (
          <span className={fuera > 0 ? styles.fuera : styles.dentro}>
            {fuera > 0 ? `${fuera} de ${evaluados} fuera de rango` : `${evaluados} dentro del rango`}
          </span>
        )}
      </header>
      <div className={styles.lienzo}><canvas ref={ref} /></div>
    </article>
  )
}

/**
 * Un gráfico por analito (modo Límites residuales): cada uno con su propia franja fija y su propia escala, así un
 * analito alto no se pierde entre los demás. Van en una caja con scroll; los que más resultados fuera de rango tienen, primero.
 */
export function GraficosPorAnalito({ informes, analitos, limites, unidad, colores, onAbrir, destacado, titulo = 'Un gráfico por analito' }: Props) {
  const orden = useMemo(() => {
    const r = limites ? resumenResidual(informes, limites) : null
    const filas = analitos.map((codigo) => {
      const f = r?.porAnalito.find((a) => a.codigo === codigo)
      return { codigo, fuera: f?.fuera ?? 0, evaluados: f?.evaluados ?? puntosDe(informes, codigo).length }
    })
    return filas.sort((a, b) => b.fuera - a.fuera || a.codigo.localeCompare(b.codigo, 'es'))
  }, [informes, analitos, limites])

  if (orden.length === 0) return null
  return (
    <section className={styles.contenedor} aria-label="Gráficos por analito">
      <h3 className={styles.titulo}>
        {titulo}
        <span className={styles.hint}>pasa el mouse sobre un punto para resaltar su franja · clic para ver el informe</span>
      </h3>
      <div className={styles.scroll}>
        {orden.map((o) => (
          <GraficoAnalito
            key={o.codigo}
            codigo={o.codigo}
            informes={informes}
            limite={limites?.[o.codigo] ?? null}
            unidad={unidad}
            colores={colores}
            onAbrir={onAbrir}
            fuera={o.fuera}
            evaluados={o.evaluados}
            destacado={destacado}
          />
        ))}
      </div>
    </section>
  )
}
