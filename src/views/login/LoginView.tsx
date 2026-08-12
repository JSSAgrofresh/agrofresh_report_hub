import { useNavigate } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { LoginForm } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import styles from './LoginView.module.css'

export function LoginView() {
  const navigate = useNavigate()

  return (
    <div className={styles.pantalla}>
      <div className={styles.tarjeta}>
        <img src={agrofreshLogo} alt="AgroFresh" className={styles.logo} />
        <div className={styles.encabezado}>
          <h1>Report Hub</h1>
          <p>Plataforma interna de trazabilidad y análisis de laboratorio.</p>
        </div>
        <LoginForm onSuccess={() => navigate(ROUTES.dashboard, { replace: true })} />
      </div>
    </div>
  )
}
