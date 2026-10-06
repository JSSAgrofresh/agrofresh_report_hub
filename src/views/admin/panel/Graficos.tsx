import { COLOR_CATEGORIA, totalDia } from '@/features/adminPanel'
import type { PuntoSerie } from '@/features/adminPanel'
import styles from './PanelAdmin.module.css'

const SERIE = ['solicitudes', 'cargas', 'verificaciones', 'laboratorio', 'otros'] as const
const NOMBRE: Record<(typeof SERIE)[number], string> = {
  solicitudes: 'Solicitudes',
  cargas: 'Cargas de datos',
  verificaciones: 'Verificaciones',
  laboratorio: 'Laboratorio',
  otros: 'Informes y otros',
}

/** Barras apiladas: una por día, con sus acciones por tipo. */
export function BarrasDiarias({ serie }: { serie: PuntoSerie[] }) {
  const ancho = 700
  const alto = 190
  const base = 170
  const max = Math.max(1, ...serie.map(totalDia))
  const paso = ancho / Math.max(1, serie.length)
  const gruesa = Math.max(3, paso * 0.68)
  const cadaN = Math.max(1, Math.ceil(serie.length / 14))
  return (
    <>
      <svg
        className={styles.grafico}
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label={`Acciones registradas por día, ${serie.length} días`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={ancho} y1={base - f * 150} y2={base - f * 150} stroke="#e1e5dc" />
        ))}
        {serie.map((p, i) => {
          let y = base
          const x = i * paso + (paso - gruesa) / 2
          return (
            <g key={p.fecha}>
              <title>{`${p.fecha}: ${totalDia(p)} acciones`}</title>
              {SERIE.map((k) => {
                const h = (p[k] / max) * 150
                if (h <= 0) return null
                y -= h
                return <rect key={k} x={x} y={y} width={gruesa} height={Math.max(1, h - 1.2)} rx={2} fill={COLOR_CATEGORIA[k] ?? '#e39a5b'} />
              })}
              {i % cadaN === 0 && (
                <text x={x + gruesa / 2} y={186} fill="#77837b" fontSize={10} textAnchor="middle">
                  {p.fecha.slice(8)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className={styles.leyenda}>
        {SERIE.map((k) => (
          <span key={k}>
            <i className={styles.punto} style={{ background: COLOR_CATEGORIA[k] ?? '#e39a5b' }} />
            {NOMBRE[k]}
          </span>
        ))}
      </div>
    </>
  )
}

/** Dona de reparto. Los números van también en la lista, no solo en el color. */
export function Dona({ partes, centro }: { partes: { nombre: string; valor: number; color: string }[]; centro: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0)
  let acumulado = 0
  return (
    <div className={styles.dona}>
      <svg viewBox="0 0 42 42" role="img" aria-label="Reparto de acciones por módulo">
        <circle cx={21} cy={21} r={15.9} fill="none" stroke="#eef1ea" strokeWidth={6} />
        {total > 0 &&
          partes.map((p) => {
            const largo = (p.valor / total) * 100
            const el = (
              <circle
                key={p.nombre}
                cx={21}
                cy={21}
                r={15.9}
                fill="none"
                stroke={p.color}
                strokeWidth={6}
                strokeDasharray={`${largo} ${100 - largo}`}
                strokeDashoffset={-acumulado}
                transform="rotate(-90 21 21)"
              />
            )
            acumulado += largo
            return el
          })}
        <text x={21} y={23} textAnchor="middle" fill="#16201b" fontSize={6.5} fontWeight={700}>
          {centro}
        </text>
      </svg>
      <div className={styles.donaLista}>
        {partes.map((p) => (
          <div key={p.nombre}>
            <span>
              <i className={styles.punto} style={{ background: p.color }} />
              {p.nombre}
            </span>
            <b>{total ? Math.round((p.valor / total) * 100) : 0} %</b>
          </div>
        ))}
      </div>
    </div>
  )
}
