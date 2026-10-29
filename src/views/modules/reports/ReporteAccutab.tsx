import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { irASeccion } from '@/components/layout/portal/irASeccion'
import { Card } from '@/components/ui/Card'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { IconArchivoPlano, IconClock, IconDatabase, IconTrace } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/Skeleton'
import { AREAS } from '@/constants/areas'
import {
  FILTRO_ACCUTAB_VACIO,
  calcularKpis,
  contarFiltros,
  estadisticaDeFilas,
  fechaDeCarpeta,
  filtrarAccutab,
  nombreEquipo,
} from '@/features/postventa'
import type { CargaTrace, FiltroAccutab, ResumenCargaTrace } from '@/features/postventa'
import { formatDateCL } from '@/lib/locale'
import { DescargasAccutab } from './DescargasAccutab'
import { FiltrosAccutab } from './FiltrosAccutab'
import { GraficoMedicion } from './GraficoMedicion'
import { IconPozoAgua } from './IconosAnalisis'
import { Kpi } from './Kpi'
import estilosReporte from './ReporteView.module.css'
import { CabeceraSeccion } from './SeccionesReport'
import { TarjetaUnica } from './TarjetasAnalisis'
import styles from './ReporteAccutab.module.css'

const ACENTO = AREAS.postventa.colorPrimario
const COLOR_PH = '#1C7FA6'
const COLOR_MV = '#eb6834'
const VISIBLES = 60
const ID_SECCION = 'accutab'

function num(v: number | null | undefined, dec: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function tituloDeCarga(c: Pick<ResumenCargaTrace, 'equipo' | 'planta' | 'cliente'>): string {
  return c.equipo ? nombreEquipo(c.equipo) : [c.cliente, c.planta].filter(Boolean).join(' · ') || 'Equipo Accu-Tab'
}

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className={styles.dato}>
      <span className={styles.datoEtiqueta}>{etiqueta}</span>
      <span className={styles.datoValor}>{valor}</span>
      {detalle && <span className={styles.datoDetalle}>{detalle}</span>}
    </div>
  )
}

/** Un informe: sus cifras (calculadas de sus mediciones) y los gráficos de pH y ORP, cada uno en su escala. Sin tabla: los datos van en el Excel. */
function DetalleCarga({
  resumen,
  verCarga,
  mostrarOrigen,
  acciones,
}: {
  resumen: ResumenCargaTrace
  verCarga: (carpeta: string) => Promise<CargaTrace>
  mostrarOrigen: boolean
  acciones: (carga: CargaTrace | null) => ReactNode
}) {
  const [carga, setCarga] = useState<CargaTrace | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let vigente = true
    verCarga(resumen.carpeta)
      .then((c) => vigente && setCarga(c))
      .catch(() => vigente && setFallo(true))
    return () => {
      vigente = false
    }
  }, [resumen.carpeta, verCarga])

  const vigente = carga?.carpeta === resumen.carpeta ? carga : null
  const datos = useMemo(() => {
    const filas = vigente?.filas ?? []
    const unDia = new Set(filas.map((f) => f.fecha)).size <= 1
    return {
      etiquetas: filas.map((f) => (unDia ? f.hora : `${f.fecha} ${f.hora}`)),
      ph: filas.map((f) => f.ph),
      mv: filas.map((f) => f.mv),
      estPh: estadisticaDeFilas(filas, 'ph'),
      estMv: estadisticaDeFilas(filas, 'mv'),
      primera: filas[0],
      ultima: filas[filas.length - 1],
      unDia,
    }
  }, [vigente])

  return (
    <Card className={styles.detalle} aria-label="Detalle del informe">
      <header className={styles.detalleCabecera}>
        <div className={styles.detalleTitulos}>
          {mostrarOrigen && (
            <span className={resumen.origen === 'email' ? styles.origenCorreo : styles.origenManual}>
              {resumen.origen === 'email' ? 'Ingesta automática' : 'Carga manual'}
            </span>
          )}
          <h3 className={styles.detalleTitulo}>{tituloDeCarga(resumen)}</h3>
          <p className={styles.detalleSub}>
            {[fechaDeCarpeta(resumen.carpeta), resumen.cliente, resumen.planta, resumen.ubicacion].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className={styles.acciones}>{acciones(vigente)}</div>
      </header>

      {fallo ? (
        <p className={styles.error}>No pudimos abrir las mediciones de este informe.</p>
      ) : !vigente ? (
        <Skeleton />
      ) : (
        <>
          <div className={styles.datos}>
            <Dato etiqueta="Registros" valor={vigente.filas.length.toLocaleString('es-CL')} />
            <Dato
              etiqueta="pH promedio"
              valor={num(datos.estPh.prom, 2)}
              detalle={datos.estPh.n ? `mín ${num(datos.estPh.min, 2)} · máx ${num(datos.estPh.max, 2)}` : undefined}
            />
            <Dato
              etiqueta="ORP promedio"
              valor={datos.estMv.n ? `${num(datos.estMv.prom, 0)} mV` : '—'}
              detalle={datos.estMv.n ? `mín ${num(datos.estMv.min, 0)} · máx ${num(datos.estMv.max, 0)}` : undefined}
            />
            <Dato
              etiqueta="Período medido"
              valor={datos.unDia ? (datos.primera?.fecha ?? '—') : `${datos.primera?.fecha ?? '—'} → ${datos.ultima?.fecha ?? '—'}`}
              detalle={datos.primera && datos.ultima ? `${datos.primera.hora} – ${datos.ultima.hora}` : undefined}
            />
          </div>

          <div className={styles.graficos}>
            <GraficoMedicion
              titulo="pH"
              etiquetas={datos.etiquetas}
              valores={datos.ph}
              color={COLOR_PH}
              decimales={2}
              limiteMin={vigente.limites?.phMin}
              limiteMax={vigente.limites?.phMax}
            />
            <GraficoMedicion
              titulo="ORP"
              unidad="mV"
              etiquetas={datos.etiquetas}
              valores={datos.mv}
              color={COLOR_MV}
              decimales={0}
              limiteMin={vigente.limites?.mvMin}
              limiteMax={vigente.limites?.mvMax}
            />
          </div>
          <p className={styles.nota}>pH y ORP van en gráficos separados porque no comparten escala. La línea punteada marca el límite del informe.</p>
        </>
      )}
    </Card>
  )
}

export interface ReporteAccutabProps {
  /** Todos los informes a los que la cuenta tiene acceso (el servidor ya los acota; acá solo se filtra). */
  cargas: ResumenCargaTrace[]
  /** Pide las mediciones de un informe. Tiene que ser estable (useCallback). */
  verCarga: (carpeta: string) => Promise<CargaTrace>
  /** Los botones de cada informe: ver o bajar su PDF, eliminar… */
  /** Recibe las mediciones del informe cuando ya llegaron (para los archivos originales); antes, `null`. */
  accionesDe: (c: ResumenCargaTrace, carga: CargaTrace | null) => ReactNode
  /** El equipo de Post Venta ve de dónde vino cada carga (Trace o correo); el cliente no. */
  mostrarOrigen?: boolean
  /** Lo que va debajo de todo y usa los mismos filtros (la tabla de informes del equipo). */
  pie?: (filtradas: ResumenCargaTrace[]) => ReactNode
  /** Para abrir desde afuera un informe de la lista (la tabla del equipo). Un objeto nuevo en cada pedido. */
  pedida?: { carpeta: string } | null
  /** Un aviso sobre la sección (p. ej. «datos simulados»). */
  aviso?: ReactNode
  error?: string | null
  /** Qué decir cuando todavía no hay ningún informe. */
  vacio?: { titulo: string; descripcion: string }
}

/**
 * El reporte de Accu-Tab, el mismo para el equipo de Post Venta y para el cliente, armado como Report de laboratorio:
 * filtros arriba, cabecera de la sección con sus dos Excel, indicadores, la lista de informes y, del elegido, sus
 * cifras y gráficos de pH y ORP.
 */
export function ReporteAccutab({ cargas, verCarga, accionesDe, mostrarOrigen = false, pedida = null, pie, aviso, error, vacio }: ReporteAccutabProps) {
  const [filtro, setFiltro] = useState<FiltroAccutab>(FILTRO_ACCUTAB_VACIO)
  const [elegida, setElegida] = useState<string | null>(null)
  const [visibles, setVisibles] = useState(VISIBLES)
  const [pedidaVista, setPedidaVista] = useState(pedida)
  if (pedida !== pedidaVista) {
    setPedidaVista(pedida)
    if (pedida) setElegida(pedida.carpeta)
  }
  const filtradas = useMemo(() => filtrarAccutab(cargas, filtro), [cargas, filtro])
  const kpis = useMemo(() => calcularKpis(filtradas), [filtradas])
  // Si el informe elegido queda fuera de los filtros (o aún no se elige uno), se muestra el primero de la lista.
  const actual = filtradas.find((c) => c.carpeta === elegida) ?? filtradas[0] ?? null
  const nFiltros = contarFiltros(filtro)

  return (
    <section className={styles.wrap} style={{ '--acento': ACENTO } as CSSProperties} aria-label="Reporte Accu-Tab">
      {aviso}
      {error && <p className={styles.error}>{error}</p>}

      {cargas.length === 0 ? (
        <EstadoModulo
          etiqueta="Sin informes todavía"
          titulo={vacio?.titulo ?? 'Aún no hay informes disponibles'}
          descripcion={vacio?.descripcion ?? 'Cuando tu equipo Accu-Tab envíe sus mediciones, el informe aparecerá aquí automáticamente.'}
        />
      ) : (
        <>
          <TarjetaUnica
            nombre="Accutab"
            total={kpis.cargas}
            unidad={{ uno: 'informe', varios: 'informes' }}
            icono={IconPozoAgua}
            acento={ACENTO}
            onElegir={() => irASeccion(ID_SECCION)}
          />

          <FiltrosAccutab todas={cargas} filtradas={filtradas} filtro={filtro} onFiltro={(f) => { setFiltro(f); setVisibles(VISIBLES) }} />

          <CabeceraSeccion id={ID_SECCION} titulo="Accutab" numero={1} acento={ACENTO} laboratorios="Equipos Accu-Tab · pH y ORP">
            <DescargasAccutab filtradas={filtradas} verCarga={verCarga} />
          </CabeceraSeccion>

          <div className={estilosReporte.stats}>
            <Kpi icono={<IconArchivoPlano />} etiqueta="Informes" destacado tono={ACENTO} sub={nFiltros > 0 ? `de ${cargas.length.toLocaleString('es-CL')} en total` : 'sin filtros'}>
              <span className={estilosReporte.statNum}>{kpis.cargas.toLocaleString('es-CL')}</span>
            </Kpi>
            <Kpi icono={<IconDatabase />} etiqueta="Mediciones" tono="#4a3aa7" sub="lecturas de pH y ORP">
              <span className={estilosReporte.statNum}>{kpis.mediciones.toLocaleString('es-CL')}</span>
            </Kpi>
            <Kpi icono={<IconTrace />} etiqueta="Equipos" tono="#15627f" sub={`${kpis.clientes} cliente${kpis.clientes === 1 ? '' : 's'}`}>
              <span className={estilosReporte.statNum}>{kpis.equipos.toLocaleString('es-CL')}</span>
            </Kpi>
            <Kpi icono={<IconClock />} etiqueta="Última carga" tono="#16857a" sub={kpis.ultima ? 'fecha de guardado' : undefined}>
              <span className={`${estilosReporte.statNum} ${styles.cifraFecha}`}>{kpis.ultima ? formatDateCL(kpis.ultima) : '—'}</span>
            </Kpi>
          </div>

          {filtradas.length === 0 ? (
            <Card className={styles.vacio}>No hay informes con estos filtros.</Card>
          ) : (
            <div className={styles.cuerpo}>
              <Card className={styles.panelLista}>
                <div className={styles.panelListaInterior}>
                  <h3 className={styles.listaTitulo}>
                    Informes <span>{filtradas.length.toLocaleString('es-CL')}</span>
                  </h3>
                  <ul className={styles.lista}>
                    {filtradas.slice(0, visibles).map((c) => (
                      <li key={c.carpeta}>
                        <button
                          type="button"
                          className={`${styles.item} ${c.carpeta === actual?.carpeta ? styles.itemActivo : ''}`}
                          aria-current={c.carpeta === actual?.carpeta ? 'true' : undefined}
                          onClick={() => setElegida(c.carpeta)}
                        >
                          <span className={styles.itemFila}>
                            <span className={styles.itemFecha}>{fechaDeCarpeta(c.carpeta)}</span>
                            {mostrarOrigen && <span className={c.origen === 'email' ? styles.origenCorreo : styles.origenManual}>{c.origen === 'email' ? 'Correo' : 'Manual'}</span>}
                          </span>
                          <span className={styles.itemNombre}>{tituloDeCarga(c)}</span>
                          <span className={styles.itemDonde}>{[c.cliente, c.planta, c.ubicacion].filter(Boolean).join(' · ')}</span>
                          <span className={styles.itemCifras}>{c.n_registros.toLocaleString('es-CL')} lecturas</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {filtradas.length > visibles && (
                    <button type="button" className={styles.verMas} onClick={() => setVisibles((v) => v + VISIBLES)}>
                      Mostrar más ({(filtradas.length - visibles).toLocaleString('es-CL')} restantes)
                    </button>
                  )}
                </div>
              </Card>
              {actual && (
                <DetalleCarga key={actual.carpeta} resumen={actual} verCarga={verCarga} mostrarOrigen={mostrarOrigen} acciones={(carga) => accionesDe(actual, carga)} />
              )}
            </div>
          )}

          {pie?.(filtradas)}
        </>
      )}
    </section>
  )
}
