import { useState } from 'react'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import type { Planta } from '@/features/catalogo'
import { etiquetaServicio, motivoBloqueo, tamanoLegible } from '@/features/envioInformes'
import type { Informe } from '@/features/envioInformes'
import { ListaCorreos } from './ListaCorreos'
import styles from './EnvioInformes.module.css'

interface TarjetaInformeProps {
  informe: Informe
  seleccionado: boolean
  /** Laboratorio y datos leídos del PDF habilitados (solo el administrador principal). */
  desbloqueado: boolean
  clientes: string[]
  plantas: Planta[]
  /** Asunto y texto que da la plantilla para este informe (cuando ya se armó la vista previa). */
  asuntoBase: string
  textoBase: string
  ocupado: boolean
  onSeleccionar: () => void
  onCambio: (parcial: Partial<Informe>) => void
  onDatos: (soldTo: string, shipTo: string, especie: string) => void
  onQuitar: () => void
  onPedirClave: () => void
}

/** Un informe subido: qué se leyó de su PDF, a quién va y, si hace falta, un
 * panel para corregir ESTE correo (la plantilla es una sola para todos). */
export function TarjetaInforme({
  informe, seleccionado, desbloqueado, clientes, plantas, asuntoBase, textoBase, ocupado,
  onSeleccionar, onCambio, onDatos, onQuitar, onPedirClave,
}: TarjetaInformeProps) {
  const [abierto, setAbierto] = useState(false)
  const bloqueo = motivoBloqueo(informe)
  // Si no se pudo leer, la causa (falta pypdf, PDF escaneado…) es más útil que el aviso genérico.
  const aviso = !informe.soldTo && informe.lectura.error ? informe.lectura.error : bloqueo
  const plantasDelCliente = plantas.filter((p) => p.cliente_nombre === informe.soldTo).map((p) => p.nombre)
  const leido = !!informe.soldTo && !!informe.shipTo
  const editado = informe.asunto !== null || informe.cuerpo !== null

  function alternar() {
    if (!abierto) onSeleccionar()
    setAbierto(!abierto)
  }

  const estado =
    informe.estado === 'enviado' ? { texto: 'Enviado', clase: styles.estadoOk }
    : informe.estado === 'enviando' ? { texto: 'Enviando…', clase: styles.estadoPrueba }
    : informe.estado === 'error' ? { texto: 'Falló', clase: styles.estadoError }
    : bloqueo ? { texto: 'Falta revisar', clase: styles.estadoPrueba }
    : { texto: `${informe.para.length} ${informe.para.length === 1 ? 'destinatario' : 'destinatarios'}`, clase: styles.estadoOk }

  return (
    <li className={`${styles.informe} ${seleccionado ? styles.informeSeleccionado : ''}`}>
      <div className={styles.informeFila}>
        <button type="button" className={styles.informeCuerpo} onClick={onSeleccionar} aria-pressed={seleccionado}>
          <span className={styles.archivoTipo}>PDF</span>
          <span className={styles.informeTextos}>
            <span className={styles.archivoNombre}>{informe.archivo.name}</span>
            <span className={styles.informeLectura}>
              {leido
                ? `${informe.soldTo} · ${informe.shipTo}${informe.especie ? ` · ${informe.especie}` : ''} · ${etiquetaServicio(informe.servicio)}`
                : 'No se pudo leer el Sold To y el Ship To'}
              {' · '}{tamanoLegible(informe.archivo.size)}
            </span>
          </span>
        </button>
        <span className={`${styles.estado} ${estado.clase}`}>{estado.texto}</span>
        <div className={styles.informeAcciones}>
          <button type="button" className={styles.enlace} onClick={alternar} disabled={ocupado} aria-expanded={abierto}>
            {abierto ? 'Cerrar' : editado ? 'Editado · ver' : 'Editar este correo'}
          </button>
          <button
            type="button"
            className={styles.chipQuitar}
            onClick={onQuitar}
            disabled={ocupado}
            aria-label={`Quitar ${informe.archivo.name}`}
          >
            ×
          </button>
        </div>
      </div>

      {aviso && informe.estado !== 'enviado' && <p className={styles.informeAviso}>{aviso}</p>}
      {informe.estado === 'error' && informe.mensaje && <p className={styles.informeError}>{informe.mensaje}</p>}
      {informe.estado === 'enviado' && informe.mensaje && <p className={styles.informeOk}>{informe.mensaje}</p>}

      {abierto && (
        <div className={styles.informePanel}>
          <p className={styles.ayudaCampo}>
            Los cambios valen solo para este informe. La plantilla de los demás no se toca.
          </p>
          <ListaCorreos etiqueta="Para" valor={informe.para} onChange={(para) => onCambio({ para })} alerta={informe.para.length === 0} />
          <ListaCorreos etiqueta="Copia (CC)" valor={informe.cc} onChange={(cc) => onCambio({ cc })} />
          <ListaCorreos etiqueta="Copia oculta (CCO)" valor={informe.bcc} onChange={(bcc) => onCambio({ bcc })} />
          <label className={styles.campoTexto}>
            <span>Asunto</span>
            <input
              value={informe.asunto ?? asuntoBase}
              disabled={!asuntoBase && informe.asunto === null}
              onChange={(e) => onCambio({ asunto: e.target.value })}
            />
          </label>
          <label className={styles.campoTexto}>
            <span>Texto del correo</span>
            <textarea
              rows={8}
              value={informe.cuerpo ?? textoBase}
              disabled={!textoBase && informe.cuerpo === null}
              onChange={(e) => onCambio({ cuerpo: e.target.value })}
            />
          </label>
          {editado && (
            <button type="button" className={styles.enlace} onClick={() => onCambio({ asunto: null, cuerpo: null })}>
              Volver a la plantilla
            </button>
          )}

          <div className={styles.datosLeidos}>
            <div className={styles.datosLeidosCabecera}>
              <span className={styles.etiquetaCampo}>Datos leídos del informe</span>
              {desbloqueado ? (
                <span className={styles.guardado}>Edición habilitada</span>
              ) : (
                <button type="button" className={styles.enlace} onClick={onPedirClave}>
                  Habilitar con clave
                </button>
              )}
            </div>
            <div className={styles.rejilla}>
              <BuscableSelect
                etiqueta="Sold To"
                opciones={clientes}
                valor={informe.soldTo}
                onChange={(v) => onDatos(v, '', informe.especie)}
                placeholderTodos="— sin dato —"
                disabled={!desbloqueado}
              />
              <BuscableSelect
                etiqueta="Ship To"
                opciones={plantasDelCliente}
                valor={informe.shipTo}
                onChange={(v) => onDatos(informe.soldTo, v, informe.especie)}
                placeholderTodos="— sin dato —"
                disabled={!desbloqueado || !informe.soldTo}
              />
              <label className={styles.campoTexto}>
                <span>Especie</span>
                <input
                  value={informe.especie}
                  disabled={!desbloqueado}
                  onChange={(e) => onDatos(informe.soldTo, informe.shipTo, e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
