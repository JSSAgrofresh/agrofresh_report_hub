import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return <button className={cn(styles.button, styles[variant], className)} {...props} />
}
