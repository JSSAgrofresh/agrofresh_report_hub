import { useMemo, type CSSProperties } from 'react'
import { Card } from '@/components/ui/Card'
import { IconFrasco } from '@/components/ui/icons'
import {
  escalaBonita,
  hayCorte,
  modeloLinea,
  posicionesX,
  radioDeValor,
  radioVacio,
  type AnalitoLinea,
  type InformeVista,
  type ModeloLinea,
  type ResultadoVista,
} from '@/features/reportes/lib/lineaTiempoInformes'
import styles from './ResultadosPorInforme.module.css'

export type LaboratorioInformes = 'als' | 'diagnofruit'

const TEXTOS: Record<LaboratorioInformes, { vacio: string; nota: string }> = {
  als: {
    vacio: 'Menos de 1 (no se detectó)',
    nota: '«<1» (o «ND»): el laboratorio no detectó el analito.',
  },
  diagnofruit: {
    vacio: 'BLD (no se detectó: bajo el límite de detección)',
    nota: '«BLD»: bajo el límite de detección del laboratorio; el patógeno no se detectó.',
  },
}

const X0 = 190
const HUECO = 130

/** Cuánto se separan los informes: con muchos, más juntos (el gráfico se desplaza hacia el lado). */
function pasoPara(n: number): number {
  return n <= 14 ? 90 : n <= 30 ? 64 : 50
}

const corto = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto)

function resumenResultado(i: { nro: string; fechaTxt: string }, a: AnalitoLinea, r: ResultadoVista | undefined): string {
  return r ? `${i.nro} · ${i.fechaTxt} · ${a.nombre}: ${r.texto}${a.unidad ? ` ${a.unidad}` : ''}` : `${i.nro} · ${a.nombre}: sin dato`
}

/** El mayor valor medido de cada unidad: el radio de los círculos se mide contra él, así dos analitos de una misma unidad se comparan. */
function maximoPorUnidad(modelo: ModeloLinea): Map<string, number> {
  const max = new Map<string, number>()
  modelo.informes.forEach((i) =>
    modelo.analitos.forEach((a) => {
      const v = i.porAnalito[a.codigo]?.valor
      if (v != null) max.set(a.unidad, Math.max(max.get(a.unidad) ?? 0, v))
    }),
  )
  return max
}

function Titulo({ children, sub }: { children: string; sub: string }) {
  return (
    <>
      <h3 className={styles.titulo}>
        <IconFrasco className={styles.icono} />
        {children}
      </h3>
      <p className={styles.sub}>{sub}</p>
    </>
  )
}

/** La etiqueta «N días después» del corte de eje. */
function Corte({ x1, x2, y, dias }: { x1: number; x2: number; y: number; dias: number }) {
  const texto = `${dias} días después`
  const ancho = texto.length * 6.4 + 26
  const medio = (x1 + x2) / 2
  return (
    <g>
      <line className={styles.corte} x1={x1} x2={x2} y1={y} y2={y} />
      <rect className={styles.pildora} x={medio - ancho / 2} y={y - 14} width={ancho} height={28} rx={14} />
      <text className={`${styles.txtMuted} ${styles.valor}`} x={medio} y={y + 4.5} textAnchor="middle" fontSize={11.5}>
        {texto}
      </text>
    </g>
  )
}

/** Línea de tiempo: un círculo por informe y analito (vacío = no se detectó, lleno = se detectó y crece con el valor), sobre un eje de fechas. */
function LineaDeTiempo({ modelo }: { modelo: ModeloLinea }) {
  const paso = pasoPara(modelo.informes.length)
  const { xs, fin } = posicionesX(modelo, X0, paso, HUECO)
  const maximos = maximoPorUnidad(modelo)
  const carriles = modelo.analitos.length
  const yCarril = (k: number) => 100 + 85 * k
  const finBandas = yCarril(carriles - 1) + 74
  const yEje = finBandas + 80
  const ancho = fin + 40
  const alto = yEje + 70
  const inclinar = paso < 70

  return (
    <div className={styles.marco}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${ancho} ${alto}`}
        style={{ width: '100%', minWidth: Math.round(ancho * 0.78), maxWidth: Math.round(ancho * 1.15) }}
        role="img"
        aria-label="Línea de tiempo de los resultados: un círculo por informe y analito"
      >
        {modelo.dias.map((d, k) => {
          const xa = xs[d.desde] - paso / 2 + 4
          const xb = xs[d.hasta] + paso / 2 - 4
          return <rect key={`b${k}`} className={k % 2 === 0 ? styles.bandaA : styles.bandaB} x={xa} y={30} width={xb - xa} height={finBandas - 30} rx={12} />
        })}

        {modelo.analitos.map((a, k) => (
          <g key={a.codigo}>
            <line className={styles.guia} x1={X0 - 6} x2={fin} y1={yCarril(k)} y2={yCarril(k)} />
            <circle cx={26} cy={yCarril(k)} r={7} fill={a.color.fill} />
            <text className={`${styles.txt} ${styles.valor}`} x={42} y={yCarril(k) - 3} fontSize={13}>
              {corto(a.nombre, 21)}
              <title>{a.nombre}</title>
            </text>
            <text className={styles.txtFaint} x={42} y={yCarril(k) + 14} fontSize={11}>
              {a.unidad}
            </text>
          </g>
        ))}

        {modelo.informes.map((inf, i) => (
          <g key={`${inf.nro}-${i}`}>
            {modelo.analitos.map((a, k) => {
              const r = inf.porAnalito[a.codigo]
              if (!r) return null
              const cy = yCarril(k)
              return (
                <g key={a.codigo}>
                  <title>{resumenResultado(inf, a, r)}</title>
                  {r.detectado ? (
                    <>
                      <circle cx={xs[i]} cy={cy} r={radioDeValor(r.valor, maximos.get(a.unidad) ?? 0, r.texto)} fill={a.color.fill} />
                      <text x={xs[i]} y={cy + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={a.color.text}>
                        {r.texto}
                      </text>
                    </>
                  ) : (
                    <>
                      <circle className={styles.vacio} cx={xs[i]} cy={cy} r={radioVacio(r.texto)} />
                      <text className={styles.txtFaint} x={xs[i]} y={cy + 3.5} textAnchor="middle" fontSize={9.5}>
                        {corto(r.texto, 4)}
                      </text>
                    </>
                  )}
                </g>
              )
            })}
            <text
              className={styles.nro}
              x={xs[i]}
              y={finBandas - 12}
              textAnchor={inclinar ? 'end' : 'middle'}
              fontSize={11}
              transform={inclinar ? `rotate(-50 ${xs[i]} ${finBandas - 12})` : undefined}
            >
              {inf.etiqueta}
            </text>
          </g>
        ))}

        <text className={`${styles.txtMuted} ${styles.valor}`} x={42} y={yEje + 4} fontSize={12}>
          Fecha de muestreo
        </text>
        {modelo.dias.map((d, k) => {
          const medio = (xs[d.desde] + xs[d.hasta]) / 2
          const n = d.hasta - d.desde + 1
          return (
            <g key={`d${k}`}>
              {d.hasta > d.desde && <line className={styles.ejeTiempo} x1={xs[d.desde]} x2={xs[d.hasta]} y1={yEje} y2={yEje} />}
              {xs.slice(d.desde, d.hasta + 1).map((x, j) => (
                <g key={j}>
                  <line className={styles.guiaFina} x1={x} x2={x} y1={finBandas + 6} y2={yEje - 7} />
                  <circle className={styles.nodo} cx={x} cy={yEje} r={5} />
                </g>
              ))}
              <text className={`${styles.txt} ${styles.valor}`} x={medio} y={yEje + 30} textAnchor="middle" fontSize={13}>
                {d.etiqueta}
              </text>
              <text className={styles.txtFaint} x={medio} y={yEje + 47} textAnchor="middle" fontSize={11}>
                {n} informe{n === 1 ? '' : 's'}
              </text>
              {hayCorte(d) && d.diasDesdeAnterior !== null && (
                <Corte x1={xs[d.desde - 1] + 10} x2={xs[d.desde] - 10} y={yEje} dias={d.diasDesdeAnterior} />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Serie de tiempo de una unidad: el valor en el eje vertical, una línea por analito. Lo que no se detectó baja a cero. */
function SerieDeUnidad({ modelo, unidad }: { modelo: ModeloLinea; unidad: string }) {
  const analitos = modelo.analitos.filter((a) => a.unidad === unidad)
  const paso = pasoPara(modelo.informes.length)
  const { xs, fin } = posicionesX(modelo, X0, paso, HUECO)
  const cortes = new Set(modelo.dias.filter(hayCorte).map((d) => d.desde))
  const mayor = Math.max(0, ...modelo.informes.flatMap((i) => analitos.map((a) => i.porAnalito[a.codigo]?.valor ?? 0)))
  const escala = escalaBonita(mayor)
  const arriba = 44
  const abajo = 244
  const y = (v: number) => abajo - (v / escala.max) * (abajo - arriba)
  const yDias = abajo + 50
  const ancho = fin + 40
  const alto = abajo + 82
  const inclinar = paso < 70
  const valorEn = (i: number, a: AnalitoLinea): number | null => {
    const r = modelo.informes[i].porAnalito[a.codigo]
    if (!r) return null
    return r.detectado ? r.valor : 0
  }

  return (
    <div className={styles.panelUnidad}>
      <div className={styles.marco}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${ancho} ${alto}`}
          style={{ width: '100%', minWidth: Math.round(ancho * 0.78), maxWidth: Math.round(ancho * 1.15) }}
          role="img"
          aria-label={`Serie de tiempo de los resultados en ${unidad}`}
        >
          {modelo.dias.map((d, k) => {
            const xa = xs[d.desde] - paso / 2 + 4
            const xb = xs[d.hasta] + paso / 2 - 4
            return <rect key={`b${k}`} className={k % 2 === 0 ? styles.bandaA : styles.bandaB} x={xa} y={arriba - 14} width={xb - xa} height={abajo - arriba + 34} rx={12} />
          })}
          <text className={styles.txtFaint} x={24} y={arriba - 22} fontSize={11}>
            {unidad}
          </text>
          {escala.marcas.map((m) => (
            <g key={m}>
              <line className={m === 0 ? styles.ejeBase : styles.rejilla} x1={X0 - 10} x2={fin} y1={y(m)} y2={y(m)} />
              <text className={styles.txtFaint} x={X0 - 18} y={y(m) + 4} textAnchor="end" fontSize={11}>
                {m}
              </text>
            </g>
          ))}

          {analitos.map((a) =>
            modelo.informes.slice(0, -1).map((_, i) => {
              const v1 = valorEn(i, a)
              const v2 = valorEn(i + 1, a)
              if (v1 === null || v2 === null || cortes.has(i + 1)) return null
              return (
                <line key={`${a.codigo}-${i}`} x1={xs[i]} y1={y(v1)} x2={xs[i + 1]} y2={y(v2)} stroke={a.color.fill} strokeWidth={3.5} strokeLinecap="round" opacity={0.9} />
              )
            }),
          )}

          {analitos.map((a) =>
            modelo.informes.map((inf, i) => {
              const r = inf.porAnalito[a.codigo]
              const v = valorEn(i, a)
              if (!r || v === null) return null
              return (
                <g key={`${a.codigo}-p${i}`}>
                  <title>{resumenResultado(inf, a, r)}</title>
                  {r.detectado ? (
                    <>
                      <circle cx={xs[i]} cy={y(v)} r={6} fill={a.color.fill} stroke="var(--color-surface)" strokeWidth={2.5} />
                      <text className={styles.etiquetaValor} x={xs[i]} y={y(v) - 12} textAnchor="middle" fontSize={11.5}>
                        {r.texto}
                      </text>
                    </>
                  ) : (
                    <circle className={styles.vacio} cx={xs[i]} cy={y(0)} r={6} />
                  )}
                </g>
              )
            }),
          )}

          {modelo.informes.map((inf, i) => (
            <text
              key={`${inf.nro}-${i}`}
              className={styles.nro}
              x={xs[i]}
              y={abajo + 18}
              textAnchor={inclinar ? 'end' : 'middle'}
              fontSize={10.5}
              transform={inclinar ? `rotate(-50 ${xs[i]} ${abajo + 18})` : undefined}
            >
              {inf.etiqueta}
            </text>
          ))}

          {modelo.dias.map((d, k) => (
            <g key={`d${k}`}>
              <line className={styles.ejeTiempo} x1={xs[d.desde] - 8} x2={xs[d.hasta] + 8} y1={yDias - 16} y2={yDias - 16} />
              <text className={`${styles.txt} ${styles.valor}`} x={(xs[d.desde] + xs[d.hasta]) / 2} y={yDias + 4} textAnchor="middle" fontSize={13}>
                {d.etiqueta}
              </text>
              {hayCorte(d) && d.diasDesdeAnterior !== null && (
                <Corte x1={xs[d.desde - 1] + 22} x2={xs[d.desde] - 22} y={yDias - 16} dias={d.diasDesdeAnterior} />
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.leyenda}>
        {analitos.map((a) => (
          <span key={a.codigo}>
            <svg width={34} height={14} aria-hidden="true">
              <line x1={2} x2={32} y1={7} y2={7} stroke={a.color.fill} strokeWidth={4} strokeLinecap="round" />
            </svg>
            {a.nombre}
          </span>
        ))}
        <span>
          <svg width={22} height={22} aria-hidden="true">
            <circle className={styles.vacio} cx={11} cy={11} r={6} />
          </svg>
          No se detectó (queda en cero)
        </span>
      </div>
    </div>
  )
}

/** Tabla: un informe por fila y una columna por analito, con su unidad bajo el nombre. */
function TablaPorInforme({ modelo, nota, columnaDetalle }: { modelo: ModeloLinea; nota: string; columnaDetalle: string }) {
  const filas = [...modelo.informes].reverse()
  const conDetalle = modelo.informes.some((i) => i.detalle)
  return (
    <>
      <div className={`${styles.marco} ${styles.tablaCaja}`}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha de muestreo</th>
              <th>N° de informe</th>
              {conDetalle && <th>{columnaDetalle}</th>}
              {modelo.analitos.map((a) => (
                <th key={a.codigo}>
                  <div className={styles.cabAnalito}>
                    <b>
                      <i className={styles.punto} style={{ background: a.color.fill }} />
                      {a.nombre.toUpperCase()}
                    </b>
                    <span>{a.unidad}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((inf, i) => (
              <tr key={`${inf.nro}-${i}`}>
                <td className={styles.fecha}>{inf.fechaTxt}</td>
                <td>
                  <span className={styles.informe}>{inf.nro}</span>
                </td>
                {conDetalle && <td className={styles.detalle}>{inf.detalle || '—'}</td>}
                {modelo.analitos.map((a) => {
                  const r = inf.porAnalito[a.codigo]
                  return (
                    <td key={a.codigo}>
                      {!r ? (
                        '—'
                      ) : r.detectado ? (
                        <span className={styles.chipSi} style={{ '--c': a.color.fill } as CSSProperties}>
                          {r.texto}
                        </span>
                      ) : (
                        <span className={styles.chipNo}>{r.texto}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.pie}>{nota}</p>
    </>
  )
}

interface Props {
  informes: InformeVista[]
  laboratorio: LaboratorioInformes
  /** Encabezado de la columna de `detalle` de los informes (la zona de muestreo, en Diagnofruit). */
  columnaDetalle?: string
}

/**
 * Lo que Report muestra cuando se elige ALS o Diagnofruit: una línea de tiempo y una serie de tiempo (ambos responden
 * «hay / no hay» y, si hay, cuánto) y debajo la tabla por informe. Los tres usan los mismos nombres, unidades, orden y colores.
 */
export function ResultadosPorInforme({ informes, laboratorio, columnaDetalle = 'Zona de muestreo' }: Props) {
  const textos = TEXTOS[laboratorio]
  const modelo = useMemo(() => modeloLinea(informes), [informes])
  const n = modelo.informes.length
  const hasta = modelo.dias.length
  return (
    <div className={styles.bloque}>
      <Card>
        <Titulo sub="Cada informe cae sobre su fecha de muestreo. Círculo vacío: no se detectó. Círculo lleno: se detectó, y su tamaño sigue el valor. El eje se corta donde pasan días sin muestras.">
          Resultados por informe
        </Titulo>
        <LineaDeTiempo modelo={modelo} />
        <div className={styles.leyenda}>
          <span>
            <svg width={22} height={22} aria-hidden="true">
              <circle className={styles.vacio} cx={11} cy={11} r={8} />
            </svg>
            {textos.vacio}
          </span>
          <span>
            <svg width={46} height={30} aria-hidden="true">
              <circle cx={10} cy={15} r={7} fill="var(--color-primary)" />
              <circle cx={31} cy={15} r={12} fill="var(--color-primary)" />
            </svg>
            Se detectó · el círculo crece con el valor
          </span>
        </div>
      </Card>
      <Card>
        <Titulo sub={`Las líneas unen informes consecutivos. Lo que no se detectó baja a cero. ${n} informe${n === 1 ? '' : 's'} en ${hasta} fecha${hasta === 1 ? '' : 's'} de muestreo.`}>
          Evolución de los resultados
        </Titulo>
        {modelo.unidades.map((u) => (
          <SerieDeUnidad key={u || 'sin-unidad'} modelo={modelo} unidad={u} />
        ))}
      </Card>
      <Card>
        <Titulo sub="Un informe por fila, el más reciente arriba.">Detalle por informe</Titulo>
        <TablaPorInforme modelo={modelo} nota={textos.nota} columnaDetalle={columnaDetalle} />
      </Card>
    </div>
  )
}
