import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarPorFolio } from '@/features/emitir'
import type { Solicitud } from '@/features/emitir'
import styles from './EscanerSolicitud.module.css'

/** Los campos que sirven para confirmar de un vistazo, con la hoja impresa en
 * la mano, que se escaneó la solicitud correcta. El resto está en la ficha. */
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
  /** Ya está en la zona de cruce, para avisar en vez de agregarla dos veces. */
  yaEnCruce: (archivo: string) => boolean
  onEnviarACruce: (solicitud: Solicitud) => void
  onVerFicha: (solicitud: Solicitud) => void
}

/**
 * Lee la solicitud impresa con la pistola de códigos de barras.
 *
 * Un lector USB se comporta como un teclado: "tipea" el folio y manda Enter.
 * Por eso acá no hay nada de hardware —ni drivers, ni permisos, ni una API—,
 * solo un campo que tiene que estar enfocado cuando se dispara. Mantenerlo
 * enfocado solo es responsabilidad de esta caja: si el foco se fuera a
 * cualquier otro input de la pantalla, el folio terminaría escrito ahí.
 */
export function EscanerSolicitud({ solicitudes, yaEnCruce, onEnviarACruce, onVerFicha }: EscanerSolicitudProps) {
  const [texto, setTexto] = useState('')
  const [ultimo, setUltimo] = useState<{ escaneado: string; solicitud: Solicitud | null } | null>(null)
  const [activo, setActivo] = useState(true)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activo) entrada.current?.focus()
  }, [activo])

  const enCruce = ultimo?.solicitud ? yaEnCruce(ultimo.solicitud.archivo) : false

  const resumen = useMemo(() => {
    const s = ultimo?.solicitud
    if (!s) return []
    return RESUMEN.map(([clave, etiqueta]) => [etiqueta, s.campos[clave]?.trim() || ''] as const).filter(
      ([, valor]) => valor !== '',
    )
  }, [ultimo])

  function procesar() {
    const escaneado = texto.trim()
    if (!escaneado) return
    const solicitud = buscarPorFolio(solicitudes ?? [], escaneado)
    setUltimo({ escaneado, solicitud })
    setTexto('')
    // Escanear es el gesto de "esta hoja entra al informe": si la solicitud
    // existe se manda sola a la zona de cruce, así se pueden pasar veinte
    // hojas seguidas sin tocar el mouse. Siempre se puede sacar de ahí.
    if (solicitud && !yaEnCruce(solicitud.archivo)) onEnviarACruce(solicitud)
  }

  return (
    <div className={styles.caja} onClick={() => setActivo(true)}>
      <form
        className={styles.linea}
        onSubmit={(e) => {
          e.preventDefault()
          procesar()
        }}
      >
        <span className={styles.icono} aria-hidden="true">
          ▌▏▌▌▏▌
        </span>
        <input
          ref={entrada}
          className={styles.entrada}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setActivo(true)}
          onBlur={() => setActivo(false)}
          onKeyDown={(e) => {
            // Hay lectores configurados para cerrar con Tab en vez de Enter.
            if (e.key === 'Tab' && texto.trim()) {
              e.preventDefault()
              procesar()
            }
          }}
          placeholder="Escanea el código de barras de la solicitud impresa"
          aria-label="Folio escaneado"
          autoComplete="off"
          spellCheck={false}
        />
        <span className={activo ? styles.listo : styles.dormido}>{activo ? 'Listo para escanear' : 'Haz clic acá'}</span>
      </form>

      {ultimo && !ultimo.solicitud && (
        <p className={styles.noEncontrada}>
          No hay ninguna solicitud con el folio <strong>{ultimo.escaneado}</strong>. Revisa que sea del laboratorio
          AGROFRESH y que esté creada en el sistema.
        </p>
      )}

      {ultimo?.solicitud && (
        <div className={styles.ficha}>
          <div className={styles.fichaCabecera}>
            <strong className={styles.folio}>{ultimo.solicitud.campos['N° Solicitud'] || ultimo.solicitud.archivo}</strong>
            <span className={styles.estado}>{enCruce ? 'ya está en la zona de cruce' : 'enviada a la zona de cruce'}</span>
          </div>
          <dl className={styles.datos}>
            {resumen.map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt>{etiqueta}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.analitos}>
            {ultimo.solicitud.analitos_solicitados.length === 0 ? (
              <span className={styles.sinAnalitos}>Sin analitos solicitados</span>
            ) : (
              ultimo.solicitud.analitos_solicitados.map((a) => (
                <span key={a} className={styles.chip}>
                  {a}
                </span>
              ))
            )}
          </div>
          <button
            type="button"
            className={styles.verFicha}
            // El clic saca el foco del campo; devolverlo acá evita que el
            // siguiente disparo de la pistola se pierda.
            onClick={() => {
              const s = ultimo.solicitud
              if (s) onVerFicha(s)
            }}
          >
            Ver ficha completa
          </button>
        </div>
      )}
    </div>
  )
}
