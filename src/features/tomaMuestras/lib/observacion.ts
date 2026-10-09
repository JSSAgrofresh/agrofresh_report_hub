/**
 * Largo máximo de la observación de una solicitud: 50. Las solicitudes de ENSAYO (Sold To AGROFRESH
 * y Ship To ENSAYO, de cualquier tipo de servicio) describen más: hasta 500. El backend exige lo
 * mismo (`toma_muestras.tope_observacion`); si cambias uno, cambia el otro y sus pruebas.
 */
export const OBSERVACION_MAX = 50
export const OBSERVACION_MAX_ENSAYO = 500

const sinTildes = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Sold To AGROFRESH y Ship To ENSAYO (sin importar mayúsculas ni tildes; «ENSAYOS» también vale). */
export const esEnsayo = (soldTo: string, shipTo: string) =>
  sinTildes(soldTo) === 'agrofresh' && sinTildes(shipTo).startsWith('ensayo')

export const topeObservacion = (soldTo: string, shipTo: string) =>
  esEnsayo(soldTo, shipTo) ? OBSERVACION_MAX_ENSAYO : OBSERVACION_MAX
