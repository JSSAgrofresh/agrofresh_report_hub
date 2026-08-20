import type { ReactNode } from 'react'
import styles from './Header.module.css'

interface HeaderProps {
  title: string
  description?: string
  acciones?: ReactNode
}

export function Header({ title, description, acciones }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.fila}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {acciones && <div className={styles.acciones}>{acciones}</div>}
      </div>
    </header>
  )
}
