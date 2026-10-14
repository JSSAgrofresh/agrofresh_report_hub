import { useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import { detalleFuera, fueraPorCliente, fueraPorSemana } from '@/features/reportes/lib/fueraDeRangoResumen'
import type { FilaCliente } from '@/features/reportes/lib/fueraDeRangoResumen'
import { DetalleFueraModal } from './DetalleFueraModal'
import styles from './ResultadosPorCliente.module.css'

interface Props {
  informes: InformeConPuntos[]
  /** Botón «Solo fuera de rango»: la barra reparte solo lo que se pasó y salen solo los clientes con algo fuera. */
  soloFuera: boolean
}

interface Hover {
  texto: string
  x: number
  y: number
}

interface ModalAbierto {
  titulo: string
  subtitulo: string
  cliente: string
  semana?: number | null
}

const SEGMENTOS = [
  { clave: 'bajo', etiqueta: 'Bajo el límite', clase: styles.bajo },
  { clave: 'sobre', etiqueta: 'Sobre el límite', clase: styles.sobre },
  { clave: 'dentro', etiqueta: 'Dentro del límite', clase: styles.dentro },
] as const

const pct = (n: number, de: number) => (de ? (n / de) * 100 : 0)

/**
 * «Fuera de rango por cliente» (Vista de límites, límites residuales). Cada barra es el 100% de los informes de ese
 * cliente: bajo el límite (celeste), sobre el límite (rojo) y dentro (verde tenue), con el %; con el mouse encima sale
 * el conteo y el clic en la barra abre «cuánto se pasaron». El clic en el nombre despliega sus semanas (uno abierto a
 * la vez). Va primero quien tiene MÁS informes fuera de rango. Con «Solo fuera de rango» la barra reparte solo lo
 * fuera (bajo contra sobre) y no salen los «dentro».
 */
export function ResultadosPorCliente({ informes, soloFuera }: Props) {
  const filas = useMemo(() => fueraPorCliente(informes, soloFuera), [informes, soloFuera])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalAbierto | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  const semanas = useMemo(() => (abierto ? fueraPorSemana(informes, abierto, soloFuera) : []), [abierto, informes, soloFuera])
  const detalle = useMemo(
    () => (modal ? detalleFuera(informes, { cliente: modal.cliente, ...(modal.semana !== undefined ? { semana: modal.semana } : {}) }) : []),
    [modal, informes],
  )
  const segmentos = soloFuera ? SEGMENTOS.filter((s) => s.clave !== 'dentro') : SEGMENTOS

  const mover = (texto: string) => (e: MouseEvent) => {
    const r = caja.current?.getBoundingClientRect()
    if (r) setHover({ texto, x: e.clientX - r.left, y: e.clientY - r.top })
  }

  function barra(f: FilaCliente, titulo: string, semana?: number | null) {
    const base = soloFuera ? f.fuera : f.total
    return (
      <button
        type="button"
        className={styles.barra}
        aria-label={`${titulo}: ver cuánto se pasaron (${f.fuera} de ${f.total} informes fuera de rango)`}
        onClick={() => {
          setHover(null)
          setModal({
            titulo: `${f.cliente}${semana === undefined ? '' : semana == null ? ' · sin semana' : ` · semana ${semana}`} · cuánto se pasaron`,
            subtitulo: `${f.fuera} informe${f.fuera === 1 ? '' : 's'} fuera de rango de ${f.total}`,
            cliente: f.cliente,
            semana,
          })
        }}
        onMouseLeave={() => setHover(null)}
      >
        {segmentos.map((s) => {
          const n = f[s.clave]
          if (n === 0) return null
          const p = pct(n, base)
          return (
            <i
              key={s.clave}
              className={s.clase}
              style={{ width: `${p}%` }}
              onMouseMove={mover(`${s.etiqueta}: ${n} informe${n === 1 ? '' : 's'} (${Math.round(p)}%)`)}
            >
              {p >= 7 ? `${Math.round(p)}%` : ''}
            </i>
          )
        })}
      </button>
    )
  }

  return (
    <div className={styles.caja} ref={caja}>
      <ul className={styles.leyenda} aria-label="Leyenda">
        {segmentos.map((s) => (
          <li key={s.clave}><i className={s.clase} />{s.etiqueta}</li>
        ))}
      </ul>
      {filas.length === 0 ? (
        <p className={styles.vacio}>
          {soloFuera ? 'Ningún informe quedó fuera de rango con estos filtros.' : 'No hay informes con límite en la tabla con estos filtros.'}
        </p>
      ) : (
        <>
          <div className={`${styles.fila} ${styles.encabezado}`} aria-hidden="true">
            <span />
            <span>Cliente</span>
            <span>{soloFuera ? '% de lo que se pasó' : '% de sus informes'}</span>
            <span>Fuera de rango</span>
          </div>
          <ol className={styles.lista}>
            {filas.map((f) => {
              const abre = abierto === f.cliente
              return (
                <li key={f.cliente} className={abre ? styles.abierta : undefined}>
                  <div className={styles.fila}>
                    <button type="button" className={styles.nombre} aria-expanded={abre} onClick={() => setAbierto(abre ? null : f.cliente)} title={f.cliente}>
                      <span className={styles.chev} aria-hidden="true">›</span>
                      <span className={styles.texto}>{f.cliente}</span>
                    </button>
                    {barra(f, f.cliente)}
                    <span className={styles.fuera}>
                      <b>{f.fuera} de {f.total}</b> fuera de rango
                      <span className={f.fuera ? styles.pastilla : styles.pastillaOk}>{Math.round(pct(f.fuera, f.total))}%</span>
                    </span>
                  </div>
                  {abre && (
                    <div className={styles.semanas}>
                      {semanas.map((w) => (
                        <div key={w.semana ?? 'sin'} className={`${styles.fila} ${styles.semana}`}>
                          <span aria-hidden="true" />
                          <span className={styles.etiquetaSemana}>{w.semana == null ? 'Sin semana' : `Semana ${w.semana}`}</span>
                          {barra(w, `${f.cliente}, ${w.semana == null ? 'sin semana' : `semana ${w.semana}`}`, w.semana)}
                          <span className={styles.fuera}><b>{w.fuera} de {w.total}</b> fuera</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}

      {hover && !modal && (
        <div className={styles.tip} style={{ left: hover.x + 12, top: hover.y - 44 }} role="status">
          {hover.texto}
        </div>
      )}

      {modal && (
        <DetalleFueraModal
          titulo={modal.titulo}
          subtitulo={modal.subtitulo}
          detalle={detalle}
          onCerrar={() => setModal(null)}
          ocultarCliente
        />
      )}
    </div>
  )
}
