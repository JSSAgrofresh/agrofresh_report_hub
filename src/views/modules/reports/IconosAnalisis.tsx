import type { SVGProps } from 'react'

/** Íconos de línea de los tres análisis, cada uno con su guiño a la fruta: una hoja, un brote y una manzana. */
function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

/** Residuos: un matraz con una hoja en su líquido. */
export function IconMatraz(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M19 6h10" />
      <path d="M21 6v12L9.5 38.5a3 3 0 0 0 2.7 4.5h23.6a3 3 0 0 0 2.7-4.5L27 18V6" />
      <path d="M14.5 30h19" />
      <path d="M24 39c-5.5 0-8-3.8-8-7 4.8 0 8 2.4 8 7z" />
      <path d="M24 39c0-2.4-.6-4-1.8-5.2" />
    </Base>
  )
}

/** FSMA: una bacteria con sus flagelos y un brote encima. */
export function IconBacteria(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="10" y="20" width="26" height="14" rx="7" transform="rotate(-28 23 27)" />
      <path d="M12 38c-3 2-4.5 5-3 7M9 31c-3.5 .5-5 2.5-5 5" />
      <circle cx="21" cy="27" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="28" cy="23" r="1.2" fill="currentColor" stroke="none" />
      <path d="M36 12c-4.8 0-7.5 3-7.5 6.5 4.8 0 7.5-2.6 7.5-6.5z" />
      <path d="M36 12c-2.6 1-4.4 3-5.6 5" />
    </Base>
  )
}

/** Fitopatología: una manzana con un gusano que sale de su picadura. */
export function IconManzanaGusano(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M24 15c-4-3-12-2-14 6-2 8 3 20 9 20 2 0 3-1 5-1s3 1 5 1c6 0 11-12 9-20-2-8-10-9-14-6z" />
      <path d="M24 15c0-4 2-7 5-8.5" />
      <circle cx="29" cy="28" r="1.6" fill="currentColor" stroke="none" />
      <path d="M29 28c4-1.5 7-5 5.5-9.5" />
      <circle cx="34.5" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
    </Base>
  )
}
