import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { MODULOS } from '@/constants/modules'
import { ModuloCard, useDashboardSummary } from '@/features/dashboard'
import styles from './DashboardView.module.css'

export function DashboardView() {
  const { resumen, status } = useDashboardSummary()

  return (
    <div>
      <Header title="Panel general" description="Punto de entrada a los módulos de AgroFresh Report Hub." />

      <div className={styles.grid}>
        {MODULOS.map((m) => (
          <ModuloCard key={m.id} modulo={m} />
        ))}
      </div>

      <div className={styles.filas}>
        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>Pendiente de revisar</h3>
          {status === 'loading' ? (
            <p className={styles.cargando}>Cargando…</p>
          ) : (
            <p className={styles.metricaGrande}>{resumen?.pendientesRevision ?? 0}</p>
          )}
          <p className={styles.nota}>Cargas de Audit a la espera de aprobación.</p>
        </Card>

        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>Últimas cargas</h3>
          {status === 'loading' ? (
            <p className={styles.cargando}>Cargando…</p>
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
          <h3 className={styles.tituloBloque}>Alertas</h3>
          {status === 'loading' ? (
            <p className={styles.cargando}>Cargando…</p>
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
