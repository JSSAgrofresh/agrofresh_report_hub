import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { IconAlerta, IconArchivoPlano, IconTrendingUp } from '@/components/ui/icons'
import {
  LABS_RESIDUALES,
  NOMBRE_BLOQUE,
  nombreLaboratorio,
  type ClaveBloque,
  type LabResidual,
} from '@/features/reportes/lib/bloquesAnalisis'
import type { InformeVista } from '@/features/reportes/lib/lineaTiempoInformes'
import { Kpi } from './Kpi'
import { ResultadosPorInforme } from './ResultadosPorInforme'
import estilosReporte from './ReporteView.module.css'
import styles from './SeccionesReport.module.css'

/** La cabecera de un bloque: el nombre del análisis, qué laboratorios lo hacen y, a la derecha, lo que se pueda tocar. */
export function CabeceraSeccion({ bloque, acento, laboratorios, children }: { bloque: ClaveBloque; acento: string; laboratorios: string; children?: ReactNode }) {
  return (
    <header className={styles.cabecera} style={{ '--acento': acento } as CSSProperties}>
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
export function SeccionInformes({ bloque, informes, totalSinFiltros, conFiltros, conGraficos, acento }: PropsInformes) {
  const lab = LAB_DE_BLOQUE[bloque]
  const nombreLab = nombreLaboratorio(lab)
  const { analisis, detecciones } = useMemo(() => {
    const todos = informes.flatMap((i) => i.resultados)
    return { analisis: todos.length, detecciones: todos.filter((r) => r.detectado).length }
  }, [informes])
  const num = (n: number) => n.toLocaleString('es-CL')

  return (
    <section className={styles.seccion} aria-label={NOMBRE_BLOQUE[bloque]}>
      <CabeceraSeccion bloque={bloque} acento={acento} laboratorios={nombreLab}>
        <span className={styles.laboratorio} style={{ '--acento': acento } as CSSProperties}>
          <i className={`${styles.punto} ${styles.encendido}`} aria-hidden="true" />
          {nombreLab}
        </span>
      </CabeceraSeccion>

      {informes.length === 0 ? (
        <Card>
          <p className={styles.vacio}>No hay informes de {nombreLab} con estos filtros.</p>
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
          <ResultadosPorInforme informes={informes} laboratorio={lab} conGraficos={conGraficos} />
        </>
      )}
    </section>
  )
}
