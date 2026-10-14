import { useCallback, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { colorDeIngrediente, colorEspecieMarca } from '@/features/reportes'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import {
  detalleFuera,
  donaPorAnalito,
  donaPorEspecie,
} from '@/features/reportes/lib/fueraDeRangoResumen'
import type { FilaDona } from '@/features/reportes/lib/fueraDeRangoResumen'
import { DetalleFueraModal } from './DetalleFueraModal'
import styles from './DonaFueraDeRango.module.css'

interface Props {
  informes: InformeConPuntos[]
  soloFuera: boolean
  /** La especie filtrada arriba (si hay UNA): la dona pasa a ser por analito. */
  especieFiltrada: string | null
  /** Deja una especie como filtro (desde el detalle). */
  onElegirEspecie?: (especie: string) => void
}

const TAMANO = 250
const RADIO = TAMANO / 2 - 14
const GROSOR = 34

function punto(r: number, a: number, dx = 0, dy = 0): [number, number] {
  return [TAMANO / 2 + dx + r * Math.cos(a), TAMANO / 2 + dy + r * Math.sin(a)]
}

/** Un tramo del anillo entre dos ángulos; `salida` lo separa del centro (el «zoom» al pasar el mouse). */
function tramo(a0: number, a1: number, salida: number): string {
  const mid = (a0 + a1) / 2
  const dx = salida * Math.cos(mid)
  const dy = salida * Math.sin(mid)
  const R = RADIO + (salida ? 4 : 0)
  const r = RADIO - GROSOR
  // Un círculo completo no se puede dibujar con un solo arco: se corta apenas antes.
  const fin = a1 - a0 >= Math.PI * 2 - 1e-4 ? a0 + Math.PI * 2 - 1e-4 : a1
  const large = fin - a0 > Math.PI ? 1 : 0
  const [x0, y0] = punto(R, a0, dx, dy)
  const [x1, y1] = punto(R, fin, dx, dy)
  const [x2, y2] = punto(r, fin, dx, dy)
  const [x3, y3] = punto(r, a0, dx, dy)
  return `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3}Z`
}

/**
 * Una sola dona para la Vista de límites: por ESPECIE (informes) y, con una especie filtrada arriba, por ANALITO
 * (resultados, cada uno con su color de siempre). El tramo fuerte es lo fuera de rango y el tenue lo que está dentro;
 * con «Solo fuera de rango» quedan solo los fuertes. Al pasar el mouse el tramo se separa un poco; el clic abre el
 * detalle de cuánto se pasaron.
 */
export function DonaFueraDeRango({ informes, soloFuera, especieFiltrada, onElegirEspecie }: Props) {
  const porAnalito = Boolean(especieFiltrada)
  const filas = useMemo(() => (porAnalito ? donaPorAnalito(informes) : donaPorEspecie(informes)), [informes, porAnalito])
  const colores = useMemo(() => {
    const m = new Map<string, string>()
    if (porAnalito) filas.forEach((f) => m.set(f.nombre, colorDeIngrediente(f.nombre)))
    else [...filas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).forEach((f, i) => m.set(f.nombre, colorEspecieMarca(i) ?? '#9aa5b1'))
    return m
  }, [filas, porAnalito])

  const visibles = useMemo(() => (soloFuera ? filas.filter((f) => f.fuera > 0) : filas), [filas, soloFuera])
  const medida = (f: FilaDona) => (soloFuera ? f.fuera : f.total)
  const suma = visibles.reduce((t, f) => t + medida(f), 0)
  const totFuera = filas.reduce((t, f) => t + f.fuera, 0)
  const totTodo = filas.reduce((t, f) => t + f.total, 0)

  const [hover, setHover] = useState<{ nombre: string; x: number; y: number } | null>(null)
  const [elegido, setElegido] = useState<string | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  const alMover = (nombre: string) => (e: MouseEvent) => {
    const r = caja.current?.getBoundingClientRect()
    if (r) setHover({ nombre, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const cerrar = useCallback(() => setElegido(null), [])
  const abrir = (nombre: string) => {
    setElegido(nombre)
  }

  const detalle = useMemo(
    () => (elegido ? detalleFuera(informes, porAnalito ? { analito: elegido } : { especie: elegido }) : []),
    [elegido, informes, porAnalito],
  )

  const tramos = visibles.map((f, i) => {
    const antes = visibles.slice(0, i).reduce((t, x) => t + medida(x), 0)
    const a0 = -Math.PI / 2 + (suma ? (antes / suma) * Math.PI * 2 : 0)
    const ancho = suma ? (medida(f) / suma) * Math.PI * 2 : 0
    return { f, a0, a1: a0 + ancho, ancho }
  })

  if (filas.length === 0) {
    return <p className={styles.vacio}>No hay informes con límite en la tabla con estos filtros.</p>
  }
  const filaHover = hover ? filas.find((f) => f.nombre === hover.nombre) : undefined
  const unidad = porAnalito ? 'resultados' : 'informes'

  return (
    <div className={styles.caja} ref={caja}>
      <div className={styles.dona}>
        <svg viewBox={`0 0 ${TAMANO} ${TAMANO}`} role="img" aria-label={porAnalito ? 'Resultados por analito' : 'Informes por especie'}>
          {tramos.map(({ f, a0, a1, ancho }) => {
            if (ancho <= 0) return null
            const color = colores.get(f.nombre) ?? '#9aa5b1'
            const salida = hover?.nombre === f.nombre || elegido === f.nombre ? 9 : 0
            const fuerte = soloFuera || f.total === 0 ? ancho : (f.fuera / f.total) * ancho
            return (
              <g
                key={f.nombre}
                className={styles.tramo}
                onMouseMove={alMover(f.nombre)}
                onMouseLeave={() => setHover(null)}
                onClick={() => abrir(f.nombre)}
              >
                {f.fuera > 0 && <path d={tramo(a0, a0 + fuerte, salida)} fill={color} stroke="#fff" strokeWidth={2} />}
                {!soloFuera && f.total > f.fuera && (
                  <path d={tramo(a0 + fuerte, a1, salida)} fill={color} fillOpacity={0.28} stroke="#fff" strokeWidth={2} />
                )}
              </g>
            )
          })}
          <text x={TAMANO / 2} y={TAMANO / 2 - 2} textAnchor="middle" className={styles.centroNum}>
            {porAnalito ? totFuera : `${totTodo ? Math.round((totFuera / totTodo) * 100) : 0}%`}
          </text>
          <text x={TAMANO / 2} y={TAMANO / 2 + 18} textAnchor="middle" className={styles.centroTxt}>
            {porAnalito ? 'resultados fuera' : 'fuera de rango'}
          </text>
        </svg>
      </div>

      <ul className={styles.leyenda}>
        {visibles.map((f) => (
          <li key={f.nombre}>
            <button
              type="button"
              className={hover?.nombre === f.nombre || elegido === f.nombre ? styles.activa : undefined}
              onMouseEnter={(e) => alMover(f.nombre)(e)}
              onMouseLeave={() => setHover(null)}
              onClick={() => abrir(f.nombre)}
              title={`Ver cuánto se pasó ${f.nombre}`}
            >
              <i style={{ background: colores.get(f.nombre) }} />
              <span className={styles.nombre}>{f.nombre}</span>
              <span className={styles.medida}>{soloFuera ? `${f.fuera} fuera` : `${f.fuera} fuera de ${f.total}`}</span>
              <b>{f.total ? Math.round((f.fuera / f.total) * 100) : 0}%</b>
            </button>
          </li>
        ))}
      </ul>

      {hover && filaHover && !elegido && (
        <div className={styles.tip} style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <b>{filaHover.nombre}</b>
          <br />
          {filaHover.fuera} de {filaHover.total} {unidad} fuera de rango ({filaHover.total ? Math.round((filaHover.fuera / filaHover.total) * 100) : 0}%)
        </div>
      )}

      {elegido && (
        <DetalleFueraModal
          titulo={`${elegido} · cuánto se pasaron`}
          subtitulo={`${detalle.length} resultado${detalle.length === 1 ? '' : 's'} fuera de rango${porAnalito && especieFiltrada ? ` en ${especieFiltrada}` : ''}`}
          detalle={detalle}
          onCerrar={cerrar}
          ocultarAnalito={porAnalito}
          pie={
            !porAnalito && onElegirEspecie ? (
              <button type="button" className={styles.accion} onClick={() => { onElegirEspecie(elegido); cerrar() }}>
                Filtrar por {elegido}
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
