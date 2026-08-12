export type UserRole = 'consulta' | 'carga' | 'aprobacion'

export interface AuthUser {
  email: string
  nombre: string
  rol: UserRole
}
