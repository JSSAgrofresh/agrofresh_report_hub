import type { AreaId } from '@/constants/areas'
import { AREAS } from '@/constants/areas'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconClock, IconTrendingUp, IconUpload } from '@/components/ui/icons'
import { AreaHero, ModuloCard, useAreaDashboardSummary } from '@/features/dashboard'
import { modulosPermitidos } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import styles from './AreaDashboardView.module.css'

export function AreaDashboardView({ area, usuario }: { area: AreaId; usuario: Usuario }) {
  const config = AREAS[area]
  const { resumen, status } = useAreaDashboardSummary(area)
  const cargando = status === 'loading'
  const modulos = modulosPermitidos(usuario)

  return (
    <div>
      <AreaHero
        area={config}
        titulo={`Panel de administración · ${config.nombre}`}
        descripcion="Resumen de la operación y acceso a las funciones habilitadas para tu área."
      />

      {modulos.length > 0 && (
        <div className={styles.grid}>
          {modulos.map((m, i) => (
            <ModuloCard key={m.id} modulo={m} indice={i} acento={config.colorPrimario} />
          ))}
        </div>
      )}

      <div className={styles.filas}>
        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>
            <IconTrendingUp className={styles.tituloIcono} style={{ color: config.colorPrimario }} />
            Registros 2026
          </h3>
          {cargando ? (
            <Skeleton style={{ width: '64px', height: '2.2rem' }} />
          ) : (
            <p className={styles.metricaGrande} style={{ color: config.colorOscuro }}>
              {resumen?.totalRegistros2026 ?? 0}
            </p>
          )}
          <p className={styles.nota}>Total acumulado en lo que va del año.</p>
        </Card>

        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>
            <IconClock className={styles.tituloIcono} style={{ color: config.colorPrimario }} />
            Última semana
          </h3>
          {cargando ? (
            <Skeleton style={{ width: '48px', height: '2.2rem' }} />
          ) : (
            <p className={styles.metricaGrande} style={{ color: config.colorOscuro }}>
              {resumen?.registrosUltimaSemana ?? 0}
            </p>
          )}
          <p className={styles.nota}>Registros nuevos en los últimos 7 días.</p>
        </Card>

        <Card className={styles.bloque}>
          <h3 className={styles.tituloBloque}>
            <IconUpload className={styles.tituloIcono} style={{ color: config.colorPrimario }} />
            Reportes enviados
          </h3>
          {cargando ? (
            <div className={styles.skeletonLista}>
              <Skeleton style={{ height: '38px' }} />
              <Skeleton style={{ height: '38px' }} />
            </div>
          ) : resumen && resumen.reportesEnviados.length > 0 ? (
            <ul className={styles.lista}>
              {resumen.reportesEnviados.map((r) => (
                <li key={r.id}>
                  <span className={styles.listaDetalle}>{r.detalle}</span>
                  <span className={styles.listaFecha}>{r.fecha}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.nota}>Sin reportes enviados todavía.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
