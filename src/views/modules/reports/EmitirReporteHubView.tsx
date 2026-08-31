import { Header } from '@/components/layout/Header'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconFrasco } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import styles from '@/components/ui/OpcionCard.module.css'

export function EmitirReporteHubView() {
  return (
    <div>
      <Header
        title="Emitir reporte"
        description="Elige el tipo de reporte que quieres generar."
      />
      <div className={styles.grilla}>
        <OpcionCard
          icono={<IconFrasco />}
          titulo="Reporte análisis cromatografía"
          descripcion="Cruza las solicitudes de análisis con los resultados del GC y arma el registro final."
          ruta={ROUTES.reportsEmitirCromatografia}
        />
      </div>
    </div>
  )
}
