import { useMemo, type CSSProperties, type ReactNode } from 'react'
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
  LIMITES_NIVEL,
  analitosDeInformes,
  filtrarBloque,
  filtrosActivosBloque,
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
  /** Filtros propios de este análisis (analito y estado); viven en «Específicos» de la tarjeta de filtros. */
  filtroBloque: FiltroBloque
  onQuitarFiltroBloque: () => void
  numero?: number
  informes: InformeVista[]
  /** Informes de ese laboratorio sin ningún filtro, para «de N en total». */
  totalSinFiltros: number
  conFiltros: boolean
  conGraficos: boolean
  acento: string
  onVerInforme?: (solicitudId: number, nro: string, fecha: string | null) => void
}

const LAB_DE_BLOQUE = { fsma: 'als', fito: 'diagnofruit' } as const

/**
 * El bloque de ALS (Análisis FSMA) o de Diagnofruit (Análisis de fitopatología): sus tres indicadores y su tabla por
 * informe, con los gráficos si el administrador principal los encendió.
 */
export function SeccionInformes({ bloque, numero, informes: informesDelReporte, totalSinFiltros, conFiltros, conGraficos, acento, filtroBloque, onQuitarFiltroBloque, onVerInforme }: PropsInformes) {
  const lab = LAB_DE_BLOQUE[bloque]
  const nombreLab = nombreLaboratorio(lab)
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

      {filtrosActivosBloque(filtroBloque) && informesDelReporte.length > 0 && (
        <p className={styles.resumenFiltro}>
          Filtrando este análisis por {textoFiltroBloque(filtroBloque)}.{' '}
          <button type="button" className={styles.limpiarBloque} onClick={onQuitarFiltroBloque}>
            Quitar
          </button>
        </p>
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
          <ResultadosPorInforme informes={informes} laboratorio={lab} conGraficos={conGraficos} onVerInforme={onVerInforme} />
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


function textoFiltroBloque(f: FiltroBloque): string {
  const partes: string[] = []
  if (f.analitos.length) partes.push(`${f.analitos.length} ${f.analitos.length === 1 ? 'analito' : 'analitos'}`)
  if (f.estado !== 'todos') partes.push(f.estado === 'detectado' ? 'Detectado' : 'No detectado')
  return partes.join(' y ')
}

/**
 * Los filtros que solo valen para FSMA o fitopatología: el analito (coliformes / Escherichia coli en FSMA; levaduras y
 * hongos en fitopatología) y si salió detectado. Se muestran en «Específicos» cuando ese análisis es el que se está mirando.
 */
export function FiltrosAnalisis({
  bloque,
  informes,
  valor,
  onChange,
}: {
  bloque: 'fsma' | 'fito'
  informes: InformeVista[]
  valor: FiltroBloque
  onChange: (f: FiltroBloque) => void
}) {
  const analitos = useMemo(() => analitosDeInformes(informes), [informes])
  const nombres = [...new Set(analitos.map(([, v]) => v.nombre))]
  const nombreDeCodigo = (codigo: string) => analitos.find(([c]) => c === codigo)?.[1].nombre ?? codigo
  const elegidos = valor.analitos.length ? [...new Set(valor.analitos.map(nombreDeCodigo))] : nombres
  // Un analito puede tener dos códigos (agua y alimento): elegir su nombre elige todos.
  const alElegir = (sel: string[]) =>
    onChange({
      ...valor,
      analitos: sel.length >= nombres.length ? [] : analitos.filter(([, v]) => sel.includes(v.nombre)).map(([c]) => c),
    })
  return (
    <>
      <MultiSelectFiltro etiqueta={bloque === 'fsma' ? 'Analito' : 'Microorganismo'} opciones={nombres} valores={elegidos} onChange={alElegir} />
      <label className={styles.estadoFiltro}>
        <span>Estado</span>
        <select value={valor.estado} onChange={(e) => onChange({ ...valor, estado: e.target.value as EstadoFiltro })}>
          <option value="todos">Todos</option>
          <option value="detectado">Detectado</option>
          <option value="no_detectado">No detectado</option>
        </select>
      </label>
    </>
  )
}
