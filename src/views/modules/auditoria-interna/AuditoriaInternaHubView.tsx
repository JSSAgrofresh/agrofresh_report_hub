import { Header } from '@/components/layout/Header'
import { useAuth } from '@/features/auth'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconAuditoria, IconTrendingUp, IconVerificar } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import tarjetas from '@/components/ui/OpcionCard.module.css'

/** Puerta de entrada del Panel de control interno. Un solo permiso para todas las
 * tarjetas, igual que el hub de AgroFresh Lab. */
export function AuditoriaInternaHubView() {
  const { user } = useAuth()
  // El rendimiento de calidad no se acota a plantas todavía: un comercial no lo ve.
  const veRendimiento = user?.tipoAcceso !== 'comercial'
  return (
    <div>
      <Header
        title="Panel de control interno"
        description="Panel analítico para auditar lo que emitimos y lo que recibimos de los laboratorios."
      />

      <div className={tarjetas.grilla}>
        <OpcionCard
          icono={<IconAuditoria />}
          titulo="Solicitudes e informes"
          descripcion="Cuánto se ha concretado, y los análisis por mes y por semana de Quiteca y Agrofresh, con gráficos por tipo de servicio y por cliente."
          ruta={ROUTES.auditoriaInternaSolicitudes}
        />
        {veRendimiento && (
          <OpcionCard
            icono={<IconVerificar />}
            titulo="Rendimiento de calidad"
            descripcion="Cuántos informes cumplen y cuántos no, por cliente, planta y semana: residuales, FSMA y fitopatología."
            ruta={ROUTES.auditoriaInternaRendimiento}
          />
        )}
        <OpcionCard
          icono={<IconTrendingUp />}
          titulo="Vista de límites"
          descripcion="Resultados contra los límites residuales del laboratorio o contra límites de control (promedio ± N desviaciones)."
          ruta={ROUTES.auditoriaInternaLimiteControl}
        />
      </div>
    </div>
  )
}
