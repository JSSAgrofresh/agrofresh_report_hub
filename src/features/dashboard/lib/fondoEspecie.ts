import arandano from '@/assets/backgrounds/arandano.avif'
import ciruela from '@/assets/backgrounds/ciruela.avif'
import clementina from '@/assets/backgrounds/clementina.avif'
import kiwi from '@/assets/backgrounds/kiwi.avif'
import limon from '@/assets/backgrounds/limon.avif'
import mandarina from '@/assets/backgrounds/mandarina.avif'
import manzana from '@/assets/backgrounds/manzana.avif'
import naranja from '@/assets/backgrounds/naranja.avif'
import nectarina from '@/assets/backgrounds/nectarina.avif'
import palta from '@/assets/backgrounds/palta.avif'
import pera from '@/assets/backgrounds/pera.avif'

/** Foto de fondo + color del degradado que va encima. */
export interface FondoEspecie {
  imagen: string
  /** Color del velo del encabezado, en el tono de la foto. */
  tinte: string
}

// Claves normalizadas (sin tildes, minúsculas) -> foto de fondo y su tinte. La
// especie que llega del filtro de Report no está homogenizada (puede venir en
// cualquier combinación de mayúsculas/tildes), así que se compara siempre
// contra la forma normalizada. Cereza no tiene entrada acá a propósito: es
// justamente la foto base del área (background_lab.jpg) que ya se usa como
// fondoBase, por estar en temporada de cereza.
//
// Los tintes salen del tono dominante de cada foto, pero todos comparten la
// saturación y la luminosidad del rojo cereza que ya se usaba (#6E2029 ->
// 55% S, 28% L): así el velo cambia de color según la fruta sin que el texto
// blanco pierda contraste en ninguna. Solo el tono cambia; nunca la
// oscuridad, que es lo que sostiene la legibilidad.
const FONDOS_POR_ESPECIE: Record<string, FondoEspecie> = {
  // Azul profundo del arándano.
  arandano: { imagen: arandano, tinte: '#20336E' },
  // Violeta de la ciruela oscura.
  ciruela: { imagen: ciruela, tinte: '#37206E' },
  clementina: { imagen: clementina, tinte: '#6E4220' },
  // Ámbar: la foto es de kiwis enteros, con su piel café, no pulpa verde.
  kiwi: { imagen: kiwi, tinte: '#6E4D20' },
  limon: { imagen: limon, tinte: '#6E5E20' },
  mandarina: { imagen: mandarina, tinte: '#6E4420' },
  // La foto mezcla manzanas rojas y verdes; el degradado pesa a la izquierda,
  // que es justo donde están las rojas.
  manzana: { imagen: manzana, tinte: '#6E202A' },
  naranja: { imagen: naranja, tinte: '#6E3F20' },
  nectarina: { imagen: nectarina, tinte: '#6E2024' },
  // Verde oliva de la palta.
  palta: { imagen: palta, tinte: '#516E20' },
  // Verde amarillento de la pera.
  pera: { imagen: pera, tinte: '#636E20' },
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Foto de fondo y tinte para el encabezado del portal de cliente según la
 * especie filtrada en Report. Sin filtro (o especie sin foto propia todavía),
 * cae al fondo "base" que se pasa como segundo argumento -cereza en temporada
 * de cereza, la foto de área normal (background_lab.jpg)-; ahí el tinte queda
 * en `undefined` para que el encabezado use el color de marca del área.
 */
export function fondoParaEspecie(
  especie: string | null | undefined,
  fondoBase: string,
): { imagen: string; tinte?: string } {
  if (!especie) return { imagen: fondoBase }
  return FONDOS_POR_ESPECIE[normalizar(especie)] ?? { imagen: fondoBase }
}
