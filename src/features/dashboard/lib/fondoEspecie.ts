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

// Claves normalizadas (sin tildes, minúsculas) -> foto de fondo. La especie
// que llega del filtro de Report no está homogenizada (puede venir en
// cualquier combinación de mayúsculas/tildes), así que se compara siempre
// contra la forma normalizada. Cereza no tiene entrada acá a propósito: es
// justamente la foto base del área (background_lab.jpg) que ya se usa como
// fondoBase, por estar en temporada de cereza.
const FONDOS_POR_ESPECIE: Record<string, string> = {
  arandano,
  ciruela,
  clementina,
  kiwi,
  limon,
  mandarina,
  manzana,
  naranja,
  nectarina,
  palta,
  pera,
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Foto de fondo para el encabezado del portal de cliente según la especie
 * filtrada en Report. Sin filtro (o especie sin foto propia todavía), cae al
 * fondo "base" que se pasa como segundo argumento -cereza en temporada de
 * cereza, la foto de área normal (background_lab.jpg)-.
 */
export function fondoParaEspecie(especie: string | null | undefined, fondoBase: string): string {
  if (!especie) return fondoBase
  return FONDOS_POR_ESPECIE[normalizar(especie)] ?? fondoBase
}
