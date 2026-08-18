import { useEffect, useRef } from 'react'

/** Horas del día en que Report debe refrescarse solo, sin intervención del usuario. */
export const HORAS_PROGRAMADAS = [8, 12, 16, 20]

/** Próxima hora programada (08:00 / 12:00 / 16:00 / 20:00) después de `desde`.
 * Si ya pasaron todas las de hoy, salta a las 08:00 del día siguiente. */
export function proximaHoraProgramada(desde: Date): Date {
  for (const hora of HORAS_PROGRAMADAS) {
    const candidato = new Date(desde)
    candidato.setHours(hora, 0, 0, 0)
    if (candidato > desde) return candidato
  }
  const manana = new Date(desde)
  manana.setDate(manana.getDate() + 1)
  manana.setHours(HORAS_PROGRAMADAS[0], 0, 0, 0)
  return manana
}

/** Llama a `onActualizar` automáticamente en cada hora programada. El botón manual de
 * "Actualizar" es independiente de esto: refresca al tiro sin alterar la próxima hora agendada. */
export function useActualizacionProgramada(onActualizar: () => void) {
  const callbackRef = useRef(onActualizar)

  useEffect(() => {
    callbackRef.current = onActualizar
  })

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    function agendar() {
      const espera = proximaHoraProgramada(new Date()).getTime() - Date.now()
      timeoutId = setTimeout(() => {
        callbackRef.current()
        agendar()
      }, espera)
    }

    agendar()
    return () => clearTimeout(timeoutId)
  }, [])
}
