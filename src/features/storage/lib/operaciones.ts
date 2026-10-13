import {
  abrirArchivo,
  abrirInformeCliente,
  descargarInformeCliente,
  listarInformesCliente,
  crearCarpeta,
  crearCarpetaR2,
  descargar,
  descargarR2,
  eliminar,
  eliminarR2,
  listar,
  listarR2,
  mover,
  moverR2,
  renombrar,
  renombrarR2,
  subirArchivos,
  subirArchivosR2,
} from './api'
import type { Espacio } from './explorador'

/** Las mismas operaciones para cualquier espacio: la pantalla no tiene que
 * saber si está sobre el disco del servidor o sobre el bucket. */
export function operaciones(espacio: Espacio) {
  if (espacio.id === 'cliente') {
    // Solo lectura: el cliente lista, mira y descarga sus informes; el servidor no le permite más.
    const noPermitido = () => Promise.reject(new Error('Solo lectura.'))
    return {
      listar: listarInformesCliente,
      crearCarpeta: noPermitido,
      subir: noPermitido,
      renombrar: noPermitido,
      mover: noPermitido,
      eliminar: noPermitido,
      descargar: descargarInformeCliente,
      abrir: abrirInformeCliente,
    } as unknown as ReturnType<typeof operacionesInternas>
  }
  return operacionesInternas(espacio)
}

function operacionesInternas(espacio: Espacio) {
  return espacio.r2
    ? {
        listar: listarR2,
        crearCarpeta: crearCarpetaR2,
        subir: subirArchivosR2,
        renombrar: renombrarR2,
        mover: moverR2,
        eliminar: eliminarR2,
        descargar: descargarR2,
        abrir: (ruta: string) => abrirArchivo(true, ruta),
      }
    : {
        listar,
        crearCarpeta,
        subir: subirArchivos,
        renombrar,
        mover,
        eliminar,
        descargar,
        abrir: (ruta: string) => abrirArchivo(false, ruta),
      }
}
