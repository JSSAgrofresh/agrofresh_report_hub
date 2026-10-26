import { useCallback, useEffect, useState } from 'react'

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Instalar el sistema como app (Chrome/Android y escritorio). `puede` es verdadero cuando el navegador ofrece
 * instalarla; `instalada` cuando ya se abrió como app. En iPhone no hay aviso: hay que usar «Compartir → Añadir a pantalla de inicio». */
export function useInstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null)
  const [instalada, setInstalada] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches ?? false)

  useEffect(() => {
    const alOfrecer = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar) }
    const alInstalar = () => { setEvento(null); setInstalada(true) }
    window.addEventListener('beforeinstallprompt', alOfrecer)
    window.addEventListener('appinstalled', alInstalar)
    return () => { window.removeEventListener('beforeinstallprompt', alOfrecer); window.removeEventListener('appinstalled', alInstalar) }
  }, [])

  const instalar = useCallback(async () => {
    if (!evento) return
    await evento.prompt()
    const r = await evento.userChoice
    if (r.outcome === 'accepted') setEvento(null)
  }, [evento])

  return { puede: evento !== null, instalada, instalar }
}
