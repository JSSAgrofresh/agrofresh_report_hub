import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { filtrarPorFolio } from '@/features/emitir'
import type { Solicitud } from '@/features/emitir'
import styles from './TablaSolicitudes.module.css'


/** El backend entrega la recepción como "YYYY-MM-DD"; en el mesón se lee
 * al derecho. Sin cruce todavía no hay recepción que mostrar. */
function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [anio, mes, dia] = iso.split('-')
  return dia ? `${dia}-${mes}-${anio}` : iso
}

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


  const cruzadas = useMemo(
    () => (solicitudes ?? []).filter((s) => s.codigo_muestra).length,
    [solicitudes],
  )


  function descargarConMuestra() {
    const solicitudesCruzadas = (solicitudes ?? []).filter((s) => s.codigo_muestra)
    const aliasInternos = new Set(['Sold To (Nombre)', 'Ship To (Nombre)'])
    const columnas: string[] = []

    solicitudesCruzadas.forEach((solicitud) => {
      Object.keys(solicitud.campos).forEach((campo) => {
        if (!aliasInternos.has(campo) && !columnas.includes(campo)) columnas.push(campo)
      })
    })

    if (!columnas.includes('N° Solicitud')) columnas.unshift('N° Solicitud')
    const indiceSolicitud = columnas.indexOf('N° Solicitud')
    columnas.splice(indiceSolicitud + 1, 0, 'N° Muestra', 'Fecha Recepción', 'Hora Recepción')
    if (!columnas.includes('Analitos')) columnas.push('Analitos')

    const filas = solicitudesCruzadas.map((solicitud) => {
      const fila: Record<string, string> = {}
      columnas.forEach((columna) => {
        if (columna === 'N° Solicitud') {
          fila[columna] = solicitud.campos[columna] || solicitud.archivo
        } else if (columna === 'N° Muestra') {
          fila[columna] = solicitud.codigo_muestra || ''
        } else if (columna === 'Fecha Recepción') {
          fila[columna] = formatearFecha(solicitud.fecha_recepcion).replace('—', '')
        } else if (columna === 'Hora Recepción') {
          fila[columna] = solicitud.hora_recepcion || ''
        } else if (columna === 'Sold To') {
          fila[columna] = solicitud.campos[columna] || solicitud.campos['Sold To (Nombre)'] || ''
        } else if (columna === 'Ship To') {
          fila[columna] = solicitud.campos[columna] || solicitud.campos['Ship To (Nombre)'] || ''
        } else if (columna === 'Analitos') {
          fila[columna] = solicitud.analitos_solicitados.join(', ')
        } else {
          fila[columna] = solicitud.campos[columna] || ''
        }
      })
      return fila
    })

    const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas })
    hoja['!autofilter'] = {
      ref: hoja['!ref'] ?? ('A1:' + XLSX.utils.encode_col(columnas.length - 1) + '1'),
    }
    hoja['!cols'] = columnas.map((columna) => ({
      wch: Math.min(
        38,
        Math.max(12, columna.length + 2, ...filas.map((fila) => String(fila[columna] || '').length + 2)),
      ),
    }))

    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Con muestra')
    XLSX.writeFile(libro, 'solicitudes_con_muestra.xlsx')
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
          onClick={descargarConMuestra}
          disabled={cruzadas === 0}
        >
          Descargar con muestra
        </button>
        <span className={styles.conteo}>
          {cruzadas} de {solicitudes?.length ?? 0} con muestra
        </span>
      </div>


      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>N° Solicitud</th>
              <th>N° Muestra</th>
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
                <td className={styles.muestra}>
                  {s.codigo_muestra ?? <span className={styles.pendiente}>esperando muestra</span>}
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
                <td colSpan={10} className={styles.vacio}>
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
