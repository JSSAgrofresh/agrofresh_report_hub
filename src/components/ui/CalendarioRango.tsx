import { useEffect, useRef, useState } from 'react'
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

type Modo = 'rango' | 'anio' | 'meses'

const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function aISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatoCorto(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(anio, mes + 1, 0).getDate()
}

function rangoAnio(anio: number): RangoFechas {
  return { desde: aISO(anio, 0, 1), hasta: aISO(anio, 11, 31) }
}

function rangoMes(anio: number, mes: number): RangoFechas {
  return { desde: aISO(anio, mes, 1), hasta: aISO(anio, mes, ultimoDiaMes(anio, mes)) }
}

function rangoUltimosDias(dias: number): RangoFechas {
  const hoy = new Date()
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - (dias - 1))
  return { desde: aISO(desde.getFullYear(), desde.getMonth(), desde.getDate()), hasta: aISO(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) }
}

function descripcionRango(rango: RangoFechas): string {
  const [ay, am, ad] = rango.desde.split('-').map(Number)
  const [by, bm, bd] = rango.hasta.split('-').map(Number)
  if (ay === by && am === 1 && ad === 1 && bm === 12 && bd === 31) {
    return `Año ${ay}`
  }
  if (ay === by && am === bm && ad === 1 && bd === ultimoDiaMes(ay, am - 1)) {
    return `${MESES[am - 1]} ${ay}`
  }
  return `${formatoCorto(rango.desde)} al ${formatoCorto(rango.hasta)}`
}

function anosDisponibles(): number[] {
  const actual = new Date().getFullYear()
  const anios: number[] = []
  for (let y = actual + 1; y >= actual - 8; y--) anios.push(y)
  return anios
}

export function CalendarioRango({ etiqueta, valor, onChange }: CalendarioRangoProps) {
  const [abierto, setAbierto] = useState(false)
  const [modo, setModo] = useState<Modo>('rango')
  const hoy = new Date()
  const [mesBase, setMesBase] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [anioTab, setAnioTab] = useState(hoy.getFullYear())
  const [mesesSeleccionados, setMesesSeleccionados] = useState<number[]>([])
  const [inicioPendiente, setInicioPendiente] = useState<string | null>(null)
  const [hoverFin, setHoverFin] = useState<string | null>(null)
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
        setInicioPendiente(null)
        setHoverFin(null)
      }
    }
    document.addEventListener('mousedown', alHacerClicFuera)
    return () => document.removeEventListener('mousedown', alHacerClicFuera)
  }, [abierto])

  function aplicarYCerrar(rango: RangoFechas | null) {
    onChange(rango)
    setInicioPendiente(null)
    setHoverFin(null)
    setAbierto(false)
  }

  function alHacerClicDia(iso: string) {
    if (!inicioPendiente) {
      setInicioPendiente(iso)
      setHoverFin(iso)
      return
    }
    const [desde, hasta] = inicioPendiente <= iso ? [inicioPendiente, iso] : [iso, inicioPendiente]
    aplicarYCerrar({ desde, hasta })
  }

  function cambiarMesBase(delta: number) {
    setMesBase((prev) => {
      const m = prev.mes + delta
      if (m < 0) return { anio: prev.anio - 1, mes: 11 }
      if (m > 11) return { anio: prev.anio + 1, mes: 0 }
      return { ...prev, mes: m }
    })
  }

  function alternarMesSeleccionado(mes: number) {
    setMesesSeleccionados((prev) => (prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes].sort((a, b) => a - b)))
  }

  function aplicarMesesSeleccionados() {
    if (mesesSeleccionados.length === 0) return
    const minMes = mesesSeleccionados[0]
    const maxMes = mesesSeleccionados[mesesSeleccionados.length - 1]
    aplicarYCerrar({ desde: aISO(anioTab, minMes, 1), hasta: aISO(anioTab, maxMes, ultimoDiaMes(anioTab, maxMes)) })
  }

  function renderMesCalendario(anio: number, mes: number) {
    const primerDiaSemana = new Date(anio, mes, 1).getDay()
    const totalDias = new Date(anio, mes + 1, 0).getDate()
    const celdas: (number | null)[] = [
      ...Array.from({ length: primerDiaSemana }, () => null),
      ...Array.from({ length: totalDias }, (_, i) => i + 1),
    ]
    const previsualizacion =
      inicioPendiente && hoverFin
        ? inicioPendiente <= hoverFin
          ? { desde: inicioPendiente, hasta: hoverFin }
          : { desde: hoverFin, hasta: inicioPendiente }
        : valor

    return (
      <div className={styles.mesCalendario}>
        <div className={styles.tituloMes}>
          {MESES[mes]} {anio}
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
            const enRango = previsualizacion && iso >= previsualizacion.desde && iso <= previsualizacion.hasta
            const esBorde = previsualizacion && (iso === previsualizacion.desde || iso === previsualizacion.hasta)
            const esInicioPendiente = inicioPendiente === iso
            return (
              <button
                key={iso}
                type="button"
                className={cn(
                  styles.dia,
                  enRango && styles.diaEnRango,
                  (esBorde || esInicioPendiente) && styles.diaBorde,
                )}
                onMouseDown={() => alHacerClicDia(iso)}
                onMouseEnter={() => inicioPendiente && setHoverFin(iso)}
              >
                {dia}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const mesSiguiente = mesBase.mes === 11 ? { anio: mesBase.anio + 1, mes: 0 } : { anio: mesBase.anio, mes: mesBase.mes + 1 }
  const texto = valor ? descripcionRango(valor) : 'Todas'
  const anios = anosDisponibles()

  return (
    <div className={styles.contenedor} ref={contenedorRef}>
      <span className={styles.etiqueta}>{etiqueta}</span>
      <button
        type="button"
        className={styles.boton}
        onClick={() => {
          setAbierto((v) => !v)
          setInicioPendiente(null)
          setHoverFin(null)
        }}
      >
        <span className={cn(styles.botonTexto, !valor && styles.botonTextoVacio)}>{texto}</span>
        <span className={styles.flecha}>📅</span>
      </button>

      {abierto && (
        <div className={styles.panel}>
          <div className={styles.tabs}>
            <button type="button" className={cn(styles.tab, modo === 'rango' && styles.tabActiva)} onClick={() => setModo('rango')}>
              Rango
            </button>
            <button type="button" className={cn(styles.tab, modo === 'anio' && styles.tabActiva)} onClick={() => setModo('anio')}>
              Año completo
            </button>
            <button type="button" className={cn(styles.tab, modo === 'meses' && styles.tabActiva)} onClick={() => setModo('meses')}>
              Meses
            </button>
          </div>

          {modo === 'rango' && (
            <>
              <div className={styles.presets}>
                <button type="button" onClick={() => aplicarYCerrar(rangoUltimosDias(7))}>Últimos 7 días</button>
                <button type="button" onClick={() => aplicarYCerrar(rangoUltimosDias(30))}>Últimos 30 días</button>
                <button type="button" onClick={() => aplicarYCerrar(rangoMes(hoy.getFullYear(), hoy.getMonth()))}>Este mes</button>
                <button
                  type="button"
                  onClick={() => {
                    const m = hoy.getMonth() === 0 ? 11 : hoy.getMonth() - 1
                    const y = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear()
                    aplicarYCerrar(rangoMes(y, m))
                  }}
                >
                  Mes pasado
                </button>
                <button type="button" onClick={() => aplicarYCerrar(rangoAnio(hoy.getFullYear()))}>Este año</button>
                <button type="button" onClick={() => aplicarYCerrar(rangoAnio(hoy.getFullYear() - 1))}>Año pasado</button>
              </div>

              <div className={styles.navegacion}>
                <button type="button" onClick={() => cambiarMesBase(-1)} aria-label="Mes anterior">
                  ‹
                </button>
                <div className={styles.saltos}>
                  <select
                    value={mesBase.mes}
                    onChange={(e) => setMesBase((prev) => ({ ...prev, mes: Number(e.target.value) }))}
                  >
                    {MESES.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={mesBase.anio}
                    onChange={(e) => setMesBase((prev) => ({ ...prev, anio: Number(e.target.value) }))}
                  >
                    {anios.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={() => cambiarMesBase(1)} aria-label="Mes siguiente">
                  ›
                </button>
              </div>

              <div className={styles.dobleCalendario}>
                {renderMesCalendario(mesBase.anio, mesBase.mes)}
                {renderMesCalendario(mesSiguiente.anio, mesSiguiente.mes)}
              </div>

              <p className={styles.ayuda}>
                {inicioPendiente ? 'Elige el día final del rango.' : 'Elige el día inicial del rango (puedes navegar entre meses o años antes de elegir el final).'}
              </p>
            </>
          )}

          {modo === 'anio' && (
            <div className={styles.grillaAnios}>
              {anios.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={cn(styles.botonAnio, valor && descripcionRango(valor) === `Año ${a}` && styles.botonAnioActivo)}
                  onClick={() => aplicarYCerrar(rangoAnio(a))}
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          {modo === 'meses' && (
            <>
              <div className={styles.navegacion}>
                <button type="button" onClick={() => setAnioTab((a) => a - 1)} aria-label="Año anterior">
                  ‹
                </button>
                <span>{anioTab}</span>
                <button type="button" onClick={() => setAnioTab((a) => a + 1)} aria-label="Año siguiente">
                  ›
                </button>
              </div>
              <div className={styles.grillaMeses}>
                {MESES_ABREV.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(styles.botonMes, mesesSeleccionados.includes(i) && styles.botonMesActivo)}
                    onClick={() => alternarMesSeleccionado(i)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className={styles.ayuda}>Elige uno o varios meses de {anioTab}. Si eliges varios no consecutivos, el rango cubrirá desde el primero hasta el último.</p>
              <button type="button" className={styles.aplicar} disabled={mesesSeleccionados.length === 0} onClick={aplicarMesesSeleccionados}>
                Aplicar {mesesSeleccionados.length > 0 ? `(${mesesSeleccionados.length} mes${mesesSeleccionados.length > 1 ? 'es' : ''})` : ''}
              </button>
            </>
          )}

          {valor && (
            <button
              type="button"
              className={styles.limpiar}
              onClick={() => {
                setMesesSeleccionados([])
                aplicarYCerrar(null)
              }}
            >
              Limpiar rango
            </button>
          )}
        </div>
      )}
    </div>
  )
}
