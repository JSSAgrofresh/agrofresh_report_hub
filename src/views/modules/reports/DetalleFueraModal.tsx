import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { colorDeIngrediente } from '@/features/reportes'
import { agruparPorAnalito } from '@/features/reportes/lib/fueraDeRangoResumen'
import type { ResultadoFuera } from '@/features/reportes/lib/fueraDeRangoResumen'
import { Modal } from '@/components/ui/Modal'
import { formatDecimalCL } from '@/lib/locale'
import styles from './DetalleFueraModal.module.css'

interface Props {
  titulo: string
  subtitulo?: string
  detalle: ResultadoFuera[]
  onCerrar: () => void
  /** Sin la columna de analito (la dona por analito ya está acotada a uno). */
  ocultarAnalito?: boolean
  /** Sin la columna de cliente (el detalle ya es de un solo cliente). */
  ocultarCliente?: boolean
  pie?: ReactNode
}

/** «Cuánto se pasaron»: cada resultado fuera de rango (el que más se pasó primero) y, en otra pestaña, agrupado por analito. */
export function DetalleFueraModal({ titulo, subtitulo, detalle, onCerrar, ocultarAnalito = false, ocultarCliente = false, pie }: Props) {
  const [pestana, setPestana] = useState<'general' | 'analito'>('general')
  const agrupado = useMemo(() => agruparPorAnalito(detalle), [detalle])
  const general = pestana === 'general' || ocultarAnalito

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} onCerrar={onCerrar} ancho="grande" pie={pie}>
      {detalle.length === 0 ? (
        <p className={styles.vacio}>Nada fuera de rango.</p>
      ) : (
        <div className={styles.cuerpoModal}>
          {!ocultarAnalito && (
            <div className={styles.pestanas} role="tablist">
              <button type="button" role="tab" aria-selected={pestana === 'general'} className={pestana === 'general' ? styles.pestanaOn : undefined} onClick={() => setPestana('general')}>
                General · por informe
              </button>
              <button type="button" role="tab" aria-selected={pestana === 'analito'} className={pestana === 'analito' ? styles.pestanaOn : undefined} onClick={() => setPestana('analito')}>
                Por analito
              </button>
            </div>
          )}
          <div className={styles.tablaCaja}>
            {general ? (
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Informe</th>
                    {!ocultarCliente && <th>Cliente</th>}
                    {!ocultarAnalito && <th>Analito</th>}
                    <th>Resultado</th>
                    <th>Límite</th>
                    <th>Se pasó</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d, i) => (
                    <tr key={`${d.solicitudId}-${d.analito}-${i}`}>
                      <td>{d.nroSolicitud}</td>
                      {!ocultarCliente && <td>{d.cliente}</td>}
                      {!ocultarAnalito && (
                        <td>
                          <i className={styles.punto} style={{ background: colorDeIngrediente(d.analito) }} />
                          {d.analito}
                        </td>
                      )}
                      <td>{formatDecimalCL(d.ppm, 2)}</td>
                      <td>{formatDecimalCL(d.min, 2)} – {formatDecimalCL(d.max, 2)}</td>
                      <td className={d.desvio > 0 ? styles.sobre : styles.bajo}>
                        {d.desvio > 0 ? '+' : '−'}{formatDecimalCL(Math.abs(d.desvio), 2)} ppm
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Analito</th>
                    <th>Límite</th>
                    <th>Fuera</th>
                    <th>Sobre / bajo</th>
                    <th>Desvío promedio</th>
                    <th>Mayor desvío</th>
                  </tr>
                </thead>
                <tbody>
                  {agrupado.map((g) => (
                    <tr key={g.analito}>
                      <td>
                        <i className={styles.punto} style={{ background: colorDeIngrediente(g.analito) }} />
                        <b>{g.analito}</b>
                      </td>
                      <td>{formatDecimalCL(g.min, 2)} – {formatDecimalCL(g.max, 2)}</td>
                      <td>{g.fuera}</td>
                      <td>{g.sobre} / {g.bajo}</td>
                      <td>± {formatDecimalCL(g.desvioPromedio, 2)} ppm</td>
                      <td className={g.mayorDesvio > 0 ? styles.sobre : styles.bajo}>
                        {g.mayorDesvio > 0 ? '+' : '−'}{formatDecimalCL(Math.abs(g.mayorDesvio), 2)} ppm
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
