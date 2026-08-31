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
  /** Lo tecleado hasta ahora, para que la tabla de al lado filtre en vivo. */
  onFiltroCambia: (texto: string) => void
  /** Ya está en la zona de cruce, para avisar en vez de agregarla dos veces. */
  yaEnCruce: (archivo: string) => boolean
  onEnviarACruce: (solicitud: Solicitud) => void
  onVerFicha: (solicitud: Solicitud) => void
}

/**
 * Lee la solicitud impresa con la pistola de códigos de barras.
 *
 * Un lector USB se comporta como un teclado: "tipea" el folio y —si está
 * configurado así— manda Enter. Muchos vienen sin ese sufijo, así que acá no
 * se espera ninguna tecla de cierre: se busca en cada carácter que entra, y la
 * solicitud aparece sola apenas el folio está completo. Enter y Tab siguen
 * funcionando para el que prefiera tipear.
 *
 * No hay nada de hardware que manejar —ni drivers, ni permisos, ni una API—,
 * solo un campo que tiene que estar enfocado cuando se dispara. Mantenerlo
 * enfocado es responsabilidad exclusiva de esta caja: si el foco se fuera a
 * cualquier otro input de la pantalla, el folio terminaría escrito ahí.
 */
export function EscanerSolicitud({
  solicitudes,
  onFiltroCambia,
  yaEnCruce,
  onEnviarACruce,
  onVerFicha,
}: EscanerSolicitudProps) {
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

  /** Deja el texto seleccionado para que el próximo disparo lo reemplace en
   * vez de pegarse al anterior: es lo que ya hace el navegador con cualquier
   * campo, y evita tener que acordarse de borrar entre hoja y hoja. */
  function prepararSiguienteDisparo() {
    entrada.current?.select()
  }

  function resolver(valor: string, forzado: boolean) {
    const escaneado = valor.trim()
    if (!escaneado) {
      setUltimo(null)
      return
    }
    const solicitud = buscarPorFolio(solicitudes ?? [], escaneado)
    // Mientras el lector todavía está escribiendo, un folio a medias no
    // encuentra nada: eso no es un error que valga la pena mostrar, solo
    // significa que faltan caracteres. Recién se avisa "no existe" cuando
    // alguien cerró con Enter, que sí es una pregunta terminada.
    if (!solicitud && !forzado) return
    setUltimo({ escaneado, solicitud })
    if (!solicitud) return
    // Escanear es el gesto de "esta hoja entra al informe": si la solicitud
    // existe se manda sola a la zona de cruce, así se pueden pasar veinte
    // hojas seguidas sin tocar el mouse. Siempre se puede sacar de ahí.
    if (!yaEnCruce(solicitud.archivo)) onEnviarACruce(solicitud)
    prepararSiguienteDisparo()
  }

  function alEscribir(valor: string) {
    setTexto(valor)
    onFiltroCambia(valor)
    resolver(valor, false)
  }

  return (
    <div className={styles.caja} onClick={() => setActivo(true)}>
      <form
        className={styles.linea}
        onSubmit={(e) => {
          e.preventDefault()
          resolver(texto, true)
        }}
      >
        <span className={styles.icono} aria-hidden="true">
          ▌▏▌▌▏▌
        </span>
        <input
          ref={entrada}
          className={styles.entrada}
          value={texto}
          onChange={(e) => alEscribir(e.target.value)}
          onFocus={() => setActivo(true)}
          onBlur={() => setActivo(false)}
          onKeyDown={(e) => {
            // Hay lectores configurados para cerrar con Tab en vez de Enter.
            if (e.key === 'Tab' && texto.trim()) {
              e.preventDefault()
              resolver(texto, true)
            }
          }}
          placeholder="Escanea el código de barras de la solicitud impresa"
          aria-label="Folio escaneado"
          autoComplete="off"
          spellCheck={false}
        />
        {texto && (
          <button type="button" className={styles.limpiar} onClick={() => { setTexto(''); onFiltroCambia(''); setUltimo(null) }}>
            Limpiar
          </button>
        )}
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
            <strong className={styles.folio}>
              {ultimo.solicitud.campos['N° Solicitud'] || ultimo.solicitud.archivo}
            </strong>
            <span className={styles.estado}>{enCruce ? 'en la zona de cruce' : 'enviada a la zona de cruce'}</span>
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
