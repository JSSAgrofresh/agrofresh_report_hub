import { Header } from '@/components/layout/Header'
import { useAuth } from '@/features/auth'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconAuditoria, IconCarpeta, IconCorreo, IconTrendingUp, IconVerificar } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import tarjetas from '@/components/ui/OpcionCard.module.css'

/** Puerta de entrada del Panel de control interno. Un solo permiso para todas las
 * tarjetas, igual que el hub de AgroFresh Lab. */
export function AuditoriaInternaHubView() {
  const { user } = useAuth()
  // Las carpetas de auditoría, los envíos a clientes y el rendimiento de calidad no se acotan a plantas todavía: un comercial no los ve.
  const veCarpetas = user?.tipoAcceso !== 'comercial'
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
        {veCarpetas && (
          <OpcionCard
            icono={<IconCarpeta />}
            titulo="Carpetas de auditoría"
            descripcion="Los PDF de los informes, ordenados por laboratorio y ship to."
            ruta={ROUTES.auditoriaInternaCarpetas}
          />
        )}
        {veCarpetas && (
          <OpcionCard
            icono={<IconVerificar />}
            titulo="Rendimiento de calidad"
            descripcion="Cuántos informes cumplen y cuántos no, por cliente, planta y semana: residuales, FSMA y fitopatología."
            ruta={ROUTES.auditoriaInternaRendimiento}
          />
        )}
        {veCarpetas && (
          <OpcionCard
            icono={<IconCorreo />}
            titulo="Informes enviados a clientes"
            descripcion="Qué informe salió, a quién, cuándo y quién lo envió, y si fue real, de prueba o marcado a mano."
            ruta={ROUTES.auditoriaInternaEnvios}
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
