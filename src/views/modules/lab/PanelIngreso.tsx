import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { buscarPorFolio, cruzarCompleto } from '@/features/emitir'
import type { Solicitud } from '@/features/emitir'
import { Escaner } from './Escaner'
import { FichaEscaneada } from './FichaEscaneada'
import { ModalCruce } from './ModalCruce'
import { TipoMuestraChip } from './TipoMuestraChip'
import styles from './PanelIngreso.module.css'

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
  /** Llamado tras un cruce exitoso para refrescar la lista */
  onCruzado: () => Promise<void>
  onVerFicha: (solicitud: Solicitud) => void
}

export function PanelIngreso({ solicitudes, onCruzado, onVerFicha }: PanelIngresoProps) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [muestra, setMuestra] = useState<string>('')
  const [reinicio, setReinicio] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [mostrarModal, setMostrarModal] = useState(false)

  const listo = Boolean(solicitud && muestra.trim())
  const yaCruzada = solicitud?.codigo_muestra ?? null
  const tipoMuestra = solicitud?.campos['Tipo Muestra'] ?? null
  const resumen = solicitud
    ? RESUMEN.map(([c, etiqueta]) => [etiqueta, solicitud.campos[c]?.trim() || ''] as [string, string]).filter(
        ([, v]) => v !== '',
      )
    : []

  function abrirModal() {
    if (!listo) return
    setError(null)
    setMostrarModal(true)
  }

  async function confirmarCruce(foto: File, peso: number, unidad: string) {
    if (!solicitud || !muestra.trim()) return
    // cruzarCompleto lanza si hay error; el modal lo captura y muestra
    await cruzarCompleto(solicitud.archivo, muestra.trim(), peso, unidad, foto)
    setMostrarModal(false)
    setSolicitud(null)
    setMuestra('')
    setReinicio((n) => n + 1)
    await onCruzado()
  }

  return (
    <div className={styles.panel}>
      {mostrarModal && solicitud && (
        <ModalCruce
          solicitud={solicitud}
          codigoMuestra={muestra.trim()}
          onConfirmar={confirmarCruce}
          onCancelar={() => setMostrarModal(false)}
        />
      )}

      <div className={styles.cajas}>
        <div className={styles.cajaSolicitud}>
          <div className={styles.rotuloFila}>
            <span className={styles.rotulo}>Solicitud</span>
            {tipoMuestra && <TipoMuestraChip tipo={tipoMuestra} compacto />}
          </div>
          <Escaner
            buscar={(t) => buscarPorFolio(solicitudes ?? [], t)}
            onEncontrado={(s) => {
              setSolicitud(s)
              setError(null)
            }}
            onLimpiar={() => setSolicitud(null)}
            placeholder="Escanea el código de barras de la solicitud"
            mensajeNoEncontrado={(c) => `No hay ninguna solicitud con el folio "${c}".`}
            resuelto={Boolean(solicitud)}
            reinicio={reinicio}
            tomarFocoAlReiniciar
            tituloCamara="Escanear código de solicitud"
          />
        </div>

        <div className={styles.cajaMuestra}>
          <span className={styles.rotulo}>N° de muestra</span>
          <Escaner
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
            esperaFinEscaneoMs={80}
            tomarFoco={Boolean(solicitud)}
            tituloCamara="Escanear número de muestra"
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
                ? 'lista para cruzar — se pedirá foto y peso'
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
        <Button onClick={abrirModal} disabled={!listo} className={styles.botonCruzar}>
          Cruzar
        </Button>
        <span className={styles.ayuda}>
          {listo
            ? 'Los dos códigos están leídos. Al cruzar se pedirá la foto y el peso de la muestra.'
            : 'Escanea la solicitud impresa y el número pegado en la muestra.'}
        </span>
      </div>
    </div>
  )
}
