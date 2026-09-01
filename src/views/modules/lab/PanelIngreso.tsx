import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { buscarPorFolio } from '@/features/emitir'
import type { Solicitud } from '@/features/emitir'
import { Escaner } from './Escaner'
import { FichaEscaneada } from './FichaEscaneada'
import styles from './PanelIngreso.module.css'

/** Los campos que sirven para confirmar de un vistazo, con la hoja impresa en
 * la mano, que se escaneó la solicitud correcta. */
const RESUMEN: [string, string][] = [
  ['Sold To (Nombre)', 'Cliente'],
  ['Ship To (Nombre)', 'Planta'],
  ['Especie', 'Especie'],
  ['Variedad', 'Variedad'],
  ['Fecha Muestreo', 'Fecha muestreo'],
  ['Tipo Muestra', 'Tipo de muestra'],
  ['Lote', 'Lote'],
  ['N° Cámara', 'N° Cámara'],
  ['Nombre Muestreador', 'Muestreador'],
]

interface PanelIngresoProps {
  solicitudes: Solicitud[] | null
  onCruzar: (solicitud: Solicitud, codigoMuestra: string) => Promise<void>
  onVerFicha: (solicitud: Solicitud) => void
}

/**
 * El mesón de recepción: llega la muestra, se escanea su solicitud y se
 * escanea el número que trae pegado.
 *
 * Los dos escaneos ocurren acá, al recibir, y no al procesar los resultados.
 * Entre una cosa y otra corre el GC y pasa la noche; y como el número de
 * muestra es el mismo código que después trae el archivo del GC, al subir los
 * resultados ya no hay que volver a emparejar nada.
 */
export function PanelIngreso({ solicitudes, onCruzar, onVerFicha }: PanelIngresoProps) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [muestra, setMuestra] = useState<string>('')
  const [reinicio, setReinicio] = useState(0)
  const [cruzando, setCruzando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listo = Boolean(solicitud && muestra.trim())
  const yaCruzada = solicitud?.codigo_muestra ?? null

  const resumen = solicitud
    ? RESUMEN.map(([c, etiqueta]) => [etiqueta, solicitud.campos[c]?.trim() || ''] as [string, string]).filter(
        ([, v]) => v !== '',
      )
    : []

  async function cruzar() {
    if (!solicitud || !muestra.trim()) return
    setCruzando(true)
    setError(null)
    try {
      await onCruzar(solicitud, muestra.trim())
      setSolicitud(null)
      setMuestra('')
      // Vacía las dos cajas y devuelve el foco a la primera: así se puede
      // recibir una muestra tras otra sin tocar el mouse.
      setReinicio((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cruzar.')
    } finally {
      setCruzando(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.cajas}>
        <div className={styles.cajaSolicitud}>
          <span className={styles.rotulo}>Solicitud</span>
          <Escaner
            buscar={(t) => buscarPorFolio(solicitudes ?? [], t)}
            onEncontrado={(s) => {
              setSolicitud(s)
              setError(null)
            }}
            onLimpiar={() => setSolicitud(null)}
            placeholder="Escanea el código de barras de la solicitud"
            mensajeNoEncontrado={(c) => `No hay ninguna solicitud con el folio “${c}”.`}
            resuelto={Boolean(solicitud)}
            reinicio={reinicio}
            tomarFocoAlReiniciar
          />
        </div>

        <div className={styles.cajaMuestra}>
          <span className={styles.rotulo}>N° de muestra</span>
          <Escaner
            // Acá no hay contra qué validar: el número viene pegado en el
            // tubo y el archivo del GC llega recién esa noche. Se acepta lo
            // que se lea, y el sistema avisa si ya está usado en otra.
            buscar={(t) => (t.trim() ? { codigo: t.trim() } : null)}
            onEncontrado={(m) => {
              setMuestra(m.codigo)
              setError(null)
            }}
            onLimpiar={() => setMuestra('')}
            placeholder="Escanea el n° de muestra"
            mensajeNoEncontrado={() => ''}
            resuelto={Boolean(muestra)}
            reinicio={reinicio}
          />
          {muestra && <p className={styles.muestraLeida}>{muestra}</p>}
        </div>
      </div>

      {solicitud && (
        <FichaEscaneada
          titulo={solicitud.campos['N° Solicitud'] || solicitud.archivo}
          listo={listo}
          estado={
            yaCruzada
              ? `ya cruzada con ${yaCruzada} — al cruzar de nuevo se reemplaza`
              : listo
                ? 'lista para cruzar'
                : 'falta escanear el n° de muestra'
          }
          datos={resumen}
          chips={solicitud.analitos_solicitados}
          onQuitar={() => setSolicitud(null)}
        >
          <button type="button" className={styles.verFicha} onClick={() => onVerFicha(solicitud)}>
            Ver ficha completa
          </button>
        </FichaEscaneada>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.acciones}>
        <Button onClick={() => void cruzar()} disabled={!listo || cruzando} className={styles.botonCruzar}>
          {cruzando ? 'Cruzando…' : 'Cruzar'}
        </Button>
        <span className={styles.ayuda}>
          {listo
            ? 'Los dos códigos están leídos. Al cruzar, la solicitud queda esperando su resultado.'
            : 'Escanea la solicitud impresa y el número pegado en la muestra.'}
        </span>
      </div>
    </div>
  )
}
