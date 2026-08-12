import { useNavigate } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { LoginForm } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import styles from './LoginView.module.css'

export function LoginView() {
  const navigate = useNavigate()

  return (
    <div className={styles.pantalla}>
      <div className={styles.marca}>
        <img src={agrofreshLogo} alt="AgroFresh" className={styles.logoMarca} />
        <div className={styles.marcaTexto}>
          <h1>Report Hub</h1>
          <p>Plataforma interna de trazabilidad y análisis de residuos de pesticidas en fruta.</p>
        </div>
        <ul className={styles.marcaLista}>
          <li>Trazabilidad de registros pH/ORP</li>
          <li>Homogenización de informes de laboratorio</li>
          <li>Cola de aprobación para cargas de datos</li>
        </ul>
      </div>

      <div className={styles.panelForm}>
        <div className={styles.tarjeta}>
          <img src={agrofreshLogo} alt="AgroFresh" className={styles.logoTarjeta} />
          <div className={styles.encabezado}>
            <h2>Ingresa a tu cuenta</h2>
            <p>Usa tu correo corporativo de AgroFresh.</p>
          </div>
          <LoginForm onSuccess={() => navigate(ROUTES.dashboard, { replace: true })} />
        </div>
      </div>
    </div>
  )
}
