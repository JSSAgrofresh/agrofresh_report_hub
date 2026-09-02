import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { alPerderSesion, tokenActual } from '@/services/http/sesion'
import { cuentaVigente, login as loginRequest, logout as logoutRequest } from '../api/authApi'
import type { AuthUser } from '../types'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  // v2: la sesión ahora guarda tipoAcceso/área en vez del rol anterior (consulta/carga/aprobación)
  const [user, setUser] = useLocalStorage<AuthUser | null>('agrofresh.sesion.v2', null)
  const [sincronizando, setSincronizando] = useState(() => Boolean(user) && Boolean(tokenActual()))

  const login = useCallback(
    async (email: string, password: string) => {
      setUser(await loginRequest(email, password))
    },
    [setUser],
  )

  const logout = useCallback(async () => {
    await logoutRequest()
    setUser(null)
  }, [setUser])

  // Cuando el backend rechaza el token —venció, lo revocaron, o a la cuenta
  // le cambiaron los permisos— la aplicación tiene que volver al ingreso.
  // Dejar la sesión guardada mostraría pantallas con datos viejos y un error
  // en cada llamada, sin explicar nunca qué pasó.
  useEffect(() => alPerderSesion(() => setUser(null)), [setUser])

  // Lo guardado es una foto tomada al iniciar sesión. Si un administrador
  // cambió el nombre, el área o los permisos, esa foto quedó vieja. Al
  // arrancar se pide la cuenta vigente al backend y se reemplaza.
  //
  // Es también la única forma de saber si el token todavía sirve: mostrar la
  // aplicación y descubrirlo recién en la primera llamada deja ver, por un
  // instante, pantallas que quizá ya no corresponden.
  const yaSincronizado = useRef(false)
  useEffect(() => {
    if (yaSincronizado.current || !user || !tokenActual()) return
    yaSincronizado.current = true
    let vigente = true
    cuentaVigente()
      .then((actual) => {
        if (vigente) setUser(actual)
      })
      // Un 401 ya lo maneja `alPerderSesion`. Cualquier otro fallo es el
      // backend caído, y eso no debe expulsar a nadie: se conserva la foto
      // guardada y se reintenta en la siguiente carga.
      .catch(() => {})
      // Sin condición a propósito. En desarrollo React monta, desmonta y
      // vuelve a montar cada efecto para destapar justo esta clase de error:
      // la limpieza del primer montaje ponía `vigente = false`, y el segundo
      // salía temprano por `yaSincronizado`, así que nadie apagaba la
      // sincronización y la aplicación se quedaba para siempre en
      // "Verificando tu sesión…".
      .finally(() => {
        setSincronizando(false)
      })
    return () => {
      vigente = false
    }
  }, [user, setUser])

  const refrescar = useCallback(async () => {
    setUser(await cuentaVigente())
  }, [setUser])

  const value = useMemo(
    () => ({ user, login, logout, refrescar, sincronizando }),
    [user, login, logout, refrescar, sincronizando],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
