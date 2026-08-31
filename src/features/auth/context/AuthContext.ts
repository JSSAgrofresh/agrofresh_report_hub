import { createContext } from 'react'
import type { AuthUser } from '../types'

export interface AuthContextValue {
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Vuelve a pedirle la cuenta al backend. Se usa después de cambiar la
   * contraseña, para que la sesión deje de estar marcada como "tiene que
   * cambiarla" sin obligar a entrar de nuevo. */
  refrescar: () => Promise<void>
  /** Todavía se está comprobando contra el backend si la sesión guardada
   * sigue valiendo. Mientras dure, mostrar la aplicación sería mostrar
   * pantallas que quizá ya no corresponden. */
  sincronizando: boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
