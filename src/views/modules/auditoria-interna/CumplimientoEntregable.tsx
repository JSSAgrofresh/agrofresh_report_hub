import { useMemo, useState } from 'react'
import {
  claveLaboratorio,
  peoresAtrasos,
  resumenAtraso,
  resumenCumplimiento,
  sensibilidad,
} from '@/features/auditoriaInterna'
import type { EvaluadaEntrega, PuntoMes } from '@/features/auditoriaInterna'
import styles from './CumplimientoEntregable.module.css'

const nf = new Intl.NumberFormat('es-CL')
const f1 = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const tono = (pct: number | null) => (pct == null ? '' : pct >= 90 ? styles.bueno : pct >= 75 ? styles.regular : styles.malo)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(2, 4)}`
const etiquetaSolicitud = (e: EvaluadaEntrega) => e.sol.numero_solicitud ?? e.sol.archivo

const COLOR = { cumplio: '#1b7f5c', tarde: '#d9822b', vencida: '#b3261e' }

interface Grupo {
  clave: string
  nombre: string
  detalle: string
  lista: EvaluadaEntrega[]
}

/** Agrupa por laboratorio o por el análisis que fija el plazo (misma regla que el resto de la pantalla). */
function agrupar(ev: EvaluadaEntrega[], por: 'laboratorio' | 'analisis'): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const e of ev) {
    if (e.veredicto === 'excluida') continue
    const lab = claveLaboratorio(e.sol.laboratorio) || 'SIN LABORATORIO'
    const clave = por === 'laboratorio' ? lab : `${lab} · ${e.analisis ?? 'plazo general'}`
    const g = mapa.get(clave) ?? { clave, nombre: clave, detalle: '', lista: [] }
    g.lista.push(e)
    mapa.set(clave, g)
  }
  return [...mapa.values()].map((g) => {
    const plazo = g.lista[0].plazo
    return { ...g, detalle: plazo != null ? `plazo ${plazo} d háb.` : 'sin plazo cargado' }
  })
}

/**
 * Cumplimiento del entregable, pensado para responder cuatro preguntas en orden:
 *  1. ¿Cumplimos?            → cifra principal y reparto de TODAS las solicitudes.
 *  2. ¿Cuánto nos pasamos?   → atraso mediano y máximo, en días hábiles.
 *  3. ¿Dónde se incumple?    → ranking de peor a mejor, por laboratorio o por análisis.
 *  4. ¿Mejora o empeora?     → cumplimiento por mes de emisión, y las solicitudes más pasadas.
 */
export function CumplimientoEntregable({
  ev,
  serie,
  textoFin,
  labElegido,
  onLab,
}: {
  ev: EvaluadaEntrega[]
  serie: PuntoMes[]
  textoFin: string
  labElegido: string
  onLab: (lab: string) => void
}) {
  const [por, setPor] = useState<'laboratorio' | 'analisis'>('laboratorio')
  const cum = useMemo(() => resumenCumplimiento(ev), [ev])
  const atraso = useMemo(() => resumenAtraso(ev), [ev])
  const peores = useMemo(() => peoresAtrasos(ev, 5), [ev])
  const sens = useMemo(() => sensibilidad(ev, [-2, 0, 2, 5]), [ev])
  const ranking = useMemo(
    () =>
      agrupar(ev, por)
        .map((g) => ({ ...g, r: resumenCumplimiento(g.lista), a: resumenAtraso(g.lista) }))
        // peor primero; los que aún no tienen nada vencido (sin % que juzgar) van al final
        .sort((a, b) => (a.r.pct ?? 101) - (b.r.pct ?? 101) || b.r.vencidas - a.r.vencidas),
    [ev, por],
  )

  const total = cum.cumplio + cum.tarde + cum.vencida + cum.plazo + cum.sinPlazo
  const partes = [
    { clave: 'cumplio', texto: 'A tiempo', n: cum.cumplio, color: COLOR.cumplio },
    { clave: 'tarde', texto: 'Entregadas tarde', n: cum.tarde, color: COLOR.tarde },
    { clave: 'vencida', texto: 'Vencidas sin entregar', n: cum.vencida, color: COLOR.vencida },
    { clave: 'plazo', texto: 'Aún en plazo', n: cum.plazo, color: '#9aa7a0' },
    { clave: 'sin_plazo', texto: 'Sin plazo cargado', n: cum.sinPlazo, color: '#d5dbd7' },
  ]
  const maxMes = Math.max(1, ...serie.map((p) => p.n))

  return (
    <div className={styles.cum}>
      {/* 1 ── ¿Cumplimos? */}
      <div className={styles.hero}>
        <div className={styles.cifra}>
          <span className={styles.pregunta}>¿Entregamos dentro del plazo prometido?</span>
          <b className={`${styles.pct} ${tono(cum.pct)}`}>{cum.pct == null ? '—' : Math.round(cum.pct)}<small>%</small></b>
          <span className={styles.frase}>
            {cum.vencidas === 0
              ? 'Todavía no vence ninguna solicitud.'
              : <><b>{nf.format(cum.cumplio)}</b> de <b>{nf.format(cum.vencidas)}</b> solicitudes que ya vencieron llegaron a «{textoFin}» a tiempo.</>}
          </span>
        </div>
        <div className={styles.reparto}>
          <div className={styles.barra} role="img" aria-label={partes.map((p) => `${p.texto}: ${p.n}`).join(', ')}>
            {partes.filter((p) => p.n > 0).map((p) => (
              <span key={p.clave} style={{ width: `${(p.n / (total || 1)) * 100}%`, background: p.color }} title={`${p.texto}: ${p.n}`} />
            ))}
          </div>
          <ul className={styles.claves}>
            {partes.map((p) => (
              <li key={p.clave} className={p.n === 0 ? styles.apagada : undefined}>
                <i style={{ background: p.color }} />
                <b>{nf.format(p.n)}</b> {p.texto}
              </li>
            ))}
          </ul>
          <p className={styles.nota}>
            El % solo cuenta las {nf.format(cum.vencidas)} que ya vencieron; «aún en plazo» y «sin plazo» no suben ni bajan el número.
          </p>
        </div>
      </div>

      {/* 2 ── ¿Cuánto nos pasamos? */}
      <div className={styles.atraso}>
        <div>
          <span className={styles.et}>Atrasadas</span>
          <b className={`${styles.gr} ${atraso.n ? styles.malo : ''}`}>{nf.format(atraso.n)}</b>
          <small>{nf.format(cum.tarde)} entregadas tarde · {nf.format(cum.vencida)} vencidas sin entregar</small>
        </div>
        <div>
          <span className={styles.et}>Atraso mediano</span>
          <b className={styles.gr}>{f1(atraso.mediana)}<small> d háb.</small></b>
          <small>por encima del plazo, la mitad se pasa menos que esto</small>
        </div>
        <div>
          <span className={styles.et}>Atraso máximo</span>
          <b className={styles.gr}>{f1(atraso.maximo)}<small> d háb.</small></b>
          <small>{peores[0] ? `${etiquetaSolicitud(peores[0].e)} · ${peores[0].e.sol.laboratorio ?? '—'}` : 'ninguna atrasada'}</small>
        </div>
      </div>

      <div className={styles.dos}>
        {/* 3 ── ¿Dónde se incumple? */}
        <section className={styles.ranking} aria-label="Dónde se incumple">
          <header>
            <h4>¿Dónde se incumple?</h4>
            <div className={styles.segmentado} role="group" aria-label="Agrupar cumplimiento por">
              <button type="button" aria-pressed={por === 'laboratorio'} onClick={() => setPor('laboratorio')}>Laboratorio</button>
              <button type="button" aria-pressed={por === 'analisis'} onClick={() => { setPor('analisis'); onLab('') }}>Análisis</button>
            </div>
          </header>
          <p className={styles.sub}>De peor a mejor cumplimiento.{por === 'laboratorio' ? ' Toca uno para filtrar las solicitudes de abajo.' : ''}</p>
          <ol>
            {ranking.map((g) => {
              const t = Math.max(1, g.r.cumplio + g.r.tarde + g.r.vencida + g.r.plazo + g.r.sinPlazo)
              const activo = por === 'laboratorio' && labElegido === g.clave
              return (
                <li key={g.clave}>
                  <button
                    type="button"
                    className={`${styles.fila} ${activo ? styles.activa : ''}`}
                    aria-pressed={por === 'laboratorio' ? activo : undefined}
                    disabled={por !== 'laboratorio'}
                    onClick={() => onLab(activo ? '' : g.clave)}
                  >
                    <span className={styles.nombre}>
                      <b>{g.nombre}</b>
                      <small>{g.detalle} · {nf.format(g.r.vencidas)} vencidas{g.a.n ? ` · se pasan ${f1(g.a.mediana)} d` : ''}</small>
                    </span>
                    <span className={styles.apilada} role="img" aria-label={`${g.nombre}: ${g.r.cumplio} a tiempo, ${g.r.tarde} tarde, ${g.r.vencida} vencidas`}>
                      <span style={{ width: `${(g.r.cumplio / t) * 100}%`, background: COLOR.cumplio }} />
                      <span style={{ width: `${(g.r.tarde / t) * 100}%`, background: COLOR.tarde }} />
                      <span style={{ width: `${(g.r.vencida / t) * 100}%`, background: COLOR.vencida }} />
                      <span className={styles.sinJuzgar} style={{ width: `${((g.r.plazo + g.r.sinPlazo) / t) * 100}%` }} />
                    </span>
                    <b className={`${styles.valor} ${tono(g.r.pct)}`}>{g.r.pct == null ? '—' : `${Math.round(g.r.pct)} %`}</b>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>

        <div className={styles.lateral}>
          {/* 4a ── ¿Mejora o empeora? */}
          <section aria-label="Evolución por mes">
            <h4>¿Mejora o empeora?</h4>
            <p className={styles.sub}>Cumplimiento por mes en que se emitió la solicitud.</p>
            {serie.length === 0 ? (
              <p className={styles.nota}>Aún no hay meses con datos.</p>
            ) : (
              <div className={styles.meses}>
                {serie.map((p) => (
                  <div key={p.mes} className={styles.mes} title={`${nombreMes(p.mes)}: ${p.pct == null ? 'faltan datos (menos de 3 vencidas)' : `${Math.round(p.pct)} %`} · ${p.n} solicitudes`}>
                    <b className={tono(p.pct)}>{p.pct == null ? '—' : `${Math.round(p.pct)}%`}</b>
                    <span className={styles.columna}>
                      <i className={p.pct == null ? styles.sinDato : undefined} style={{ height: `${p.pct == null ? 6 : Math.max(6, p.pct)}%`, opacity: 0.35 + 0.65 * (p.n / maxMes) }} />
                    </span>
                    <small>{nombreMes(p.mes)}</small>
                    <small className={styles.n}>{nf.format(p.n)} sol.</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 4b ── Las más pasadas */}
          <section aria-label="Las solicitudes más pasadas de su plazo">
            <h4>Las más pasadas de su plazo</h4>
            {peores.length === 0 ? (
              <p className={styles.nota}>Ninguna solicitud atrasada.</p>
            ) : (
              <ol className={styles.peores}>
                {peores.map(({ e, atraso: a }) => (
                  <li key={e.sol.archivo}>
                    <b>{etiquetaSolicitud(e)}</b>
                    <span>{e.sol.laboratorio ?? '—'} · {e.sol.sold_to ?? '—'}</span>
                    <em className={e.veredicto === 'vencida' ? styles.malo : styles.aviso}>
                      +{f1(a)} d {e.veredicto === 'vencida' ? 'sin entregar' : 'tarde'}
                    </em>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Sensibilidad, a modo de nota */}
          <section aria-label="Sensibilidad del plazo" className={styles.sens}>
            <h4>¿Y si el plazo fuera otro?</h4>
            <div>
              {sens.map((s) => (
                <span key={s.delta} className={s.delta === 0 ? styles.actual : undefined}>
                  <b>{s.pct == null ? '—' : `${Math.round(s.pct)} %`}</b>
                  <small>{s.delta === 0 ? 'hoy' : `${s.delta > 0 ? '+' : '−'}${Math.abs(s.delta)} d`}</small>
                </span>
              ))}
            </div>
            <p className={styles.nota}>Si un día más mueve mucho el %, el plazo está justo o el proceso está al límite.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
