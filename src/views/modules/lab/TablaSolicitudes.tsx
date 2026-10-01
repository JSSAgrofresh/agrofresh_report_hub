import { useMemo, useState } from 'react'
import { descargarExcelConMuestra, filtrarPorFolio } from '@/features/emitir'
import { descargarPdfsZip } from '@/features/tomaMuestras'
import { Modal } from '@/components/ui/Modal'
import { guardarBlob } from '@/services/http/descargar'
import type { Solicitud } from '@/features/emitir'
import { TipoMuestraChip } from './TipoMuestraChip'
import styles from './TablaSolicitudes.module.css'


/** El backend entrega la recepción como "YYYY-MM-DD"; en el mesón se lee
 * al derecho. Sin cruce todavía no hay recepción que mostrar. */
function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [anio, mes, dia] = iso.split('-')
  return dia ? `${dia}-${mes}-${anio}` : iso
}

/** Lo máximo que acepta el backend en un solo .zip (`MAX_PDF_ZIP`). */
const PDFS_POR_ZIP = 200

type Filtro = 'todas' | 'cruzadas' | 'pendientes'


const ETIQUETA: Record<Filtro, string> = {
  todas: 'Todas',
  cruzadas: 'Con muestra',
  pendientes: 'Sin muestra',
}


interface TablaSolicitudesProps {
  solicitudes: Solicitud[] | null
  onVerFicha: (solicitud: Solicitud) => void
  onQuitarCruce: (solicitud: Solicitud) => void
}


/**
 * Todas las solicitudes de AGROFRESH y en qué estado está cada una.
 *
 * El color es la información principal: verde significa que la muestra ya
 * llegó y está esperando su resultado; blanca, que todavía no. Con eso se ve
 * de un vistazo qué falta por recibir, sin leer ninguna columna.
 */
export function TablaSolicitudes({ solicitudes, onVerFicha, onQuitarCruce }: TablaSolicitudesProps) {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [buscar, setBuscar] = useState('')
  const [dialogoPdf, setDialogoPdf] = useState(false)
  const [bajandoPdf, setBajandoPdf] = useState(false)


  const cruzadas = useMemo(
    () => (solicitudes ?? []).filter((s) => s.codigo_muestra).length,
    [solicitudes],
  )


  async function descargarConMuestra() {
    const solicitudesCruzadas = (solicitudes ?? []).filter((s) => s.codigo_muestra)
    try {
      guardarBlob(await descargarExcelConMuestra(solicitudesCruzadas), 'solicitudes_con_muestra.xlsx')
    } catch {
      alert('No se pudo generar el Excel. Intenta de nuevo.')
    }
  }


  const sinCruzar = useMemo(
    () => (solicitudes ?? []).filter((s) => !s.codigo_muestra),
    [solicitudes],
  )

  /** Los PDF de la solicitud de análisis, en uno o más .zip (el backend acepta
   * hasta `PDFS_POR_ZIP` por vez). */
  async function descargarPdfs(lista: Solicitud[]) {
    setBajandoPdf(true)
    try {
      const archivos = lista.map((s) => s.archivo)
      for (let i = 0; i < archivos.length; i += PDFS_POR_ZIP) {
        await descargarPdfsZip(archivos.slice(i, i + PDFS_POR_ZIP))
      }
      setDialogoPdf(false)
    } catch {
      alert('No se pudieron generar los PDF. Intenta de nuevo.')
    } finally {
      setBajandoPdf(false)
    }
  }

  const visibles = useMemo(() => {
    let lista = filtrarPorFolio(solicitudes ?? [], buscar)
    if (filtro === 'cruzadas') lista = lista.filter((s) => s.codigo_muestra)
    if (filtro === 'pendientes') lista = lista.filter((s) => !s.codigo_muestra)
    return lista
  }, [solicitudes, buscar, filtro])


  return (
    <>
      <div className={styles.barra}>
        <div className={styles.filtros} role="tablist">
          {(Object.keys(ETIQUETA) as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filtro === f}
              className={filtro === f ? styles.filtroActivo : styles.filtro}
              onClick={() => setFiltro(f)}
            >
              {ETIQUETA[f]}
            </button>
          ))}
        </div>
        <input
          className={styles.buscar}
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por folio"
        />
        <button
          type="button"
          className={styles.boton}
          onClick={() => void descargarConMuestra()}
          disabled={cruzadas === 0}
        >
          Descargar con muestra
        </button>
        <button
          type="button"
          className={styles.boton}
          onClick={() => setDialogoPdf(true)}
          disabled={(solicitudes?.length ?? 0) === 0}
        >
          Descargar PDFs
        </button>
        <span className={styles.conteo}>
          {cruzadas} de {solicitudes?.length ?? 0} con muestra
        </span>
      </div>


      {dialogoPdf && (
        <Modal
          titulo="Descargar solicitudes en PDF"
          subtitulo="Las solicitudes de análisis, en un .zip."
          onCerrar={() => !bajandoPdf && setDialogoPdf(false)}
          pie={
            <button type="button" className={styles.boton} onClick={() => setDialogoPdf(false)} disabled={bajandoPdf}>
              Cancelar
            </button>
          }
        >
          <p className={styles.pregunta}>¿Cuáles quieres descargar?</p>
          <div className={styles.opcionesPdf}>
            <button
              type="button"
              data-foco
              className={styles.opcionPdf}
              onClick={() => void descargarPdfs(solicitudes ?? [])}
              disabled={bajandoPdf}
            >
              <strong>Todas</strong>
              <span>{solicitudes?.length ?? 0} solicitudes, con o sin muestra</span>
            </button>
            <button
              type="button"
              className={styles.opcionPdf}
              onClick={() => void descargarPdfs(sinCruzar)}
              disabled={bajandoPdf || sinCruzar.length === 0}
            >
              <strong>Solo las que no están cruzadas</strong>
              <span>
                {sinCruzar.length === 0
                  ? 'Todas ya tienen su muestra'
                  : `${sinCruzar.length} esperando muestra`}
              </span>
            </button>
          </div>
          {bajandoPdf && <p className={styles.pregunta}>Generando los PDF…</p>}
        </Modal>
      )}

      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>N° Solicitud</th>
              <th>Tipo</th>
              <th>N° Muestra</th>
              <th>Peso</th>
              <th>Fecha recepción</th>
              <th>Hora recepción</th>
              <th>Fecha muestreo</th>
              <th>Sold To</th>
              <th>Especie</th>
              <th>Variedad</th>
              <th>Analitos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) => (
              <tr key={s.archivo} className={s.codigo_muestra ? styles.lista : undefined}>
                <td className={styles.folio}>{s.campos['N° Solicitud'] || s.archivo}</td>
                <td>
                  {s.campos['Tipo Muestra']
                    ? <TipoMuestraChip tipo={s.campos['Tipo Muestra']} compacto />
                    : <span className={styles.pendiente}>—</span>}
                </td>
                <td className={styles.muestra}>
                  {s.codigo_muestra ?? <span className={styles.pendiente}>esperando muestra</span>}
                </td>
                <td className={styles.mono}>
                  {s.peso_muestra != null
                    ? <>{s.peso_muestra} <span className={styles.unidad}>{s.unidad_peso ?? 'kg'}</span></>
                    : '—'}
                </td>
                <td className={styles.mono}>{formatearFecha(s.fecha_recepcion)}</td>
                <td className={styles.mono}>{s.hora_recepcion || '—'}</td>
                <td className={styles.mono}>{s.campos['Fecha Muestreo'] || '—'}</td>
                <td>{s.campos['Sold To (Nombre)'] || '—'}</td>
                <td>{s.campos['Especie'] || '—'}</td>
                <td>{s.campos['Variedad'] || '—'}</td>
                <td>
                  {s.analitos_solicitados.map((a) => (
                    <span key={a} className={styles.chip}>
                      {a}
                    </span>
                  ))}
                </td>
                <td className={styles.acciones}>
                  <button type="button" className={styles.boton} onClick={() => onVerFicha(s)}>
                    Ver ficha
                  </button>
                  {s.codigo_muestra && (
                    <button type="button" className={styles.boton} onClick={() => onQuitarCruce(s)}>
                      Quitar muestra
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={12} className={styles.vacio}>
                  {solicitudes === null
                    ? 'Cargando…'
                    : buscar
                      ? `Sin resultados para “${buscar}”.`
                      : 'No hay solicitudes en este estado.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
