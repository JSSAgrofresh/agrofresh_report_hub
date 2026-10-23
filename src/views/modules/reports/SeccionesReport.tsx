import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { IconAlerta, IconArchivoPlano, IconTrendingUp } from '@/components/ui/icons'
import {
  ID_BLOQUE,
  LABS_RESIDUALES,
  NOMBRE_BLOQUE,
  nombreLaboratorio,
  type ClaveBloque,
  type LabResidual,
} from '@/features/reportes/lib/bloquesAnalisis'
import type { InformeVista } from '@/features/reportes/lib/lineaTiempoInformes'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import {
  FILTRO_BLOQUE_VACIO,
  LIMITES_NIVEL,
  filtrarBloque,
  nivelesPorAnalito,
  presenciaPorAnalito,
  type EstadoFiltro,
  type FiltroBloque,
} from '@/features/reportes/lib/estadoPatogenos'
import { esPaletaSobria } from '@/lib/paleta'
import { DonasEstado } from './DonasEstado'
import { Kpi } from './Kpi'
import { ResultadosPorInforme } from './ResultadosPorInforme'
import estilosReporte from './ReporteView.module.css'
import { InfoTip } from '@/components/ui/InfoTip'
import styles from './SeccionesReport.module.css'

/** La cabecera de un bloque: el nombre del análisis, qué laboratorios lo hacen y, a la derecha, lo que se pueda tocar. */
export function CabeceraSeccion({
  id,
  bloque,
  numero,
  acento,
  laboratorios,
  children,
}: {
  /** Ancla a la que saltan las tarjetas de análisis de arriba. */
  id?: string
  bloque: ClaveBloque
  /** Número correlativo del bloque, en un círculo en la esquina (solo cuando se ven varios bloques). */
  numero?: number
  acento: string
  laboratorios: string
  children?: ReactNode
}) {
  return (
    <header id={id} className={styles.cabecera} style={{ '--acento': acento } as CSSProperties}>
      {numero != null && (
        <span className={styles.numero} aria-label={`Análisis ${numero}`}>
          {numero}
        </span>
      )}
      <div className={styles.titulo}>
        <h2>{NOMBRE_BLOQUE[bloque]}</h2>
        <span>{laboratorios}</span>
      </div>
      {children}
    </header>
  )
}

/**
 * Los botones «Laboratorio AgroFresh» y «Laboratorio Quiteca» del bloque de residuos. Los dos encendidos = se ven los dos
 * laboratorios; tocar uno deja solo ese. Si el filtro de arriba fijó el laboratorio, el otro queda en gris y tocarlo quita
 * ese filtro.
 */
export function BotonesLabResidual({
  efectivo,
  fijadoPorFiltro,
  acento,
  onTocar,
}: {
  efectivo: LabResidual | ''
  fijadoPorFiltro: boolean
  acento: string
  onTocar: (lab: LabResidual) => void
}) {
  return (
    <div className={styles.botones} style={{ '--acento': acento } as CSSProperties} role="group" aria-label="Laboratorio del análisis de residuos">
      {LABS_RESIDUALES.map((lab) => {
        const encendido = efectivo === '' || efectivo === lab
        return (
          <button
            key={lab}
            type="button"
            aria-pressed={encendido}
            className={`${styles.boton} ${encendido ? styles.encendido : ''} ${fijadoPorFiltro && !encendido ? styles.gris : ''}`}
            title={fijadoPorFiltro && !encendido ? 'Quita el filtro de laboratorio para ver sus datos' : undefined}
            onClick={() => onTocar(lab)}
          >
            <i className={styles.punto} aria-hidden="true" />
            {nombreLaboratorio(lab)}
          </button>
        )
      })}
    </div>
  )
}

interface PropsInformes {
  bloque: 'fsma' | 'fito'
  numero?: number
  informes: InformeVista[]
  /** Informes de ese laboratorio sin ningún filtro, para «de N en total». */
  totalSinFiltros: number
  conFiltros: boolean
  conGraficos: boolean
  acento: string
}

const LAB_DE_BLOQUE = { fsma: 'als', fito: 'diagnofruit' } as const

/**
 * El bloque de ALS (Análisis FSMA) o de Diagnofruit (Análisis de fitopatología): sus tres indicadores y su tabla por
 * informe, con los gráficos si el administrador principal los encendió.
 */
export function SeccionInformes({ bloque, numero, informes: informesDelReporte, totalSinFiltros, conFiltros, conGraficos, acento }: PropsInformes) {
  const lab = LAB_DE_BLOQUE[bloque]
  const nombreLab = nombreLaboratorio(lab)
  // Filtros propios de este análisis (los generales de arriba ya vienen aplicados).
  const [filtroBloque, setFiltroBloque] = useState<FiltroBloque>(FILTRO_BLOQUE_VACIO)
  const analitosDelBloque = useMemo(() => {
    const porCodigo = new Map<string, { nombre: string; orden: number }>()
    informesDelReporte.forEach((i) => i.resultados.forEach((r) => porCodigo.has(r.codigo) || porCodigo.set(r.codigo, { nombre: r.nombre, orden: r.orden })))
    return [...porCodigo.entries()].sort((a, b) => a[1].orden - b[1].orden || a[1].nombre.localeCompare(b[1].nombre, 'es'))
  }, [informesDelReporte])
  const nombreDeCodigo = (codigo: string) => analitosDelBloque.find(([c]) => c === codigo)?.[1].nombre ?? codigo
  const nombresDelBloque = [...new Set(analitosDelBloque.map(([, v]) => v.nombre))]
  const nombresElegidos = filtroBloque.analitos.length ? [...new Set(filtroBloque.analitos.map(nombreDeCodigo))] : nombresDelBloque
  // Un analito puede tener dos códigos (agua y alimento): elegir su nombre elige todos.
  const alElegirAnalitos = (nombres: string[]) =>
    setFiltroBloque((f) => ({
      ...f,
      analitos: nombres.length >= nombresDelBloque.length ? [] : analitosDelBloque.filter(([, v]) => nombres.includes(v.nombre)).map(([c]) => c),
    }))
  const filtrosActivos = filtroBloque.analitos.length > 0 || filtroBloque.estado !== 'todos'
  const informes = useMemo(() => filtrarBloque(informesDelReporte, filtroBloque), [informesDelReporte, filtroBloque])
  // Las tortas cuentan presencia y ausencia: el filtro «Estado» las dejaría en un solo color, así que solo les aplica el de analito.
  const informesParaTortas = useMemo(() => filtrarBloque(informesDelReporte, { analitos: filtroBloque.analitos, estado: 'todos' }), [informesDelReporte, filtroBloque.analitos])
  const tortasPresencia = useMemo(() => presenciaPorAnalito(informesParaTortas, { colorDelAnalito: bloque === 'fito' }), [informesParaTortas, bloque])
  const tortasNivel = useMemo(() => (bloque === 'fito' ? nivelesPorAnalito(informesParaTortas, { colorDelAnalito: true }) : []), [bloque, informesParaTortas])
  const { analisis, detecciones } = useMemo(() => {
    const todos = informes.flatMap((i) => i.resultados)
    return { analisis: todos.length, detecciones: todos.filter((r) => r.detectado).length }
  }, [informes])
  const num = (n: number) => n.toLocaleString('es-CL')

  return (
    <section id={ID_BLOQUE[bloque]} className={styles.seccion} aria-label={NOMBRE_BLOQUE[bloque]}>
      <CabeceraSeccion bloque={bloque} numero={numero} acento={acento} laboratorios={nombreLab}>
        <span className={styles.laboratorio} style={{ '--acento': acento } as CSSProperties}>
          <i className={`${styles.punto} ${styles.encendido}`} aria-hidden="true" />
          {nombreLab}
        </span>
      </CabeceraSeccion>

      {informesDelReporte.length > 0 && (
        <div className={styles.filtrosBloque} role="group" aria-label={`Filtros de ${NOMBRE_BLOQUE[bloque]}`}>
          <span className={styles.filtrosTitulo}>Filtros de este análisis</span>
          <MultiSelectFiltro etiqueta="Analito" opciones={nombresDelBloque} valores={nombresElegidos} onChange={alElegirAnalitos} />
          <label className={styles.estadoFiltro}>
            <span>Estado</span>
            <select value={filtroBloque.estado} onChange={(e) => setFiltroBloque((f) => ({ ...f, estado: e.target.value as EstadoFiltro }))}>
              <option value="todos">Todos</option>
              <option value="detectado">Detectado</option>
              <option value="no_detectado">No detectado</option>
            </select>
          </label>
          {filtrosActivos && (
            <button type="button" className={styles.limpiarBloque} onClick={() => setFiltroBloque(FILTRO_BLOQUE_VACIO)}>
              Quitar filtros
            </button>
          )}
          {bloque === 'fsma' && <InfoTip>Especie y variedad no se aplican aquí: ALS no las informa.</InfoTip>}
        </div>
      )}

      {informes.length === 0 ? (
        <Card>
          <p className={styles.vacio}>
            {informesDelReporte.length > 0 ? 'Ningún informe cumple los filtros de este análisis.' : `No hay informes de ${nombreLab} con estos filtros.`}
          </p>
        </Card>
      ) : (
        <>
          <div className={styles.tarjetas}>
            <Kpi destacado tono={acento} icono={<IconArchivoPlano />} etiqueta="Total de informes de análisis" sub={conFiltros ? `de ${num(totalSinFiltros)} en total` : 'sin filtros'}>
              <span className={estilosReporte.statNum}>{num(informes.length)}</span>
            </Kpi>
            <Kpi tono="#4a3aa7" icono={<IconTrendingUp />} etiqueta="Análisis" sub="resultados medidos">
              <span className={estilosReporte.statNum}>{num(analisis)}</span>
            </Kpi>
            <Kpi tono="#b0271f" icono={<IconAlerta />} etiqueta="Detecciones" sub={`de ${num(analisis)} análisis`}>
              <span className={estilosReporte.statNum}>{num(detecciones)}</span>
            </Kpi>
          </div>
          <DonasEstado
            titulo="Presencia y ausencia"
            ayuda={
              esPaletaSobria()
                ? 'Cuánto de lo analizado está bien. Azul: no detectado (ausencia). Rojo: detectado (presencia). Cada burbuja es el porcentaje de informes.'
                : 'Cuánto de lo analizado está bien. Detectado es malo; no detectado es bueno. El número del centro es el porcentaje no detectado.'
            }
            centro="no detectado"
            donas={tortasPresencia}
            burbujas={esPaletaSobria()}
          />
          {tortasNivel.length > 0 && (
            <DonasEstado
              titulo="Nivel de contaminación"
              ayuda="Cada informe se clasifica según la tabla de límites del laboratorio. El número del centro es el porcentaje en nivel óptimo."
              centro="en nivel óptimo"
              donas={tortasNivel}
              pie={<LimitesNivelTabla />}
            />
          )}
          {/* Primero los gráficos; la tabla por informe va plegada, para quien quiera el detalle. */}
          <ResultadosPorInforme informes={informes} laboratorio={lab} conGraficos={conGraficos} />
        </>
      )}
    </section>
  )
}

/** La tabla de límites de Diagnofruit, plegada bajo las tortas de nivel: Óptimo, Moderado y Peligroso en con/mL. */
function LimitesNivelTabla() {
  const filas = Object.values(LIMITES_NIVEL)
  return (
    <details className={styles.limites}>
      <summary>Ver la tabla de límites</summary>
      <div className={styles.limitesScroll}>
        <table>
          <thead>
            <tr>
              <th scope="col">Nivel de contaminación</th>
              {filas.map((f) => (
                <th key={f.nombre} scope="col">{f.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Óptimo</th>
              {filas.map((f) => (
                <td key={f.nombre}>&lt; {f.optimoMenorQue} con/mL</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Moderado</th>
              {filas.map((f) => (
                <td key={f.nombre}>{f.optimoMenorQue} – {f.moderadoHasta} con/mL</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Peligroso</th>
              {filas.map((f) => (
                <td key={f.nombre}>&gt; {f.moderadoHasta} con/mL</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  )
}
