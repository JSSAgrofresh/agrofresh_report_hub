import type { CSSProperties } from 'react'

/** Paleta de acentos de los laboratorios. Son tonos elegidos para convivir
 * con el verde de la marca sin competir con él: se usan solo como color de
 * identidad de cada laboratorio (franja, avatar, pestaña activa), nunca para
 * comunicar estado -eso lo hacen las insignias-. */
const PALETA: { fuerte: string; suave: string }[] = [
  { fuerte: '#5A9E30', suave: '#eef5e7' },
  { fuerte: '#2D7FB8', suave: '#e7f1f8' },
  { fuerte: '#B5842A', suave: '#faf2e0' },
  { fuerte: '#7B5EA7', suave: '#f1ecf7' },
  { fuerte: '#2A8F82', suave: '#e6f4f2' },
  { fuerte: '#BC5A3C', suave: '#faece7' },
  { fuerte: '#4C63B6', suave: '#eaedf8' },
  { fuerte: '#7D8C2E', suave: '#f2f4e3' },
]

/** El color se deriva del código y no de la posición en la lista para que un
 * laboratorio conserve su identidad aunque se reordene o se cree otro antes. */
function indiceDe(codigo: string): number {
  let suma = 0
  for (let i = 0; i < codigo.length; i += 1) suma = (suma * 31 + codigo.charCodeAt(i)) % 100000
  return suma % PALETA.length
}

/** Variables CSS que consume la hoja de estilos (`var(--acento)`). */
export function acentoDeLaboratorio(codigo: string): CSSProperties {
  const { fuerte, suave } = PALETA[indiceDe(codigo)]
  return { '--acento': fuerte, '--acento-suave': suave } as CSSProperties
}

/** Iniciales para el avatar: dos letras a partir de las palabras del nombre,
 * o las dos primeras del código si el nombre no da. */
export function inicialesDe(nombre: string, codigo: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase()
  if (palabras.length === 1 && palabras[0].length >= 2) return palabras[0].slice(0, 2).toUpperCase()
  return codigo.slice(0, 2).toUpperCase()
}
