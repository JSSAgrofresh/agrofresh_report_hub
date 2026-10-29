import type { SVGProps } from 'react'

/**
 * Íconos de los tres análisis: trazo limpio y relleno suave del mismo color (dúo de tonos), con su guiño a la fruta.
 * Heredan el color del texto (`currentColor`): el relleno es la misma tinta a baja opacidad.
 */
function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

const SUAVE = { fill: 'currentColor', fillOpacity: 0.16, stroke: 'none' } as const
const MEDIO = { fill: 'currentColor', fillOpacity: 0.32, stroke: 'none' } as const

/** Residuos: un matraz Erlenmeyer con su líquido y una hojita flotando. */
export function IconMatraz(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path {...SUAVE} d="M13.2 33h21.6l5 8.4a2.6 2.6 0 0 1-2.2 3.9H10.4a2.6 2.6 0 0 1-2.2-3.9z" />
      <path d="M18 5h12" />
      <path d="M20.5 5v13.5L8.6 40.2a3.2 3.2 0 0 0 2.8 4.8h25.2a3.2 3.2 0 0 0 2.8-4.8L27.5 18.5V5" />
      <path d="M12.5 33h23" />
      <path {...MEDIO} d="M24 41.5c-4.6 0-6.8-3.2-6.8-6 4.1 0 6.8 2 6.8 6z" />
      <path d="M24 41.5c-4.6 0-6.8-3.2-6.8-6 4.1 0 6.8 2 6.8 6zM24 41.5c0-2-.5-3.4-1.5-4.4" />
      <circle cx="30" cy="38" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="31.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="34.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  )
}

/** FSMA: una bacteria en forma de bastón con flagelos y su interior punteado. */
export function IconBacteria(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <g transform="rotate(-35 24 24)">
        <rect {...SUAVE} x="8" y="15" width="32" height="18" rx="9" />
        <rect x="8" y="15" width="32" height="18" rx="9" />
        <path d="M8 24H3.5M40 24h4.5M14 15v-4M20 15v-4M28 15v-4M34 15v-4M14 33v4M20 33v4M28 33v4M34 33v4" />
        <circle cx="18" cy="24" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="25" cy="22" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="30.5" cy="26.5" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </Base>
  )
}

/** Fitopatología: una manzana con su hoja y un gusano que asoma de la mordida. */
export function IconManzanaGusano(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path
        {...SUAVE}
        d="M24 15.5c-4.2-3.2-12.5-2.4-14.4 6.2-2 8.8 3.4 21.8 9.8 21.8 2.2 0 3.2-1 4.6-1s2.4 1 4.6 1c6.4 0 11.8-13 9.8-21.8-1.9-8.6-10.2-9.4-14.4-6.2z"
      />
      <path d="M24 15.5c-4.2-3.2-12.5-2.4-14.4 6.2-2 8.8 3.4 21.8 9.8 21.8 2.2 0 3.2-1 4.6-1s2.4 1 4.6 1c6.4 0 11.8-13 9.8-21.8-1.9-8.6-10.2-9.4-14.4-6.2z" />
      <path d="M24 15.5c0-4.4 1.8-7.4 5-9" />
      <path {...MEDIO} d="M29 6.5c3.6-.4 6 1 7 3.6-3.6.6-6.2-.6-7-3.6z" />
      <path d="M29 6.5c3.6-.4 6 1 7 3.6-3.6.6-6.2-.6-7-3.6z" />
      <circle cx="19" cy="29" r="2" fill="currentColor" fillOpacity="0.55" stroke="none" />
      <circle cx="25.5" cy="35" r="1.5" fill="currentColor" fillOpacity="0.55" stroke="none" />
      <path d="M31 29c3.2-1 5.4-3.6 4.6-7" />
      <circle cx="35.2" cy="21.2" r="1.7" fill="currentColor" stroke="none" />
    </Base>
  )
}

/** Accutab: una tina de agua de la línea de proceso de la fruta (la que lava y enfría), con su agua, una gota y la fruta flotando. */
export function IconPozoAgua(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path {...SUAVE} d="M7 25h34l-2.4 14.2a3 3 0 0 1-3 2.5H12.4a3 3 0 0 1-3-2.5z" />
      <path d="M6 18h36M9 18l3.4 21.2a3 3 0 0 0 3 2.5h17.2a3 3 0 0 0 3-2.5L39 18" />
      <path d="M9 28c3-2.4 5-2.4 7.5 0s4.5 2.4 7.5 0 5-2.4 7.5 0 4.5 2.4 7.5 0" />
      <path d="M12.5 35c2.6-2 4.4-2 6.7 0s4 2 6.6 0 4.4-2 6.7 0" opacity={0.55} />
      <circle {...MEDIO} cx="18" cy="21.4" r="3.9" />
      <circle cx="18" cy="21.4" r="3.9" />
      <circle {...MEDIO} cx="29.5" cy="22" r="3.4" />
      <circle cx="29.5" cy="22" r="3.4" />
      <path d="M18 17.5v-1.6M29.5 18.6V17" />
      <path d="M24 4.5c-2.4 3.3-3.6 5.2-3.6 7a3.6 3.6 0 0 0 7.2 0c0-1.8-1.2-3.7-3.6-7z" />
    </Base>
  )
}
