import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { login as loginRequest, logout as logoutRequest } from '../api/authApi'
import type { AuthUser } from '../types'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  // v2: la sesión ahora guarda tipoAcceso/área en vez del rol anterior (consulta/carga/aprobación)
  const [user, setUser] = useLocalStorage<AuthUser | null>('agrofresh.sesion.v2', null)

  const login = useCallback(
    async (email: string, password: string) => {
      const authUser = await loginRequest(email, password)
      setUser(authUser)
    },
    [setUser],
  )

  const logout = useCallback(async () => {
    await logoutRequest()
    setUser(null)
  }, [setUser])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
