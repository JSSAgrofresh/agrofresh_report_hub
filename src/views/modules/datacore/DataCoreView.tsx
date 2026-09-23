import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { descargarExportacion } from '@/features/auditoria'
import { ChequeoListadosPanel } from './ChequeoListadosPanel'
import { ErDiagrama } from './ErDiagrama'
import { HomogenizarPanel } from './HomogenizarPanel'
import { HomogenizadorIngestPanel } from './HomogenizadorIngestPanel'
import { PendientesSinInformePanel } from './PendientesSinInformePanel'
import styles from './DataCoreView.module.css'

export type Vista = 'cargar' | 'modelo' | 'homogenizar' | 'sin_informe' | 'chequeo_listados'

interface DataCoreViewProps {
  vistaInicial?: Vista
}

export function DataCoreView({ vistaInicial = 'cargar' }: DataCoreViewProps = {}) {
  const [vista, setVista] = useState<Vista>(vistaInicial)

  return (
    <div>
      <Header
        title="Data Core"
        description="Carga de datos, homogeneización y exploración de la base de datos."
      />
      <Card className={styles.banner}>
        <div>
          <b>Data Core</b>
          <span> Carga, homogeneiza y audita los datos del sistema.</span>
        </div>
        <div className={styles.bannerAcciones}>
          <button type="button" className={styles.exportar} onClick={() => void descargarExportacion()}>
            Descargar base en Excel
          </button>
        </div>
      </Card>

      <nav className={styles.tabs}>
        <button className={vista === 'cargar' ? styles.tabActiva : ''} onClick={() => setVista('cargar')}>
          Cargar datos
        </button>
        <button className={vista === 'homogenizar' ? styles.tabActiva : ''} onClick={() => setVista('homogenizar')}>
          Homogeneizar datos
        </button>
        <button className={vista === 'chequeo_listados' ? styles.tabActiva : ''} onClick={() => setVista('chequeo_listados')}>
          Chequeo de integridad
        </button>
        <button className={vista === 'sin_informe' ? styles.tabActiva : ''} onClick={() => setVista('sin_informe')}>
          Filas sin N° Informe
        </button>
        <button className={vista === 'modelo' ? styles.tabActiva : ''} onClick={() => setVista('modelo')}>
          Modelo entidad-relación
        </button>
      </nav>

      {vista === 'cargar' && <Card><HomogenizadorIngestPanel /></Card>}
      {vista === 'homogenizar' && <HomogenizarPanel />}
      {vista === 'chequeo_listados' && <ChequeoListadosPanel />}
      {vista === 'sin_informe' && <PendientesSinInformePanel />}
      {vista === 'modelo' && <Card><ErDiagrama /></Card>}
    </div>
  )
}
