import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { listarActividadLab, urlFotoCruce } from '@/features/emitir'
import type { ActividadLab as ActividadItem } from '@/features/emitir'
import { TipoMuestraChip } from './TipoMuestraChip'
import styles from './ActividadLab.module.css'

const ETIQUETAS_ACCION: Record<string, string> = {
  cruce: 'Cruce',
  anulacion_cruce: 'Anulación de cruce',
  foto_cruce: 'Foto de cruce',
  ingreso_solicitud: 'Ingreso de solicitud',
}

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/Santiago',
    })
  } catch {
    return iso
  }
}

function FilaActividad({ item }: { item: ActividadItem }) {
  const [mostrarFoto, setMostrarFoto] = useState(false)
  const accion = ETIQUETAS_ACCION[item.accion] ?? item.accion
  const tieneFoto = Boolean(item.r2_key_foto && item.archivo)

  return (
    <div className={`${styles.fila} ${item.resultado !== 'ok' ? styles.filaError : ''}`}>
      <div className={styles.encabezadoFila}>
        <span className={styles.accion}>{accion}</span>
        <span className={styles.fecha}>{formatearFecha(item.creado_en)}</span>
      </div>

      <div className={styles.datosGrid}>
        {item.numero_solicitud && (
          <div className={styles.dato}>
            <span className={styles.datoRotulo}>Solicitud</span>
            <span className={styles.datoValor}>{item.numero_solicitud}</span>
          </div>
        )}
        {item.codigo_muestra && (
          <div className={styles.dato}>
            <span className={styles.datoRotulo}>N° muestra</span>
            <span className={`${styles.datoValor} ${styles.mono}`}>{item.codigo_muestra}</span>
          </div>
        )}
        {item.tipo_muestra && (
          <div className={styles.dato}>
            <span className={styles.datoRotulo}>Tipo</span>
            <TipoMuestraChip tipo={item.tipo_muestra} compacto />
          </div>
        )}
        {item.peso_muestra !== null && item.peso_muestra !== undefined && (
          <div className={styles.dato}>
            <span className={styles.datoRotulo}>Peso</span>
            <span className={styles.datoValor}>
              {item.peso_muestra} <span className={styles.unidad}>{item.unidad_peso ?? 'kg'}</span>
            </span>
          </div>
        )}
        {!!item.detalle?.['sold_to'] && (
          <div className={styles.dato}>
            <span className={styles.datoRotulo}>Cliente</span>
            <span className={styles.datoValor}>{String(item.detalle['sold_to'])}</span>
          </div>
        )}
        {!!item.detalle?.['especie'] && (
          <div className={styles.dato}>
            <span className={styles.datoRotulo}>Especie</span>
            <span className={styles.datoValor}>{String(item.detalle['especie'])}</span>
          </div>
        )}
      </div>

      <div className={styles.pieFilas}>
        <span className={styles.usuario} title={item.usuario_email}>
          {item.usuario_nombre}
        </span>
        {tieneFoto && (
          <button
            type="button"
            className={styles.botonFoto}
            onClick={() => setMostrarFoto((v) => !v)}
            aria-expanded={mostrarFoto}
          >
            {mostrarFoto ? 'Ocultar foto' : 'Ver foto'}
          </button>
        )}
        {item.resultado !== 'ok' && item.mensaje && (
          <span className={styles.mensajeError}>{item.mensaje}</span>
        )}
      </div>

      {mostrarFoto && item.archivo && (
        <div className={styles.fotoContainer}>
          <img
            src={urlFotoCruce(item.archivo)}
            alt={`Foto del cruce de ${item.numero_solicitud ?? item.archivo}`}
            className={styles.foto}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Historial de actividad del módulo de ingreso al laboratorio.
 * Se carga bajo demanda para no impactar el tiempo inicial de la pantalla.
 */
export function ActividadLab() {
  const [actividad, setActividad] = useState<ActividadItem[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState(false)
  const [limite] = useState(50)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const items = await listarActividadLab({ limite })
      setActividad(items)
    } catch {
      setError('No se pudo cargar el historial de actividad.')
    } finally {
      setCargando(false)
    }
  }, [limite])

  useEffect(() => {
    if (expandido && actividad === null) {
      void cargar()
    }
  }, [expandido, actividad, cargar])

  return (
    <Card className={styles.seccion}>
      <div className={styles.cabecera}>
        <div>
          <h3 className={styles.titulo}>
            Historial de actividad
          </h3>
          <p className={styles.subtitulo}>
            Registro permanente de cruces, fotos y operaciones del módulo.
          </p>
        </div>
        <div className={styles.acciones}>
          {expandido && (
            <button type="button" className={styles.botonChico} onClick={() => void cargar()} disabled={cargando}>
              {cargando ? 'Actualizando…' : 'Actualizar'}
            </button>
          )}
          <button
            type="button"
            className={styles.botonChico}
            onClick={() => setExpandido((v) => !v)}
          >
            {expandido ? 'Ocultar' : 'Ver historial'}
          </button>
        </div>
      </div>

      {expandido && (
        <div className={styles.contenido}>
          {cargando && <p className={styles.cargando}>Cargando…</p>}
          {error && <p className={styles.errorMsg}>{error}</p>}
          {!cargando && actividad !== null && actividad.length === 0 && (
            <p className={styles.vacio}>No hay actividad registrada todavía.</p>
          )}
          {actividad && actividad.length > 0 && (
            <div className={styles.lista}>
              {actividad.map((item) => (
                <FilaActividad key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
