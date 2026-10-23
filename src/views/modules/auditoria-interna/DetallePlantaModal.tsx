import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { bandaFito, bandaLimite, fmtDesvio, fmtNum, leerDetallePlanta, numeroSemana, rangoSemana, sumarDias } from '@/features/rendimientoCalidad'
import type { AnalitoFito, AnalitoFsma, AnalitoResidual, Bloque, InformeDetalle, Servicio } from '@/features/rendimientoCalidad'
import styles from './DetallePlantaModal.module.css'

const TITULO_BLOQUE: Record<Bloque, string> = { residuales: 'Residuales', fsma: 'FSMA', fito: 'FITO' }
const NOMBRE_SERVICIO: Record<Servicio, string> = { linea: 'Línea de proceso', actimist: 'Actimist', ecofog: 'Ecofog' }
const NIVEL: Record<string, string> = { optimo: 'Óptimo', moderado: 'Moderado', peligroso: 'Peligroso' }

const fecha = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

/** El valor de un analito sobre su rango permitido: la banda verde es lo que se acepta; el punto, dónde cayó. */
function BarraLimite({ a }: { a: AnalitoResidual }) {
  if (a.min === null || a.max === null || a.valor === null) return <div className={styles.barraVacia} />
  const b = bandaLimite(a.valor, a.min, a.max)
  return (
    <div className={styles.barra} role="img" aria-label={`${fmtNum(a.valor)} ${a.unidad}, rango permitido de ${fmtNum(a.min)} a ${fmtNum(a.max)}`}>
      <span className={styles.pista} />
      <span className={styles.banda} style={{ left: `${b.desde}%`, width: `${b.hasta - b.desde}%` }} />
      <span className={styles.corte} style={{ left: `${b.desde}%` }} />
      <span className={styles.corte} style={{ left: `${b.hasta}%` }} />
      <span className={`${styles.punto} ${styles[`p_${a.estado}`]}`} style={{ left: `${b.marca}%` }} />
    </div>
  )
}

function FilaResidual({ a }: { a: AnalitoResidual }) {
  const sinLimite = a.estado === 'sin_limite'
  const enRango = a.estado === 'dentro'
  return (
    <li className={`${styles.analito} ${sinLimite ? styles.tenue : ''}`}>
      <div className={styles.nombre}>
        <b>{a.nombre}</b>
        <span>{a.codigo}</span>
      </div>
      <div className={styles.limite}>
        {a.min !== null && a.max !== null ? (
          <>
            <small>Límite</small>
            <span>{fmtNum(a.min)} – {fmtNum(a.max)} {a.unidad}</span>
          </>
        ) : (
          <small>Sin límite para esta especie</small>
        )}
      </div>
      {sinLimite ? <div className={styles.barraVacia} /> : <BarraLimite a={a} />}
      <div className={styles.valor}>
        <b>{a.valor === null ? '—' : `${a.signo}${fmtNum(a.valor)}`}</b>
        <span>{a.unidad}</span>
      </div>
      <div className={styles.variacion}>
        {a.estado === 'sobre' && <span className={styles.arriba}>▲ {fmtDesvio(a.desvio)} {a.unidad}</span>}
        {a.estado === 'bajo' && <span className={styles.abajo}>▼ {fmtDesvio(a.desvio)} {a.unidad}</span>}
        {enRango && <span className={styles.dentro}>Dentro del límite</span>}
        {a.estado === 'sin_medida' && <span className={styles.tenue}>Bajo cuantificación</span>}
      </div>
    </li>
  )
}

function FilaFsma({ a }: { a: AnalitoFsma }) {
  return (
    <li className={styles.analitoSimple}>
      <div className={styles.nombre}>
        <b>{a.nombre}</b>
        <span>{a.codigo}</span>
      </div>
      <div className={styles.valor}>
        <b>{a.valor === null ? '—' : typeof a.valor === 'number' ? fmtNum(a.valor) : a.valor}</b>
        <span>{a.unidad ?? ''}</span>
      </div>
      <div className={styles.variacion}>
        {a.detecto === true && <span className={styles.arriba}>Detectado</span>}
        {a.detecto === false && <span className={styles.dentro}>No detectado</span>}
        {a.detecto === null && <span className={styles.tenue}>Sin dato</span>}
      </div>
    </li>
  )
}

function FilaFito({ a }: { a: AnalitoFito }) {
  const b = bandaFito(a.valor ?? 0, a.optimo_hasta, a.peligroso_desde)
  return (
    <li className={styles.analitoFito}>
      <div className={styles.nombre}>
        <b>{a.nombre}</b>
        <span>{a.codigo}</span>
      </div>
      <div className={styles.limite}>
        <small>Niveles</small>
        <span>&lt; {fmtNum(a.optimo_hasta)} · {fmtNum(a.optimo_hasta)}–{fmtNum(a.peligroso_desde)} · &gt; {fmtNum(a.peligroso_desde)}</span>
      </div>
      <div className={styles.barra} role="img" aria-label={`${fmtNum(a.valor)} ${a.unidad ?? ''}, nivel ${a.nivel ? NIVEL[a.nivel] : 'sin dato'}`}>
        <span className={`${styles.tramo} ${styles.tOptimo}`} style={{ left: 0, width: `${b.optimo}%` }} />
        <span className={`${styles.tramo} ${styles.tModerado}`} style={{ left: `${b.optimo}%`, width: `${b.peligroso - b.optimo}%` }} />
        <span className={`${styles.tramo} ${styles.tPeligroso}`} style={{ left: `${b.peligroso}%`, width: `${100 - b.peligroso}%` }} />
        <span className={`${styles.punto} ${a.nivel === 'optimo' ? styles.p_dentro : a.nivel === 'moderado' ? styles.p_moderado : styles.p_sobre}`} style={{ left: `${b.marca}%` }} />
      </div>
      <div className={styles.valor}>
        <b>{a.valor === null ? '—' : `${a.signo}${fmtNum(a.valor)}`}</b>
        <span>{a.unidad ?? ''}</span>
      </div>
      <div className={styles.variacion}>
        {a.nivel === 'optimo' && <span className={styles.dentro}>Óptimo</span>}
        {a.nivel === 'moderado' && <span className={styles.moderado}>Moderado</span>}
        {a.nivel === 'peligroso' && <span className={styles.arriba}>Peligroso</span>}
      </div>
    </li>
  )
}

function Tarjeta({ inf }: { inf: InformeDetalle }) {
  const veredicto = inf.cumple === true ? 'Cumple' : inf.cumple === false ? 'No cumple' : 'Sin criterio'
  const clase = inf.cumple === true ? styles.cumple : inf.cumple === false ? styles.noCumple : styles.sinCriterio
  return (
    <article className={`${styles.tarjeta} ${inf.cumple === false ? styles.tarjetaMala : ''}`}>
      <header className={styles.cab}>
        <div className={styles.ident}>
          <b>{inf.informe ?? inf.ot ?? `Informe ${inf.id}`}</b>
          <span>{fecha(inf.fecha)} · {inf.laboratorio}{inf.ot && inf.informe ? ` · ${inf.ot}` : ''}</span>
        </div>
        <div className={styles.etiquetas}>
          {inf.especie && <span className={styles.especie}>{inf.especie}{inf.variedad ? ` · ${inf.variedad}` : ''}</span>}
          {inf.bloque === 'residuales' && <span className={`${styles.servicio} ${styles[`s_${inf.servicio}`]}`}>{NOMBRE_SERVICIO[inf.servicio]}</span>}
          <span className={`${styles.veredicto} ${clase}`}>{veredicto}</span>
        </div>
      </header>
      {inf.analitos.length === 0 ? (
        <p className={styles.vacio}>Este informe no trae analitos que se puedan juzgar.</p>
      ) : (
        <ul className={styles.lista}>
          {inf.bloque === 'residuales' && inf.analitos.map((a) => <FilaResidual key={a.codigo} a={a} />)}
          {inf.bloque === 'fsma' && inf.analitos.map((a) => <FilaFsma key={a.codigo} a={a} />)}
          {inf.bloque === 'fito' && inf.analitos.map((a) => <FilaFito key={a.codigo} a={a} />)}
        </ul>
      )}
    </article>
  )
}

interface Props {
  soldTo: string
  shipTo: string
  desde: string
  hasta: string
  onCerrar: () => void
}

/** Lo que hay detrás de una fila: los informes de esa planta en el período, con cada analito contra el límite de su especie y servicio. */
export function DetallePlantaModal({ soldTo, shipTo, desde, hasta, onCerrar }: Props) {
  const [informes, setInformes] = useState<InformeDetalle[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bloque, setBloque] = useState<Bloque | null>(null)

  useEffect(() => {
    let cancelado = false
    leerDetallePlanta(soldTo, shipTo, desde, hasta)
      .then((r) => {
        if (cancelado) return
        setInformes(r.informes)
        // Abre en el primer análisis que tenga algo que no cumple, y si no, en el primero con informes.
        const malo = r.informes.find((i) => i.cumple === false)
        setBloque((malo ?? r.informes[0])?.bloque ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle.')
      })
    return () => {
      cancelado = true
    }
  }, [soldTo, shipTo, desde, hasta])

  const porBloque = useMemo(() => {
    const m: Record<Bloque, InformeDetalle[]> = { residuales: [], fsma: [], fito: [] }
    for (const i of informes ?? []) m[i.bloque].push(i)
    return m
  }, [informes])

  const periodo = desde || hasta ? `${desde ? `Sem ${numeroSemana(desde)} (${rangoSemana(desde)})` : 'desde el inicio'} a ${hasta ? `Sem ${numeroSemana(sumarDias(hasta, -6))}` : 'hoy'}` : 'todo el período'
  const total = informes?.length ?? 0
  const malos = (informes ?? []).filter((i) => i.cumple === false).length

  return (
    <Modal titulo={shipTo || 'Detalle'} subtitulo={`${soldTo} · ${periodo}`} onCerrar={onCerrar} ancho="grande">
      <div className={styles.contenido}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {informes === null && !error && <Skeleton style={{ height: 240 }} />}
      {informes && (
        <>
          <p className={styles.resumen}>
            <b>{total}</b> {total === 1 ? 'informe' : 'informes'}
            {malos > 0 ? <> · <span className={styles.rojo}>{malos} no {malos === 1 ? 'cumple' : 'cumplen'}</span></> : ' · todos cumplen'}
          </p>
          {total === 0 ? (
            <p className={styles.vacio}>No hay informes de esta planta en el período.</p>
          ) : (
            <>
              <div className={styles.pestanas} role="tablist" aria-label="Análisis">
                {(['residuales', 'fsma', 'fito'] as const).filter((b) => porBloque[b].length > 0).map((b) => {
                  const m = porBloque[b].filter((i) => i.cumple === false).length
                  return (
                    <button key={b} type="button" role="tab" aria-selected={bloque === b} className={styles.pestana} onClick={() => setBloque(b)}>
                      {TITULO_BLOQUE[b]}
                      <span className={styles.conteo}>{porBloque[b].length}</span>
                      {m > 0 && <span className={styles.conteoMalo}>{m} no cumple</span>}
                    </button>
                  )
                })}
              </div>
              {bloque === 'residuales' && (
                <div className={styles.leyenda} aria-hidden="true">
                  <span><i className={styles.lBanda} /> Rango permitido</span>
                  <span><i className={`${styles.lPunto} ${styles.p_sobre}`} /> Sobre el límite</span>
                  <span><i className={`${styles.lPunto} ${styles.p_bajo}`} /> Bajo el límite</span>
                  <span><i className={`${styles.lPunto} ${styles.p_dentro}`} /> Dentro</span>
                </div>
              )}
              <div className={styles.tarjetas}>
                {bloque && porBloque[bloque].map((i) => <Tarjeta key={i.id} inf={i} />)}
              </div>
            </>
          )}
        </>
      )}
      </div>
    </Modal>
  )
}
