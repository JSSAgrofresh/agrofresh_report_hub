import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconAlerta, IconClock, IconUpload } from '@/components/ui/icons'
import { MODULOS } from '@/constants/modules'
import { ModuloCard, useDashboardSummary } from '@/features/dashboard'
import styles from './DashboardView.module.css'

export function DashboardView() {
  const { resumen, status } = useDashboardSummary()
  const cargando = status === 'loading'

  return (
    <div>
      <Header title="Panel general" description="Punto de entrada a los módulos de AgroFresh Report Hub." />

      <div className={styles.grid}>
        {MODULOS.map((m, i) => (
          <ModuloCard key={m.id} modulo={m} indice={i} />
        ))}
      </div>

      <div className={styles.filas}>
        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>
            <IconClock className={styles.tituloIcono} />
            Pendiente de revisar
          </h3>
          {cargando ? (
            <Skeleton style={{ width: '48px', height: '2.2rem' }} />
          ) : (
            <p className={styles.metricaGrande}>{resumen?.pendientesRevision ?? 0}</p>
          )}
          <p className={styles.nota}>Cargas de Audit a la espera de aprobación.</p>
        </Card>

        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>
            <IconUpload className={styles.tituloIcono} />
            Últimas cargas
          </h3>
          {cargando ? (
            <div className={styles.skeletonLista}>
              <Skeleton style={{ height: '38px' }} />
              <Skeleton style={{ height: '38px' }} />
              <Skeleton style={{ height: '38px' }} />
            </div>
          ) : resumen && resumen.ultimasCargas.length > 0 ? (
            <ul className={styles.lista}>
              {resumen.ultimasCargas.map((c) => (
                <li key={c.id}>
                  <span className={styles.listaModulo}>{c.modulo}</span>
                  <span className={styles.listaDetalle}>{c.detalle}</span>
                  <span className={styles.listaFecha}>{c.fecha}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.nota}>Sin cargas registradas.</p>
          )}
        </Card>

        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>
            <IconAlerta className={styles.tituloIcono} />
            Alertas
          </h3>
          {cargando ? (
            <Skeleton style={{ height: '38px' }} />
          ) : resumen && resumen.alertas.length > 0 ? (
            <ul className={styles.alertas}>
              {resumen.alertas.map((a) => (
                <li key={a.id} className={a.severidad === 'advertencia' ? styles.alertaAdvertencia : styles.alertaInfo}>
                  <b>{a.modulo}</b> · {a.mensaje}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.nota}>Todo funcionando con normalidad.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
