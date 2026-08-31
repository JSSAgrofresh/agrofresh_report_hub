import { Navigate, Outlet } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'
import { CambiarPassword } from './CambiarPassword'
import styles from './RequireAuth.module.css'

export function RequireAuth() {
  const { user, sincronizando } = useAuth()

  if (!user) return <Navigate to={ROUTES.login} replace />

  // La sesión guardada es una foto: todavía se está confirmando contra el
  // backend que sirve y con qué permisos. Mostrar el sistema mientras tanto
  // dejaría ver, por un instante, pantallas que quizá ya no corresponden.
  if (sincronizando) return <p className={styles.cargando}>Verificando tu sesión…</p>

  // Contraseña puesta por un administrador: la conoce alguien más, así que no
  // se entra a ninguna parte hasta cambiarla.
  if (user.debeCambiarPassword) return <CambiarPassword />

  return <Outlet />
}
