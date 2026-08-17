import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import styles from './CalendarioRango.module.css'

export interface RangoFechas {
  desde: string
  hasta: string
}

interface CalendarioRangoProps {
  etiqueta: string
  valor: RangoFechas | null
  onChange: (rango: RangoFechas | null) => void
}

const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function aISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatoCorto(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

export function CalendarioRango({ etiqueta, valor, onChange }: CalendarioRangoProps) {
  const [abierto, setAbierto] = useState(false)
  const hoy = new Date()
  const [mesVisible, setMesVisible] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [arrastrando, setArrastrando] = useState(false)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [hoverFin, setHoverFin] = useState<string | null>(null)

  useEffect(() => {
    if (!arrastrando) return
    function terminar() {
      setArrastrando(false)
      if (anchor && hoverFin) {
        const [desde, hasta] = anchor <= hoverFin ? [anchor, hoverFin] : [hoverFin, anchor]
        onChange({ desde, hasta })
      }
    }
    window.addEventListener('mouseup', terminar)
    return () => window.removeEventListener('mouseup', terminar)
  }, [arrastrando, anchor, hoverFin, onChange])

  function iniciarSeleccion(iso: string) {
    setArrastrando(true)
    setAnchor(iso)
    setHoverFin(iso)
  }

  function extenderSeleccion(iso: string) {
    if (arrastrando) setHoverFin(iso)
  }

  function cambiarMes(delta: number) {
    setMesVisible((prev) => {
      const m = prev.mes + delta
      if (m < 0) return { anio: prev.anio - 1, mes: 11 }
      if (m > 11) return { anio: prev.anio + 1, mes: 0 }
      return { ...prev, mes: m }
    })
  }

  const { anio, mes } = mesVisible
  const primerDiaSemana = new Date(anio, mes, 1).getDay()
  const totalDias = new Date(anio, mes + 1, 0).getDate()
  const celdas: (number | null)[] = [
    ...Array.from({ length: primerDiaSemana }, () => null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ]

  const previsualizacion =
    arrastrando && anchor && hoverFin
      ? anchor <= hoverFin
        ? { desde: anchor, hasta: hoverFin }
        : { desde: hoverFin, hasta: anchor }
      : valor

  const texto = valor ? `${formatoCorto(valor.desde)} al ${formatoCorto(valor.hasta)}` : 'Todas'

  return (
    <div className={styles.contenedor}>
      <span className={styles.etiqueta}>{etiqueta}</span>
      <button type="button" className={styles.boton} onClick={() => setAbierto((v) => !v)}>
        <span className={cn(styles.botonTexto, !valor && styles.botonTextoVacio)}>{texto}</span>
        <span className={styles.flecha}>📅</span>
      </button>

      {abierto && (
        <>
          <div className={styles.fondo} onClick={() => setAbierto(false)} />
          <div className={styles.panel}>
            <div className={styles.navegacion}>
              <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
                ‹
              </button>
              <span>
                {MESES[mes]} {anio}
              </span>
              <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
                ›
              </button>
            </div>

            <div className={styles.grilla}>
              {DIAS_SEMANA.map((d, i) => (
                <span key={i} className={styles.diaSemana}>
                  {d}
                </span>
              ))}
              {celdas.map((dia, i) => {
                if (dia === null) return <span key={`vacio-${i}`} />
                const iso = aISO(anio, mes, dia)
                const enRango =
                  previsualizacion && iso >= previsualizacion.desde && iso <= previsualizacion.hasta
                const esBorde = previsualizacion && (iso === previsualizacion.desde || iso === previsualizacion.hasta)
                return (
                  <button
                    key={iso}
                    type="button"
                    className={cn(styles.dia, enRango && styles.diaEnRango, esBorde && styles.diaBorde)}
                    onMouseDown={() => iniciarSeleccion(iso)}
                    onMouseEnter={() => extenderSeleccion(iso)}
                  >
                    {dia}
                  </button>
                )
              })}
            </div>

            <p className={styles.ayuda}>Mantén presionado el clic y arrastra para elegir un rango de días.</p>

            {valor && (
              <button
                type="button"
                className={styles.limpiar}
                onClick={() => {
                  onChange(null)
                  setAnchor(null)
                  setHoverFin(null)
                }}
              >
                Limpiar rango
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
