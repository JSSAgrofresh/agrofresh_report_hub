import { NavLink } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/cn'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { to: ROUTES.dashboard, label: 'Panel general', end: true },
  { to: ROUTES.reports, label: 'Reportes' },
  { to: ROUTES.samples, label: 'Muestras' },
]

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>AgroFresh Report Hub</div>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
