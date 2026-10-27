import { useEffect, useMemo, useState } from 'react'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  FILTRO_CARGAS_VACIO,
  calcularKpis,
  descargarPdfCliente,
  fechaDeCarpeta,
  filtrarCargas,
  listarInformesCliente,
  nombreEquipo,
  opcionesDeCampo,
  verInformeCliente,
  verPdfCliente,
} from '@/features/postventa'
import type { CargaTrace, FiltroCargas, Periodo, ResumenCargaTrace } from '@/features/postventa'
import { formatDateCL } from '@/lib/locale'
import { GraficoMedicion } from './GraficoMedicion'
import styles from './InformesAccutabCliente.module.css'

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'todo', texto: 'Todo' },
  { valor: '365', texto: '12 meses' },
  { valor: '90', texto: '90 días' },
  { valor: '30', texto: '30 días' },
]

const COLOR_PH = '#2f7da3'
const COLOR_MV = '#c8693f'
const FILAS_VISIBLES = 12

function num(v: number | null | undefined, dec: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function Indicador({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className={styles.indicador}>
      <span className={styles.indicadorEtiqueta}>{etiqueta}</span>
      <span className={styles.indicadorValor}>{valor}</span>
      {detalle && <span className={styles.indicadorDetalle}>{detalle}</span>}
    </div>
  )
}

function Selector({
  etiqueta,
  valor,
  opciones,
  vacio,
  formato,
  onCambio,
}: {
  etiqueta: string
  valor: string
  opciones: string[]
  vacio: string
  formato?: (v: string) => string
  onCambio: (v: string) => void
}) {
  // Con una sola opción no hay nada que elegir: el filtro no se dibuja.
  if (opciones.length < 2) return null
  return (
    <label className={styles.campo}>
      <span>{etiqueta}</span>
      <select value={valor} onChange={(e) => onCambio(e.target.value)}>
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {formato ? formato(o) : o}
          </option>
        ))}
      </select>
    </label>
  )
}

function titulo(c: Pick<ResumenCargaTrace, 'equipo' | 'planta' | 'cliente'>): string {
  return c.equipo ? nombreEquipo(c.equipo) : [c.cliente, c.planta].filter(Boolean).join(' · ') || 'Equipo Accu-Tab'
}

/** Detalle de UN informe: lo que dice su PDF, pero a la vista (cifras, gráficos de pH y ORP y la tabla de mediciones). */
function DetalleInforme({ resumen }: { resumen: ResumenCargaTrace }) {
  const [carga, setCarga] = useState<CargaTrace | null>(null)
  const [fallo, setFallo] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  useEffect(() => {
    let vigente = true
    verInformeCliente(resumen.carpeta)
      .then((c) => vigente && setCarga(c))
      .catch(() => vigente && setFallo(true))
    return () => {
      vigente = false
    }
  }, [resumen.carpeta])

  const vigente = carga?.carpeta === resumen.carpeta ? carga : null
  const serie = useMemo(() => {
    const filas = vigente?.filas ?? []
    const unDia = new Set(filas.map((f) => f.fecha)).size <= 1
    return {
      etiquetas: filas.map((f) => (unDia ? f.hora : `${f.fecha} ${f.hora}`)),
      ph: filas.map((f) => f.ph),
      mv: filas.map((f) => f.mv),
      primera: filas[0],
      ultima: filas[filas.length - 1],
      unDia,
    }
  }, [vigente])

  return (
    <section className={styles.detalle} aria-label="Detalle del informe">
      <header className={styles.detalleCabecera}>
        <div>
          <h3 className={styles.detalleTitulo}>{titulo(resumen)}</h3>
          <p className={styles.detalleSub}>
            {[fechaDeCarpeta(resumen.carpeta), resumen.cliente, resumen.planta, resumen.ubicacion].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className={styles.acciones}>
          <button type="button" className={styles.ver} onClick={() => void verPdfCliente(resumen.carpeta)}>
            Ver informe
          </button>
          <button type="button" className={styles.bajar} onClick={() => void descargarPdfCliente(resumen.carpeta)}>
            Descargar PDF
          </button>
        </div>
      </header>

      {fallo ? (
        <p className={styles.error}>No pudimos abrir las mediciones de este informe. El PDF sí está disponible arriba.</p>
      ) : !vigente ? (
        <Skeleton />
      ) : (
        <>
          <div className={styles.indicadores}>
            <Indicador etiqueta="Registros" valor={vigente.filas.length.toLocaleString('es-CL')} />
            <Indicador
              etiqueta="pH promedio"
              valor={num(vigente.estadisticas?.ph.prom, 2)}
              detalle={vigente.estadisticas?.ph.prom != null ? `mín ${num(vigente.estadisticas.ph.min, 2)} · máx ${num(vigente.estadisticas.ph.max, 2)}` : undefined}
            />
            <Indicador
              etiqueta="ORP promedio"
              valor={vigente.estadisticas?.mv.prom != null ? `${num(vigente.estadisticas.mv.prom, 0)} mV` : '—'}
              detalle={vigente.estadisticas?.mv.prom != null ? `mín ${num(vigente.estadisticas.mv.min, 0)} · máx ${num(vigente.estadisticas.mv.max, 0)}` : undefined}
            />
            <Indicador
              etiqueta="Período medido"
              valor={serie.unDia ? (serie.primera?.fecha ?? '—') : `${serie.primera?.fecha ?? '—'} → ${serie.ultima?.fecha ?? '—'}`}
              detalle={serie.primera && serie.ultima ? `${serie.primera.hora} – ${serie.ultima.hora}` : undefined}
            />
          </div>

          <div className={styles.graficos}>
            <GraficoMedicion
              titulo="pH"
              etiquetas={serie.etiquetas}
              valores={serie.ph}
              color={COLOR_PH}
              decimales={2}
              limiteMin={vigente.limites?.phMin}
              limiteMax={vigente.limites?.phMax}
            />
            <GraficoMedicion
              titulo="ORP"
              unidad="mV"
              etiquetas={serie.etiquetas}
              valores={serie.mv}
              color={COLOR_MV}
              decimales={0}
              limiteMin={vigente.limites?.mvMin}
              limiteMax={vigente.limites?.mvMax}
            />
          </div>
          <p className={styles.nota}>pH y ORP van en gráficos separados porque no comparten escala. La línea punteada marca el límite del informe.</p>

          <div className={styles.tablaCabecera}>
            <h4>Mediciones</h4>
            <span>
              {(verTodas ? vigente.filas.length : Math.min(FILAS_VISIBLES, vigente.filas.length)).toLocaleString('es-CL')} /{' '}
              {vigente.filas.length.toLocaleString('es-CL')} registros
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
                </tr>
              </thead>
              <tbody>
                {vigente.filas.slice(0, verTodas ? undefined : FILAS_VISIBLES).map((f, i) => (
                  <tr key={`${f.ts}-${i}`}>
                    <td>{f.fecha}</td>
                    <td>{f.hora}</td>
                    <td>{num(f.ph, 2)}</td>
                    <td>{num(f.mv, 0)}</td>
                    <td>{num(f.temp, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {vigente.filas.length > FILAS_VISIBLES && (
            <button type="button" className={styles.verMas} onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? 'Mostrar menos' : `Ver los ${(vigente.filas.length - FILAS_VISIBLES).toLocaleString('es-CL')} registros restantes`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Portal de cliente: sus informes Accu-Tab con la misma lectura que ve el equipo de Post Venta, en estilo sobrio:
 * filtros, indicadores, la lista de informes y, del elegido, sus cifras, gráficos de pH y ORP y las mediciones.
 * El servidor ya entrega solo lo de esta cuenta; acá solo se filtra y se ordena.
 */
export function InformesAccutabCliente() {
  const [informes, setInformes] = useState<ResumenCargaTrace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroCargas>(FILTRO_CARGAS_VACIO)
  const [elegida, setElegida] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    listarInformesCliente()
      .then((l) => vigente && setInformes(l))
      .catch(() => {
        if (!vigente) return
        setInformes([])
        setError('No pudimos cargar tus informes. Intenta de nuevo en unos minutos.')
      })
    return () => {
      vigente = false
    }
  }, [])

  const todas = useMemo(() => informes ?? [], [informes])
  const filtrados = useMemo(() => filtrarCargas(todas, filtro), [todas, filtro])
  const kpis = useMemo(() => calcularKpis(filtrados), [filtrados])
  // Si el informe elegido queda fuera de los filtros (o aún no hay uno), se muestra el primero de la lista.
  const actual = filtrados.find((c) => c.carpeta === elegida) ?? filtrados[0] ?? null
  const hayFiltros = Boolean(filtro.cliente || filtro.planta || filtro.ubicacion || filtro.equipo || filtro.periodo !== 'todo')

  if (informes === null) return <Skeleton />

  return (
    <section className={styles.wrap} aria-label="Tus informes Accu-Tab">
      <div className={styles.cabecera}>
        <h2 className={styles.titulo}>Tus informes Accu-Tab</h2>
        <p className={styles.nota}>Cada informe resume las mediciones de pH y ORP de tu equipo. Ábrelo para verlo o descárgalo en PDF.</p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {todas.length === 0 && !error ? (
        <EstadoModulo
          etiqueta="Sin informes todavía"
          titulo="Aún no hay informes disponibles"
          descripcion="Cuando tu equipo Accu-Tab envíe sus mediciones, el informe aparecerá aquí automáticamente."
        />
      ) : (
        <>
          <div className={styles.filtros}>
            <Selector etiqueta="Sold To" valor={filtro.cliente} opciones={opcionesDeCampo(todas, 'cliente')} vacio="Todos" onCambio={(v) => setFiltro({ ...filtro, cliente: v })} />
            <Selector etiqueta="Ship To" valor={filtro.planta} opciones={opcionesDeCampo(todas, 'planta')} vacio="Todos" onCambio={(v) => setFiltro({ ...filtro, planta: v })} />
            <Selector etiqueta="Posición de muestreo" valor={filtro.ubicacion} opciones={opcionesDeCampo(todas, 'ubicacion')} vacio="Todas" onCambio={(v) => setFiltro({ ...filtro, ubicacion: v })} />
            <Selector etiqueta="Equipo" valor={filtro.equipo} opciones={opcionesDeCampo(todas, 'equipo')} vacio="Todos" formato={nombreEquipo} onCambio={(v) => setFiltro({ ...filtro, equipo: v })} />
            <div className={styles.campo}>
              <span>Período</span>
              <div className={styles.segmentos} role="group" aria-label="Período">
                {PERIODOS.map((p) => (
                  <button
                    key={p.valor}
                    type="button"
                    aria-pressed={filtro.periodo === p.valor}
                    className={filtro.periodo === p.valor ? styles.segmentoActivo : undefined}
                    onClick={() => setFiltro({ ...filtro, periodo: p.valor })}
                  >
                    {p.texto}
                  </button>
                ))}
              </div>
            </div>
            {hayFiltros && (
              <button type="button" className={styles.limpiar} onClick={() => setFiltro(FILTRO_CARGAS_VACIO)}>
                Limpiar
              </button>
            )}
          </div>

          <div className={styles.indicadores}>
            <Indicador etiqueta="Mediciones" valor={kpis.mediciones.toLocaleString('es-CL')} detalle="lecturas pH + ORP" />
            <Indicador etiqueta="Equipos" valor={kpis.equipos.toLocaleString('es-CL')} detalle={`${filtrados.length.toLocaleString('es-CL')} informe${filtrados.length === 1 ? '' : 's'}`} />
            <Indicador etiqueta="pH promedio" valor={num(kpis.phPromedio, 2)} detalle="ponderado por mediciones" />
            <Indicador etiqueta="ORP promedio" valor={kpis.mvPromedio == null ? '—' : `${num(kpis.mvPromedio, 0)} mV`} detalle="ponderado por mediciones" />
            <Indicador etiqueta="Última carga" valor={kpis.ultima ? formatDateCL(kpis.ultima) : '—'} detalle={kpis.ultima ? 'fecha de guardado' : undefined} />
          </div>

          {filtrados.length === 0 ? (
            <p className={styles.vacio}>No hay informes con estos filtros.</p>
          ) : (
            <div className={styles.cuerpo}>
              <aside className={styles.lista} aria-label="Informes">
                <h3 className={styles.listaTitulo}>Informes</h3>
                <ul>
                  {filtrados.map((c) => (
                    <li key={c.carpeta}>
                      <button
                        type="button"
                        className={`${styles.item} ${c.carpeta === actual?.carpeta ? styles.itemActivo : ''}`}
                        aria-current={c.carpeta === actual?.carpeta ? 'true' : undefined}
                        onClick={() => setElegida(c.carpeta)}
                      >
                        <span className={styles.itemFecha}>{fechaDeCarpeta(c.carpeta)}</span>
                        <span className={styles.itemNombre}>{titulo(c)}</span>
                        <span className={styles.itemDonde}>{[c.cliente, c.planta, c.ubicacion].filter(Boolean).join(' · ')}</span>
                        <span className={styles.itemCifras}>
                          {c.n_registros.toLocaleString('es-CL')} lecturas · pH {num(c.ph_promedio, 2)} · {num(c.mv_promedio, 0)} mV
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
              {actual && <DetalleInforme key={actual.carpeta} resumen={actual} />}
            </div>
          )}
        </>
      )}
    </section>
  )
}
