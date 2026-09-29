import { Link } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconAuditoria, IconCarpeta, IconTrendingUp } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import { totales, useSolicitudesAuditoria } from '@/features/auditoriaInterna'
import { ESTADOS, ORDEN_ESTADOS } from './estados'
import tarjetas from '@/components/ui/OpcionCard.module.css'
import styles from './AuditoriaInternaHubView.module.css'

const nf = new Intl.NumberFormat('es-CL')

/** Puerta de entrada de Auditoría interna, con el pulso del panel a la vista:
 * antes de abrir nada, ya se sabe cuánto falta. Un solo permiso para las tres
 * tarjetas, igual que el hub de AgroFresh Lab. */
export function AuditoriaInternaHubView() {
  const { datos, error } = useSolicitudesAuditoria()
  const t = datos ? totales(datos) : null

  return (
    <div>
      <Header
        title="Auditoría Interna"
        description="Panel analítico para auditar lo que emitimos y lo que recibimos de los laboratorios."
      />

      {!error && (
        <Link to={ROUTES.auditoriaInternaSolicitudes} className={styles.pulso} aria-label="Ver el detalle de solicitudes e informes">
          {t ? (
            <>
              <div className={styles.principal}>
                <span className={styles.etiqueta}>Solicitudes concretadas</span>
                <span className={styles.cifra}>{Math.round(t.porcentajeConcretado)}<small>%</small></span>
                <span className={styles.sub}>{nf.format(t.concretadas)} de {nf.format(t.emitidas)} emitidas</span>
              </div>
              <div className={styles.detalle}>
                <div className={styles.barra} role="img" aria-label="Estado de las solicitudes emitidas">
                  {ORDEN_ESTADOS.map((e) => {
                    const n = e === 'concretada' ? t.concretadas : e === 'sin_report' ? t.sinReport : t.pendientes
                    return n > 0 ? <span key={e} style={{ flexGrow: n, background: ESTADOS[e].color }} /> : null
                  })}
                </div>
                <ul className={styles.leyenda}>
                  {ORDEN_ESTADOS.map((e) => (
                    <li key={e}>
                      <i style={{ background: ESTADOS[e].color }} />
                      <b>{nf.format(e === 'concretada' ? t.concretadas : e === 'sin_report' ? t.sinReport : t.pendientes)}</b>
                      {ESTADOS[e].texto}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className={styles.carga} aria-busy="true">
              <Skeleton style={{ width: 120, height: 48 }} />
              <Skeleton style={{ flex: 1, height: 12 }} />
            </div>
          )}
        </Link>
      )}

      <div className={tarjetas.grilla}>
        <OpcionCard
          icono={<IconAuditoria />}
          titulo="Solicitudes e informes"
          descripcion="Qué solicitudes emitimos, cuáles ya tienen su informe y están en Report, con los gráficos por laboratorio y por cliente."
          ruta={ROUTES.auditoriaInternaSolicitudes}
        />
        <OpcionCard
          icono={<IconCarpeta />}
          titulo="Carpetas de auditoría"
          descripcion="Los PDF de los informes, ordenados por laboratorio y ship to."
          ruta={ROUTES.auditoriaInternaCarpetas}
        />
        <OpcionCard
          icono={<IconTrendingUp />}
          titulo="Vista por límite de control"
          descripcion="Límites dinámicos (promedio ± N desviaciones) sobre los resultados de la base."
          ruta={ROUTES.auditoriaInternaLimiteControl}
        />
      </div>
    </div>
  )
}
