import { useNavigation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import styles from './LoadingBar.module.css'

export function LoadingBar() {
  const navigation = useNavigation()
  const cargando = navigation.state !== 'idle'

  return <div className={cn(styles.bar, cargando && styles.activa)} aria-hidden="true" />
}
