import { Header } from '@/components/layout/Header'
import { useAuth } from '@/features/auth'
import { modulosPermitidos } from '@/features/usuarios'
import { ModuloCard, useActividadDashboard } from '@/features/dashboard'
import { ConverterPanel, KpiCard, SolicitudesPanel, TracePanel, UsuariosActivos, VerificacionesPanel } from './bloquesAdmin'
import styles from './AdminGeneralDashboardView.module.css'

export function AdminGeneralDashboardView() {
  const { user } = useAuth()
  // Gerencia comparte este panel con el admin general pero NO ve Auditoría
  // interna: las tarjetas salen de lo permitido, no de la lista completa.
  const modulos = user ? modulosPermitidos(user) : []
  const { actividad, status, ultimaActualizacion, refrescar } = useActividadDashboard()
  const cargando = status === 'loading'
  const m = actividad?.metricas

  return (
    <div>
      <Header
        title="Panel general"
        description="Vista en tiempo real de la actividad del sistema. Se actualiza cada 30 segundos."
      />

      {/* Módulos */}
      <div className={styles.grid}>
        {modulos.map((mod, i) => (
          <ModuloCard key={mod.id} modulo={mod} indice={i} />
        ))}
      </div>

      {/* KPIs */}
      <div className={styles.kpis}>
        <KpiCard
          valor={cargando ? '…' : (m?.total_solicitudes ?? 0).toLocaleString('es-CL')}
          etiqueta="Solicitudes en la base"
          sub="registros vigentes"
        />
        <KpiCard
          valor={cargando ? '…' : (m?.esta_semana ?? 0)}
          etiqueta="Ingresadas esta semana"
          sub="últimos 7 días"
          destaca={!cargando && (m?.esta_semana ?? 0) > 0}
        />
        <KpiCard
          valor={cargando ? '…' : (m?.pendientes_converter ?? 0)}
          etiqueta="En cola Converter"
          sub="esperando revisión"
          destaca={!cargando && (m?.pendientes_converter ?? 0) > 0}
        />
        <KpiCard
          valor={cargando ? '…' : (m?.verificacion_hoy ? '✓' : '—')}
          etiqueta="Verificación de hoy"
          sub={m?.verificacion_hoy ? 'registrada' : 'sin registrar'}
          destaca={!cargando && !!m?.verificacion_hoy}
        />
      </div>

      {/* Actualización */}
      <div className={styles.actualizacion}>
        <button type="button" className={styles.refrescarBtn} onClick={refrescar}>
          ↻ Refrescar
        </button>
        {ultimaActualizacion && (
          <span className={styles.timestamp}>
            Actualizado {ultimaActualizacion.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* Fila superior: usuarios + converter + trace */}
      <div className={styles.filas3}>
        <UsuariosActivos usuarios={actividad?.usuarios_activos ?? []} cargando={cargando} />
        <ConverterPanel items={actividad?.converter_recientes ?? []} cargando={cargando} />
        <TracePanel items={actividad?.trace_recientes ?? []} cargando={cargando} />
      </div>

      {/* Fila inferior: solicitudes + verificaciones */}
      <div className={styles.filas2}>
        <SolicitudesPanel items={actividad?.solicitudes_recientes ?? []} cargando={cargando} />
        <VerificacionesPanel items={actividad?.verificaciones_recientes ?? []} cargando={cargando} />
      </div>
    </div>
  )
}
