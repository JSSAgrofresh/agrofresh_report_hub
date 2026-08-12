import agrofreshLogo from '@/assets/agrofresh-logo.png'
import styles from './MobileTopbar.module.css'

export function MobileTopbar({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  return (
    <div className={styles.bar}>
      <button className={styles.hamburguesa} onClick={onAbrirMenu} aria-label="Abrir menú">
        <span />
        <span />
        <span />
      </button>
      <img src={agrofreshLogo} alt="AgroFresh" className={styles.logo} />
    </div>
  )
}
