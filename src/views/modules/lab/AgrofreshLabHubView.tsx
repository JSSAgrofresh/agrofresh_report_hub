import { Header } from '@/components/layout/Header'
import { OpcionCard } from '@/components/ui/OpcionCard'
import { IconFrasco, IconVerificar } from '@/components/ui/icons'
import { ROUTES } from '@/constants/routes'
import styles from '@/components/ui/OpcionCard.module.css'

/**
 * AgroFresh Lab dejó de ser una sola pantalla.
 *
 * Lo que había —recibir la muestra, cruzarla con su solicitud y subir el
 * resultado del GC— es ahora «Ingreso al laboratorio», y no cambió nada. Al
 * lado entra «Verificaciones diarias», el control de equipos que se hacía en
 * un Excel con macros.
 *
 * Mismo patrón que el hub de Report: el módulo y su permiso siguen siendo uno
 * solo (`agrofresh_lab`); esto es la puerta de entrada, no una capa nueva de
 * permisos.
 */
export function AgrofreshLabHubView() {
  return (
    <div>
      <Header
        title="AgroFresh Lab"
        description="El laboratorio de cromatografía, de punta a punta: las muestras que entran y los equipos con que se miden."
      />
      <div className={styles.grilla}>
        <OpcionCard
          icono={<IconFrasco />}
          titulo="Ingreso al laboratorio"
          descripcion="Recibe la muestra, crúzala con su solicitud y sube el resultado del GC."
          ruta={ROUTES.agrofreshLabIngreso}
        />
        <OpcionCard
          icono={<IconVerificar />}
          titulo="Verificaciones diarias"
          descripcion="micropipetas, balanza, temperaturas, gases, inyector y detector, con su histórico."
          ruta={ROUTES.agrofreshLabVerificaciones}
        />
      </div>
    </div>
  )
}
