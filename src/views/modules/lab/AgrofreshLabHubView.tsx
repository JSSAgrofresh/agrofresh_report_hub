import { Header } from '@/components/layout/Header'
import { useAuth } from '@/features/auth'
import { puedeVerSeccionLab } from '@/features/usuarios'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconCorreo, IconFrasco, IconVerificar } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import styles from '@/components/ui/OpcionCard.module.css'

/**
 * AgroFresh Lab dejó de ser una sola pantalla.
 *
 * Lo que había —recibir la muestra, cruzarla con su solicitud y subir el
 * resultado del GC— es ahora «Ingreso al laboratorio», y no cambió nada. Al
 * lado entra «Verificaciones diarias», el control de equipos que se hacía en
 * un Excel con macros, y «Envío de informes», donde se mandan a los clientes
 * los PDF que entrega el laboratorio.
 *
 * Mismo patrón que el hub de Report: el módulo y su permiso siguen siendo uno
 * solo (`agrofresh_lab`). El administrador general puede dejar a una cuenta con
 * solo algunas de las tres puertas (Usuarios → «Secciones de AgroFresh Lab»):
 * acá se muestran solo las suyas.
 */
export function AgrofreshLabHubView() {
  const { user } = useAuth()
  const ve = (s: Parameters<typeof puedeVerSeccionLab>[1]) => !user || puedeVerSeccionLab(user, s)
  return (
    <div>
      <Header
        title="AgroFresh Lab"
        description="El laboratorio de cromatografía, de punta a punta: las muestras que entran y los equipos con que se miden."
      />
      <div className={styles.grilla}>
        {ve('lab_ingreso') && (
          <OpcionCard
            icono={<IconFrasco />}
            titulo="Ingreso al laboratorio"
            descripcion="Recibe la muestra, crúzala con su solicitud y sube el resultado del GC."
            ruta={ROUTES.agrofreshLabIngreso}
          />
        )}
        {ve('lab_verificaciones') && (
          <OpcionCard
            icono={<IconVerificar />}
            titulo="Verificaciones diarias"
            descripcion="micropipetas, balanza, temperaturas, gases, inyector y detector, con su histórico."
            ruta={ROUTES.agrofreshLabVerificaciones}
          />
        )}
        {ve('lab_envio') && (
          <OpcionCard
            icono={<IconCorreo />}
            titulo="Envío de informes"
            descripcion="Sube el PDF del laboratorio, elige Sold To y Ship To y envíalo a la lista de distribución del cliente."
            ruta={ROUTES.agrofreshLabEnvioInformes}
          />
        )}
      </div>
    </div>
  )
}
