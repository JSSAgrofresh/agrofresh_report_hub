import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Card } from '@/components/ui/Card'
import {
  calcularKpis,
  nombreEquipo,
  opcionesDeCampo,
} from '@/features/postventa'
import type { FiltroCargas, Periodo, ResumenCargaTrace } from '@/features/postventa'
import { formatDateCL } from '@/lib/locale'
import styles from './PostVentaResumen.module.css'

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'todo', texto: 'Todo' },
  { valor: '365', texto: '12 meses' },
  { valor: '90', texto: '90 días' },
  { valor: '30', texto: '30 días' },
]

function num(v: number | null | undefined, decimales: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

/** Tarjeta de indicador con degradado. El texto va siempre en blanco sobre
 * tonos oscuros: el extremo claro de cada degradado sigue sobre 4:1 con el
 * blanco (la cifra es grande y en negrita), y el texto chico queda a la
 * izquierda, sobre el extremo oscuro. */
function Tile({
  etiqueta,
  valor,
  detalle,
  desde,
  hasta,
  textual,
}: {
  etiqueta: string
  valor: string
  detalle?: string
  desde?: string
  hasta?: string
  /** El valor es una fecha, no una cifra: va más chico para caber en una línea. */
  textual?: boolean
}) {
  const estilo =
    desde && hasta ? ({ '--desde': desde, '--hasta': hasta } as CSSProperties) : undefined
  return (
    <div className={`${styles.tile} ${estilo ? styles.tileColor : ''}`} style={estilo}>
      <span className={styles.tileEtiqueta}>{etiqueta}</span>
      <span className={`${styles.tileValor} ${textual ? styles.tileValorTexto : ''}`}>{valor}</span>
      {detalle && <span className={styles.tileDetalle}>{detalle}</span>}
    </div>
  )
}

/**
 * Vista general de Accu-Tab, arriba del detalle de una carga: filtros,
 * indicadores de las cargas. Todo sale de la lista de cargas
 * que ya se pidió; no se baja ninguna medición extra.
 */
export function PostVentaResumen({
  todas,
  filtradas,
  filtro,
  onFiltro,
}: {
  todas: ResumenCargaTrace[]
  filtradas: ResumenCargaTrace[]
  filtro: FiltroCargas
  onFiltro: (f: FiltroCargas) => void
}) {
  const clientes = useMemo(() => opcionesDeCampo(todas, 'cliente'), [todas])
  const plantas = useMemo(() => opcionesDeCampo(todas, 'planta'), [todas])
  const posiciones = useMemo(() => opcionesDeCampo(todas, 'ubicacion'), [todas])
  const equipos = useMemo(() => opcionesDeCampo(todas, 'equipo'), [todas])
  const kpis = useMemo(() => calcularKpis(filtradas), [filtradas])
  const hayFiltros = Boolean(
    filtro.cliente || filtro.planta || filtro.ubicacion || filtro.equipo || filtro.periodo !== 'todo',
  )

  return (
    <section className={styles.resumen} aria-label="Vista general">
      <div className={styles.barra}>
        <label className={styles.campo}>
          <span>Sold To</span>
          <select
            value={filtro.cliente}
            onChange={(e) => onFiltro({ ...filtro, cliente: e.target.value })}
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          <span>Ship To</span>
          <select
            value={filtro.planta}
            onChange={(e) => onFiltro({ ...filtro, planta: e.target.value })}
          >
            <option value="">Todos</option>
            {plantas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          <span>Posición de muestreo</span>
          <select
            value={filtro.ubicacion}
            onChange={(e) => onFiltro({ ...filtro, ubicacion: e.target.value })}
          >
            <option value="">Todas</option>
            {posiciones.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          <span>Equipo</span>
          <select
            value={filtro.equipo}
            onChange={(e) => onFiltro({ ...filtro, equipo: e.target.value })}
          >
            <option value="">Todos</option>
            {equipos.map((e) => (
              <option key={e} value={e}>
                {nombreEquipo(e)}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.campo}>
          <span>Período</span>
          <div className={styles.segmentos} role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                aria-pressed={filtro.periodo === p.valor}
                className={filtro.periodo === p.valor ? styles.segmentoActivo : undefined}
                onClick={() => onFiltro({ ...filtro, periodo: p.valor })}
              >
                {p.texto}
              </button>
            ))}
          </div>
        </div>
        {hayFiltros && (
          <button
            type="button"
            className={styles.limpiar}
            onClick={() => onFiltro({ cliente: '', planta: '', ubicacion: '', equipo: '', periodo: 'todo' })}
          >
            Limpiar
          </button>
        )}
      </div>

      <div className={styles.tiles}>
        <Tile
          etiqueta="Mediciones"
          valor={kpis.mediciones.toLocaleString('es-CL')}
          detalle="lecturas pH + ORP"
          desde="#3a2f8f"
          hasta="#5b47c4"
        />
        <Tile
          etiqueta="Equipos"
          valor={kpis.equipos.toLocaleString('es-CL')}
          detalle={`${kpis.clientes} cliente${kpis.clientes === 1 ? '' : 's'}`}
          desde="#0d3f52"
          hasta="#15627f"
        />
        <Tile
          etiqueta="pH promedio"
          valor={num(kpis.phPromedio, 2)}
          detalle="ponderado por mediciones"
          desde="#145f7c"
          hasta="#1C7FA6"
        />
        <Tile
          etiqueta="ORP promedio"
          valor={kpis.mvPromedio == null ? '—' : `${num(kpis.mvPromedio, 0)} mV`}
          detalle="ponderado por mediciones"
          desde="#a3401a"
          hasta="#c95424"
        />
        <Tile
          textual
          etiqueta="Última carga"
          valor={kpis.ultima ? formatDateCL(kpis.ultima) : '—'}
          detalle={kpis.ultima ? 'fecha de guardado' : undefined}
          desde="#0f5f58"
          hasta="#16857a"
        />
      </div>

      {filtradas.length === 0 && <Card className={styles.vacio}>No hay informes con estos filtros.</Card>}
    </section>
  )
}

