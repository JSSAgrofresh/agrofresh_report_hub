import { buscarPorFolio } from '@/features/emitir'
import type { Solicitud } from '@/features/emitir'
import { Escaner } from './Escaner'
import { FichaEscaneada } from './FichaEscaneada'

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

interface EscanerSolicitudProps {
  solicitudes: Solicitud[] | null
  elegida: Solicitud | null
  onElegir: (solicitud: Solicitud | null) => void
  onFiltroCambia: (texto: string) => void
  /** Verde: el otro lado también está resuelto y el cruce se puede hacer. */
  listo: boolean
  reinicio: number
  onVerFicha: (solicitud: Solicitud) => void
}

/** Lee la solicitud impresa con la pistola de códigos de barras. */
export function EscanerSolicitud({
  solicitudes,
  elegida,
  onElegir,
  onFiltroCambia,
  listo,
  reinicio,
  onVerFicha,
}: EscanerSolicitudProps) {
  const resumen = elegida
    ? RESUMEN.map(([clave, etiqueta]) => [etiqueta, elegida.campos[clave]?.trim() || ''] as [string, string]).filter(
        ([, valor]) => valor !== '',
      )
    : []

  return (
    <>
      <Escaner
        buscar={(texto) => buscarPorFolio(solicitudes ?? [], texto)}
        onEncontrado={onElegir}
        onTexto={onFiltroCambia}
        placeholder="Escanea el código de barras de la solicitud impresa"
        mensajeNoEncontrado={(c) =>
          `No hay ninguna solicitud con el folio “${c}”. Revisa que sea del laboratorio AGROFRESH y que esté creada.`
        }
        resuelto={Boolean(elegida)}
        reinicio={reinicio}
        tomarFocoAlReiniciar
      />

      {elegida && (
        <FichaEscaneada
          titulo={elegida.campos['N° Solicitud'] || elegida.archivo}
          listo={listo}
          estado={listo ? 'lista para cruzar' : 'falta escanear el vial'}
          datos={resumen}
          chips={elegida.analitos_solicitados}
          onQuitar={() => onElegir(null)}
        >
          <button
            type="button"
            style={{
              marginTop: 12, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--color-border-strong)', background: '#fff',
              color: 'var(--color-text-muted)', padding: '4px 9px', borderRadius: 'var(--radius-sm)',
            }}
            onClick={() => onVerFicha(elegida)}
          >
            Ver ficha completa
          </button>
        </FichaEscaneada>
      )}
    </>
  )
}
