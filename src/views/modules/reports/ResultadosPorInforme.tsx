import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { InfoTip } from '@/components/ui/InfoTip'
import { IconFrasco } from '@/components/ui/icons'
import {
  HUECO_CORTE,
  X0_EJE,
  escalaBonita,
  hayCorte,
  modeloLinea,
  pasoDeEje,
  posicionesX,
  radioDeValor,
  radioVacio,
  type AnalitoLinea,
  type InformeVista,
  type ModeloLinea,
  type ResultadoVista,
} from '@/features/reportes/lib/lineaTiempoInformes'
import { TablaInformes } from './TablaInformes'
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
        <InfoTip>{sub}</InfoTip>
      </h3>
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

/** Un color del analito con transparencia, para pistas, halos y áreas (el relleno sólido sigue siendo `fill`). */
const tinte = (color: string, porcentaje: number) => `color-mix(in srgb, ${color} ${porcentaje}%, transparent)`

/** El día de la semana junto a la fecha («jueves · 5 informes»). */
function subDia(d: { diaSemana: string | null }, n: number): string {
  const informes = `${n} informe${n === 1 ? '' : 's'}`
  return d.diaSemana ? `${d.diaSemana} · ${informes}` : informes
}

/**
 * Línea de tiempo: un círculo por informe y analito (vacío = no se detectó, lleno = se detectó y crece con el valor)
 * sobre una vía de fechas. Cada informe es una columna; al pasar el mouse se resalta. La vía marca con un punto lleno los
 * días en que algo se detectó.
 */
function LineaDeTiempo({ modelo }: { modelo: ModeloLinea }) {
  const cortes = modelo.dias.filter(hayCorte).length
  const paso = pasoDeEje(modelo.informes.length, cortes)
  const { xs, fin } = posicionesX(modelo, X0_EJE, paso, HUECO_CORTE)
  const maximos = maximoPorUnidad(modelo)
  const carriles = modelo.analitos.length
  const yCarril = (k: number) => 86 + 100 * k
  const arriba = 28
  const finBandas = yCarril(carriles - 1) + 78
  const yEje = finBandas + 66
  const ancho = fin + 40
  const alto = yEje + 70

  return (
    <div className={styles.marco}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${ancho} ${alto}`}
        style={{ width: '100%', minWidth: Math.round(ancho * 0.78), maxWidth: Math.round(ancho * 1.4) }}
        role="img"
        aria-label="Línea de tiempo de los resultados: un círculo por informe y analito"
      >
        {modelo.dias.map((d, k) => {
          const xa = xs[d.desde] - paso / 2 + 4
          const xb = xs[d.hasta] + paso / 2 - 4
          return <rect key={`b${k}`} className={k % 2 === 0 ? styles.bandaA : styles.bandaB} x={xa} y={arriba} width={xb - xa} height={finBandas - arriba} rx={14} />
        })}

        {modelo.analitos.map((a, k) => (
          <g key={a.codigo}>
            {modelo.dias.map((d, j) => (
              <rect
                key={`p${j}`}
                x={xs[d.desde] - paso / 2 + 12}
                y={yCarril(k) - 32}
                width={xs[d.hasta] - xs[d.desde] + paso - 24}
                height={64}
                rx={32}
                style={{ fill: tinte(a.color.fill, 13) }}
              />
            ))}
            <circle cx={26} cy={yCarril(k)} r={8} fill={a.color.fill} />
            <circle cx={26} cy={yCarril(k)} r={13} style={{ fill: tinte(a.color.fill, 22) }} />
            <circle cx={26} cy={yCarril(k)} r={8} fill={a.color.fill} />
            <text className={`${styles.txt} ${styles.valor}`} x={50} y={yCarril(k) - 3} fontSize={14}>
              {corto(a.nombre, 20)}
              <title>{a.nombre}</title>
            </text>
            <text className={styles.txtFaint} x={50} y={yCarril(k) + 15} fontSize={11.5}>
              {a.unidad}
            </text>
          </g>
        ))}

        {modelo.informes.map((inf, i) => (
          <g key={`${inf.nro}-${i}`} className={styles.columna}>
            <rect className={styles.columnaFondo} x={xs[i] - paso / 2 + 3} y={arriba + 4} width={paso - 6} height={finBandas - arriba - 8} rx={12} />
            {modelo.analitos.map((a, k) => {
              const r = inf.porAnalito[a.codigo]
              if (!r) return null
              const cy = yCarril(k)
              return (
                <g key={a.codigo}>
                  <title>{resumenResultado(inf, a, r)}</title>
                  {r.detectado ? (
                    <>
                      <circle cx={xs[i]} cy={cy} r={radioDeValor(r.valor, maximos.get(a.unidad) ?? 0, r.texto) + 5} style={{ fill: tinte(a.color.fill, 24) }} />
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
            <rect className={styles.pildoraInforme} x={xs[i] - 37} y={finBandas - 32} width={74} height={22} rx={11} />
            <text className={styles.nro} x={xs[i]} y={finBandas - 17} textAnchor="middle" fontSize={11}>
              {inf.etiqueta}
            </text>
          </g>
        ))}

        <text className={`${styles.txtMuted} ${styles.valor}`} x={26} y={yEje + 5} fontSize={12.5}>
          Fecha de muestreo
        </text>
        {modelo.dias.map((d, k) => {
          const medio = (xs[d.desde] + xs[d.hasta]) / 2
          const n = d.hasta - d.desde + 1
          return (
            <g key={`d${k}`}>
              {d.hasta > d.desde && <line className={styles.ejeTiempo} x1={xs[d.desde]} x2={xs[d.hasta]} y1={yEje} y2={yEje} />}
              {xs.slice(d.desde, d.hasta + 1).map((x, j) => {
                const huboAlgo = modelo.analitos.some((a) => modelo.informes[d.desde + j].porAnalito[a.codigo]?.detectado)
                return (
                  <g key={j}>
                    <line className={styles.guiaFina} x1={x} x2={x} y1={finBandas + 4} y2={yEje - 10} />
                    {huboAlgo && <circle cx={x} cy={yEje} r={14} className={styles.nodoAro} />}
                    <circle className={huboAlgo ? styles.nodoSi : styles.nodo} cx={x} cy={yEje} r={8} />
                  </g>
                )
              })}
              <text className={`${styles.txt} ${styles.valor}`} x={medio} y={yEje + 40} textAnchor="middle" fontSize={15}>
                {d.etiqueta}
              </text>
              <text className={styles.txtFaint} x={medio} y={yEje + 58} textAnchor="middle" fontSize={12}>
                {subDia(d, n)}
              </text>
              {hayCorte(d) && d.diasDesdeAnterior !== null && (
                <Corte x1={xs[d.desde - 1] + 14} x2={xs[d.desde] - 14} y={yEje} dias={d.diasDesdeAnterior} />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Serie de tiempo de una unidad: el valor en el eje vertical, una línea con su área por analito. Lo que no se detectó baja a cero. */
function SerieDeUnidad({ modelo, unidad, conLeyenda }: { modelo: ModeloLinea; unidad: string; conLeyenda: boolean }) {
  const analitos = modelo.analitos.filter((a) => a.unidad === unidad)
  const cortes = modelo.dias.filter(hayCorte).length
  const paso = pasoDeEje(modelo.informes.length, cortes)
  const { xs, fin } = posicionesX(modelo, X0_EJE, paso, HUECO_CORTE)
  const corteAntesDe = new Set(modelo.dias.filter(hayCorte).map((d) => d.desde))
  const mayor = Math.max(0, ...modelo.informes.flatMap((i) => analitos.map((a) => i.porAnalito[a.codigo]?.valor ?? 0)))
  const escala = escalaBonita(mayor)
  const arriba = 44
  const abajo = 280
  const y = (v: number) => abajo - (v / escala.max) * (abajo - arriba)
  const finBandas = abajo + 46
  const yDias = finBandas + 52
  const ancho = fin + 40
  const alto = yDias + 36
  const valorEn = (i: number, a: AnalitoLinea): number | null => {
    const r = modelo.informes[i].porAnalito[a.codigo]
    if (!r) return null
    return r.detectado ? r.valor : 0
  }
  /** Si otro punto del mismo informe queda justo encima, el valor va debajo de su punto para que no se pisen. */
  const etiquetaAbajo = (i: number, a: AnalitoLinea): boolean => {
    const mio = y(valorEn(i, a) ?? 0)
    return analitos.some((b) => {
      if (b.codigo === a.codigo || !modelo.informes[i].porAnalito[b.codigo]?.detectado) return false
      const otro = y(valorEn(i, b) ?? 0)
      return otro < mio && mio - otro < 30
    })
  }
  /** Tramos de informes seguidos de un analito, sin saltar un corte de eje ni un informe sin dato. */
  const tramos = (a: AnalitoLinea): number[][] => {
    const res: number[][] = []
    let actual: number[] = []
    modelo.informes.forEach((_, i) => {
      const v = valorEn(i, a)
      if (v === null || (corteAntesDe.has(i) && actual.length)) {
        if (actual.length) res.push(actual)
        actual = []
      }
      if (v !== null) actual.push(i)
    })
    if (actual.length) res.push(actual)
    return res
  }

  return (
    <div className={styles.panelUnidad}>
      <div className={styles.leyendaSerie}>
        <span className={styles.unidadChip}>{unidad || 'sin unidad'}</span>
        {analitos.map((a) => (
          <span key={a.codigo} className={styles.analitoChip}>
            <i className={styles.punto} style={{ background: a.color.fill }} />
            {a.nombre}
          </span>
        ))}
      </div>
      <div className={styles.marco}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${ancho} ${alto}`}
          style={{ width: '100%', minWidth: Math.round(ancho * 0.78), maxWidth: Math.round(ancho * 1.4) }}
          role="img"
          aria-label={`Serie de tiempo de los resultados en ${unidad}`}
        >
          {modelo.dias.map((d, k) => {
            const xa = xs[d.desde] - paso / 2 + 4
            const xb = xs[d.hasta] + paso / 2 - 4
            return <rect key={`b${k}`} className={k % 2 === 0 ? styles.bandaA : styles.bandaB} x={xa} y={arriba - 18} width={xb - xa} height={finBandas - arriba + 18} rx={14} />
          })}
          {escala.marcas.map((m) => (
            <g key={m}>
              <line className={m === 0 ? styles.ejeBase : styles.rejilla} x1={X0_EJE - 14} x2={fin} y1={y(m)} y2={y(m)} />
              <text className={styles.txtFaint} x={X0_EJE - 24} y={y(m) + 4} textAnchor="end" fontSize={11.5}>
                {m}
              </text>
            </g>
          ))}

          {modelo.informes.map((inf, i) => (
            <g key={`${inf.nro}-${i}`} className={styles.columna}>
              <rect className={styles.columnaFondo} x={xs[i] - paso / 2 + 3} y={arriba - 14} width={paso - 6} height={finBandas - arriba + 10} rx={12} />
              <rect className={styles.pildoraInforme} x={xs[i] - 37} y={abajo + 12} width={74} height={22} rx={11} />
              <text className={styles.nro} x={xs[i]} y={abajo + 27} textAnchor="middle" fontSize={11}>
                {inf.etiqueta}
              </text>
            </g>
          ))}

          {analitos.map((a) =>
            tramos(a).map((tramo, t) => {
              const puntos = tramo.map((i) => `${xs[i].toFixed(1)},${y(valorEn(i, a) ?? 0).toFixed(1)}`)
              const primero = xs[tramo[0]].toFixed(1)
              const ultimo = xs[tramo[tramo.length - 1]].toFixed(1)
              return (
                <g key={`${a.codigo}-t${t}`}>
                  {tramo.length > 1 && (
                    <>
                      <path d={`M${primero},${y(0)} L${puntos.join(' L')} L${ultimo},${y(0)} Z`} style={{ fill: tinte(a.color.fill, 16) }} />
                      <polyline points={puntos.join(' ')} fill="none" stroke={a.color.fill} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
                    </>
                  )}
                </g>
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
                      <circle cx={xs[i]} cy={y(v)} r={9} style={{ fill: tinte(a.color.fill, 28) }} />
                      <circle cx={xs[i]} cy={y(v)} r={6.5} fill={a.color.fill} stroke="var(--color-surface)" strokeWidth={2.5} />
                      <text className={styles.etiquetaValor} x={xs[i]} y={etiquetaAbajo(i, a) ? y(v) + 24 : y(v) - 15} textAnchor="middle" fontSize={12}>
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

          {modelo.dias.map((d, k) => {
            const n = d.hasta - d.desde + 1
            return (
              <g key={`d${k}`}>
                <line className={styles.ejeTiempo} x1={xs[d.desde] - 10} x2={xs[d.hasta] + 10} y1={yDias - 22} y2={yDias - 22} />
                <text className={`${styles.txt} ${styles.valor}`} x={(xs[d.desde] + xs[d.hasta]) / 2} y={yDias + 2} textAnchor="middle" fontSize={15}>
                  {d.etiqueta}
                </text>
                <text className={styles.txtFaint} x={(xs[d.desde] + xs[d.hasta]) / 2} y={yDias + 20} textAnchor="middle" fontSize={12}>
                  {subDia(d, n)}
                </text>
                {hayCorte(d) && d.diasDesdeAnterior !== null && (
                  <Corte x1={xs[d.desde - 1] + 24} x2={xs[d.desde] - 24} y={yDias - 22} dias={d.diasDesdeAnterior} />
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {conLeyenda && (
        <div className={styles.leyenda}>
          <span>
            <svg width={22} height={22} aria-hidden="true">
              <circle className={styles.vacio} cx={11} cy={11} r={6} />
            </svg>
            No se detectó (queda en cero)
          </span>
        </div>
      )}
    </div>
  )
}

interface Props {
  informes: InformeVista[]
  laboratorio: LaboratorioInformes
  /** Encabezado de la columna de `detalle` de los informes (la zona de muestreo, en Diagnofruit). */
  columnaDetalle?: string
  /**
   * Si se muestran la línea de tiempo y la serie de tiempo (Administración General → Funciones). Apagados, de fábrica,
   * queda solo la tabla.
   */
  conGraficos: boolean
}

/**
 * Lo que Report muestra cuando se elige ALS o Diagnofruit: la tabla por informe y, si el administrador principal los
 * encendió, una línea de tiempo y una serie de tiempo (ambos responden «hay / no hay» y, si hay, cuánto) sobre ella. Los
 * tres usan los mismos nombres, unidades, orden y colores.
 */
export function ResultadosPorInforme({ informes, laboratorio, columnaDetalle = 'Zona de muestreo', conGraficos }: Props) {
  const textos = TEXTOS[laboratorio]
  const modelo = useMemo(() => modeloLinea(informes), [informes])
  const n = modelo.informes.length
  const hasta = modelo.dias.length
  const tabla = (
    <Card>
      <Titulo sub="Un informe por fila. Toca un encabezado para ordenar; la búsqueda y la descarga respetan lo que ves.">
        {conGraficos ? 'Detalle por informe' : 'Resultados por informe'}
      </Titulo>
      <TablaInformes modelo={modelo} nota={textos.nota} columnaDetalle={columnaDetalle} archivo={laboratorio} />
    </Card>
  )
  if (!conGraficos) return <div className={styles.bloque}>{tabla}</div>
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
        {modelo.unidades.map((u, k) => (
          <SerieDeUnidad key={u || 'sin-unidad'} modelo={modelo} unidad={u} conLeyenda={k === modelo.unidades.length - 1} />
        ))}
      </Card>
      {tabla}
    </div>
  )
}
