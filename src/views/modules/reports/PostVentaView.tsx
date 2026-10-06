import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { Skeleton } from '@/components/ui/Skeleton'
import { AREAS } from '@/constants/areas'
import { AreaHero } from '@/features/dashboard'
import {
  FILTRO_CARGAS_VACIO,
  filtrarCargas,
  eliminarCargaTrace,
  eliminarCargasTrace,
  fechaDeCarpeta,
  generarInformeCarga,
  listarCargasTrace,
  descargarOriginalCarga,
  descargarPdfCarga,
  verCargaTrace,
} from '@/features/postventa'
import type { CargaTrace, EstadisticaSerie, FiltroCargas, ResumenCargaTrace } from '@/features/postventa'
import { HttpError } from '@/services/http/client'
import { PostVentaResumen } from './PostVentaResumen'
import styles from './PostVentaView.module.css'

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Legend, Tooltip)

// pH y ORP viven en escalas incomparables (≈7 vs ≈700 mV): van SIEMPRE en dos
// gráficos separados, nunca en uno con doble eje -eso haría parecer que las dos
// curvas se cruzan cuando no comparten unidad-. Los dos tonos están validados
// para daltonismo sobre la superficie blanca de la app (ΔE 17 CVD, 30 normal).
const COLOR_PH = '#1C7FA6'
const COLOR_MV = '#eb6834'
const COLOR_GRILLA = '#e1e5dc'
const COLOR_EJE = '#77837b'

function formatearEquipo(equipo: string): string {
  return equipo
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function num(v: number | null | undefined, decimales = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

function Tarjeta({
  etiqueta,
  valor,
  detalle,
  color,
  textual,
}: {
  etiqueta: string
  valor: string
  detalle?: string
  color?: string
  /** El valor es texto (una fecha), no una cifra: se muestra más chico. */
  textual?: boolean
}) {
  return (
    <Card className={styles.tarjeta} style={color ? { borderLeftColor: color } : undefined}>
      <div className={styles.tarjetaEtiqueta}>{etiqueta}</div>
      <div className={`${styles.tarjetaValor} ${textual ? styles.tarjetaValorTexto : ''}`}>{valor}</div>
      {detalle && <div className={styles.tarjetaDetalle}>{detalle}</div>}
    </Card>
  )
}

/** Un gráfico de línea por serie: pH y mV nunca comparten eje. */
function GraficoSerie({
  titulo,
  nota,
  etiquetas,
  valores,
  color,
  decimales,
  limiteMin,
  limiteMax,
}: {
  titulo: string
  nota: string
  etiquetas: string[]
  valores: (number | null)[]
  color: string
  decimales: number
  limiteMin?: number | null
  limiteMax?: number | null
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const chart = useRef<Chart | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()

    // Los límites configurados en Trace se dibujan como líneas de referencia
    // planas y discretas: son un umbral, no una serie más.
    const lineaLimite = (valor: number) => ({
      label: 'Límite',
      data: etiquetas.map(() => valor),
      borderColor: COLOR_EJE,
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
    })

    chart.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: etiquetas,
        datasets: [
          {
            label: titulo,
            data: valores,
            borderColor: color,
            backgroundColor: `${color}1F`,
            borderWidth: 2,
            pointRadius: valores.length > 60 ? 0 : 3,
            pointHoverRadius: 5,
            spanGaps: true,
            tension: 0.25,
            fill: true,
          },
          ...(limiteMin != null ? [lineaLimite(limiteMin)] : []),
          ...(limiteMax != null ? [lineaLimite(limiteMax)] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          // Una sola serie: el título ya la nombra, un recuadro de leyenda
          // sobraría. Las líneas de límite se explican en la nota.
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.dataset.label === 'Límite'
                  ? `Límite: ${num(ctx.parsed.y, decimales)}`
                  : `${titulo}: ${num(ctx.parsed.y, decimales)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: COLOR_EJE, maxTicksLimit: 8, autoSkip: true },
          },
          y: {
            grid: { color: COLOR_GRILLA },
            border: { display: false },
            ticks: { color: COLOR_EJE },
          },
        },
      },
    })
    return () => chart.current?.destroy()
  }, [titulo, etiquetas, valores, color, decimales, limiteMin, limiteMax])

  return (
    <Card className={styles.grafico}>
      <h3 className={styles.tituloGrafico}>{titulo}</h3>
      <p className={styles.notaGrafico}>{nota}</p>
      <div className={styles.lienzo}>
        <canvas ref={ref} />
      </div>
    </Card>
  )
}

function textoEstadistica(e: EstadisticaSerie | undefined, decimales: number): string | undefined {
  if (!e || e.prom === null) return undefined
  return `mín ${num(e.min, decimales)} · máx ${num(e.max, decimales)} · σ ${num(e.desv, decimales)}`
}

export function PostVentaView() {
  const [cargas, setCargas] = useState<ResumenCargaTrace[] | null>(null)
  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<CargaTrace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verMasFilas, setVerMasFilas] = useState(false)
  const [filtro, setFiltro] = useState<FiltroCargas>(FILTRO_CARGAS_VACIO)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [verTodosInformes, setVerTodosInformes] = useState(false)
  const [generando, setGenerando] = useState<string | null>(null)
  const detalleRef = useRef<HTMLDivElement | null>(null)
  const cargasFiltradas = useMemo(() => filtrarCargas(cargas ?? [], filtro), [cargas, filtro])

  const mensaje = (err: unknown, alterno: string) =>
    err instanceof HttpError ? `El backend respondió con un error (${err.status}).` : alterno

  const recargarLista = useCallback(async () => {
    try {
      const lista = await listarCargasTrace()
      setCargas(lista)
      setSeleccionada((actual) => actual ?? lista[0]?.carpeta ?? null)
    } catch (err) {
      setCargas([])
      setError(mensaje(err, 'No se pudo conectar con el backend. Revisa que esté corriendo.'))
    }
  }, [])

  useEffect(() => {
    let vigente = true
    listarCargasTrace()
      .then((lista) => {
        if (!vigente) return
        setCargas(lista)
        setSeleccionada((actual) => actual ?? lista[0]?.carpeta ?? null)
      })
      .catch((err: unknown) => {
        if (!vigente) return
        setCargas([])
        setError(mensaje(err, 'No se pudo conectar con el backend. Revisa que esté corriendo.'))
      })
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    if (!seleccionada) return
    let vigente = true
    verCargaTrace(seleccionada)
      .then((d) => {
        if (vigente) setDetalle(d)
      })
      .catch((err: unknown) => {
        if (vigente) setError(mensaje(err, 'No se pudo abrir esa carga.'))
      })
    return () => {
      vigente = false
    }
  }, [seleccionada])

  useEffect(() => {
    setVerMasFilas(false)
  }, [seleccionada])

  // "Está cargando" se deduce de si el detalle que hay en mano corresponde a la
  // carga elegida; así no hace falta un estado aparte que haya que sincronizar.
  const detalleVigente = detalle?.carpeta === seleccionada ? detalle : null
  const cargandoDetalle = seleccionada !== null && detalleVigente === null

  const serie = useMemo(() => {
    const filas = detalleVigente?.filas ?? []
    // Una descarga de pendrive suele cubrir un solo día: repetir la fecha en
    // cada marca del eje solo la satura. Si hay más de un día, se muestra
    // completa porque ahí sí distingue.
    const unSoloDia = new Set(filas.map((f) => f.fecha)).size <= 1
    return {
      etiquetas: filas.map((f) => (unSoloDia ? f.hora : `${f.fecha} ${f.hora}`)),
      ph: filas.map((f) => f.ph),
      mv: filas.map((f) => f.mv),
      primera: filas[0],
      ultima: filas[filas.length - 1],
      unSoloDia,
    }
  }, [detalleVigente])

  async function borrar(carpeta: string) {
    if (!window.confirm(`¿Eliminar la carga del ${fechaDeCarpeta(carpeta)}? Se borra del servidor y no se puede deshacer.`))
      return
    try {
      await eliminarCargaTrace(carpeta)
      setSeleccionada(null)
      setDetalle(null)
      await recargarLista()
    } catch (err) {
      setError(mensaje(err, 'No se pudo eliminar esa carga.'))
    }
  }

  // Solo cuentan las marcadas que siguen a la vista: si un filtro esconde una,
  // no se borra a escondidas.
  const marcadasVisibles = cargasFiltradas.filter((c) => marcadas.has(c.carpeta)).map((c) => c.carpeta)
  const todasMarcadas = cargasFiltradas.length > 0 && marcadasVisibles.length === cargasFiltradas.length

  function alternar(carpeta: string) {
    setMarcadas((previas) => {
      const nuevas = new Set(previas)
      if (nuevas.has(carpeta)) nuevas.delete(carpeta)
      else nuevas.add(carpeta)
      return nuevas
    })
  }

  async function generarInforme(carpeta: string) {
    setGenerando(carpeta)
    try {
      await generarInformeCarga(carpeta)
      await recargarLista()
      setDetalle(null)
    } catch (err) {
      setError(mensaje(err, 'No se pudo generar el informe.'))
    } finally {
      setGenerando(null)
    }
  }

  function marcarTodas() {
    setMarcadas(todasMarcadas ? new Set() : new Set(cargasFiltradas.map((c) => c.carpeta)))
  }

  async function borrarMarcadas() {
    const n = marcadasVisibles.length
    if (
      !n ||
      !window.confirm(
        `¿Eliminar ${n} informe${n === 1 ? '' : 's'} del sistema? Se borran del servidor y de Storage, y no se puede deshacer.`,
      )
    )
      return
    try {
      const r = await eliminarCargasTrace(marcadasVisibles)
      setMarcadas(new Set())
      if (seleccionada && r.borradas.includes(seleccionada)) {
        setSeleccionada(null)
        setDetalle(null)
      }
      if (r.fallidas.length) setError(`${r.fallidas.length} informe(s) ya no existían.`)
      await recargarLista()
    } catch (err) {
      setError(mensaje(err, 'No se pudieron eliminar los informes.'))
    }
  }

  if (cargas === null) {
    return (
      <div>
        <AreaHero
          area={AREAS.postventa}
          titulo="Accu-Tab · pH y ORP"
          descripcion="Seguimiento de los equipos en planta: la evolución del pH y del ORP carga a carga."
        />
        <Header title="Reportes de Post Venta" description="Histórico de cargas de Trace: equipos Accu-Tab, pH y ORP." />
        <Skeleton />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <AreaHero
        area={AREAS.postventa}
        titulo="Accu-Tab · pH y ORP"
        descripcion="Seguimiento de los equipos en planta: la evolución del pH y del ORP carga a carga."
      />
      <Header
        title="Reportes de Post Venta"
        description="Análisis de equipos Accu-Tab: cargas manuales desde Trace y automáticas desde correo."
      />

      {error && <p className={styles.error}>{error}</p>}

      {cargas.length === 0 ? (
        <EstadoModulo
          etiqueta="Sin cargas todavía"
          titulo="Aún no hay ningún análisis guardado"
          descripcion="Abre Trace, carga los archivos de pH y ORP del pendrive del equipo, completa los datos del informe y usa «Guardar en el servidor». Los correos con datos AccuTab también se procesan automáticamente."
        />
      ) : (
        <>
        <PostVentaResumen
          todas={cargas}
          filtradas={cargasFiltradas}
          filtro={filtro}
          onFiltro={setFiltro}
        />
        <Card className={styles.informes} aria-label="Informes">
          <div className={styles.informesCabecera}>
            <div>
              <h2 className={styles.informesTitulo}>Informes</h2>
              <p className={styles.informesNota}>
                Un informe PDF por carga, con los mismos filtros de arriba. Marca los que quieras sacar del sistema.
              </p>
            </div>
            <button
              type="button"
              className={styles.botonEliminarVarios}
              disabled={marcadasVisibles.length === 0}
              onClick={() => void borrarMarcadas()}
            >
              Eliminar seleccionados{marcadasVisibles.length ? ` (${marcadasVisibles.length})` : ''}
            </button>
          </div>
          <div className={styles.tablaEnvoltorio}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Marcar todos los informes que se ven"
                      checked={todasMarcadas}
                      onChange={marcarTodas}
                    />
                  </th>
                  <th>Fecha</th>
                  <th>Sold To</th>
                  <th>Ship To</th>
                  <th>Posición de muestreo</th>
                  <th>Equipo</th>
                  <th>Informe</th>
                </tr>
              </thead>
              <tbody>
                {cargasFiltradas.slice(0, verTodosInformes ? undefined : 25).map((c) => (
                  <tr key={c.carpeta}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Marcar informe del ${fechaDeCarpeta(c.carpeta)}`}
                        checked={marcadas.has(c.carpeta)}
                        onChange={() => alternar(c.carpeta)}
                      />
                    </td>
                    <td>
                      <button type="button" className={styles.enlaceBoton} onClick={() => setSeleccionada(c.carpeta)}>
                        {fechaDeCarpeta(c.carpeta)}
                      </button>
                    </td>
                    <td>{c.cliente ?? '—'}</td>
                    <td>{c.planta ?? '—'}</td>
                    <td>{c.ubicacion ?? '—'}</td>
                    <td>{c.equipo ? formatearEquipo(c.equipo) : '—'}</td>
                    <td>
                      {c.tiene_pdf ? (
                        <button type="button" className={styles.enlaceBoton} onClick={() => void descargarPdfCarga(c.carpeta)}>
                          Descargar PDF
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.enlaceBoton}
                          disabled={generando === c.carpeta}
                          onClick={() => void generarInforme(c.carpeta)}
                        >
                          {generando === c.carpeta ? 'Generando…' : 'Generar informe'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cargasFiltradas.length > 25 && (
            <div className={styles.tablaFooter}>
              <button type="button" className={styles.botonVerMas} onClick={() => setVerTodosInformes((v) => !v)}>
                {verTodosInformes ? 'Mostrar menos' : 'Ver todos los informes'}
              </button>
            </div>
          )}
        </Card>
        <div className={styles.layout} ref={detalleRef}>
          <Card className={styles.panelLista}>
            <h2 className={styles.tituloPanel}>Cargas</h2>
            <div className={styles.lista}>
              {cargasFiltradas.length === 0 && <p className={styles.listaVacia}>Ningún informe con estos filtros.</p>}
              {cargasFiltradas.map((c) => (
                <div key={c.carpeta} className={styles.itemFila}>
                <button
                  type="button"
                  className={`${styles.itemCarga} ${c.carpeta === seleccionada ? styles.itemActivo : ''} ${c.origen === 'email' ? styles.itemEmail : styles.itemManual}`}
                  onClick={() => setSeleccionada(c.carpeta)}
                >
                  <div className={styles.itemFechaRow}>
                    <span className={styles.itemFecha}>{fechaDeCarpeta(c.carpeta)}</span>
                    <span className={c.origen === 'email' ? styles.badgeEmail : styles.badgeManual}>
                      {c.origen === 'email' ? 'Correo' : 'Manual'}
                    </span>
                  </div>
                  <div className={styles.itemNombre}>
                    {c.equipo
                      ? formatearEquipo(c.equipo)
                      : [c.cliente, c.planta].filter(Boolean).join(' · ') || 'Sin datos del informe'}
                  </div>
                  {(c.cliente || c.planta || c.ubicacion) && c.equipo && (
                    <div className={styles.itemCliente}>
                      {[c.cliente, c.planta, c.ubicacion].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className={styles.itemMetricas}>
                    {c.n_registros.toLocaleString('es-CL')} reg · pH {num(c.ph_promedio)} · {num(c.mv_promedio, 0)} mV
                  </div>
                </button>
                </div>
              ))}
            </div>
          </Card>

          {cargandoDetalle ? (
            <Skeleton />
          ) : detalleVigente ? (
            <div className={styles.detalle}>
              <div className={styles.cabeceraDetalle}>
                <div>
                  <div className={styles.tituloDetalleRow}>
                    <span className={detalleVigente.origen === 'email' ? styles.badgeEmail : styles.badgeManual}>
                      {detalleVigente.origen === 'email' ? 'Ingesta automática' : 'Carga manual'}
                    </span>
                  </div>
                  <h2 className={styles.tituloDetalle}>
                    {detalleVigente.equipo
                      ? formatearEquipo(detalleVigente.equipo)
                      : [detalleVigente.cliente, detalleVigente.planta].filter(Boolean).join(' · ') || 'Carga sin datos del informe'}
                  </h2>
                  <p className={styles.subtituloDetalle}>
                    {[
                      fechaDeCarpeta(detalleVigente.carpeta),
                      detalleVigente.cliente,
                      detalleVigente.planta,
                      detalleVigente.responsable,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className={styles.acciones}>
                  {detalleVigente.tiene_pdf && (
                    <button
                      type="button"
                      className={styles.enlaceBoton}
                      onClick={() => void descargarPdfCarga(detalleVigente.carpeta)}
                    >
                      Descargar informe PDF
                    </button>
                  )}
                  {detalleVigente.archivos.map((nombre) => (
                    <button
                      key={nombre}
                      type="button"
                      className={styles.enlaceBoton}
                      onClick={() => void descargarOriginalCarga(detalleVigente.carpeta, nombre)}
                    >
                      {nombre}
                    </button>
                  ))}
                  <Button variant="ghost" onClick={() => void borrar(detalleVigente.carpeta)}>
                    Eliminar
                  </Button>
                </div>
              </div>

              <div className={styles.tarjetas}>
                <Tarjeta etiqueta="Registros" valor={detalleVigente.filas.length.toLocaleString('es-CL')} />
                <Tarjeta
                  etiqueta="pH promedio"
                  valor={num(detalleVigente.estadisticas?.ph.prom)}
                  detalle={textoEstadistica(detalleVigente.estadisticas?.ph, 2)}
                  color={COLOR_PH}
                />
                <Tarjeta
                  etiqueta="ORP promedio (mV)"
                  valor={num(detalleVigente.estadisticas?.mv.prom, 0)}
                  detalle={textoEstadistica(detalleVigente.estadisticas?.mv, 0)}
                  color={COLOR_MV}
                />
                <Tarjeta
                  etiqueta="Período medido"
                  textual
                  valor={
                    serie.unSoloDia
                      ? (serie.primera?.fecha ?? '—')
                      : `${serie.primera?.fecha ?? '—'} → ${serie.ultima?.fecha ?? '—'}`
                  }
                  detalle={
                    serie.primera && serie.ultima ? `${serie.primera.hora} – ${serie.ultima.hora}` : undefined
                  }
                />
              </div>

              <div className={styles.graficos}>
                <GraficoSerie
                  titulo="pH"
                  nota="Cada punto es una medición del equipo. La línea de puntos marca el límite configurado en el informe."
                  etiquetas={serie.etiquetas}
                  valores={serie.ph}
                  color={COLOR_PH}
                  decimales={2}
                  limiteMin={detalleVigente.limites?.phMin}
                  limiteMax={detalleVigente.limites?.phMax}
                />
                <GraficoSerie
                  titulo="ORP (mV)"
                  nota="En gráfico aparte: el ORP se mide en milivoltios y no comparte escala con el pH."
                  etiquetas={serie.etiquetas}
                  valores={serie.mv}
                  color={COLOR_MV}
                  decimales={0}
                  limiteMin={detalleVigente.limites?.mvMin}
                  limiteMax={detalleVigente.limites?.mvMax}
                />
              </div>

              <Card className={styles.cardTabla}>
                <div className={styles.tablaHeader}>
                  <div>
                    <h3 className={styles.tituloGrafico}>Tabla unificada</h3>
                    <p className={styles.notaGrafico}>
                      Mediciones pareadas pH + ORP por cercanía de hora.
                    </p>
                  </div>
                  <span className={styles.tablaConteo}>
                    {verMasFilas
                      ? detalleVigente.filas.length.toLocaleString('es-CL')
                      : Math.min(15, detalleVigente.filas.length).toLocaleString('es-CL')}{' '}
                    / {detalleVigente.filas.length.toLocaleString('es-CL')} registros
                  </span>
                </div>
                <div className={styles.tablaEnvoltorio}>
                  <table className={styles.tabla}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>pH</th>
                        <th>mV</th>
                        <th>Temp.</th>
                        <th>Desfase</th>
                        <th>Archivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalleVigente.filas.slice(0, verMasFilas ? undefined : 15).map((f, i) => (
                        <tr key={`${f.ts}-${i}`}>
                          <td>{f.fecha}</td>
                          <td>{f.hora}</td>
                          <td>{num(f.ph)}</td>
                          <td>{num(f.mv, 0)}</td>
                          <td>{num(f.temp, 1)}</td>
                          <td>{f.desfase === null ? '—' : `${f.desfase} min`}</td>
                          <td>{f.archivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detalleVigente.filas.length > 15 && (
                  <div className={styles.tablaFooter}>
                    <button
                      type="button"
                      className={styles.botonVerMas}
                      onClick={() => setVerMasFilas((v) => !v)}
                    >
                      {verMasFilas
                        ? 'Mostrar menos'
                        : `Ver los ${(detalleVigente.filas.length - 15).toLocaleString('es-CL')} registros restantes`}
                    </button>
                  </div>
                )}
              </Card>
            </div>
          ) : null}
        </div>
        </>
      )}
    </div>
  )
}
