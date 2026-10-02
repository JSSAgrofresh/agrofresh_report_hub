import { useEffect, useMemo, useState } from 'react'
import { formatDateCL, formatDateTimeCL, formatDecimalCL } from '@/lib/locale'
import { guardarBlob } from '@/services/http/descargar'
import {
  descargarPdfInforme,
  estadoResultado,
  limiteDeAnalito,
  obtenerFichaInforme,
} from '@/features/reportes'
import type { Analito, EstadoResultado, FichaInforme, LimiteAnalito, LimiteResuelto } from '@/features/reportes'
import styles from './FichaInformeModal.module.css'

interface Props {
  solicitudId: number
  /** Texto de respaldo mientras carga (N° informe · fecha). */
  titulo: string
  analitos: Analito[]
  limites: LimiteAnalito[]
  onCerrar: () => void
}

const ETIQUETA_ESTADO: Record<EstadoResultado, string> = {
  dentro: 'Dentro',
  sobre: 'Sobre el límite',
  bajo: 'Bajo el mínimo',
  sin_limite: 'Sin límite',
  nd: 'Sin valor numérico',
}

/** Campos de «Datos del informe», en orden. [clave en solicitud, etiqueta, es fecha] */
const DATOS: [string, string, boolean?][] = [
  ['laboratorio', 'Laboratorio'],
  ['tipo_servicio', 'Tipo de servicio'],
  ['especie', 'Especie'],
  ['variedad', 'Variedad'],
  ['fecha_muestreo', 'Fecha de muestreo', true],
  ['hora_muestreo', 'Hora de muestreo'],
  ['fecha_recepcion', 'Fecha de recepción', true],
  ['fecha_entrada', 'Fecha de entrada', true],
  ['fecha_analisis', 'Fecha de análisis', true],
  ['fecha_informe', 'Fecha del informe', true],
  ['semana_muestreo', 'Semana de muestreo'],
  ['temporada', 'Temporada'],
  ['tipo_muestra', 'Tipo de muestra'],
  ['posicion_muestreo', 'Posición de muestreo'],
  ['lote', 'Lote'],
  ['nro_camara', 'Cámara'],
  ['nro_linea', 'Línea'],
  ['kg_procesados', 'Kilos procesados'],
  ['csg', 'CSG'],
  ['nombre_muestreador', 'Muestreador'],
  ['solicitante', 'Solicitante'],
  ['referencia', 'OT / referencia'],
  ['codigo_ensayo', 'Código de ensayo'],
  ['nro_ensayo', 'N° de ensayo'],
  ['producto_utilizado', 'Producto utilizado'],
  ['email_laboratorio', 'Email laboratorio'],
]

/** Lo que la solicitud de Toma de muestras sabe y la base de Report no. */
const DATOS_TOMA: [string, string][] = [
  ['linea_proceso', 'Línea de proceso'],
  ['numero_camara', 'Cámara'],
  ['kilos_procesados', 'Kilos procesados'],
  ['tipo_muestra', 'Tipo de muestra'],
  ['nombre_muestreador', 'Muestreador'],
  ['lote', 'Lote'],
  ['csg_productor', 'CSG productor'],
  ['csg_packing', 'CSG packing'],
  ['producto_utilizado', 'Producto utilizado'],
  ['email_solicitante', 'Email del solicitante'],
  ['generado_por', 'Generada por'],
]

function textoDeFecha(v: string): string {
  return v.length > 10 ? formatDateTimeCL(v) : formatDateCL(v)
}

function rangoLimite(l: LimiteResuelto): string {
  if (l.min == null && l.max == null) return '—'
  const f = (n: number) => formatDecimalCL(n, 4)
  if (l.min != null && l.max != null) return `${f(l.min)} – ${f(l.max)}`
  return l.max != null ? `≤ ${f(l.max)}` : `≥ ${f(l.min as number)}`
}

export function FichaInformeModal({ solicitudId, titulo, analitos, limites, onCerrar }: Props) {
  const [ficha, setFicha] = useState<FichaInforme | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urlPdf, setUrlPdf] = useState<string | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const [pdf, setPdf] = useState<{ blob: Blob; nombre: string | null } | null>(null)
  const [visorAbierto, setVisorAbierto] = useState(false)

  useEffect(() => {
    let cancelado = false
    obtenerFichaInforme(solicitudId)
      .then((f) => !cancelado && setFicha(f))
      .catch((e: unknown) => !cancelado && setError(e instanceof Error ? e.message : 'No se pudo cargar el informe.'))
    return () => {
      cancelado = true
    }
  }, [solicitudId])

  const hayPdf = ficha?.pdf.disponible === true
  useEffect(() => {
    if (!hayPdf) return
    let cancelado = false
    let local: string | null = null
    descargarPdfInforme(solicitudId)
      .then(({ blob, nombre }) => {
        if (cancelado) return
        local = URL.createObjectURL(blob)
        setUrlPdf(local)
        setPdf({ blob, nombre })
      })
      .catch((e: unknown) => !cancelado && setErrorPdf(e instanceof Error ? e.message : 'No se pudo abrir el PDF.'))
    return () => {
      cancelado = true
      if (local) URL.revokeObjectURL(local)
    }
  }, [hayPdf, solicitudId])

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (visorAbierto) setVisorAbierto(false)
      else onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [visorAbierto, onCerrar])

  const sol = ficha?.solicitud
  const filas = useMemo(() => {
    if (!ficha || !sol) return []
    return ficha.resultados.map((r) => {
      const limite = limiteDeAnalito(
        analitos,
        limites,
        r.codigo,
        sol.laboratorio as string | null,
        sol.especie as string | null,
        sol.tipo_servicio as string | null,
      )
      return { r, limite, estado: estadoResultado(r.valor_num, limite) }
    })
  }, [ficha, sol, analitos, limites])

  const numericos = filas.filter((f) => f.r.valor_num != null)
  const promedio = numericos.length ? numericos.reduce((a, f) => a + (f.r.valor_num as number), 0) / numericos.length : null
  const sobre = filas.filter((f) => f.estado === 'sobre').length

  const datos = sol ? DATOS.filter(([c]) => sol[c] != null && sol[c] !== '') : []
  const datosToma = ficha?.toma
    ? DATOS_TOMA.filter(([c]) => ficha.toma?.[c] != null && !datos.some(([d]) => sol?.[d] != null && d === c && sol[d] === ficha.toma?.[c]))
    : []
  const observaciones = [sol?.observacion, sol?.observacion_2, ficha?.toma?.observacion].filter(
    (o, i, a): o is string => typeof o === 'string' && o !== '' && a.indexOf(o) === i,
  )

  function bajar() {
    if (pdf) guardarBlob(pdf.blob, pdf.nombre ?? ficha?.pdf.nombre ?? 'informe.pdf')
  }

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.caja} role="dialog" aria-modal="true" aria-label={`Informe ${titulo}`} onClick={(e) => e.stopPropagation()}>
        <header className={styles.cabecera}>
          <div className={styles.cabeceraTexto}>
            <h3>{sol?.nro_solicitud ? String(sol.nro_solicitud) : titulo}</h3>
            <div className={styles.chips}>
              {sol?.laboratorio && <span className={styles.chip}>{String(sol.laboratorio)}</span>}
              {sol?.tipo_servicio && <span className={styles.chip}>{String(sol.tipo_servicio)}</span>}
              {sol?.fecha_muestreo && <span className={styles.chip}>Muestreo {formatDateCL(String(sol.fecha_muestreo))}</span>}
              {sol?.especie && (
                <span className={styles.chip}>
                  {String(sol.especie)}
                  {sol.variedad ? ` · ${String(sol.variedad)}` : ''}
                </span>
              )}
            </div>
            {sol && (
              <p className={styles.donde}>
                {sol.cliente ?? 'Sin cliente'}
                {sol.planta ? ` · ${sol.planta}` : ''}
              </p>
            )}
          </div>
          <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        {error && <p className={styles.error}>{error}</p>}
        {!ficha && !error && <p className={styles.cargando}>Cargando informe…</p>}

        {ficha && sol && (
          <div className={styles.cuerpo}>
            <div className={styles.columnaPrincipal}>
              <div className={styles.tarjetas}>
                <div className={styles.tarjeta}>
                  <span>Analitos</span>
                  <strong>{filas.length}</strong>
                </div>
                <div className={styles.tarjeta}>
                  <span>Promedio</span>
                  <strong>{promedio != null ? `${formatDecimalCL(promedio, 4)} ppm` : '—'}</strong>
                </div>
                <div className={`${styles.tarjeta} ${sobre ? styles.tarjetaAlerta : ''}`}>
                  <span>Sobre el límite</span>
                  <strong>{sobre}</strong>
                </div>
              </div>

              <section>
                <h4 className={styles.seccion}>Resultados</h4>
                {filas.length === 0 ? (
                  <p className={styles.vacio}>Este informe no tiene resultados cargados.</p>
                ) : (
                  <div className={styles.tablaScroll}>
                    <table className={styles.tabla}>
                      <thead>
                        <tr>
                          <th>Analito</th>
                          <th className={styles.num}>Resultado</th>
                          <th>Producto</th>
                          <th className={styles.num}>Dosis</th>
                          <th>Límite</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map(({ r, limite, estado }, i) => (
                          <tr key={`${r.codigo}-${i}`}>
                            <td>
                              <span className={styles.codigo}>{r.codigo}</span>
                              {r.nombre && r.nombre !== r.codigo && <span className={styles.nombre}>{r.nombre}</span>}
                            </td>
                            <td className={styles.num}>
                              {r.valor_num != null ? (
                                <>
                                  <strong>{formatDecimalCL(r.valor_num, 4)}</strong> <span className={styles.unidad}>{r.unidad}</span>
                                </>
                              ) : (
                                <span className={styles.sinValor}>{r.valor_texto ?? '—'}</span>
                              )}
                            </td>
                            <td>{r.producto ?? '—'}</td>
                            <td className={styles.num}>{r.dosis != null ? String(r.dosis) : '—'}</td>
                            <td>{rangoLimite(limite)}</td>
                            <td>
                              <span className={`${styles.estado} ${styles[`estado_${estado}`]}`}>{ETIQUETA_ESTADO[estado]}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h4 className={styles.seccion}>Datos del informe</h4>
                <dl className={styles.datos}>
                  {datos.map(([c, etiqueta, esFecha]) => (
                    <div key={c}>
                      <dt>{etiqueta}</dt>
                      <dd>{esFecha ? textoDeFecha(String(sol[c])) : String(sol[c])}</dd>
                    </div>
                  ))}
                  {datosToma.map(([c, etiqueta]) => (
                    <div key={`toma-${c}`}>
                      <dt>{etiqueta}</dt>
                      <dd>{String(ficha.toma?.[c])}</dd>
                    </div>
                  ))}
                </dl>
                {observaciones.length > 0 && (
                  <p className={styles.observaciones}>
                    <strong>Observaciones:</strong> {observaciones.join(' · ')}
                  </p>
                )}
                {ficha.carga && (
                  <p className={styles.carga}>
                    Cargado {ficha.carga.creado_en ? `el ${formatDateTimeCL(ficha.carga.creado_en)}` : ''}
                    {ficha.carga.creado_por ? ` por ${ficha.carga.creado_por}` : ''}
                    {ficha.carga.archivo ? ` · ${ficha.carga.archivo}` : ''}
                    {ficha.carga.origen ? ` (${ficha.carga.origen})` : ''}
                  </p>
                )}
              </section>
            </div>

            <aside className={styles.columnaPdf}>
              <h4 className={styles.seccion}>Informe</h4>
              <div className={styles.vista}>
                {urlPdf ? (
                  <>
                    <iframe className={styles.miniatura} title="Vista previa del informe" src={`${urlPdf}#page=1&toolbar=0&navpanes=0&view=FitH`} tabIndex={-1} />
                    <button className={styles.verSobre} onClick={() => setVisorAbierto(true)} aria-label="Ver informe">
                      <span>Ver informe</span>
                    </button>
                  </>
                ) : (
                  <div className={styles.sinPdf}>
                    {errorPdf ? errorPdf : hayPdf ? 'Cargando vista previa…' : 'Este informe aún no tiene un PDF guardado.'}
                  </div>
                )}
              </div>
              {pdf && (
                <div className={styles.acciones}>
                  <button className={styles.botonPrincipal} onClick={() => setVisorAbierto(true)}>
                    Ver
                  </button>
                  <button className={styles.botonSecundario} onClick={bajar}>
                    Descargar
                  </button>
                </div>
              )}
              {ficha.pdf.nombre && <p className={styles.nombreArchivo}>{ficha.pdf.nombre}</p>}
            </aside>
          </div>
        )}
      </div>

      {visorAbierto && urlPdf && (
        <div
          className={styles.visorFondo}
          onClick={(e) => {
            e.stopPropagation()
            setVisorAbierto(false)
          }}
        >
          <div className={styles.visor} role="dialog" aria-modal="true" aria-label="Informe completo" onClick={(e) => e.stopPropagation()}>
            <div className={styles.visorBarra}>
              <strong>{ficha?.pdf.nombre ?? 'Informe'}</strong>
              <div className={styles.acciones}>
                <button className={styles.botonSecundario} onClick={bajar}>
                  Descargar
                </button>
                <button className={styles.botonSecundario} onClick={() => setVisorAbierto(false)}>
                  Cerrar
                </button>
              </div>
            </div>
            <iframe className={styles.visorMarco} title="Informe completo" src={urlPdf} />
          </div>
        </div>
      )}
    </div>
  )
}
