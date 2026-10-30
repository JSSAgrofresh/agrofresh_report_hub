import type { PlantaAsignada } from '../types'

const n = (t?: string | null) => (t ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const mismaPlanta = (a: PlantaAsignada, cliente: string, planta: string | null) =>
  n(a.clienteNombre) === n(cliente) && n(a.plantaNombre) === n(planta)

/** Lo que ve la cuenta en una planta (o en todo el Sold To si `planta` es null): `todas` o la lista de especies. */
export function especiesDe(accesos: PlantaAsignada[], cliente: string, planta: string | null) {
  const filas = accesos.filter((a) => mismaPlanta(a, cliente, planta))
  const todas = filas.some((a) => !a.especie)
  return { tiene: filas.length > 0, todas, especies: todas ? [] : filas.map((a) => a.especie as string) }
}

/** Deja en cada planta indicada exactamente esas especies (`'todas'` = sin límite, `[]` = sin acceso). */
export function fijarEspecies(accesos: PlantaAsignada[], cliente: string, plantas: (string | null)[], especies: string[] | 'todas') {
  const resto = accesos.filter((a) => !plantas.some((p) => mismaPlanta(a, cliente, p)))
  const nuevas: PlantaAsignada[] = plantas.flatMap((p) =>
    especies === 'todas'
      ? [{ clienteNombre: cliente, plantaNombre: p }]
      : especies.map((e) => ({ clienteNombre: cliente, plantaNombre: p, especie: e })),
  )
  return [...resto, ...nuevas]
}

/** Alterna UNA especie de una planta: si estaba en «todas», pasa a todas menos esa. */
export function alternarEspecie(accesos: PlantaAsignada[], cliente: string, planta: string | null, especie: string, todasLasEspecies: string[]) {
  const actual = especiesDe(accesos, cliente, planta)
  const base = actual.todas ? todasLasEspecies : actual.especies
  const siguiente = base.some((e) => n(e) === n(especie)) ? base.filter((e) => n(e) !== n(especie)) : [...base, especie]
  return fijarEspecies(accesos, cliente, [planta], siguiente)
}

/** Cuántas plantas del cliente tiene la cuenta (`todo` = todo el Sold To). */
export function resumenDeCliente(accesos: PlantaAsignada[], cliente: string) {
  const filas = accesos.filter((a) => n(a.clienteNombre) === n(cliente))
  return { todo: filas.some((a) => !a.plantaNombre), plantas: new Set(filas.filter((a) => a.plantaNombre).map((a) => n(a.plantaNombre))).size }
}
