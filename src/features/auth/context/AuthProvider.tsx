import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { buscarUsuarioPorEmail } from '@/features/usuarios'
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

  // La sesión guardada es una foto del usuario tomada al iniciar sesión. Si
  // un administrador le cambia el nombre, el área o los permisos, esa foto
  // queda vieja y la persona sigue viendo sus datos anteriores mientras no
  // cierre sesión. Al arrancar se vuelve a pedir la cuenta por su correo y se
  // reemplaza la foto por el dato vigente del backend.
  //
  // El correo es la identidad estable de la cuenta -el id puede no existir en
  // sesiones creadas antes de que el padrón viviera en el backend-, así que
  // la búsqueda va por correo. Si la cuenta ya no existe, se cierra la sesión.
  const emailSesion = user?.email
  const yaSincronizado = useRef<string | null>(null)
  useEffect(() => {
    if (!emailSesion || yaSincronizado.current === emailSesion) return
    yaSincronizado.current = emailSesion
    let vigente = true
    buscarUsuarioPorEmail(emailSesion)
      .then((actual) => {
        if (!vigente) return
        // `undefined` significa que la cuenta fue eliminada: la sesión ya no
        // corresponde a nadie y no debe seguir abierta.
        setUser(actual ?? null)
      })
      // Un backend caído no debe expulsar a nadie: se conserva la sesión
      // guardada y se reintenta en la siguiente carga.
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [emailSesion, setUser])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
