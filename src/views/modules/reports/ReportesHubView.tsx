import { Header } from '@/components/layout/Header'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { IconEmitir, IconReports, IconTrendingUp } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/features/auth'
import { puedeVerReporte } from '@/features/usuarios'
import styles from '@/components/ui/OpcionCard.module.css'

export function ReportesHubView() {
  const { user } = useAuth()
  // El hub es común a las dos áreas, pero cada tarjeta es de un área: solo se
  // muestra lo que este usuario puede abrir de verdad -si no, la tarjeta
  // llevaría a una pantalla que el guard rebota-.
  const ver = (reporte: 'laboratorio' | 'postventa' | 'emitir') => !!user && puedeVerReporte(user, reporte)
  const alguno = ver('laboratorio') || ver('postventa') || ver('emitir')

  return (
    <div>
      <Header title="Report" description="Elige qué tipo de reporte quieres ver o emitir." />
      {alguno ? (
        <div className={styles.grilla}>
          {ver('laboratorio') && (
            <OpcionCard
              icono={<IconReports />}
              titulo="Reportes de Laboratorio"
              descripcion="Control de residuos: límites residuales y de control en tiempo real desde la base de datos."
              ruta={ROUTES.reportsLaboratorio}
            />
          )}
          {ver('postventa') && (
            <OpcionCard
              icono={<IconTrendingUp />}
              titulo="Reportes de Post Venta"
              descripcion="Histórico de cargas de Trace: pH y ORP de los equipos Accu-Tab, por fecha."
              ruta={ROUTES.reportsPostVenta}
            />
          )}
          {ver('emitir') && (
            <OpcionCard
              icono={<IconEmitir />}
              titulo="Emitir reporte"
              descripcion="Genera un reporte nuevo a partir de resultados de laboratorio, cruzándolos con las solicitudes de análisis."
              ruta={ROUTES.reportsEmitir}
            />
          )}
        </div>
      ) : (
        <EstadoModulo
          etiqueta="Sin reportes disponibles"
          titulo="Tu cuenta no tiene reportes asignados"
          descripcion="Habla con un administrador para que te asigne el área correspondiente."
        />
      )}
    </div>
  )
}
