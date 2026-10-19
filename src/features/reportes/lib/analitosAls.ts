/**
 * Cómo se muestra cada analito de ALS en la tabla de Report: nombre, unidad y orden.
 *
 * Es una tabla fija porque ALS repite siempre los mismos ensayos y la tabla no puede depender de que el catálogo
 * de analitos esté sembrado en la base (sin sembrar salían los códigos «ECOLI», «COLT» y la unidad en «—»).
 * Las unidades son las que imprime el informe de ALS. Las claves son los códigos de la ingesta (`mapeo.ANALITOS_RESULTADO`)
 * y los del catálogo de Toma de muestras (`mapeo.ALIAS_CODIGO_CATALOGO`), que son el mismo analito.
 */
export interface AnalitoAls {
  nombre: string
  unidad: string
  /** Posición dentro de un informe: primero lo que ALS escribe primero (Coliformes Totales, luego Escherichia coli). */
  orden: number
}

const COLIFORMES_AGUA: AnalitoAls = { nombre: 'Coliformes Totales', unidad: 'UFC/100 mL', orden: 1 }
const ECOLI_AGUA: AnalitoAls = { nombre: 'Escherichia coli', unidad: 'UFC/100 mL', orden: 2 }
const COLIFORMES_ALIMENTO: AnalitoAls = { nombre: 'Coliformes Totales', unidad: 'UFC/g', orden: 3 }
const ECOLI_ALIMENTO: AnalitoAls = { nombre: 'Escherichia coli', unidad: 'UFC/g', orden: 4 }
const ENTEROBACTERIAS: AnalitoAls = { nombre: 'Enterobacterias', unidad: 'UFC/g', orden: 5 }
const HONGOS: AnalitoAls = { nombre: 'Hongos', unidad: 'UFC/g', orden: 6 }
const LEVADURAS: AnalitoAls = { nombre: 'Levaduras', unidad: 'UFC/g', orden: 7 }
const CENIZAS: AnalitoAls = { nombre: 'Cenizas insolubles en ácido', unidad: '%', orden: 14 }
const AFLATOXINAS: AnalitoAls = { nombre: 'Aflatoxinas totales (B1+B2+G1+G2)', unidad: 'µg/kg', orden: 15 }

const POR_CODIGO: Record<string, AnalitoAls> = {
  COLT: COLIFORMES_AGUA, COLIF100: COLIFORMES_AGUA,
  ECOLI: ECOLI_AGUA, ECOLI100: ECOLI_AGUA,
  COLA: COLIFORMES_ALIMENTO, COLIFG: COLIFORMES_ALIMENTO,
  ECOLA: ECOLI_ALIMENTO, ECOLIG: ECOLI_ALIMENTO,
  ENTB: ENTEROBACTERIAS, ENTERO: ENTEROBACTERIAS,
  HONG: HONGOS, HONGOS,
  LEVG: LEVADURAS,
  SALM: { nombre: 'Salmonella en 25 g', unidad: 'P/A', orden: 8 },
  PB: { nombre: 'Plomo', unidad: 'mg/kg', orden: 9 },
  HG: { nombre: 'Mercurio', unidad: 'mg/kg', orden: 10 },
  AS: { nombre: 'Arsénico', unidad: 'mg/kg', orden: 11 },
  CD: { nombre: 'Cadmio', unidad: 'mg/kg', orden: 12 },
  AL: { nombre: 'Aluminio', unidad: 'mg/kg', orden: 13 },
  CEN: CENIZAS, CENIZAS,
  AFLA: AFLATOXINAS, AFLAT: AFLATOXINAS,
}

/** Orden de los analitos que no están en la tabla: van al final, entre ellos por nombre. */
export const ORDEN_ALS_DESCONOCIDO = 99

/** Nombre, unidad y orden de un analito de ALS por su código; `null` si ALS trae uno que esta tabla no conoce. */
export function analitoAls(codigo: string | null | undefined): AnalitoAls | null {
  return POR_CODIGO[(codigo ?? '').trim().toUpperCase()] ?? null
}
