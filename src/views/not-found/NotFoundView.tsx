import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ROUTES } from '@/constants/routes'
import styles from './NotFoundView.module.css'

export function NotFoundView() {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>404</h1>
      <p className={styles.text}>La página que buscas no existe.</p>
      <Link to={ROUTES.dashboard}>
        <Button variant="secondary">Volver al panel</Button>
      </Link>
    </div>
  )
}
